import type { Phrase, Scenario } from '../data/types';
import { pronunciationOf } from './progress';
import type { ProgressMap } from './readiness';
import { basicClean } from './text';

/**
 * Типы упражнений:
 * - choose-en — по-русски дана фраза, выбрать английский вариант (узнавание);
 * - listen — прослушать английскую фразу и выбрать перевод (понимание на слух);
 * - build — собрать английскую фразу из слов (вспоминание);
 * - speak — прочитать английскую фразу вслух (произношение);
 * - recall-speak — по-русски дана фраза, сказать её по-английски (вспоминание + произношение).
 */
export type ExerciseType = 'choose-en' | 'listen' | 'build' | 'speak' | 'recall-speak';

export interface Exercise {
  key: string;
  type: ExerciseType;
  phrase: Phrase;
  scenarioId: string;
  /** Варианты ответа (для choose-en и listen), включая правильный. */
  options?: Phrase[];
  /** Перемешанные слова (для build). */
  tiles?: string[];
}

export type Rng = () => number;

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Слова фразы для упражнения «собери фразу» — без знаков препинания в конце. */
export function phraseWords(en: string): string[] {
  return en
    .split(/\s+/)
    .map((w) => w.replace(/^[¿¡"«“]+|[.,!?;:"»”]+$/g, ''))
    .filter(Boolean);
}

/** Совпадает ли собранная фраза с эталоном (без учёта регистра и пунктуации). */
export function isBuildCorrect(en: string, answer: string[]): boolean {
  const norm = (ws: string[]) => ws.map((w) => basicClean(w)).join(' ');
  return norm(phraseWords(en)) === norm(answer);
}

interface Located {
  phrase: Phrase;
  scenario: Scenario;
}

function pickDistractors(target: Located, pool: Located[], count: number, rng: Rng): Phrase[] {
  const seen = new Set([basicClean(target.phrase.en), basicClean(target.phrase.ru)]);
  const sameScenario = pool.filter((l) => l.scenario.id === target.scenario.id);
  const others = pool.filter((l) => l.scenario.id !== target.scenario.id);
  // Сначала похожие по смыслу (из той же ситуации и того же говорящего) — так тест честнее.
  const ordered = [
    ...shuffle(sameScenario.filter((l) => l.phrase.speaker === target.phrase.speaker), rng),
    ...shuffle(sameScenario.filter((l) => l.phrase.speaker !== target.phrase.speaker), rng),
    ...shuffle(others, rng),
  ];
  const out: Phrase[] = [];
  for (const l of ordered) {
    if (out.length >= count) break;
    const en = basicClean(l.phrase.en);
    const ru = basicClean(l.phrase.ru);
    if (seen.has(en) || seen.has(ru)) continue;
    seen.add(en);
    seen.add(ru);
    out.push(l.phrase);
  }
  return out;
}

export function makeExercise(
  type: ExerciseType,
  target: Located,
  pool: Located[],
  rng: Rng = Math.random,
): Exercise {
  const ex: Exercise = {
    key: `${type}:${target.phrase.id}:${Math.floor(rng() * 1e9)}`,
    type,
    phrase: target.phrase,
    scenarioId: target.scenario.id,
  };
  if (type === 'choose-en' || type === 'listen') {
    ex.options = shuffle([target.phrase, ...pickDistractors(target, pool, 3, rng)], rng);
  }
  if (type === 'build') {
    const words = phraseWords(target.phrase.en);
    let tiles = shuffle(words, rng);
    // Не показываем слова сразу в правильном порядке.
    for (let i = 0; i < 5 && tiles.join(' ') === words.join(' '); i++) tiles = shuffle(words, rng);
    ex.tiles = tiles;
  }
  return ex;
}

function locate(scenarios: Scenario[]): Located[] {
  return scenarios.flatMap((scenario) => scenario.phrases.map((phrase) => ({ phrase, scenario })));
}

/** Подобрать упражнение под текущий уровень фразы. */
export function chooseType(
  phrase: Phrase,
  progress: ProgressMap,
  speechAvailable: boolean,
  rng: Rng = Math.random,
): ExerciseType {
  if (phrase.speaker === 'them') return 'listen';
  const p = progress[phrase.id];
  const level = p?.memory.level ?? 0;
  const pron = pronunciationOf(p);
  const canBuild = phraseWords(phrase.en).length >= 3;
  if (level === 0) return 'choose-en';
  if (speechAvailable && pron === null) return 'speak';
  if (level <= 2) {
    if (speechAvailable && pron !== null && pron < 70 && rng() < 0.5) return 'speak';
    return canBuild ? 'build' : 'choose-en';
  }
  if (speechAvailable) return 'recall-speak';
  return canBuild ? 'build' : 'choose-en';
}

/**
 * Проверка готовности: сбалансированный набор заданий на память и произношение.
 * Ключевые фразы попадают в тест чаще.
 */
export function buildExam(
  scenarios: Scenario[],
  speechAvailable: boolean,
  size = 12,
  rng: Rng = Math.random,
): Exercise[] {
  const pool = locate(scenarios);
  const weighted = pool.map((l) => ({ l, w: rng() * (l.phrase.key ? 2 : 1) }));
  weighted.sort((a, b) => b.w - a.w);

  // Держим пропорцию «слушаю / говорю» примерно 1:2, как в реальных ситуациях.
  const them = weighted.filter((x) => x.l.phrase.speaker === 'them').map((x) => x.l);
  const you = weighted.filter((x) => x.l.phrase.speaker === 'you').map((x) => x.l);
  const themCount = Math.min(them.length, Math.round(size / 3));
  const picked = [...them.slice(0, themCount), ...you.slice(0, size - themCount)];
  if (picked.length < size) picked.push(...them.slice(themCount, themCount + size - picked.length));

  const youCycle: ExerciseType[] = speechAvailable
    ? ['choose-en', 'speak', 'build', 'recall-speak']
    : ['choose-en', 'build'];
  let i = 0;
  const exercises = picked.map((l) => {
    if (l.phrase.speaker === 'them') return makeExercise('listen', l, pool, rng);
    let type = youCycle[i++ % youCycle.length];
    if (type === 'build' && phraseWords(l.phrase.en).length < 3) type = 'choose-en';
    return makeExercise(type, l, pool, rng);
  });
  return shuffle(exercises, rng);
}

/** Проверяет ли упражнение память и/или произношение. */
export function exerciseChecks(type: ExerciseType): { memory: boolean; pronunciation: boolean } {
  switch (type) {
    case 'speak':
      return { memory: false, pronunciation: true };
    case 'recall-speak':
      return { memory: true, pronunciation: true };
    default:
      return { memory: true, pronunciation: false };
  }
}

/** Порог, начиная с которого фраза, сказанная по памяти, считается вспомненной. */
export const RECALL_PASS_SCORE = 60;
