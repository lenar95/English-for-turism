import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Burst } from '../components/Burst';
import { IconBrain, IconWave } from '../components/Icons';
import { TopBar } from '../components/Layout';
import { PronunciationCheck } from '../components/PronunciationCheck';
import { Metric, Ring } from '../components/Readiness';
import { SpeakButtons } from '../components/Speak';
import { phraseById, scenarioById } from '../data';
import type { Phrase } from '../data/types';
import { RECALL_PASS_SCORE } from '../lib/exercises';
import type { PronunciationResult } from '../lib/pronunciation';
import { useApp } from '../state/AppContext';

interface LineResult {
  phrase: Phrase;
  /** Для реплик пользователя: вспомнил ли сам, без подсказки. */
  recalled?: boolean;
  pronScore?: number;
}

export function DialoguePage() {
  const { id = '', did = '' } = useParams();
  const app = useApp();
  const scenario = scenarioById[id];
  const dialogue = scenario?.dialogues.find((d) => d.id === did);
  const [round, setRound] = useState(0);

  if (!scenario || !dialogue) {
    return (
      <div className="page">
        <TopBar back={scenario ? `/scenario/${scenario.id}` : '/scenarios'} />
        <p className="empty">Диалог не найден.</p>
      </div>
    );
  }

  const lines = dialogue.lines.map((l) => phraseById[l.phraseId]?.phrase).filter((p): p is Phrase => Boolean(p));
  const others = scenario.dialogues.filter((d) => d.id !== dialogue.id);

  return (
    <div className={`arena arena--${scenario.stage}`}>
    <div className="page page--bare" style={{ minHeight: '100dvh' }}>
      <TopBar back={`/scenario/${scenario.id}`} title={dialogue.title} />
      <DialogueRun
        key={`${dialogue.id}-${round}`}
        lines={lines}
        speechOn={app.speechOn}
        onRestart={() => setRound((r) => r + 1)}
        footer={
          <>
            {others.map((d) => (
              <Link key={d.id} className="btn btn--outline btn--block" to={`/scenario/${scenario.id}/dialogue/${d.id}`}>
                Другой диалог: {d.title}
              </Link>
            ))}
            <Link className="btn btn--ghost btn--block" to={`/scenario/${scenario.id}`}>
              К ситуации
            </Link>
          </>
        }
      />
    </div>
    </div>
  );
}

function DialogueRun({
  lines,
  speechOn,
  onRestart,
  footer,
}: {
  lines: Phrase[];
  speechOn: boolean;
  onRestart: () => void;
  footer: React.ReactNode;
}) {
  const app = useApp();
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<LineResult[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(Date.now());
  const logged = useRef(false);
  const current = lines[step];
  const finished = step >= lines.length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [step]);

  const logDialogue = (all: LineResult[], exitedEarly: boolean) => {
    if (logged.current) return;
    const mine = all.filter((x) => x.phrase.speaker === 'you');
    if (exitedEarly && !mine.length) return;
    logged.current = true;
    app.logSession({
      start: startedAt.current,
      end: Date.now(),
      kind: 'dialogue',
      planned: lines.filter((l) => l.speaker === 'you').length,
      done: mine.length,
      correct: mine.filter((x) => x.recalled).length,
      exitedEarly,
    });
  };

  // Ушёл со страницы посреди диалога — это досрочный выход.
  const resultsRef = useRef<LineResult[]>([]);
  useEffect(() => () => logDialogue(resultsRef.current, true), []); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = (r: LineResult) => {
    if (r.phrase.speaker === 'you') {
      if (r.recalled !== undefined) app.answer(r.phrase.id, r.recalled, 'recall');
      if (r.pronScore !== undefined) app.pronunciation(r.phrase.id, r.pronScore);
    }
    const all = [...results, r];
    resultsRef.current = all;
    setResults(all);
    setStep((s) => s + 1);
    if (step + 1 >= lines.length) logDialogue(all, false);
  };

  const yourLines = results.filter((r) => r.phrase.speaker === 'you');
  const recalled = yourLines.filter((r) => r.recalled).length;
  const pronScores = yourLines.map((r) => r.pronScore).filter((s): s is number => s !== undefined);
  const memory = yourLines.length ? Math.round((recalled / yourLines.length) * 100) : 0;
  const pron = pronScores.length ? Math.round(pronScores.reduce((a, b) => a + b, 0) / pronScores.length) : null;

  return (
    <>
      <div className="banner banner--info">
        <span aria-hidden>🎭</span>
        <span>
          Собеседник говорит по-английски — слушайте. Когда ваша очередь, вспомните фразу по русской подсказке и
          {speechOn ? ' скажите её в микрофон.' : ' проверьте себя.'}
        </span>
      </div>

      <div className="chat">
        {results.map((r, i) => (
          <Bubble key={i} phrase={r.phrase} score={r.pronScore} showTr={app.data.settings.showTranscription} />
        ))}
        {!finished && current.speaker === 'them' && (
          <TheirTurn key={step} phrase={current} showTr={app.data.settings.showTranscription} onNext={() => complete({ phrase: current })} />
        )}
        {!finished && current.speaker === 'you' && (
          <YourTurn key={step} phrase={current} speechOn={speechOn} showTr={app.data.settings.showTranscription} onDone={complete} />
        )}
      </div>

      {finished && (
        <div className="card stack pop" style={{ alignItems: 'center', position: 'relative' }}>
          <Burst count={20} />
          <h2>Диалог пройден! 🎉</h2>
          <Ring value={pron === null ? memory : Math.round((memory + pron) / 2)} size={120} label="результат" />
          <div className="stack" style={{ width: '100%' }}>
            <Metric icon={<IconBrain width={16} height={16} />} label={`Вспомнили сами: ${recalled} из ${yourLines.length}`} value={memory} />
            <Metric
              icon={<IconWave width={16} height={16} />}
              label="Произношение"
              value={pron ?? 0}
              disabled={pron === null ? 'Не проверялось' : undefined}
            />
          </div>
          <button type="button" className="btn btn--block" onClick={onRestart}>
            Пройти ещё раз
          </button>
          {footer}
        </div>
      )}
      <div ref={endRef} />
    </>
  );
}

