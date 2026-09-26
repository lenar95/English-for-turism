/**
 * Модель памяти для одной фразы.
 *
 * У каждой фразы есть уровень освоения 0–5 (как коробки в системе Лейтнера)
 * и «стабильность» — через сколько дней вероятность вспомнить фразу упадёт до 90%.
 * Вероятность вспомнить со временем снижается по кривой забывания
 * R(t) = 1 / (1 + t / (9·S)) — та же форма, что в алгоритме FSRS (Anki).
 * Поэтому готовность честно падает, если долго не повторять.
 */

export const MAX_LEVEL = 5;
const DAY = 24 * 60 * 60 * 1000;

/** Стабильность (в днях) для каждого уровня. */
const STABILITY_DAYS = [0, 1, 3, 7, 16, 35];

/**
 * Тип проверки:
 * - recognition — узнать фразу среди вариантов (легче);
 * - recall — вспомнить самому: собрать из слов или сказать вслух (сложнее).
 */
export type AnswerKind = 'recognition' | 'recall';

export interface MemoryState {
  level: number;
  /** Время последнего повторения, мс. */
  last: number;
  reviews: number;
  correct: number;
}

export const emptyMemory = (): MemoryState => ({ level: 0, last: 0, reviews: 0, correct: 0 });

/**
 * Узнавание среди вариантов подтверждает, что фраза знакома, но не что вы её вспомните.
 * Для фраз, которые нужно говорить самому, оно поднимает максимум до уровня 3.
 * Для фраз, которые нужно понимать на слух, узнавания достаточно.
 */
export function recognitionCap(mustSpeak: boolean): number {
  return mustSpeak ? 3 : MAX_LEVEL;
}

export function applyAnswer(
  m: MemoryState,
  correct: boolean,
  kind: AnswerKind,
  mustSpeak: boolean,
  now: number,
): MemoryState {
  let level = m.level;
  if (correct) {
    const cap = kind === 'recall' ? MAX_LEVEL : recognitionCap(mustSpeak);
    // Верный ответ поднимает уровень на 1. Но повтор через минуту не должен
    // мгновенно давать максимум: память закрепляется повторением в разные дни,
    // поэтому в течение 12 часов уровень растёт не выше 2 (для recall — не выше 4).
    const sameDay = m.last > 0 && now - m.last < 12 * 60 * 60 * 1000;
    const dayCap = sameDay ? (kind === 'recall' ? 4 : 2) : MAX_LEVEL;
    if (level < cap) level = Math.min(level + 1, cap, Math.max(dayCap, level));
  } else {
    level = Math.max(0, level - 2);
  }
  return {
    level,
    last: now,
    reviews: m.reviews + 1,
    correct: m.correct + (correct ? 1 : 0),
  };
}

export function stabilityDays(level: number): number {
  return STABILITY_DAYS[Math.max(0, Math.min(MAX_LEVEL, level))];
}

/** Вероятность вспомнить фразу сейчас (0–1). */
export function retention(m: MemoryState, now: number): number {
  if (m.level === 0 || m.last === 0) return 0;
  const days = Math.max(0, now - m.last) / DAY;
  return 1 / (1 + days / (9 * stabilityDays(m.level)));
}

/** Сила памяти по фразе, 0–1: насколько хорошо выучена и не забыта. */
export function memoryStrength(m: MemoryState | undefined, now: number): number {
  if (!m) return 0;
  return (m.level / MAX_LEVEL) * retention(m, now);
}

/** Пора ли повторить фразу. */
export function isDue(m: MemoryState | undefined, now: number): boolean {
  if (!m || m.level === 0) return false;
  return now - m.last >= stabilityDays(m.level) * DAY;
}
