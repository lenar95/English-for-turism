import { describe, expect, it } from 'vitest';
import { isSupported, note, UNSUPPORTED_AFTER, type LangStatsMap } from './langSupport';

describe('поддержка языков распознавания', () => {
  it('неизвестный язык считается поддерживаемым', () => {
    expect(isSupported(undefined)).toBe(true);
  });

  it('две холостые попытки без единого успеха — язык не поддерживается', () => {
    let m: LangStatsMap = {};
    for (let i = 0; i < UNSUPPORTED_AFTER; i++) {
      expect(isSupported(m['tr-TR'])).toBe(true);
      m = note(m, 'tr-TR', false);
    }
    expect(isSupported(m['tr-TR'])).toBe(false);
    expect(isSupported(m['en-US'])).toBe(true);
  });

  it('язык, который хоть раз сработал, не отключается, а успех сбрасывает счётчик', () => {
    let m = note({}, 'en-US', true);
    for (let i = 0; i < 5; i++) m = note(m, 'en-US', false);
    expect(isSupported(m['en-US'])).toBe(true);
    m = note(m, 'en-US', true);
    expect(m['en-US']).toEqual({ ok: 2, empty: 0 });
  });
});
