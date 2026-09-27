import type { Phrase, Scenario } from '../data/types';
import { chooseType, makeExercise, phraseWords, shuffle, type Exercise, type ExerciseType, type Rng } from './exercises';
import { isDue, memoryStrength } from './memory';
import { pronunciationOf } from './progress';
import type { ProgressMap } from './readiness';

/**
 * Адаптивная тренировка — быстрый контур управления внутри сессии.
 *
 * Держим долю верных ответов около 85%:
 * - несколько ошибок подряд → следующие задания легче и на более знакомых фразах;
 * - всё слишком легко → задания сложнее (вспомнить самому вместо выбора из вариантов);
 * - ошибка → та же фраза вернётся через пару заданий в облегчённом виде;
 * - сессия заканчивается успехом: если последнее задание не получилось, добавляем одно лёгкое.
 */

export interface OutcomeLike {
  exercise: Exercise;
  memoryCorrect?: boolean;
  pronScore?: number;
}

export interface ExerciseSource {
  /** Сколько заданий запланировано (для полоски прогресса). */
  planned: number;
  /** Следующее задание по истории ответов; null — сессия окончена. */
  next(outcomes: OutcomeLike[]): Exercise | null;
}

export type SessionMode = 'normal' | 'minimal' | 'warmup';

export function isSuccess(o: OutcomeLike): boolean {
  if (o.memoryCorrect !== undefined) return o.memoryCorrect;
  if (o.pronScore !== undefined) return o.pronScore >= 65;
  return true;
}

/** Сдвиг сложности по последним ответам: −1 легче, 0 как есть, +1 сложнее. */
export function difficultyShift(outcomes: OutcomeLike[]): -1 | 0 | 1 {
  const last = outcomes.slice(-4);
  if (last.length < 2) return 0;
  const rate = last.filter(isSuccess).length / last.length;
  if (rate < 0.6) return -1;
  if (last.length >= 4 && rate === 1) return 1;
  return 0;
}

const EASIER: Partial<Record<ExerciseType, ExerciseType>> = {
  'recall-speak': 'build',
  build: 'choose-en',
};

function harder(type: ExerciseType, phrase: Phrase, speechOn: boolean): ExerciseType {
  const canBuild = phraseWords(phrase.en).length >= 3;
  if (type === 'choose-en') return canBuild ? 'build' : speechOn ? 'recall-speak' : 'choose-en';
  if (type === 'build' || type === 'speak') return speechOn ? 'recall-speak' : type;
  return type;
}

/** Самое лёгкое задание на фразу: узнать среди вариантов. */
function easiest(phrase: Phrase): ExerciseType {
  return phrase.speaker === 'them' ? 'listen' : 'choose-en';
}

export function createAdaptiveSession(
  scenarios: Scenario[],
  progress: ProgressMap,
  now: number,
  speechOn: boolean,
  size: number,
  mode: SessionMode = 'normal',
  rng: Rng = Math.random,
  focusKey = false,
): ExerciseSource {
  const pool = scenarios.flatMap((scenario) => scenario.phrases.map((phrase) => ({ phrase, scenario })));
  const strength = (p: Phrase) => memoryStrength(progress[p.id]?.memory, now);

  let ranked = pool
    .map((l) => {
      const p = progress[l.phrase.id];
      let priority: number;
      if (mode === 'warmup') {
        // Разминка после перерыва: то, что человек уже знал, — чтобы начать с успеха.
        priority = (p?.memory.level ?? 0) > 0 ? 1 + strength(l.phrase) : 0;
      } else {
        const pron = pronunciationOf(p);
        priority = 1 - strength(l.phrase);
        if (l.phrase.speaker === 'you' && speechOn) priority += (1 - (pron ?? 0) / 100) * 0.7;
        if (l.phrase.key) priority += focusKey ? 1.5 : 0.3;
        if (isDue(p?.memory, now)) priority += 0.5;
      }
      return { l, priority: priority + rng() * 0.4 };
    })
    .sort((a, b) => b.priority - a.priority)
    .map((x) => x.l);
  // В разминке и минимальном шаге немного фраз и больше знакомых.
  ranked = ranked.slice(0, Math.max(size * 2, 8));
  const queue = shuffle(ranked.slice(0, size), rng);
  const reserve = ranked.slice(size);
  /** Фразы, к которым вернёмся после ошибки: [позиция, фраза]. */
  const retry: { at: number; phrase: Phrase }[] = [];
  const retried = new Set<string>();
  let extra = 0;

  const locate = (phrase: Phrase) => pool.find((l) => l.phrase.id === phrase.id)!;

  return {
    planned: size,
    next(outcomes) {
      const n = outcomes.length;
      const last = outcomes[n - 1];
      if (last && !isSuccess(last) && !retried.has(last.exercise.phrase.id)) {
        retried.add(last.exercise.phrase.id);
        retry.push({ at: n + 2, phrase: last.exercise.phrase });
      }

      if (n >= size) {
        // Заканчиваем на успехе: одно лёгкое задание, если последнее не получилось.
        if (!last || isSuccess(last) || extra >= 1) return null;
        extra++;
        const used = new Set(outcomes.map((o) => o.exercise.phrase.id));
        const sure =
          [...pool].sort((a, b) => strength(b.phrase) - strength(a.phrase)).find((l) => !used.has(l.phrase.id)) ??
          pool[0];
        return makeExercise(easiest(sure.phrase), sure, pool, rng);
      }

      const shift = mode === 'warmup' ? -1 : difficultyShift(outcomes);
      const due = retry.findIndex((r) => r.at <= n);
      let phrase: Phrase;
      let type: ExerciseType;
      if (due >= 0) {
        phrase = retry.splice(due, 1)[0].phrase;
        type = easiest(phrase);
      } else {
        if (shift === -1 && queue.length > 1) {
          // Трудно — берём самую знакомую из оставшихся фраз.
          const i = queue.reduce((best, l, k) => (strength(l.phrase) > strength(queue[best].phrase) ? k : best), 0);
          phrase = queue.splice(i, 1)[0].phrase;
        } else {
          phrase = (queue.shift() ?? reserve.shift() ?? pool[Math.floor(rng() * pool.length)]).phrase;
        }
        type = chooseType(phrase, progress, speechOn, rng);
        if (shift === -1) type = EASIER[type] ?? type;
        if (shift === 1) type = harder(type, phrase, speechOn);
      }
      return makeExercise(type, locate(phrase), pool, rng);
    },
  };
}

/** Фиксированный набор заданий (для проверки готовности — она должна быть сопоставимой). */
export function fixedSource(exercises: Exercise[]): ExerciseSource {
  return { planned: exercises.length, next: (outcomes) => exercises[outcomes.length] ?? null };
}
