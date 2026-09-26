import { useState } from 'react';
import type { Phrase } from '../data/types';
import { MAX_LEVEL } from '../lib/memory';
import { pronunciationOf } from '../lib/progress';
import { useApp } from '../state/AppContext';
import { IconExpand, IconMic } from './Icons';
import { PronunciationCheck } from './PronunciationCheck';
import { ShowToPerson } from './ShowToPerson';
import { SpeakButtons } from './Speak';

export function PhraseCard({ phrase, context }: { phrase: Phrase; context?: string }) {
  const app = useApp();
  const [practice, setPractice] = useState(false);
  const [show, setShow] = useState(false);
  const p = app.data.progress[phrase.id];
  const pron = pronunciationOf(p);
  const canSpeak = phrase.speaker === 'you' && app.speechOn;

  return (
    <article className="card phrase">
      <div className="row row--wrap" style={{ gap: 6 }}>
        <span className={`chip ${phrase.speaker === 'you' ? 'chip--you' : 'chip--them'}`}>
          {phrase.speaker === 'you' ? 'Говорите вы' : 'Говорят вам'}
        </span>
        {phrase.key && <span className="chip chip--key">★ ключевая</span>}
        {context && <span className="chip">{context}</span>}
      </div>
      <span className="phrase__en" lang="en">{phrase.en}</span>
      {app.data.settings.showTranscription && <span className="phrase__tr">{phrase.tr}</span>}
      <span className="phrase__ru">{phrase.ru}</span>
      {phrase.note && <p className="phrase__note">💡 {phrase.note}</p>}
      <div className="phrase__actions">
        <SpeakButtons text={phrase.en} />
        {canSpeak && (
          <button
            type="button"
            className={`icon-btn ${practice ? 'icon-btn--primary' : ''}`}
            onClick={() => setPractice(!practice)}
            aria-label="Проверить произношение"
            aria-expanded={practice}
            title="Проверить произношение"
          >
            <IconMic />
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => setShow(true)} aria-label="Показать собеседнику" title="Показать собеседнику">
          <IconExpand />
        </button>
        <span className="grow" />
        <div className="phrase__stats">
          {p && p.memory.level > 0 && <span className="chip">память {p.memory.level}/{MAX_LEVEL}</span>}
          {pron !== null && (
            <span className={`chip ${pron >= 65 ? 'chip--good' : 'chip--bad'}`}>🎙 {Math.round(pron)}%</span>
          )}
        </div>
      </div>
      {practice && canSpeak && (
        <PronunciationCheck targets={[phrase.en]} compact onResult={(r) => app.pronunciation(phrase.id, r.score)} />
      )}
      {show && <ShowToPerson phrase={phrase} onClose={() => setShow(false)} />}
    </article>
  );
}
