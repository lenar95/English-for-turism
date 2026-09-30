import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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
const voiceListeners = new Set<() => void>();

/** Когда последний раз звучала или была прервана озвучка — чтобы микрофон не включался в ту же секунду. */
let lastAudioAt = 0;
export const msSinceSpeech = () => Date.now() - lastAudioAt;

function loadVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  const list = window.speechSynthesis.getVoices();
  if (list.length) {
    const changed = list.length !== voicesCache.length;
    voicesCache = list;
    if (changed) voiceListeners.forEach((l) => l());
  }
  return voicesCache;
}

/** Подписка на появление списка голосов (в Safari он приходит не сразу). */
export function subscribeVoices(listener: () => void): () => void {
  voiceListeners.add(listener);
  return () => voiceListeners.delete(listener);
}

/**
 * Есть ли голос для языка. known=false — список голосов ещё не пришёл, судить рано.
 * На iPhone озвучка на языке без установленного голоса зависает и ломает звук страницы,
 * поэтому такую озвучку пропускаем.
 */
export function voiceStatus(lang: string): { known: boolean; available: boolean } {
  if (Capacitor.isNativePlatform()) return { known: true, available: true };
  const voices = loadVoices();
  if (!voices.length) return { known: false, available: true };
  return { known: true, available: Boolean(pickVoice(lang)) };
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
  const voice = pickVoice(language);
  const voices = loadVoices();
  if (lang && voices.length && !voice) {
    diag(`озвучка (${language}) пропущена: голоса для этого языка нет (всего голосов ${voices.length})`);
    return;
  }
  synth.cancel();
  lastAudioAt = Date.now();
  const voiceInfo = voice ? `${voice.name} (${voice.lang}${voice.localService ? ', на устройстве' : ', сетевой'})` : `не выбран, голосов ${voices.length}`;
  diag(`озвучка (${language}): «${clean.slice(0, 40)}» — голос ${voiceInfo}`);
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = language;
    u.rate = rate;
    if (voice) u.voice = voice;
    // Страховка: в некоторых браузерах onend не приходит. Тогда считаем озвучку законченной
    // и снимаем её, чтобы зависший синтез не держал аудио и не мешал микрофону.
    const guard = setTimeout(() => {
      if (synth.speaking) synth.cancel();
      lastAudioAt = Date.now();
      diag('озвучка: onend не пришёл, снята по таймауту');
      resolve();
    }, 3000 + (clean.length * 200) / rate);
    u.onend = () => {
      clearTimeout(guard);
      lastAudioAt = Date.now();
      // На iPhone после естественного окончания озвучки синтез может держать звук страницы —
      // снимаем явно, чтобы микрофон получил его обратно.
      synth.cancel();
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
  }
}
