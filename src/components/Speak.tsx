import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSettings } from '../state/AppContext';
import { speak, stopSpeaking, subscribeVoices, voiceStatus } from '../lib/speech/tts';

/** Есть ли на устройстве голос для языка; известно ли это вообще (список голосов приходит не сразу). */
export function useVoiceFor(lang: string | undefined): { known: boolean; available: boolean } {
  const key = useSyncExternalStore(
    subscribeVoices,
    () => {
      if (!lang) return 'true|true';
      const s = voiceStatus(lang);
      return `${s.known}|${s.available}`;
    },
    () => 'true|true',
  );
  const [known, available] = key.split('|');
  return { known: known === 'true', available: available === 'true' };
}

export const NO_VOICE_HINT =
  'Голос для этого языка на телефоне не установлен. iPhone: Настройки → Универсальный доступ → Устный контент → Голоса.';
import { IconSpeaker, IconTurtle } from './Icons';

/** Кнопки «прослушать» и «прослушать медленно». */
export function SpeakButtons({
  text,
  showSlow = true,
  autoPlay = false,
  lang,
}: {
  text: string;
  showSlow?: boolean;
  autoPlay?: boolean;
  /** Язык фразы, если она не английская. */
  lang?: string;
}) {
  const { settings } = useSettings();
  const [playing, setPlaying] = useState<'normal' | 'slow' | null>(null);
  const voice = useVoiceFor(lang);
  const missing = voice.known && !voice.available;

  const play = async (slow: boolean) => {
    setPlaying(slow ? 'slow' : 'normal');
    try {
      await speak(text, { accent: settings.accent, slow, lang });
    } finally {
      setPlaying(null);
    }
  };

  useEffect(() => {
    if (autoPlay) void play(false);
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, autoPlay]);

  return (
    <>
      <button
        type="button"
        className={`icon-btn icon-btn--primary ${playing === 'normal' ? 'playing' : ''}`}
        onClick={() => void play(false)}
        aria-label="Прослушать"
        title={missing ? NO_VOICE_HINT : 'Прослушать'}
        disabled={missing}
      >
        <IconSpeaker />
      </button>
      {showSlow && (
        <button
          type="button"
          className={`icon-btn ${playing === 'slow' ? 'playing' : ''}`}
          onClick={() => void play(true)}
          aria-label="Прослушать медленно"
          title={missing ? NO_VOICE_HINT : 'Медленно'}
          disabled={missing}
        >
          <IconTurtle />
        </button>
      )}
    </>
  );
}
