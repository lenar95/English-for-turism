import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition as NativeRecognition } from '@capgo/capacitor-speech-recognition';
import { diag } from './diag';
import { initialState, step, type RecEffect, type RecEvent, type RecognitionErrorCode, type TimerName } from './recognitionMachine';
import { msSinceSpeech } from './tts';

/**
 * Распознавание английской речи.
 * В браузере — Web Speech API (Chrome, Edge, Safari), в iOS-приложении —
 * нативный распознаватель Apple (SFSpeechRecognizer) через плагин Capacitor.
 */

export type { RecognitionErrorCode };

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

/**
 * Режимы работы на iPhone. Safari после первой записи иногда включает микрофон,
 * но не передаёт звук в распознавание. Если попытка прошла «вхолостую»,
 * переключаемся на следующий режим и запоминаем тот, что сработал.
 * 0 — обычный;
 * 1 — держим микрофон открытым (getUserMedia), чтобы iOS не переключала звук в режим воспроизведения;
 * 2 — то же + без промежуточных результатов и со свежим объектом на каждую запись.
 */
const STRATEGY_KEY = 'eft:speech-strategy';
const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
let strategy = (() => {
  try {
    const saved = localStorage.getItem(STRATEGY_KEY);
    if (saved !== null) return Math.min(2, Number(saved) || 0);
  } catch {
    /* ignore */
  }
  // На iPhone обычный режим после первой записи перестаёт получать звук — сразу держим микрофон открытым.
  return isIOS ? 1 : 0;
})();
let emptyInRow = 0;

function setStrategy(n: number, why: string) {
  strategy = n;
  emptyInRow = 0;
  diag(`режим ${n}: ${why}`);
  try {
    localStorage.setItem(STRATEGY_KEY, String(n));
  } catch {
    /* ignore */
  }
}

let micStream: MediaStream | null = null;
let micRequest: Promise<void> | null = null;

// Ушли со страницы — отпускаем микрофон (иначе горит значок записи). Вернёмся — откроем снова при записи.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
      diag('страница скрыта — микрофон отпущен');
    }
  });
}

/** Открыть микрофон и держать поток, пока открыта страница. */
function keepMicOpen(): Promise<void> {
  if (micStream && micStream.getAudioTracks().some((t) => t.readyState === 'live')) return Promise.resolve();
  if (micRequest) return micRequest;
  if (!navigator.mediaDevices?.getUserMedia) return Promise.resolve();
  micRequest = navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      micStream = stream;
      diag('микрофон удерживается открытым');
      // iOS глушит поток на время озвучки и обычно возвращает звук после неё, поэтому по mute
      // поток не отпускаем, только пишем в журнал; закрытый системой поток отпускаем.
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('mute', () => diag('микрофон: система заглушила поток'));
        track.addEventListener('unmute', () => diag('микрофон: поток снова передаёт звук'));
        track.addEventListener('ended', () => {
          if (micStream !== stream) return;
          micStream = null;
          diag('микрофон: поток закрыт системой — следующая запись откроет его заново');
        });
      }
    })
    .catch((err: unknown) => diag(`getUserMedia не сработал: ${err instanceof Error ? err.name : String(err)}`))
    .finally(() => {
      micRequest = null;
    });
  return micRequest;
}

/**
 * Лестница восстановления после холостых попыток (микрофон включился, звука нет).
 * Так бывает на iPhone после озвучки: iOS глушит вход страницы и не возвращает его.
 * Каждая следующая холостая попытка пробует более сильное средство и пишет это в журнал,
 * чтобы по нему было видно, что помогло:
 * 1 — отпустить удерживаемый микрофон и открыть заново;
 * 2 — то же плюс попросить у iOS режим «запись и воспроизведение» (navigator.audioSession);
 * 3 — дальше не удерживать микрофон вовсе.
 * Если и это не помогает, надёжно помогает только перезагрузка страницы — её предлагает интерфейс.
 */
let holdMic = true;

function releaseHeldMic(): void {
  if (!micStream) return;
  micStream.getTracks().forEach((t) => t.stop());
  micStream = null;
}

function requestPlayAndRecord(): boolean {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return false;
  try {
    session.type = 'play-and-record';
    return true;
  } catch {
    return false;
  }
}

function recover(id: number): void {
  // Синтез речи мог остаться «владельцем» звука после озвучки — на всякий случай снимаем.
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  if (emptyInRow <= 1) {
    releaseHeldMic();
    diag(`#${id} восстановление 1: микрофон отпущен, следующая запись откроет его заново`);
  } else if (emptyInRow === 2) {
    releaseHeldMic();
    const ok = requestPlayAndRecord();
    diag(`#${id} восстановление 2: режим «запись и воспроизведение» ${ok ? 'запрошен' : 'недоступен'}, микрофон откроется заново`);
  } else {
    releaseHeldMic();
    holdMic = false;
    diag(`#${id} восстановление 3: дальше без удержания микрофона`);
  }
}

