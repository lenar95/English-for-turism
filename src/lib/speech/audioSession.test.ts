// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('режим звука на iPhone', () => {
  let play: ReturnType<typeof vi.fn>;
  let pause: ReturnType<typeof vi.fn>;
  const session = { type: 'auto' };

  beforeEach(() => {
    vi.resetModules();
    session.type = 'auto';
    play = vi.fn(async () => undefined);
    pause = vi.fn();
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
    URL.createObjectURL = vi.fn(() => 'blob:silent');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'audioSession');
  });

  const onIPhone = (withSession = true) => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: IPHONE });
    if (withSession) Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
  };

  it('на время озвучки — режим воспроизведения и беззвучный аудиоэлемент, потом обратно', async () => {
    onIPhone();
    const { beginPlayback } = await import('./audioSession');
    const release = beginPlayback();
    expect(session.type).toBe('playback');
    expect(play).toHaveBeenCalledTimes(1);
    release();
    expect(session.type).toBe('auto');
    expect(pause).toHaveBeenCalled();
    // Повторный вызов безопасен.
    release();
    expect(session.type).toBe('auto');
  });

  it('перед записью — режим записи и воспроизведения', async () => {
    onIPhone();
    const { beginPlayback, beginRecording } = await import('./audioSession');
    beginPlayback();
    beginRecording();
    expect(session.type).toBe('play-and-record');
  });

  it('старая iOS без audioSession: хотя бы беззвучный аудиоэлемент', async () => {
    onIPhone(false);
    const { beginPlayback } = await import('./audioSession');
    beginPlayback()();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('отказ автовоспроизведения не ломает озвучку', async () => {
    onIPhone();
    play.mockRejectedValue(new DOMException('no gesture', 'NotAllowedError'));
    const { beginPlayback } = await import('./audioSession');
    expect(() => beginPlayback()()).not.toThrow();
  });

  it('вне iPhone ничего не трогает', async () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140' });
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    const { beginPlayback, beginRecording } = await import('./audioSession');
    beginPlayback()();
    beginRecording();
    expect(session.type).toBe('auto');
    expect(play).not.toHaveBeenCalled();
  });
});
