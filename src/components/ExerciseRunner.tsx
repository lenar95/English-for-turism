import { useEffect, useMemo, useRef, useState } from 'react';
import type { Phrase } from '../data/types';
import { isSuccess, type ExerciseSource } from '../lib/adaptive';
import { exerciseChecks, isBuildCorrect, RECALL_PASS_SCORE, withoutSpeech, type Exercise } from '../lib/exercises';
import type { SessionKind } from '../state/model';
import type { PronunciationResult } from '../lib/pronunciation';
import { scenarioById } from '../data';
import { useApp } from '../state/AppContext';
import { hapticError, hapticSuccess } from '../lib/haptics';
import { Burst } from './Burst';
import { IconCheck, IconClose } from './Icons';
import { PronunciationCheck } from './PronunciationCheck';
import { SpeakButtons } from './Speak';

export interface Outcome {
  exercise: Exercise;
  /** Вспомнил/узнал ли фразу (если упражнение проверяет память). */
  memoryCorrect?: boolean;
  /** Оценка произношения (если упражнение проверяет произношение). */
  pronScore?: number;
}

interface Props {
  source: ExerciseSource;
  kind: SessionKind;
  mode: 'practice' | 'exam';
  onFinish: (outcomes: Outcome[]) => void;
  onExit: () => void;
}

const KIND_LABEL: Record<Exercise['type'], string> = {
  'choose-en': 'Выберите, как сказать по-английски',
  listen: 'Послушайте и выберите перевод',
  build: 'Соберите фразу из слов',
  speak: 'Прочитайте вслух',
  'recall-speak': 'Скажите по-английски',
};

export function ExerciseRunner({ source, kind, mode, onFinish, onExit }: Props) {
  const app = useApp();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [current, setCurrent] = useState<Outcome | null>(null);
  // Следующее задание выбирается по результатам предыдущих (адаптивная сложность).
  const [exercise, setExercise] = useState<Exercise | null>(() => source.next([]));
  const startedAt = useRef(Date.now());
  const index = outcomes.length;
  const planned = Math.max(source.planned, index + 1);

  const logSession = (all: Outcome[], exitedEarly: boolean) => {
    if (!all.length && exitedEarly && Date.now() - startedAt.current < 3000) return; // случайно открыл и закрыл
    app.logSession({
      start: startedAt.current,
      end: Date.now(),
      kind,
      planned: source.planned,
      done: all.length,
      correct: all.filter(isSuccess).length,
      exitedEarly,
    });
  };

  const record = (o: Outcome) => {
    const checks = exerciseChecks(o.exercise.type);
    if (checks.memory && o.memoryCorrect !== undefined) {
      const answerKind = o.exercise.type === 'choose-en' || o.exercise.type === 'listen' ? 'recognition' : 'recall';
      app.answer(o.exercise.phrase.id, o.memoryCorrect, answerKind);
    }
    if (checks.pronunciation && o.pronScore !== undefined) {
      app.pronunciation(o.exercise.phrase.id, o.pronScore);
    }
  };

  const next = () => {
    if (!current) return;
    record(current);
    const all = [...outcomes, current];
    setOutcomes(all);
    setCurrent(null);
    const upcoming = source.next(all);
    if (!upcoming) {
      logSession(all, false);
      onFinish(all);
    } else setExercise(upcoming);
  };

  const exit = () => {
    logSession(outcomes, true);
    onExit();
  };

  if (!exercise) return null;
  // Микрофон недоступен или пропал посреди сессии: речевое задание показываем письменным.
  // Подменяем само задание, чтобы ответ записался как задание на память, а не на произношение.
  const shown = app.speechOn ? exercise : withoutSpeech(exercise);

  return (
    // «Арена»: яркий градиент в цвете этапа поездки — как в тренажёрах внимания,
    // энергичный фон нужен в момент действия, а экраны статистики остаются спокойными.
    <div className={`arena arena--${scenarioById[shown.scenarioId]?.stage ?? 'basics'}`}>
    <div className="page page--bare" style={{ minHeight: '100dvh' }}>
      <div className="row">
        <button type="button" className="icon-btn icon-btn--plain" onClick={exit} aria-label="Выйти">
          <IconClose />
        </button>
        <div className="progress-dots grow" aria-label={`Задание ${index + 1} из ${planned}`}>
          {Array.from({ length: planned }, (_, i) => (
            <span key={i} className={i < index ? 'done' : i === index ? 'current' : ''} />
          ))}
        </div>
        <span className="small muted" style={{ minWidth: 44, textAlign: 'right' }}>
          {index + 1}/{planned}
        </span>
      </div>

      <ExerciseView
        key={shown.key}
        exercise={shown}
        mode={mode}
        onAnswered={(o) => {
          // Вибрация на выбор ответа; у речевых заданий она срабатывает в самой проверке произношения.
          if (o && o.memoryCorrect !== undefined && o.pronScore === undefined) {
            if (o.memoryCorrect) hapticSuccess();
            else hapticError();
          }
          setCurrent(o);
        }}
        speechOn={app.speechOn}
        showTr={app.data.settings.showTranscription}
      />

      <div className="sticky-footer">
        <button type="button" className="btn btn--block" disabled={!current} onClick={next}>
          {index + 1 >= planned && (!current || isSuccess(current)) ? 'Посмотреть результат' : 'Дальше'}
        </button>
      </div>
    </div>
    </div>
  );
}

