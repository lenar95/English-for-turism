import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { beginPlayback } from './audioSession';
import { diag } from './diag';

export type Accent = 'en-US' | 'en-GB';

export interface SpeakOptions {
  accent: Accent;
  slow?: boolean;
  /** Язык, если фраза не английская (например, tr-TR для турецких слов). */
  lang?: string;
}

const NORMAL_RATE = 0.95;
const SLOW_RATE = 0.65;

/** Предпочтительные «естественные» голоса разных платформ. */
const PREFERRED_VOICES = [
  'Samantha', 'Ava', 'Allison', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny',
  'Daniel', 'Serena', 'Kate', 'Google UK English Female', 'Microsoft Sonia',
];

let voicesCache: SpeechSynthesisVoice[] = [];

/** Вернуть звук в обычный режим после текущей озвучки (см. audioSession.ts). */
let endPlayback: (() => void) | null = null;

/** Когда последний раз звучала или была прервана озвучка — чтобы микрофон не включался в ту же секунду. */
let lastAudioAt = 0;
export const msSinceSpeech = () => Date.now() - lastAudioAt;

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length) voicesCache = list;
  return voicesCache;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

function pickVoice(accent: string): SpeechSynthesisVoice | undefined {
  const voices = loadVoices();
  const norm = (l: string) => l.replace('_', '-').toLowerCase();
  const exact = voices.filter((v) => norm(v.lang) === accent.toLowerCase());
  const base = accent.slice(0, 2).toLowerCase();
  const english = voices.filter((v) => norm(v.lang).startsWith(base));
  const candidates = exact.length ? exact : english;
  for (const name of PREFERRED_VOICES) {
    const v = candidates.find((c) => c.name.includes(name));
    if (v) return v;
  }
  return candidates.find((v) => v.localService) ?? candidates[0];
}

export function ttsAvailable(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Произнести английскую фразу. Промис завершается, когда фраза договорена. */
export async function speak(text: string, { accent, slow, lang }: SpeakOptions): Promise<void> {
  const language = lang ?? accent;
  const rate = slow ? SLOW_RATE : NORMAL_RATE;
  const clean = text.replace(/[’]/g, "'");
  if (Capacitor.isNativePlatform()) {
    await TextToSpeech.stop().catch(() => undefined);
    await TextToSpeech.speak({ text: clean, lang: language, rate, category: 'playback' });
    return;
  }
  if (!ttsAvailable()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  endPlayback?.();
  lastAudioAt = Date.now();
  diag(`озвучка: «${clean.slice(0, 40)}»`);
  // На iPhone без этого переключатель «Без звука» глушит озвучку на динамике.
  const release = beginPlayback();
  endPlayback = release;
  await new Promise<void>((done) => {
    const resolve = () => {
      release();
      if (endPlayback === release) endPlayback = null;
      done();
    };
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = language;
    u.rate = rate;
    const voice = pickVoice(language);
    if (voice) u.voice = voice;
    // Страховка: в некоторых браузерах onend не приходит. Тогда считаем озвучку законченной
    // и снимаем её, чтобы зависший синтез не держал аудио и не мешал микрофону.
    const guard = setTimeout(() => {
      if (synth.speaking) synth.cancel();
      lastAudioAt = Date.now();
      diag('озвучка: onend не пришёл, снята по таймауту');
      resolve();
    }, 1500 + (clean.length * 120) / rate);
    u.onend = () => {
      clearTimeout(guard);
      lastAudioAt = Date.now();
      resolve();
    };
    u.onerror = () => {
      clearTimeout(guard);
      lastAudioAt = Date.now();
      resolve();
    };
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (Capacitor.isNativePlatform()) {
    void TextToSpeech.stop().catch(() => undefined);
  } else if (ttsAvailable()) {
    if (window.speechSynthesis.speaking) lastAudioAt = Date.now();
    window.speechSynthesis.cancel();
    endPlayback?.();
    endPlayback = null;
  }
}
