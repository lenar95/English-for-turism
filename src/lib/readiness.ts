import type { Phrase, Scenario } from '../data/types';
import { memoryStrength } from './memory';
import { pronunciationOf, type PhraseProgress } from './progress';
import { READY_BASIC, READY_CONFIDENT, READY_OK } from './thresholds';

export type ProgressMap = Record<string, PhraseProgress | undefined>;

export interface Readiness {
  /** Итог 0–100. */
  total: number;
  /** Память 0–100: насколько хорошо фразы выучены и не забыты. */
  memory: number;
  /** Произношение 0–100 по фразам, которые нужно говорить самому. */
  pronunciation: number;
  /** Сколько фраз хотя бы раз тренировали. */
  practiced: number;
  phrases: number;
}

/** Вес памяти и произношения в итоговой готовности. */
export const MEMORY_WEIGHT = 0.5;

const phraseWeight = (p: Phrase) => (p.key ? 2 : 1);

export function scenarioReadiness(
  scenario: Scenario,
  progress: ProgressMap,
  now: number,
  withPronunciation = true,
): Readiness {
  let memSum = 0;
  let memW = 0;
  let pronSum = 0;
  let pronW = 0;
  let practiced = 0;
  for (const phrase of scenario.phrases) {
    const p = progress[phrase.id];
    const w = phraseWeight(phrase);
    memSum += memoryStrength(p?.memory, now) * w;
    memW += w;
    if (p && (p.memory.reviews > 0 || p.pron.length > 0)) practiced++;
    if (phrase.speaker === 'you') {
      pronSum += (pronunciationOf(p) ?? 0) / 100 * w;
      pronW += w;
    }
  }
  const memory = memW ? (memSum / memW) * 100 : 0;
  const pronunciation = pronW ? (pronSum / pronW) * 100 : 0;
  const total = withPronunciation
    ? MEMORY_WEIGHT * memory + (1 - MEMORY_WEIGHT) * pronunciation
    : memory;
  return {
    total: Math.round(total),
    memory: Math.round(memory),
    pronunciation: Math.round(pronunciation),
    practiced,
    phrases: scenario.phrases.length,
  };
}

/** Общая готовность к поездке: среднее по выбранным сценариям. */
export function tripReadiness(
  scenarios: Scenario[],
  progress: ProgressMap,
  now: number,
  withPronunciation = true,
): Readiness {
  if (!scenarios.length) {
    return { total: 0, memory: 0, pronunciation: 0, practiced: 0, phrases: 0 };
  }
  const parts = scenarios.map((s) => scenarioReadiness(s, progress, now, withPronunciation));
  const avg = (f: (r: Readiness) => number) =>
    Math.round(parts.reduce((s, r) => s + f(r), 0) / parts.length);
  return {
    total: avg((r) => r.total),
    memory: avg((r) => r.memory),
    pronunciation: avg((r) => r.pronunciation),
    practiced: parts.reduce((s, r) => s + r.practiced, 0),
    phrases: parts.reduce((s, r) => s + r.phrases, 0),
  };
}

export interface ReadinessLevel {
  label: string;
  description: string;
  tone: 'mid' | 'good' | 'great';
}

export function readinessLevel(total: number): ReadinessLevel {
  if (total >= READY_CONFIDENT)
    return {
      label: 'Уверенный путешественник',
      description: 'Вы справитесь с этими ситуациями сами. Повторяйте раз в несколько дней, чтобы не забыть.',
      tone: 'great',
    };
  if (total >= READY_OK)
    return {
      label: 'Готов к поездке',
      description: 'Основные фразы вы знаете и вас поймут. Подтяните слабые места.',
      tone: 'good',
    };
  if (total >= READY_BASIC)
    return {
      label: 'Базовый уровень',
      description: 'Кое-что уже получается, но в живом разговоре будет трудно. Продолжайте тренироваться.',
      tone: 'mid',
    };
  return {
    label: 'Пока не готов',
    description: 'Начните с ключевых фраз — их немного, а пользы больше всего.',
    tone: 'mid',
  };
}