function Bubble({ phrase, score, showTr }: { phrase: Phrase; score?: number; showTr: boolean }) {
  return (
    <div className={`bubble bubble--${phrase.speaker}`}>
      <span className="bubble__en" lang="en">{phrase.en}</span>
      {showTr && phrase.speaker === 'them' && <span className="bubble__meta phrase__tr">{phrase.tr}</span>}
      <span className="bubble__meta muted">
        {phrase.ru}
        {score !== undefined && ` · 🎙 ${score}%`}
      </span>
    </div>
  );
}

function TheirTurn({ phrase, showTr, onNext }: { phrase: Phrase; showTr: boolean; onNext: () => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="stack">
      <div className="bubble bubble--them">
        <div className="row" style={{ gap: 8 }}>
          <SpeakButtons text={phrase.en} autoPlay />
        </div>
        <button
          type="button"
          onClick={() => setReveal(true)}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
          aria-label={reveal ? undefined : 'Показать текст'}
        >
          <span className="bubble__en" lang="en" style={reveal ? undefined : { filter: 'blur(6px)' }}>{phrase.en}</span>
          {reveal && showTr && <span className="bubble__meta phrase__tr">{phrase.tr}</span>}
          {reveal && <span className="bubble__meta muted">{phrase.ru}</span>}
        </button>
        {!reveal && <span className="tiny muted">Сначала попробуйте понять на слух. Нажмите на текст, чтобы увидеть его.</span>}
      </div>
      <button type="button" className="btn btn--secondary" onClick={onNext} style={{ alignSelf: 'flex-start' }}>
        Понятно, дальше
      </button>
    </div>
  );
}

function YourTurn({
  phrase,
  speechOn,
  showTr,
  onDone,
}: {
  phrase: Phrase;
  speechOn: boolean;
  showTr: boolean;
  onDone: (r: LineResult) => void;
}) {
  const [hint, setHint] = useState(0);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [selfCheck, setSelfCheck] = useState(false);
  const targets = [phrase.en, ...(phrase.alt ?? [])];
  const passed = result !== null && result.score >= RECALL_PASS_SCORE;

  const onResult = (r: PronunciationResult) => {
    setResult(r);
  };

  return (
    <div className="card stack">
      <span className="chip chip--you" style={{ alignSelf: 'flex-start' }}>Ваша реплика</span>
      <span className="exercise__prompt">{phrase.ru}</span>
      {hint >= 1 && showTr && <span className="phrase__tr">Подсказка: {phrase.tr}</span>}
      {hint >= 2 && <span className="phrase__en" lang="en">{phrase.en}</span>}

      {speechOn ? (
        <>
          <PronunciationCheck targets={targets} onResult={onResult} showWords={passed} idleHint="Скажите эту фразу по-английски" />
          <div className="row row--wrap">
            {hint < 2 && !passed && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHint(showTr ? hint + 1 : 2)}>
                {hint === 0 && showTr ? 'Подсказка' : 'Показать фразу'}
              </button>
            )}
            <span className="grow" />
            {passed ? (
              <button type="button" className="btn btn--sm" onClick={() => onDone({ phrase, recalled: hint === 0, pronScore: result!.score })}>
                Дальше
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => onDone({ phrase, recalled: false, pronScore: result?.score })}
              >
                Пропустить
              </button>
            )}
          </div>
          {result && !passed && <p className="small muted">Пока не похоже на нужную фразу. Попробуйте ещё раз или возьмите подсказку.</p>}
        </>
      ) : !selfCheck ? (
        <button type="button" className="btn btn--secondary" onClick={() => setSelfCheck(true)}>
          Проговорил вслух — проверить себя
        </button>
      ) : (
        <>
          <div className="feedback feedback--mid">
            <span className="phrase__en" lang="en">{phrase.en}</span>
            {showTr && <span className="phrase__tr">{phrase.tr}</span>}
          </div>
          <div className="row">
            <button type="button" className="btn btn--outline grow" onClick={() => onDone({ phrase, recalled: false })}>
              Не вспомнил
            </button>
            <button type="button" className="btn grow" onClick={() => onDone({ phrase, recalled: hint === 0 })}>
              Вспомнил
            </button>
          </div>
        </>
      )}
    </div>
  );
}
