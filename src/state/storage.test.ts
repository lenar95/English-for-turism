// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn(async (_options: unknown) => undefined);
vi.mock('@capacitor/preferences', () => ({ Preferences: { set: (o: unknown) => set(o), get: async () => ({ value: null }) } }));

import { defaultData } from './model';
import { flushSave, saveData } from './storage';

describe('сохранение', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    set.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('несколько изменений подряд пишутся один раз, с задержкой', () => {
    saveData({ ...defaultData(), weeklyGoal: 3 });
    saveData({ ...defaultData(), weeklyGoal: 5 });
    expect(set).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.parse((set.mock.calls[0] as unknown as [{ value: string }])[0].value).weeklyGoal).toBe(5);
  });

  it('уход со страницы записывает сразу и не оставляет отложенной записи', () => {
    saveData({ ...defaultData(), weeklyGoal: 6 });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(set).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(set).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });

  it('pagehide и повторный flush без изменений ничего не пишут лишнего', () => {
    saveData({ ...defaultData(), weeklyGoal: 2 });
    window.dispatchEvent(new Event('pagehide'));
    flushSave();
    expect(set).toHaveBeenCalledTimes(1);
  });
});
