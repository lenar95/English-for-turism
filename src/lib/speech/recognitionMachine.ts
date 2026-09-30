/**
 * Машина состояний записи речи в браузере: чистая логика без таймеров и DOM.
 *
 * Адаптер (recognition.ts) переводит события браузера и таймеров в `RecEvent`,
 * а получаемые эффекты исполняет: запускает распознаватель, ставит таймеры,
 * отдаёт результат. Так все обходы капризов Safari на iPhone проверяются тестами
 * с фейковыми событиями, а не только на телефоне.
 *
 * Страховки, которые здесь закодированы:
 * - после паузы в речи (silenceMs) запись останавливается сама;
 * - если после остановки браузер не ответил (0,6–1,2 с) — берём то, что успело распознаться;
 * - если микрофон так и не заработал — перезапуск со свежим объектом (до 2 раз);
 * - если за 9 с не распознано ни слова — «ничего не услышали», а не зависание;
 * - «холостая» попытка (микрофон включился, речи и текста нет) переключает режим работы:
 *   0 — обычный; 1 — держим микрофон открытым; 2 — то же, без промежуточных результатов
 *   и со свежим объектом на каждую запись;
 * - в режимах с удерживаемым микрофоном холостая попытка ещё и отпускает его: iOS иногда
 *   перестаёт отдавать звук через давно открытый поток, хотя тот выглядит живым, и тогда
 *   не помогает даже свежий объект распознавания. Следующая запись откроет микрофон заново.
 */

export type RecognitionErrorCode = 'unsupported' | 'permission' | 'no-speech' | 'network' | 'aborted' | 'unknown';

export type TimerName = 'begin' | 'silence' | 'afterStop' | 'restartCheck' | 'restartBegin' | 'noWords' | 'max';

export type Phase = 'idle' | 'mic' | 'pending' | 'active' | 'done';

export interface RecState {
  phase: Phase;
  /** Режим работы (см. выше). Сохраняется между записями. */
  strategy: number;
  /** Сколько холостых попыток подряд. Сохраняется между записями. */
  emptyInRow: number;
  alternatives: string[];
  error: RecognitionErrorCode | null;
  aborted: boolean;
  audioStarted: boolean;
  speechHeard: boolean;
  restarts: number;
  startedAt: number;
  /** Номер запуска распознавателя: события от старого объекта игнорируются. */
  run: number;
}

export type RecEvent =
  | { type: 'start'; now: number; msSinceSpeech: number; micLive: boolean; lang?: string }
  | { type: 'mic-ready'; now: number; msSinceSpeech: number }
  | { type: 'timer'; now: number; name: TimerName }
  | { type: 'rec-start'; now: number; run: number }
  | { type: 'rec-audio'; now: number; run: number }
  | { type: 'rec-speech'; now: number; run: number }
  | { type: 'rec-result'; now: number; run: number; alternatives: string[] }
  | { type: 'rec-error'; now: number; run: number; error: string }
  | { type: 'rec-end'; now: number; run: number }
  | { type: 'rec-start-failed'; now: number; run: number; message: string }
  | { type: 'stop'; now: number }
  | { type: 'abort'; now: number };

export type RecEffect =
  | { type: 'log'; message: string }
  | { type: 'keepMic' }
  | { type: 'timer'; name: TimerName; ms: number }
  | { type: 'clearTimer'; name: TimerName }
  /** Запустить распознаватель. fresh — обязательно новый объект; interim — с промежуточными результатами. */
  | { type: 'begin'; run: number; fresh: boolean; interim: boolean }
  | { type: 'stopRec' }
  | { type: 'abortRec' }
  /** Отцепить обработчики от текущего объекта (перед перезапуском). */
  | { type: 'detachRec' }
  /** Запись окончена: снять таймеры, отпустить объект. */
  | { type: 'finish' }
  | { type: 'partial'; text: string }
  | { type: 'strategy'; value: number; why: string }
  /** Отпустить удерживаемый микрофон: следующая запись откроет его заново. */
  | { type: 'releaseMic' }
  | { type: 'resolve'; alternatives: string[] }
  | { type: 'reject'; code: RecognitionErrorCode };

export interface RecOptions {
  silenceMs: number;
  maxMs: number;
}

/** Сколько ждать между озвучкой и включением микрофона (браузер переключает аудио с динамика). */
export const AFTER_SPEECH_MS = 500;
/** Микрофон не включился за это время — перезапуск. */
export const RESTART_CHECK_MS = 2500;
export const RESTART_DELAY_MS = 300;
export const MAX_RESTARTS = 2;
/** Ни одного слова за это время — «ничего не услышали». */
export const NO_WORDS_MS = 9000;
/** Попытка длиннее этого без речи и текста при включённом микрофоне — холостая. */
export const EMPTY_ATTEMPT_MS = 2500;

const ERROR_CODES: Record<string, RecognitionErrorCode> = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  'no-speech': 'no-speech',
  network: 'network',
  aborted: 'aborted',
};

export function initialState(strategy: number, emptyInRow: number): RecState {
  return {
    phase: 'idle',
    strategy,
    emptyInRow,
    alternatives: [],
    error: null,
    aborted: false,
    audioStarted: false,
    speechHeard: false,
    restarts: 0,
    startedAt: 0,
    run: 0,
  };
}

interface Out {
  state: RecState;
  effects: RecEffect[];
}

