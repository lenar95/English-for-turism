import { describe, expect, it } from 'vitest';
import { forEachLimited, RateLimiter } from './ratelimit';

describe('ограничение частоты', () => {
  it('пропускает не больше лимита в окне и снова пускает, когда окно сдвинулось', () => {
    const rl = new RateLimiter(3, 1000);
    expect([rl.allow('a', 0), rl.allow('a', 100), rl.allow('a', 200)]).toEqual([true, true, true]);
    expect(rl.allow('a', 300)).toBe(false);
    expect(rl.allow('b', 300)).toBe(true); // другой ключ не затронут
    expect(rl.allow('a', 1001)).toBe(true); // первое событие вышло из окна
  });

  it('sweep забывает ключи без свежих событий', () => {
    const rl = new RateLimiter(3, 1000);
    rl.allow('a', 0);
    rl.allow('b', 900);
    rl.sweep(1500);
    expect(rl.size).toBe(1);
  });
});

describe('ограниченная параллельность', () => {
  it('одновременно выполняется не больше limit задач, все элементы обработаны', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await forEachLimited([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      done.push(n);
      running--;
    });
    expect(peak).toBe(3);
    expect(done.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('пустой список — ничего не делает', async () => {
    await expect(forEachLimited([], 4, async () => undefined)).resolves.toBeUndefined();
  });
});
