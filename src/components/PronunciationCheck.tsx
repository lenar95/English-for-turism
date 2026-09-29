import { useEffect, useRef, useState } from 'react';
import { pronunciationVerdict, scorePronunciation, type PronunciationResult } from '../lib/pronunciation';
import { listen, recognitionErrorText, type ListenSession } from '../lib/speech/recognition';
import { stopSpeaking } from '../lib/speech/tts';
import { useApp } from '../state/AppContext';
import { hapticError, hapticSuccess } from '../lib/haptics';
import { Burst } from './Burst';
import { IconMic, IconStop } from './Icons';
import { VoiceBars } from './VoiceBars';

interface Props {
  /** Допустимые варианты фразы; первый — основной. */
  targets: string[];
  onResult?: (result: PronunciationResult) => void;
  /** Показывать разбор по словам (скрываем, когда фразу нужно было вспомнить). */
  showWords?: boolean;
  compact?: boolean;
  idleHint?: string;
  disabled?: boolean;
  /** Язык фразы (BCP 47). По умолчанию английский. */
  lang?: string;
}

type Status = 'idle' | 'listening' | 'processing' | 'done' | 'error';

export function PronunciationCheck({ targets, onResult, showWords = true, compact, idleHint, disabled, lang = 'en-US' }: Props) {
  const { speechSupported, data } = useApp();
  const [status, setStatus] = useState<Status>('idle');
  const [partial, setPartial] = useState('');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [error, setError] = useState('');
  const session = useRef<ListenSession | null>(null);

  useEffect(() => () => session.current?.abort(), []);
  useEffect(() => {
    setResult(null);
    setStatus('idle');
    setPartial('');
  }, [targets.join('|')]);

  if (!speechSupported || !data.settings.pronunciation) {
    return (
      <p className="small muted center">
        {speechSupported
          ? 'Проверка произношения выключена в настройках.'
          : 'Распознавание речи недоступно в этом браузере. Откройте приложение в Chrome, Edge или Safari, либо установите iOS-приложение.'}
      </p>
    );
  }

  const start = () => {
    if (status === 'listening') {
      session.current?.stop();
      return;
    }
    stopSpeaking();
    setError('');
    setPartial('');
    setResult(null);
    setStatus('listening');
    const s = listen({ lang, onPartial: setPartial });
    session.current = s;
    s.result
      .then((alts) => {
        setStatus('processing');
        const r = scorePronunciation(targets, alts, lang.startsWith('tr') ? 'tr' : 'en');
        setResult(r);
        setStatus('done');
        if (r.score >= 85) hapticSuccess();
        else if (r.score < 40) hapticError();
        onResult?.(r);
      })
      .catch((err: unknown) => {
        if ((err as { code?: string })?.code === 'aborted') {
          // Запись прервана (например, начали запись на другой фразе) — возвращаем кнопку в исходное состояние.
          setStatus('idle');
          setPartial('');
          return;
        }
        setError(recognitionErrorText(err));
        setStatus('error');
      });
  };

  const verdict = result ? pronunciationVerdict(result.score) : null;

  const hint =
    status === 'listening'
      ? partial || 'Говорите… нажмите ещё раз, чтобы закончить'
      : status === 'error'
        ? error
        : status === 'done'
          ? 'Нажмите на микрофон, чтобы попробовать ещё раз'
          : idleHint ?? 'Нажмите на микрофон и произнесите фразу';

  return (
    <div className="pron">
      <div className={compact ? 'row' : 'stack'} style={compact ? undefined : { alignItems: 'center' }}>
        <button
          type="button"
          className={`mic-btn ${compact ? 'mic-btn--sm' : ''} ${status === 'listening' ? 'listening' : ''}`}
          onClick={start}
          disabled={disabled}
          aria-label={status === 'listening' ? 'Закончить запись' : 'Сказать фразу'}
        >
          {status === 'listening' ? <IconStop /> : <IconMic />}
        </button>
        {status === 'listening' && !compact && <VoiceBars pulse={partial} />}
        <p className={`pron__hint ${compact ? 'grow' : ''}`} style={compact ? { textAlign: 'left' } : undefined} aria-live="polite">
          {hint}
        </p>
      </div>
      {result && verdict && (
        <div className="pron__result pop" aria-live="polite">
          {result.score >= 85 && <Burst />}
          <div className={`pron__score tone-${verdict.tone}`}>
            <span className="pron__score-num">{result.score}%</span>
            <span>{verdict.label}</span>
          </div>
          {showWords && (
            <div className="words">
              {result.words.map((w, i) => (
                <span key={i} className={`w-${w.status}`} title={w.heard ? `Услышано: ${w.heard}` : 'Не услышано'}>
                  {w.word}
                </span>
              ))}
            </div>
          )}
          <p className="heard">Услышано: «{result.transcript || '—'}»</p>
        </div>
      )}
    </div>
  );
}
