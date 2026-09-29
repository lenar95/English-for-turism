import { useEffect, useState } from 'react';
import { useSettings } from '../state/AppContext';
import { speak, stopSpeaking } from '../lib/speech/tts';
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
        title="Прослушать"
      >
        <IconSpeaker />
      </button>
      {showSlow && (
        <button
          type="button"
          className={`icon-btn ${playing === 'slow' ? 'playing' : ''}`}
          onClick={() => void play(true)}
          aria-label="Прослушать медленно"
          title="Медленно"
        >
          <IconTurtle />
        </button>
      )}
    </>
  );
}
