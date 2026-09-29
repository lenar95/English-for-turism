import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscriber } from './schedule';
import { Store } from './store';

const sub = (id: string): Subscriber => ({
  id,
  tokenHash: 'h',
  subscription: { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p', auth: 'a' } },
  time: '19:00',
  tz: 'UTC',
  snapshot: { lastActiveDay: null, doneToday: 0, goal: 10, tripDate: '', minimal: false },
  variant: 0,
  createdAt: 0,
  updatedAt: 0,
});

describe('хранилище подписок', () => {
  let dir: string;
  beforeEach(() => {
    vi.useFakeTimers();
    dir = mkdtempSync(join(tmpdir(), 'eft-store-'));
  });
  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('пишет с задержкой, а flush — сразу', () => {
    const store = new Store(dir);
    store.set(sub('a'));
    const file = join(dir, 'subscribers.json');
    expect(existsSync(file)).toBe(false);
    store.flush();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
    store.set(sub('b'));
    vi.advanceTimersByTime(500);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2);
  });

  it('повторный flush без изменений ничего не делает, данные переживают перезапуск', () => {
    const store = new Store(dir);
    store.set(sub('a'));
    store.flush();
    store.flush();
    expect(new Store(dir).get('a')?.id).toBe('a');
  });
});
