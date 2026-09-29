import { describe, expect, it } from 'vitest';
import { applyAnswer, emptyMemory, isDue, memoryStrength, retention } from './memory';

const DAY = 86400000;
const T0 = Date.UTC(2026, 0, 1);

describe('модель памяти', () => {
  it('новая фраза — ноль', () => {
    expect(memoryStrength(emptyMemory(), T0)).toBe(0);
  });

  it('узнавание среди вариантов не поднимает «говорящую» фразу выше 3 уровня', () => {
    let m = emptyMemory();
    for (let d = 0; d < 10; d++) m = applyAnswer(m, true, 'recognition', true, T0 + d * DAY);
    expect(m.level).toBe(3);
  });

  it('фразу «на слух» можно довести до максимума узнаванием', () => {
    let m = emptyMemory();
    for (let d = 0; d < 10; d++) m = applyAnswer(m, true, 'recognition', false, T0 + d * DAY);
    expect(m.level).toBe(5);
  });

  it('много повторов подряд в один день не дают максимума', () => {
    let m = emptyMemory();
    for (let i = 0; i < 10; i++) m = applyAnswer(m, true, 'recall', true, T0 + i * 60000);
    expect(m.level).toBe(4);
  });

  it('ошибка понижает уровень на 2 и назначает повтор на завтра', () => {
    let m = emptyMemory();
    for (let d = 0; d < 4; d++) m = applyAnswer(m, true, 'recall', true, T0 + d * DAY);
    expect(m.level).toBe(4);
    expect(isDue(m, T0 + 5 * DAY)).toBe(false); // на уровне 4 стабильность 16 дней
    m = applyAnswer(m, false, 'recall', true, T0 + 5 * DAY);
    expect(m.level).toBe(2);
    expect(isDue(m, T0 + 5 * DAY + DAY / 2)).toBe(false);
    expect(isDue(m, T0 + 6 * DAY)).toBe(true);
  });

  it('фраза, которую ни разу не вспомнили, всё равно попадает в «пора повторить»', () => {
    expect(isDue(emptyMemory(), T0)).toBe(false);
    const failed = applyAnswer(emptyMemory(), false, 'recall', true, T0);
    expect(failed.level).toBe(0);
    expect(isDue(failed, T0 + DAY / 2)).toBe(false);
    expect(isDue(failed, T0 + DAY)).toBe(true);
  });

  it('со временем фраза забывается, и её пора повторить', () => {
    const m = applyAnswer(emptyMemory(), true, 'recall', true, T0);
    expect(retention(m, T0)).toBeCloseTo(1);
    expect(retention(m, T0 + DAY)).toBeCloseTo(0.9, 2);
    expect(retention(m, T0 + 30 * DAY)).toBeLessThan(0.3);
    expect(isDue(m, T0 + DAY / 2)).toBe(false);
    expect(isDue(m, T0 + 2 * DAY)).toBe(true);
  });
});
