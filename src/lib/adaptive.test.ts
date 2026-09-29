import { describe, expect, it } from 'vitest';
import { scenarios } from '../data';
import { createAdaptiveSession, isSuccess, type OutcomeLike } from './adaptive';

const NOW = new Date(2026, 9, 1, 12).getTime();

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/** Прогнать сессию: verdict решает, верен ли ответ на задании с данным номером. */
function run(size: number, verdict: (i: number, o: OutcomeLike) => boolean, speech = false) {
  const src = createAdaptiveSession(scenarios.slice(0, 2), {}, NOW, speech, size, 'normal', seeded(11));
  const outcomes: OutcomeLike[] = [];
  for (let ex = src.next(outcomes); ex && outcomes.length < 40; ex = src.next(outcomes)) {
    const o: OutcomeLike = { exercise: ex };
    o.memoryCorrect = verdict(outcomes.length, o);
    outcomes.push(o);
  }
  return outcomes;
}

describe('адаптивная сессия', () => {
  it('ошибка возвращается через два задания в самом лёгком виде', () => {
    const outcomes = run(6, (i) => i !== 0);
    const failed = outcomes[0].exercise.phrase;
    // Между ошибкой и повтором — два других задания.
    expect(outcomes[1].exercise.phrase.id).not.toBe(failed.id);
    expect(outcomes[2].exercise.phrase.id).not.toBe(failed.id);
    expect(outcomes[3].exercise.phrase.id).toBe(failed.id);
    expect(outcomes[3].exercise.type).toBe(failed.speaker === 'them' ? 'listen' : 'choose-en');
    expect(outcomes).toHaveLength(6);
  });

  it('ошибка в последнем задании возвращается после плана', () => {
    const outcomes = run(4, (i) => i !== 3);
    expect(outcomes).toHaveLength(5);
    expect(outcomes[4].exercise.phrase.id).toBe(outcomes[3].exercise.phrase.id);
    expect(isSuccess(outcomes[4])).toBe(true);
  });

  it('хвост сессии — не больше двух заданий, даже если всё идёт плохо', () => {
    const outcomes = run(5, () => false);
    expect(outcomes.length).toBeLessThanOrEqual(7);
    expect(outcomes.length).toBeGreaterThan(5);
  });

  it('без ошибок сессия ровно плановой длины', () => {
    expect(run(7, () => true)).toHaveLength(7);
  });
});
