import type { Scenario } from '../data/types';
import type { AnswerEvent, SessionLog } from '../state/model';
import { isDue, retention } from './memory';
import type { ProgressMap } from './readiness';

const DAY = 86400000;

/**
 * Состояние ученика, оценённое по поведению.
 * Мотивацию напрямую не измерить, поэтому смотрим на «датчики»:
 * как давно занимался, как часто, насколько успешно, бросает ли сессии посередине.
 *
 * - new — только начал;
 * - flow — всё в порядке: занимается, ошибок в меру;
 * - struggling — много ошибок, риск фрустрации;
 * - coasting — почти без ошибок, риск скуки;
 * - drifting — занимается всё реже или бросает сессии, риск бросить курс;
 * - returning — вернулся после перерыва.
 */
export type MotivationState = 'new' | 'flow' | 'struggling' | 'coasting' | 'drifting' | 'returning';

export interface MotivationReading {
  state: MotivationState;
  /** Дней с последнего занятия (0 — сегодня). null — ещё не занимался. */
  daysSinceLast: number | null;
  /** Доля верных ответов среди последних 30 (null — мало данных). */
  accuracy: number | null;
  /** Дней с занятиями за последние 7 и за 7 дней до них. */
  activeLast7: number;
  activePrev7: number;
  /** Доля брошенных сессий среди последних 5. */
  earlyExitRate: number;
}

/** Целевая доля верных ответов: около 85% — учимся быстрее всего и не скучаем. */
export const TARGET_ACCURACY = 0.85;
export const ACCURACY_BAND: [number, number] = [0.7, 0.95];

export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKeyToTs(key: string): number {
  return new Date(`${key}T00:00:00`).getTime();
}

export function readMotivation(
  answers: AnswerEvent[],
  sessions: SessionLog[],
  activeDays: string[],
  now: number,
): MotivationReading {
  const today = dayStart(now);
  const days = activeDays.map(dayKeyToTs).filter((t) => !Number.isNaN(t));
  const lastDay = days.length ? Math.max(...days) : null;
  const daysSinceLast = lastDay === null ? null : Math.round((today - lastDay) / DAY);
  const activeLast7 = days.filter((d) => d > today - 7 * DAY).length;
  const activePrev7 = days.filter((d) => d <= today - 7 * DAY && d > today - 14 * DAY).length;

  const recent = answers.slice(-30);
  const accuracy = recent.length >= 8 ? recent.filter((a) => a.ok).length / recent.length : null;

  const lastSessions = sessions.filter((s) => s.kind !== 'exam').slice(-5);
  const earlyExitRate = lastSessions.length ? lastSessions.filter((s) => s.exitedEarly).length / lastSessions.length : 0;

  let state: MotivationState;
  if (!answers.length) state = 'new';
  else if (daysSinceLast !== null && daysSinceLast >= 3) state = 'returning';
  else if ((lastSessions.length >= 3 && earlyExitRate >= 0.4) || (activePrev7 >= 3 && activeLast7 <= 1)) state = 'drifting';
  else if (accuracy !== null && accuracy < ACCURACY_BAND[0]) state = 'struggling';
  else if (accuracy !== null && recent.length >= 20 && accuracy > ACCURACY_BAND[1]) state = 'coasting';
  else state = 'flow';

  return { state, daysSinceLast, accuracy, activeLast7, activePrev7, earlyExitRate };
}

export const STATE_TEXT: Record<MotivationState, { title: string; hint: string }> = {
  new: { title: 'Начало пути', hint: 'Первые занятия — самые важные. Начните с коротких сессий.' },
  flow: { title: 'Хороший темп', hint: 'Ошибок в меру — так учатся быстрее всего.' },
  struggling: {
    title: 'Много трудных заданий',
    hint: 'Приложение сейчас даёт задания полегче и чаще повторяет знакомое — это нормально.',
  },
  coasting: { title: 'Слишком легко', hint: 'Задания станут чуть сложнее, чтобы было интереснее.' },
  drifting: {
    title: 'Занятий стало меньше',
    hint: 'Хватит и минуты в день: маленький шаг лучше, чем никакого.',
  },
  returning: { title: 'С возвращением', hint: 'Начнём с разминки на том, что вы уже знаете.' },
};