export function step(state: RecState, event: RecEvent, opts: RecOptions): Out {
  if (state.phase === 'done') return { state, effects: [] };
  // События распознавателя принимаем только от текущего запуска.
  if ('run' in event && event.run !== state.run) return { state, effects: [] };

  const s: RecState = { ...state };
  const effects: RecEffect[] = [];
  const log = (message: string) => effects.push({ type: 'log', message });

  const begin = (fresh: boolean) => {
    s.run += 1;
    s.phase = 'active';
    effects.push({ type: 'begin', run: s.run, fresh, interim: s.strategy < 2 });
    effects.push({ type: 'timer', name: 'restartCheck', ms: RESTART_CHECK_MS });
  };

  const scheduleBegin = (msSinceSpeech: number) => {
    const wait = Math.max(0, AFTER_SPEECH_MS - msSinceSpeech);
    if (wait) log(`пауза ${wait} мс после озвучки`);
    s.phase = 'pending';
    effects.push({ type: 'timer', name: 'begin', ms: wait });
  };

  const stop = () => {
    log('стоп');
    effects.push({ type: 'stopRec' });
    effects.push({ type: 'timer', name: 'afterStop', ms: s.alternatives.length ? 600 : 1200 });
  };

  const finish = (why: string, now: number) => {
    s.phase = 'done';
    effects.push({ type: 'finish' });
    log(`конец (${why}): ${s.alternatives.length ? `«${s.alternatives[0]}»` : s.error ? `ошибка ${s.error}` : 'ничего'}`);
    // Микрофон включился, но за 2,5+ с не пришло ни звука речи, ни текста — попытка «вхолостую».
    if (!s.aborted && !s.alternatives.length && s.audioStarted && !s.speechHeard && now - s.startedAt > EMPTY_ATTEMPT_MS) {
      s.emptyInRow += 1;
      log(`холостая попытка (${s.emptyInRow} подряд, режим ${s.strategy})`);
      if (s.strategy >= 1) effects.push({ type: 'releaseMic' });
      if (s.emptyInRow >= (s.strategy === 0 ? 1 : 2) && s.strategy < 2) {
        s.strategy += 1;
        s.emptyInRow = 0;
        effects.push({
          type: 'strategy',
          value: s.strategy,
          why: s.strategy === 1 ? 'держим микрофон открытым' : 'без промежуточных результатов, свежий объект',
        });
      }
    } else if (s.alternatives.length) {
      s.emptyInRow = 0;
    }
    if (s.aborted) effects.push({ type: 'reject', code: 'aborted' });
    else if (s.alternatives.length) effects.push({ type: 'resolve', alternatives: s.alternatives });
    // Ошибку «aborted» от самого браузера показываем как «не услышали», а не молча сбрасываем кнопку.
    else effects.push({ type: 'reject', code: s.error && s.error !== 'aborted' ? s.error : 'no-speech' });
  };

  switch (event.type) {
    case 'start': {
      s.startedAt = event.now;
      log(`старт записи${event.lang ? ` (${event.lang})` : ''}`);
      log(`режим ${s.strategy}`);
      effects.push({ type: 'timer', name: 'noWords', ms: NO_WORDS_MS });
      effects.push({ type: 'timer', name: 'max', ms: opts.maxMs });
      // iOS строже к микрофону, если запись начинается не прямо в обработчике нажатия,
      // поэтому по возможности стартуем синхронно.
      if (s.strategy >= 1 && !event.micLive) {
        s.phase = 'mic';
        effects.push({ type: 'keepMic' });
      } else if (AFTER_SPEECH_MS - event.msSinceSpeech > 0) {
        scheduleBegin(event.msSinceSpeech);
      } else {
        begin(false);
      }
      break;
    }
    case 'mic-ready':
      if (s.phase === 'mic') scheduleBegin(event.msSinceSpeech);
      break;
    case 'timer':
      switch (event.name) {
        case 'begin':
          if (s.phase === 'pending') begin(false);
          break;
        case 'restartCheck':
          if (s.phase !== 'active' || s.audioStarted || s.alternatives.length || s.restarts >= MAX_RESTARTS) break;
          s.restarts += 1;
          log(`микрофон не включился за 2,5 с — перезапуск №${s.restarts}`);
          effects.push({ type: 'detachRec' });
          effects.push({ type: 'timer', name: 'restartBegin', ms: RESTART_DELAY_MS });
          break;
        case 'restartBegin':
          begin(true);
          break;
        case 'silence':
        case 'max':
          stop();
          break;
        case 'afterStop':
          finish('таймаут после стопа', event.now);
          break;
        case 'noWords':
          if (!s.alternatives.length) finish('ничего не распознано за 9 с', event.now);
          break;
      }
      break;
    case 'rec-start':
      log('onstart');
      break;
    case 'rec-audio':
      s.audioStarted = true;
      log('микрофон включился');
      break;
    case 'rec-speech':
      s.speechHeard = true;
      log('слышна речь');
      break;
    case 'rec-result':
      s.audioStarted = true;
      s.speechHeard = true;
      s.alternatives = event.alternatives.filter(Boolean);
      log(`результат: «${s.alternatives[0] ?? ''}»`);
      effects.push({ type: 'partial', text: s.alternatives[0] ?? '' });
      // Пауза после речи — фраза сказана, заканчиваем.
      effects.push({ type: 'timer', name: 'silence', ms: opts.silenceMs });
      break;
    case 'rec-error':
      log(`ошибка: ${event.error}`);
      s.error = ERROR_CODES[event.error] ?? 'unknown';
      if (s.error === 'permission' || s.error === 'network') finish('ошибка', event.now);
      break;
    case 'rec-end':
      log('onend');
      finish('браузер завершил', event.now);
      break;
    case 'rec-start-failed':
      log(`start() не сработал: ${event.message}`);
      break;
    case 'stop':
      stop();
      break;
    case 'abort':
      s.aborted = true;
      log('отмена');
      effects.push({ type: 'abortRec' });
      finish('отмена', event.now);
      break;
  }
  return { state: s, effects };
}
