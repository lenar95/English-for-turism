import { describe, expect, it } from 'vitest';
import { scenarios } from '../data';
import { allBadges } from './badges';
import { reducer, defaultData } from '../state/model';

const base = { progress: {}, exams: [], streak: 0, tripScenarios: scenarios.slice(0, 2), now: Date.now(), speechOn: true };

describe('значки', () => {
  it('у новичка нет значков, а список включает значок на каждую ситуацию поездки', () => {
    const b = allBadges(base);
    expect(b.some((x) => x.earned)).toBe(false);
    expect(b.filter((x) => x.id.startsWith('scenario:'))).toHaveLength(2);
  });

  it('значки за серию дней и проверку', () => {
    const b = allBadges({ ...base, streak: 3, exams: [{ total: 85 }] });
    const earned = b.filter((x) => x.earned).map((x) => x.id);
    expect(earned).toEqual(expect.arrayContaining(['streak-3', 'exam-first', 'exam-80']));
    expect(earned).not.toContain('streak-7');
  });

  it('полученные значки сохраняются без повторов', () => {
    let d = reducer(defaultData(), { type: 'badges', ids: ['first-step'] });
    d = reducer(d, { type: 'badges', ids: ['first-step', 'streak-3'] });
    expect(d.badges).toEqual(['first-step', 'streak-3']);
  });
});
