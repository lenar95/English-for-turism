import { useSyncExternalStore } from 'react';

/**
 * «Сейчас» для рендера. Обновляется раз в минуту и при возвращении вкладки на экран,
 * а не на каждую перерисовку: рендер остаётся чистым, а готовность и план не «дрожат»
 * между двумя рендерами одного кадра.
 */
const TICK_MS = 60_000;
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function touch() {
  current = Date.now();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(touch, TICK_MS);
    document.addEventListener('visibilitychange', onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

function onVisible() {
  if (!document.hidden) touch();
}

const read = () => current;

export function useNow(): number {
  return useSyncExternalStore(subscribe, read, read);
}
