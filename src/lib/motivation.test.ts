import { describe, expect, it } from 'vitest';
import { scenarios } from '../data';
import { defaultData, type AnswerEvent, type SessionLog } from '../state/model';
import { dayKey } from './dates';
import { createAdaptiveSession, difficultyShift, isSuccess } from './adaptive';
import { activeThisWeek, dailyPlan, freezePlan, planIsCurrent, readMotivation, todayPlan } from './motivation';

const DAY = 86400000;
const NOW = new Date('2026-10-01T12:00:00').getTime();
const days = (...ago: number[]) => ago.map((d) => dayKey(NOW - d * DAY));
const answers = (n: number, okShare: number, t = NOW): AnswerEvent[] =>
  Array.from({ length: n }, (_, i) => ({ t: t - i * 1000, phraseId: `p${i}`, ok: i < n * okShare }));
const session = (exitedEarly: boolean): SessionLog => ({ start: NOW, end: NOW, kind: 'practice', planned: 10, done: 3, correct: 3, exitedEarly });

describe('оценка состояния', () => {
  it('новичок', () => {
    expect(readMotivation([], [], [], NOW).state).toBe('new');
  });
  it('в потоке при ~85% верных', () => {
    expect(readMotivation(answers(30, 0.85), [], days(0, 1, 2), NOW).state).toBe('flow');
  });
  it('фрустрация при большом числе ошибок', () => {
    expect(readMotivation(answers(30, 0.5), [], days(0), NOW).state).toBe('struggling');
  });
  it('скука, когда ошибок почти нет', () => {
    expect(readMotivation(answers(30, 1), [], days(0), NOW).state).toBe('coasting');
  });
  it('возвращение после 3+ дней перерыва', () => {
    expect(readMotivation(answers(30, 0.85, NOW - 5 * DAY), [], days(5, 6), NOW).state).toBe('returning');
  });
  it('угасание: бросает тренировки на середине', () => {
    const s = [session(true), session(true), session(false), session(true)];
    expect(readMotivation(answers(30, 0.85), s, days(0, 1), NOW).state).toBe('drifting');
  });
});

describe('план на день', () => {
  const trip = scenarios.slice(0, 3);
  it('растёт, когда до вылета мало дней', () => {
    const r = readMotivation([], [], [], NOW);
    const far = dailyPlan(trip, {}, [], dayKey(NOW + 30 * DAY), r, NOW);
    const near = dailyPlan(trip, {}, [], dayKey(NOW + 3 * DAY), r, NOW);
    expect(near.goal).toBeGreaterThan(far.goal);
    expect(near.goal).toBeLessThanOrEqual(30);
  });
  it('при угасании сжимается до минимального шага', () => {
    const r = readMotivation(answers(30, 0.85), [session(true), session(true), session(true)], days(0), NOW);
    const plan = dailyPlan(trip, {}, [], dayKey(NOW + 3 * DAY), r, NOW);
    expect(plan.minimal).toBe(true);
    expect(plan.goal).toBeLessThanOrEqual(5);
  });
  it('считает сделанное сегодня', () => {
    const r = readMotivation([], [], [], NOW);
    expect(dailyPlan(trip, {}, answers(7, 1), '', r, NOW).done).toBe(7);
  });
});

describe('план на день фиксируется', () => {
  const trip = scenarios.slice(0, 3);
  it('после разминки цель не скачет до следующего дня', () => {
    // Вернулся после перерыва: план сжат до минимального шага.
    let data = {
      ...defaultData(),
      activeDays: days(5, 6),
      answers: answers(30, 0.85, NOW - 5 * DAY),
      trip: { ...defaultData().trip, date: dayKey(NOW + 10 * DAY) },
    };
    const fresh = todayPlan(data, trip, NOW);
    expect(fresh.minimal).toBe(true);
    data = { ...data, todayPlan: freezePlan(fresh, data.trip, NOW) };
    // Сделал пять заданий: состояние уже не «вернулся», но план прежний, а сделанное считается живьём.
    data = { ...data, answers: [...data.answers, ...answers(5, 1, NOW + 60000)], activeDays: [...data.activeDays, dayKey(NOW)] };
    expect(readMotivation(data.answers, data.sessions, data.activeDays, NOW + 60000).state).not.toBe('returning');
    const after = todayPlan(data, trip, NOW + 60000);
    expect(after.goal).toBe(fresh.goal);
    expect(after.minimal).toBe(true);
    expect(after.done).toBe(5);
    // Назавтра и при смене даты вылета план считается заново.
    expect(planIsCurrent(data.todayPlan, data.trip, NOW + DAY)).toBe(false);
    expect(todayPlan(data, trip, NOW + DAY).goal).toBeGreaterThan(fresh.goal);
    expect(planIsCurrent(data.todayPlan, { ...data.trip, date: dayKey(NOW + 3 * DAY) }, NOW)).toBe(false);
  });
});

describe('неделя', () => {
  it('считает дни текущей недели с понедельника', () => {
    // 1 октября 2026 — четверг.
    const w = activeThisWeek(days(0, 1, 7), NOW);
    expect(w.count).toBe(2);
    expect(w.days).toHaveLength(7);
  });
});

describe('адаптивная тренировка', () => {
  const mk = (ok: boolean) => ({ exercise: { phrase: { id: 'x' } } as never, memoryCorrect: ok });
  it('облегчает после ошибок и усложняет после серии успехов', () => {
    expect(difficultyShift([mk(false), mk(false), mk(true)])).toBe(-1);
    expect(difficultyShift([mk(true), mk(true), mk(true), mk(true)])).toBe(1);
    expect(difficultyShift([mk(true), mk(false), mk(true), mk(true)])).toBe(0);
  });

  it('возвращает к ошибке и заканчивает на успехе', () => {
    let seed = 3;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const src = createAdaptiveSession(scenarios.slice(0, 2), {}, NOW, false, 5, 'normal', rng);
    const outcomes: { exercise: ReturnType<typeof src.next> & object; memoryCorrect: boolean }[] = [];
    let ex = src.next([]);
    let i = 0;
    while (ex && i < 20) {
      // Первая ошибка, потом только последняя плановая — ошибка.
      const ok = !(i === 0 || i === 4);
      outcomes.push({ exercise: ex, memoryCorrect: ok });
      ex = src.next(outcomes);
      i++;
    }
    const firstId = outcomes[0].exercise.phrase.id;
    expect(outcomes.slice(1).some((o) => o.exercise.phrase.id === firstId)).toBe(true);
    expect(outcomes.length).toBe(6);
    expect(isSuccess(outcomes[outcomes.length - 1])).toBe(true);
  });
});
