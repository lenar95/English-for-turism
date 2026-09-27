import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeRecognition } from '@capgo/capacitor-speech-recognition';
import { diag } from './diag';
import { msSinceSpeech } from './tts';

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
  onaudiostart?: (() => void) | null;
  onstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
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

/** Активная запись в браузере: одновременно может идти только одна. */
let activeWeb: { abort(): void } | null = null;

/**
 * Один объект распознавания на всю страницу. Safari на iPhone плохо переносит
 * создание нового объекта на каждую запись: первая запись работает, следующие — нет.
 * Если общий объект перестал отвечать, его заменяем свежим.
 */
let shared: WebRecognition | null = null;
/** Общий объект сейчас запущен (start уже был, onend ещё не пришёл). */
let sharedRunning = false;
let sessionSeq = 0;

function takeRecognition(Ctor: WebRecognitionCtor, fresh: boolean): WebRecognition {
  if (fresh && shared) {
    const old = shared;
    old.onresult = old.onerror = old.onend = null;
    old.onaudiostart = old.onstart = old.onspeechstart = null;
    try {
      old.abort();
    } catch {
      /* ignore */
    }
    shared = null;
    sharedRunning = false;
  }
  if (!shared) {
    shared = new Ctor();
    diag('создан новый объект распознавания');
  }
  return shared;
}

/**
 * Распознавание в браузере со страховками от зависаний:
 * - после паузы в речи (silenceMs) запись останавливается сама;
 * - если после остановки браузер не ответил (0,6–1,2 с) — берём то, что успело распознаться;
 * - если микрофон так и не заработал — перезапуск со свежим объектом (до 2 раз);
 * - если за 8 с не распознано ни слова — сообщаем «ничего не услышали», а не висим.
 */
function listenWeb({ lang = 'en-US', onPartial, silenceMs = 1500, maxMs = 12000 }: ListenOptions): ListenSession {
  const Ctor = webCtor();
  if (!Ctor) {
    return {
      result: Promise.reject(new RecognitionError('unsupported')),
      stop() {},
      abort() {},
    };
  }
  // Предыдущая запись (например, на другой карточке) должна закончиться.
  activeWeb?.abort();

  const id = ++sessionSeq;
  const log = (m: string) => diag(`#${id} ${m}`);
  log('старт записи');

  let rec: WebRecognition | null = null;
  let alternatives: string[] = [];
  let error: RecognitionError | null = null;
  let settled = false;
  let aborted = false;
  let audioStarted = false;
  let restarts = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;

  let resolveResult!: (v: string[]) => void;
  let rejectResult!: (e: RecognitionError) => void;
  const result = new Promise<string[]>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  const detach = (r: WebRecognition) => {
    r.onresult = r.onerror = r.onend = null;
    r.onaudiostart = r.onstart = r.onspeechstart = null;
  };

  const finish = (why: string) => {
    if (settled) return;
    settled = true;
    timers.forEach(clearTimeout);
    timers.clear();
    const r = rec;
    rec = null;
    if (r) {
      detach(r);
      // Браузер так и не сообщил об окончании — этому объекту больше не доверяем.
      if (sharedRunning && r === shared) {
        log('браузер не завершил запись — сбрасываем объект');
        takeRecognition(Ctor, true);
      }
    }
    if (activeWeb === session) activeWeb = null;
    log(`конец (${why}): ${alternatives.length ? `«${alternatives[0]}»` : error ? `ошибка ${error.message}` : 'ничего'}`);
    if (aborted) rejectResult(new RecognitionError('aborted'));
    else if (alternatives.length) resolveResult(alternatives);
    else rejectResult(error ?? new RecognitionError('no-speech'));
  };

  /** Мягкая остановка: просим браузер закончить, но ждём недолго. */
  const stop = () => {
    if (settled) return;
    log('стоп');
    try {
      rec?.stop();
    } catch {
      /* ignore */
    }
    later(() => finish('таймаут после стопа'), alternatives.length ? 600 : 1200);
  };

  const begin = (fresh: boolean) => {
    if (settled) return;
    const r = takeRecognition(Ctor, fresh || sharedRunning);
    rec = r;
    r.lang = lang;
    r.interimResults = true;
    r.maxAlternatives = 5;
    r.continuous = false;
    r.onstart = () => log('onstart');
    r.onaudiostart = () => {
      audioStarted = true;
      log('микрофон включился');
    };
    r.onspeechstart = () => log('слышна речь');
    r.onresult = (e) => {
      audioStarted = true;
      // Склеиваем все сегменты: для каждой гипотезы берём её вариант в каждом сегменте.
      const segs = Array.from(e.results);
      const maxAlt = Math.max(...segs.map((x) => x.length));
      const alts: string[] = [];
      for (let a = 0; a < maxAlt; a++) {
        alts.push(segs.map((x) => (x[a] ?? x[0]).transcript).join(' ').trim());
      }
      alternatives = alts.filter(Boolean);
      log(`результат: «${alternatives[0] ?? ''}»`);
      onPartial?.(alternatives[0] ?? '');
      // Пауза после речи — фраза сказана, заканчиваем.
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        timers.delete(silenceTimer);
      }
      silenceTimer = later(stop, silenceMs);
    };
    r.onerror = (e) => {
      log(`ошибка: ${e.error}`);
      const map: Record<string, RecognitionErrorCode> = {
        'not-allowed': 'permission',
        'service-not-allowed': 'permission',
        'no-speech': 'no-speech',
        network: 'network',
        aborted: 'aborted',
      };
      error = new RecognitionError(map[e.error] ?? 'unknown', e.error);
      if (error.code === 'permission' || error.code === 'network') finish('ошибка');
    };
    r.onend = () => {
      sharedRunning = false;
      log('onend');
      finish('браузер завершил');
    };
    try {
      r.start();
      sharedRunning = true;
    } catch (err) {
      log(`start() не сработал: ${err instanceof Error ? err.name : String(err)}`);
    }
    // Микрофон так и не включился и ничего не распознано — пробуем свежий объект.
    later(() => {
      if (settled || rec !== r || audioStarted || alternatives.length || restarts >= 2) return;
      restarts++;
      log(`микрофон не включился за 2,5 с — перезапуск №${restarts}`);
      detach(r);
      later(() => begin(true), 300);
    }, 2500);
  };

  const session = {
    result,
    stop,
    abort: () => {
      if (settled) return;
      aborted = true;
      log('отмена');
      try {
        rec?.abort();
      } catch {
        /* ignore */
      }
      finish('отмена');
    },
  };
  activeWeb = session;
  // Если только что звучала озвучка, даём браузеру переключить аудио с динамика на микрофон.
  const wait = Math.max(0, 500 - msSinceSpeech());
  if (wait) log(`пауза ${wait} мс после озвучки`);
  later(() => begin(false), wait);
  // Ни одного слова за 9 с — не висим, а сообщаем, что ничего не услышали.
  later(() => {
    if (!alternatives.length) finish('ничего не распознано за 9 с');
  }, 9000);
  later(stop, maxMs);
  return session;
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
