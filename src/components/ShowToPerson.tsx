import { useEffect, useState } from 'react';
import { localOf } from '../data';
import type { Phrase } from '../data/types';
import { IconClose } from './Icons';
import { SpeakButtons } from './Speak';

/** Полноэкранный режим: показать фразу собеседнику крупным шрифтом. */
export function ShowToPerson({ phrase, onClose }: { phrase: Phrase; onClose: () => void }) {
  const local = localOf(phrase);
  const [inLocal, setInLocal] = useState(false);
  const shown = inLocal && local ? { text: local.text, lang: local.lang } : { text: phrase.en, lang: 'en' };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="show-overlay" role="dialog" aria-modal="true" aria-label="Показать собеседнику">
      <div className="row row--between">
        <span className="small muted">{phrase.ru}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <IconClose />
        </button>
      </div>
      <div className="show-overlay__text" lang={shown.lang.slice(0, 2)}>{shown.text}</div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <SpeakButtons key={shown.lang} text={shown.text} lang={inLocal ? shown.lang : undefined} />
      </div>
      {local && (
        <button type="button" className="btn btn--outline" style={{ alignSelf: 'center' }} onClick={() => setInLocal(!inLocal)}>
          {inLocal ? 'Показать по-английски' : `Показать ${local.name}`}
        </button>
      )}
    </div>
  );
}
