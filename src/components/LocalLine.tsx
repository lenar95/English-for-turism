import { useState } from 'react';
import type { LocalVersion } from '../data';
import { localProgressKey } from '../lib/localPractice';
import { useActions } from '../state/AppContext';
import { useSpeechFor } from '../lib/speech/useSpeechFor';
import { IconMic } from './Icons';
import { PronunciationCheck } from './PronunciationCheck';
import { SpeakButtons } from './Speak';

/** Та же фраза на местном языке: текст, произношение, озвучка и проверка через микрофон. */
export function LocalLine({ local, phraseId, canSpeak }: { local: LocalVersion; phraseId: string; canSpeak: boolean }) {
  const { pronunciation } = useActions();
  const [practice, setPractice] = useState(false);
  const speech = useSpeechFor(local.lang);
  const mic = canSpeak && speech;
  return (
    <div className="local-line">
      <div className="row" style={{ gap: 8 }}>
        <div className="local-line__text">
          <span className="local-line__label">{capitalize(local.name)}</span>
          <span className="local-line__phrase" lang={local.lang.slice(0, 2)}>{local.text}</span>
          <span className="local-line__tr">{local.tr}</span>
        </div>
        <SpeakButtons text={local.text} lang={local.lang} />
        {mic && (
          <button
            type="button"
            className={`icon-btn ${practice ? 'icon-btn--primary' : ''}`}
            onClick={() => setPractice(!practice)}
            aria-label={`Проверить произношение ${local.name}`}
            aria-expanded={practice}
            title={`Проверить произношение ${local.name}`}
          >
            <IconMic />
          </button>
        )}
      </div>
      {practice && mic && (
        <PronunciationCheck
          targets={[local.text]}
          lang={local.lang}
          compact
          idleHint={`Нажмите и скажите ${local.name}`}
          onResult={(r) => pronunciation(localProgressKey(phraseId, local.lang), r.score)}
        />
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