interface ViewProps {
  exercise: Exercise;
  mode: 'practice' | 'exam';
  onAnswered: (o: Outcome | null) => void;
  speechOn: boolean;
  showTr: boolean;
}

function ExerciseView(props: ViewProps) {
  const { type } = props.exercise;
  return (
    <div className="exercise">
      <span className="exercise__kind">{KIND_LABEL[type]}</span>
      {type === 'choose-en' && <ChooseEn {...props} />}
      {type === 'listen' && <Listen {...props} />}
      {type === 'build' && <Build {...props} />}
      {type === 'speak' && <Speak {...props} />}
      {type === 'recall-speak' && <RecallSpeak {...props} />}
    </div>
  );
}

function Answer({ phrase, showTr, title, tone }: { phrase: Phrase; showTr: boolean; title: string; tone: 'good' | 'bad' | 'mid' }) {
  return (
    <div className={`feedback feedback--${tone} pop`} aria-live="polite">
      {tone === 'good' && <Burst />}
      <span className="feedback__title">
        {tone === 'good' && (
          <span className="check-badge">
            <IconCheck width={16} height={16} />
          </span>
        )}
        {title}
      </span>
      <div className="row">
        <div className="grow stack stack--sm">
          <span className="phrase__en" lang="en">{phrase.en}</span>
          {showTr && <span className="phrase__tr">{phrase.tr}</span>}
          <span className="phrase__ru">{phrase.ru}</span>
        </div>
        <SpeakButtons text={phrase.en} showSlow={false} />
      </div>
    </div>
  );
}

function PromptRu({ phrase }: { phrase: Phrase }) {
  return (
    <div className="card stack stack--sm">
      <span className={`chip ${phrase.speaker === 'you' ? 'chip--you' : 'chip--them'}`} style={{ alignSelf: 'flex-start' }}>
        {phrase.speaker === 'you' ? 'Вам нужно сказать' : 'Вам говорят'}
      </span>
      <span className="exercise__prompt">{phrase.ru}</span>
    </div>
  );
}

function ChooseEn({ exercise, onAnswered, showTr }: ViewProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const correct = picked === exercise.phrase.id;
  const pick = (p: Phrase) => {
    if (picked) return;
    setPicked(p.id);
    onAnswered({ exercise, memoryCorrect: p.id === exercise.phrase.id });
  };
  return (
    <>
      <PromptRu phrase={exercise.phrase} />
      <div className="options">
        {exercise.options!.map((o) => (
          <button
            type="button"
            key={o.id}
            lang="en"
            className={`option ${picked && o.id === exercise.phrase.id ? 'correct' : ''} ${picked === o.id && !correct ? 'wrong' : ''}`}
            disabled={!!picked}
            onClick={() => pick(o)}
          >
            {o.en}
          </button>
        ))}
      </div>
      {picked && <Answer phrase={exercise.phrase} showTr={showTr} title={correct ? 'Верно!' : 'Правильный ответ'} tone={correct ? 'good' : 'bad'} />}
    </>
  );
}

function Listen({ exercise, onAnswered, showTr }: ViewProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const correct = picked === exercise.phrase.id;
  const pick = (p: Phrase) => {
    if (picked) return;
    setPicked(p.id);
    onAnswered({ exercise, memoryCorrect: p.id === exercise.phrase.id });
  };
  return (
    <>
      <div className="card stack" style={{ alignItems: 'center' }}>
        <span className="chip chip--them">Вам говорят</span>
        <div className="row">
          <SpeakButtons text={exercise.phrase.en} autoPlay />
        </div>
        <span className="small muted">Можно прослушать несколько раз</span>
      </div>
      <div className="options">
        {exercise.options!.map((o) => (
          <button
            type="button"
            key={o.id}
            className={`option ${picked && o.id === exercise.phrase.id ? 'correct' : ''} ${picked === o.id && !correct ? 'wrong' : ''}`}
            disabled={!!picked}
            onClick={() => pick(o)}
          >
            {o.ru}
          </button>
        ))}
      </div>
      {picked && <Answer phrase={exercise.phrase} showTr={showTr} title={correct ? 'Верно, вы поняли!' : 'На самом деле сказали'} tone={correct ? 'good' : 'bad'} />}
    </>
  );
}

