import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeRecognition } from '@capgo/capacitor-speech-recognition';

/**
 * Распознавание английской речи.
 * В браузере — Web Speech API (Chrome, Edge, Safari), в iOS-приложении —
 * нативный распознаватель Apple (SFSpeechRecognizer) через плагин Capacitor.
 */

export type RecognitionErrorCode =
  | 'unsupported'
  | 'permission'
  | 'no-speech'
  | 'network'
  | 'aborted'
  | 'unknown';

export class RecognitionError extends Error {
  constructor(public code: RecognitionErrorCode, message?: string) {
    super(message ?? code);
  }
}

export interface ListenSession {
  /** Гипотезы распознавателя, лучшая первая. */
  result: Promise<string[]>;
  /** Закончить запись и получить результат. */
  stop(): void;
  /** Отменить без результата. */
  abort(): void;
}

export interface ListenOptions {
  lang?: string;
  onPartial?: (text: string) => void;
  /** Сколько тишины после речи ждать до автоматической остановки, мс. */
  silenceMs?: number;
  /** Максимальная длительность записи, мс. */
  maxMs?: number;
}

type WebRecognitionCtor = new () => WebRecognition;
interface WebRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: WebRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface WebRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

function webCtor(): WebRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as WebRecognitionCtor | null;
}

let nativeAvailable: boolean | null = null;

/** Доступно ли распознавание речи на этом устройстве. */
export async function recognitionAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    if (nativeAvailable === null) {
      nativeAvailable = await NativeRecognition.available()
        .then((r) => r.available)
        .catch(() => false);
    }
    return nativeAvailable;
  }
  return webCtor() !== null;
}

/** Синхронная проверка для браузера (для первого рендера). */
export function recognitionLikelyAvailable(): boolean {
  return Capacitor.isNativePlatform() || webCtor() !== null;
}

export function listen(opts: ListenOptions = {}): ListenSession {
  return Capacitor.isNativePlatform() ? listenNative(opts) : listenWeb(opts);
}

function listenWeb({ lang = 'en-US', onPartial, maxMs = 12000 }: ListenOptions): ListenSession {
  const Ctor = webCtor();
  if (!Ctor) {
    return {
      result: Promise.reject(new RecognitionError('unsupported')),
      stop() {},
      abort() {},
    };
  }
  const rec = new Ctor();
  rec.lang = lang;
  rec.interimResults = true;
  rec.maxAlternatives = 5;
  rec.continuous = false;

  let alternatives: string[] = [];
  let aborted = false;
  let error: RecognitionError | null = null;

  const result = new Promise<string[]>((resolve, reject) => {
    rec.onresult = (e) => {
      // Склеиваем все сегменты: для каждой гипотезы берём её вариант в каждом сегменте.
      const segs = Array.from(e.results);
      const maxAlt = Math.max(...segs.map((s) => s.length));
      const alts: string[] = [];
      for (let a = 0; a < maxAlt; a++) {
        alts.push(segs.map((s) => (s[a] ?? s[0]).transcript).join(' ').trim());
      }
      alternatives = alts.filter(Boolean);
      onPartial?.(alternatives[0] ?? '');
    };
    rec.onerror = (e) => {
      const map: Record<string, RecognitionErrorCode> = {
        'not-allowed': 'permission',
        'service-not-allowed': 'permission',
        'no-speech': 'no-speech',
        network: 'network',
        aborted: 'aborted',
      };
      error = new RecognitionError(map[e.error] ?? 'unknown', e.error);
    };
    rec.onend = () => {
      clearTimeout(timer);
      if (aborted) reject(new RecognitionError('aborted'));
      else if (alternatives.length) resolve(alternatives);
      else reject(error ?? new RecognitionError('no-speech'));
    };
  });
  const timer = setTimeout(() => rec.stop(), maxMs);
  try {
    rec.start();
  } catch {
    // start() бросает, если распознавание уже запущено — onend всё равно придёт.
  }
  return {
    result,
    stop: () => rec.stop(),
    abort: () => {
      aborted = true;
      rec.abort();
    },
  };
}

function listenNative({ lang = 'en-US', onPartial, silenceMs = 1600, maxMs = 12000 }: ListenOptions): ListenSession {
  let matches: string[] = [];
  let settled = false;
  let aborted = false;
  const handles: Promise<PluginListenerHandle>[] = [];
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let finish: () => void = () => {};

  const cleanup = () => {
    clearTimeout(silenceTimer);
    clearTimeout(maxTimer);
    handles.forEach((h) => void h.then((x) => x.remove()).catch(() => undefined));
  };

  const result = new Promise<string[]>((resolve, reject) => {
    finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      void NativeRecognition.stop().catch(() => undefined);
      if (aborted) reject(new RecognitionError('aborted'));
      else if (matches.length) resolve(matches);
      else reject(new RecognitionError('no-speech'));
    };

    (async () => {
      let perm = await NativeRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') perm = await NativeRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') throw new RecognitionError('permission');

      handles.push(
        NativeRecognition.addListener('partialResults', (e) => {
          const m = (e.matches ?? []).filter(Boolean);
          if (!m.length) return;
          matches = m;
          onPartial?.(m[0]);
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(finish, silenceMs);
        }),
        NativeRecognition.addListener('listeningState', (e) => {
          if (e.status === 'stopped' || e.state === 'stopped') finish();
        }),
      );
      maxTimer = setTimeout(finish, maxMs);
      const res = await NativeRecognition.start({
        language: lang,
        maxResults: 5,
        partialResults: true,
        popup: false,
      });
      if (res?.matches?.length) matches = res.matches;
    })().catch((err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof RecognitionError ? err : new RecognitionError('unknown', String(err)));
    });
  });

  return {
    result,
    stop: () => finish(),
    abort: () => {
      aborted = true;
      finish();
    },
  };
}

export function recognitionErrorText(err: unknown): string {
  const code = err instanceof RecognitionError ? err.code : 'unknown';
  switch (code) {
    case 'unsupported':
      return 'Этот браузер не умеет распознавать речь. Откройте приложение в Chrome, Edge или Safari.';
    case 'permission':
      return 'Нет доступа к микрофону. Разрешите его в настройках браузера или телефона.';
    case 'no-speech':
      return 'Ничего не услышали. Нажмите на микрофон и скажите фразу погромче.';
    case 'network':
      return 'Для распознавания речи нужен интернет. Проверьте подключение.';
    case 'aborted':
      return 'Запись отменена.';
    default:
      return 'Не удалось распознать речь. Попробуйте ещё раз.';
  }
}