/** Запись подряд несколько раз не слышит звука: интерфейс предлагает перезагрузить страницу. */
export function recognitionStuck(): boolean {
  return emptyInRow >= 2;
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

/** Все гипотезы распознавателя: для каждой — её вариант в каждом сегменте, склеенный в строку. */
function alternativesOf(e: WebRecognitionEvent): string[] {
  const segs = Array.from(e.results);
  const maxAlt = Math.max(...segs.map((x) => x.length));
  const alts: string[] = [];
  for (let a = 0; a < maxAlt; a++) alts.push(segs.map((x) => (x[a] ?? x[0]).transcript).join(' ').trim());
  return alts.filter(Boolean);
}

/**
 * Распознавание в браузере. Вся логика страховок от зависаний живёт в машине состояний
 * (recognitionMachine.ts); здесь — только перевод событий браузера и таймеров в её события
 * и исполнение её эффектов.
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
  let state = initialState(strategy, emptyInRow);
  const timers = new Map<TimerName, ReturnType<typeof setTimeout>>();
  let rec: WebRecognition | null = null;
  const now = () => Date.now();

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

  const attach = (r: WebRecognition, run: number) => {
    r.onstart = () => dispatch({ type: 'rec-start', now: now(), run });
    r.onaudiostart = () => dispatch({ type: 'rec-audio', now: now(), run });
    r.onspeechstart = () => dispatch({ type: 'rec-speech', now: now(), run });
    r.onresult = (e) => dispatch({ type: 'rec-result', now: now(), run, alternatives: alternativesOf(e) });
    r.onerror = (e) => dispatch({ type: 'rec-error', now: now(), run, error: e.error });
    r.onend = () => {
      sharedRunning = false;
      dispatch({ type: 'rec-end', now: now(), run });
    };
  };

  const session: ListenSession = {
    result,
    stop: () => dispatch({ type: 'stop', now: now() }),
    abort: () => dispatch({ type: 'abort', now: now() }),
  };

  const perform = (effect: RecEffect) => {
    switch (effect.type) {
      case 'log':
        diag(`#${id} ${effect.message}`);
        break;
      case 'keepMic':
        void keepMicOpen().then(() => dispatch({ type: 'mic-ready', now: now(), msSinceSpeech: msSinceSpeech() }));
        break;
      case 'timer': {
        const { name } = effect;
        clearTimeout(timers.get(name));
        timers.set(
          name,
          setTimeout(() => {
            timers.delete(name);
            dispatch({ type: 'timer', now: now(), name });
          }, effect.ms),
        );
        break;
      }
      case 'clearTimer':
        clearTimeout(timers.get(effect.name));
        timers.delete(effect.name);
        break;
      case 'begin': {
        const r = takeRecognition(Ctor, effect.fresh || sharedRunning || state.strategy >= 2);
        rec = r;
        r.lang = lang;
        r.interimResults = effect.interim;
        r.maxAlternatives = 5;
        r.continuous = false;
        attach(r, effect.run);
        try {
          r.start();
          sharedRunning = true;
        } catch (err) {
          dispatch({ type: 'rec-start-failed', now: now(), run: effect.run, message: err instanceof Error ? err.name : String(err) });
        }
        break;
      }
      case 'stopRec':
        try {
          rec?.stop();
        } catch {
          /* ignore */
        }
        break;
      case 'abortRec':
        try {
          rec?.abort();
        } catch {
          /* ignore */
        }
        break;
      case 'detachRec':
        if (rec) detach(rec);
        break;
      case 'finish': {
        timers.forEach((t) => clearTimeout(t));
        timers.clear();
        const r = rec;
        rec = null;
        if (r) {
          detach(r);
          // Браузер так и не сообщил об окончании — этому объекту больше не доверяем.
          if (sharedRunning && r === shared) {
            diag(`#${id} браузер не завершил запись — сбрасываем объект`);
            takeRecognition(Ctor, true);
          }
        }
        if (activeWeb === session) activeWeb = null;
        break;
      }
      case 'partial':
        onPartial?.(effect.text);
        break;
      case 'releaseMic':
        recover(id);
        break;
      case 'strategy':
        setStrategy(effect.value, effect.why);
        break;
      case 'resolve':
        resolveResult(effect.alternatives);
        break;
      case 'reject':
        rejectResult(new RecognitionError(effect.code));
        break;
    }
  };

  const dispatch = (event: RecEvent) => {
    if (state.phase === 'done') return;
    const out = step(state, event, { silenceMs, maxMs });
    state = out.state;
    emptyInRow = state.emptyInRow;
    for (const effect of out.effects) perform(effect);
  };

  activeWeb = session;
  const track = micStream?.getAudioTracks()[0];
  const micLive = Boolean(track && track.readyState === 'live');
  if (track) diag(`#${id} удерживаемый микрофон: ${track.readyState}${track.muted ? ', заглушён' : ''}${track.enabled ? '' : ', выключен'}`);
  // Если удержание микрофона решено не использовать (см. recover), машина сразу запускает запись.
  dispatch({ type: 'start', now: now(), msSinceSpeech: msSinceSpeech(), micLive: holdMic ? micLive : true, lang });
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