function Build({ exercise, onAnswered, showTr }: ViewProps) {
  const tiles = exercise.tiles ?? [];
  const [chosen, setChosen] = useState<number[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const answer = chosen.map((i) => tiles[i]);

  const add = (i: number) => {
    if (checked !== null || chosen.includes(i)) return;
    setChosen([...chosen, i]);
  };
  const remove = (pos: number) => {
    if (checked !== null) return;
    setChosen(chosen.filter((_, k) => k !== pos));
  };
  const check = () => {
    const ok = isBuildCorrect(exercise.phrase.en, answer);
    setChecked(ok);
    onAnswered({ exercise, memoryCorrect: ok });
  };

  return (
    <>
      <PromptRu phrase={exercise.phrase} />
      <div className={`tiles tiles--answer ${checked === true ? 'correct' : checked === false ? 'wrong' : ''}`} lang="en">
        {chosen.length === 0 && <span className="small muted" style={{ alignSelf: 'center' }}>Нажимайте на слова по порядку</span>}
        {chosen.map((ti, pos) => (
          <button type="button" key={`${ti}-${pos}`} className="tile" onClick={() => remove(pos)}>
            {tiles[ti]}
          </button>
        ))}
      </div>
      <div className="tiles" lang="en">
        {tiles.map((t, i) => (
          <button type="button" key={i} className={`tile ${chosen.includes(i) ? 'used' : ''}`} onClick={() => add(i)} disabled={checked !== null}>
            {t}
          </button>
        ))}
      </div>
      {checked === null && (
        <div className="row">
          <button type="button" className="btn btn--outline grow" onClick={() => setChosen([])} disabled={!chosen.length}>
            Сбросить
          </button>
          <button type="button" className="btn btn--secondary grow" onClick={check} disabled={chosen.length !== tiles.length}>
            Проверить
          </button>
        </div>
      )}
      {checked !== null && (
        <Answer phrase={exercise.phrase} showTr={showTr} title={checked ? 'Верно!' : 'Правильный порядок'} tone={checked ? 'good' : 'bad'} />
      )}
    </>
  );
}

function Speak({ exercise, onAnswered, showTr, mode }: ViewProps) {
  const [best, setBest] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const onResult = (r: PronunciationResult) => {
    // В тренировке засчитываем лучшую попытку, в проверке — первую.
    const score = mode === 'exam' ? r.score : Math.max(best ?? 0, r.score);
    setBest(score);
    setAttempts((a) => a + 1);
    onAnswered({ exercise, pronScore: score });
  };
  return (
    <>
      <div className="card phrase">
        <span className="phrase__en" lang="en" style={{ fontSize: 24 }}>{exercise.phrase.en}</span>
        {showTr && <span className="phrase__tr">{exercise.phrase.tr}</span>}
        <span className="phrase__ru">{exercise.phrase.ru}</span>
        {mode === 'practice' && (
          <div className="phrase__actions">
            <SpeakButtons text={exercise.phrase.en} />
            <span className="small muted">Сначала послушайте, как это звучит</span>
          </div>
        )}
      </div>
      <PronunciationCheck
        targets={[exercise.phrase.en]}
        onResult={onResult}
        disabled={mode === 'exam' && attempts > 0}
      />
    </>
  );
}

function RecallSpeak({ exercise, onAnswered, showTr, mode }: ViewProps) {
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const targets = useMemo(() => [exercise.phrase.en, ...(exercise.phrase.alt ?? [])], [exercise.phrase]);
  const done = gaveUp || (result !== null && (mode === 'exam' || result.score >= RECALL_PASS_SCORE));

  useEffect(() => {
    if (gaveUp) onAnswered({ exercise, memoryCorrect: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaveUp]);

  const onResult = (r: PronunciationResult) => {
    setResult(r);
    const recalled = r.score >= RECALL_PASS_SCORE;
    onAnswered({ exercise, memoryCorrect: recalled, pronScore: r.score });
  };

  const recalled = result !== null && result.score >= RECALL_PASS_SCORE;
  return (
    <>
      <PromptRu phrase={exercise.phrase} />
      {!gaveUp && (
        <PronunciationCheck
          targets={targets}
          onResult={onResult}
          showWords={recalled}
          disabled={done}
          idleHint="Вспомните фразу и скажите её по-английски"
        />
      )}
      {!done && (
        <button type="button" className="btn btn--ghost" onClick={() => setGaveUp(true)}>
          Не помню — показать ответ
        </button>
      )}
      {done && (
        <Answer
          phrase={exercise.phrase}
          showTr={showTr}
          title={gaveUp ? 'Запомните эту фразу' : recalled ? 'Вспомнили!' : 'Правильная фраза'}
          tone={gaveUp || !recalled ? 'bad' : 'good'}
        />
      )}
      {result && !recalled && mode === 'practice' && !gaveUp && (
        <p className="small muted center">Не совсем то. Попробуйте ещё раз или посмотрите ответ.</p>
      )}
    </>
  );
}
