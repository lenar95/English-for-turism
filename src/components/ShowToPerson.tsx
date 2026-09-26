import { useEffect } from 'react';
import type { Phrase } from '../data/types';
import { IconClose } from './Icons';
import { SpeakButtons } from './Speak';

/** Полноэкранный режим: показать фразу собеседнику крупным шрифтом. */
export function ShowToPerson({ phrase, onClose }: { phrase: Phrase; onClose: () => void }) {
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
      <div className="show-overlay__text" lang="en">{phrase.en}</div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <SpeakButtons text={phrase.en} />
      </div>
    </div>
  );
}
