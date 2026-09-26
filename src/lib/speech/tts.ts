import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

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
  await new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = language;
    u.rate = rate;
    const voice = pickVoice(language);
    if (voice) u.voice = voice;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
    // Страховка: в некоторых браузерах onend не приходит.
    setTimeout(resolve, 1500 + clean.length * 120 / rate);
  });
}

export function stopSpeaking(): void {
  if (Capacitor.isNativePlatform()) {
    void TextToSpeech.stop().catch(() => undefined);
  } else if (ttsAvailable()) {
    window.speechSynthesis.cancel();
  }
}