/** Сколько заданий сделано сегодня. */
export function answeredToday(answers: AnswerEvent[], now: number): number {
  const start = dayStart(now);
  return answers.filter((a) => a.t >= start).length;
}

/** Сколько дней с занятиями в текущей неделе (с понедельника). */
export function activeThisWeek(activeDays: string[], now: number): { count: number; days: boolean[] } {
  const today = new Date(dayStart(now));
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const set = new Set(activeDays);
  const days: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push(set.has(key));
  }
  return { count: days.filter(Boolean).length, days };
}

/** Какую долю изученного человек, вероятно, помнит сейчас (для приветствия после перерыва). */
export function rememberedShare(scenarios: Scenario[], progress: ProgressMap, now: number): number | null {
  const learned = scenarios.flatMap((s) => s.phrases).map((p) => progress[p.id]?.memory).filter((m) => m && m.level > 0);
  if (!learned.length) return null;
  return learned.reduce((s, m) => s + retention(m!, now), 0) / learned.length;
}

export interface DailyPlan {
  /** Сколько заданий на сегодня. */
  goal: number;
  done: number;
  /** Режим «минимальный шаг»: план сжат до минуты. */
  minimal: boolean;
  /** Объяснение плана человеку. */
  message: string;
  daysLeft: number | null;
  /** Всё выучить до вылета не успеть — тренировки сосредоточены на ключевых фразах. */
  focusKey: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * План на сегодня (средний контур управления).
 * Из даты вылета и того, сколько фраз ещё не выучено, считаем дневную норму.
 * Если человек теряет темп — не повышаем требования, а сжимаем план до минимального шага.
 */
export function dailyPlan(
  scenarios: Scenario[],
  progress: ProgressMap,
  answers: AnswerEvent[],
  tripDate: string,
  reading: MotivationReading,
  now: number,
): DailyPlan {
  const phrases = scenarios.flatMap((s) => s.phrases);
  const notSolid = phrases.filter((p) => (progress[p.id]?.memory.level ?? 0) < 3).length;
  const due = phrases.filter((p) => isDue(progress[p.id]?.memory, now)).length;
  const date = tripDate ? new Date(`${tripDate}T00:00:00`).getTime() : NaN;
  const daysLeft = Number.isNaN(date) ? null : Math.round((date - dayStart(now)) / DAY);
  const done = answeredToday(answers, now);

  // Каждой новой фразе нужно ~3 задания в разные дни; повторения — по одному.
  let goal: number;
  let message: string;
  let focusKey = false;
  if (daysLeft === null) {
    goal = clamp(due + 8, 10, 25);
    message = 'Укажите дату вылета — и план подстроится под неё.';
  } else if (daysLeft <= 0) {
    goal = clamp(due, 5, 15);
    message = 'Вы в поездке! Повторите ключевые фразы перед выходом.';
  } else {
    const perDay = Math.ceil((notSolid * 3) / Math.max(daysLeft, 1));
    goal = clamp(perDay + due, 8, 30);
    if (notSolid === 0) message = 'Всё выучено — осталось повторять, чтобы не забыть.';
    else if (perDay + due > 30) {
      // Нагрузку выше разумной не требуем — честно говорим и сужаем цель.
      focusKey = true;
      message = `До вылета ${daysLeft} дн. — всё выучить не успеть, поэтому тренировки сосредоточены на ключевых фразах ★. ${goal} заданий ≈ 3 короткие тренировки.`;
    } else message = `До вылета ${daysLeft} дн. По ${goal} заданий в день — и к поездке вы будете готовы.`;
  }

  let minimal = false;
  if (reading.state === 'drifting' || reading.state === 'returning') {
    minimal = true;
    goal = Math.min(goal, 5);
    message =
      reading.state === 'returning'
        ? 'Сегодня — только разминка на минуту. Этого достаточно, чтобы вернуться в ритм.'
        : 'Хватит и минуты: пять заданий сегодня лучше, чем ни одного.';
  } else if (reading.state === 'struggling') {
    goal = Math.min(goal, 12);
  }
  return { goal, done, minimal, message, daysLeft, focusKey };
}
