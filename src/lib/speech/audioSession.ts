import { Capacitor } from '@capacitor/core';
import { diag } from './diag';

/**
 * Звук озвучки на iPhone при включённом беззвучном режиме.
 *
 * Safari считает синтез речи звуком страницы и при переключателе «Без звука» глушит его
 * на встроенном динамике (в наушниках при этом слышно). На время озвучки просим iOS
 * режим воспроизведения, который переключатель не глушит:
 * - navigator.audioSession.type = 'playback' (Safari 17+);
 * - беззвучный аудиоэлемент: медиа iOS играет и в беззвучном режиме, и пока он звучит,
 *   страница остаётся в режиме воспроизведения (для старых iOS и на случай, если синтез
 *   речи не подчиняется audioSession).
 * После озвучки возвращаем режим «auto»: микрофон, который приложение держит открытым
 * на iPhone, снова переводит страницу в режим записи и воспроизведения.
 * В iOS-приложении это не нужно: там озвучка сама просит категорию playback.
 */

type SessionType = 'auto' | 'playback' | 'play-and-record' | 'ambient' | 'transient' | 'transient-solo';
interface AudioSessionLike {
  type: SessionType;
}

const isIOSWeb = () =>
  typeof navigator !== 'undefined' &&
  !Capacitor.isNativePlatform() &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const session = (): AudioSessionLike | undefined =>
  typeof navigator !== 'undefined' ? (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession : undefined;

function setType(type: SessionType): boolean {
  const s = session();
  if (!s) return false;
  try {
    s.type = type;
    return true;
  } catch {
    return false;
  }
}

/** Полсекунды тишины в WAV (8 кГц, 8 бит, моно) — данные для беззвучного аудиоэлемента. */
function silentWavUrl(): string {
  const samples = 4000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (off: number, s: string) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // моно
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8-битная тишина — середина шкалы
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let silent: HTMLAudioElement | null = null;
let logged = false;

function playSilent(): void {
  try {
    silent ??= Object.assign(new Audio(silentWavUrl()), { loop: true, preload: 'auto' });
    silent.setAttribute('playsinline', '');
    // Без жеста пользователя (автовоспроизведение в упражнении) iOS может отказать — это не страшно.
    void silent.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/**
 * Подготовить звук к озвучке. Возвращает функцию, которую нужно вызвать, когда озвучка
 * закончилась (или прервана). Вне Safari на iPhone ничего не делает.
 */
export function beginPlayback(): () => void {
  if (!isIOSWeb()) return () => undefined;
  const viaSession = setType('playback');
  playSilent();
  if (!logged) {
    logged = true;
    diag(`звук: режим воспроизведения ${viaSession ? 'через audioSession' : 'без audioSession (старая iOS)'} + беззвучный аудиоэлемент`);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    silent?.pause();
    if (viaSession) setType('auto');
  };
}

/** Перед записью с микрофона: режим записи и воспроизведения (важно, если озвучку прервали). */
export function beginRecording(): void {
  if (!isIOSWeb()) return;
  silent?.pause();
  setType('play-and-record');
}
