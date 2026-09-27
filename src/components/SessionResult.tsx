import { Link } from 'react-router-dom';
import { readinessLevel } from '../lib/readiness';
import { useApp } from '../state/AppContext';
import type { Outcome } from './ExerciseRunner';
import { Burst } from './Burst';
import { IconBrain, IconWave } from './Icons';
import { Metric, Ring } from './Readiness';
import { SpeakButtons } from './Speak';

export interface SessionScore {
  total: number;
  memory: number;
  pronunciation: number | null;
}

/** Итог сессии: доля верных ответов на память и средняя оценка произношения. */
export function scoreSession(outcomes: Outcome[], withPronunciation: boolean): SessionScore {
  const mem = outcomes.filter((o) => o.memoryCorrect !== undefined);
  const pron = outcomes.filter((o) => o.pronScore !== undefined);
  const memory = mem.length ? Math.round((mem.filter((o) => o.memoryCorrect).length / mem.length) * 100) : 0;
  const pronunciation =
    withPronunciation && pron.length ? Math.round(pron.reduce((s, o) => s + (o.pronScore ?? 0), 0) / pron.length) : null;
  const total = pronunciation === null ? memory : Math.round((memory + pronunciation) / 2);
  return { total, memory, pronunciation };
}

interface Props {
  title: string;
  outcomes: Outcome[];
  score: SessionScore;
  onRetry: () => void;
  backTo: string;
  backLabel: string;
  exam?: boolean;
}

export function SessionResult({ title, outcomes, score, onRetry, backTo, backLabel, exam }: Props) {
  const { data } = useApp();
  const level = readinessLevel(score.total);
  const mistakes = outcomes.filter((o) => o.memoryCorrect === false || (o.pronScore !== undefined && o.pronScore < 65));
  const seen = new Set<string>();
  const uniqueMistakes = mistakes.filter((o) => !seen.has(o.exercise.phrase.id) && seen.add(o.exercise.phrase.id));

  return (
    <div className="page page--bare">
      <div className="card stack pop" style={{ alignItems: 'center', textAlign: 'center', position: 'relative' }}>
        {score.total >= 60 && <Burst count={20} />}
        <span className="small muted">{title}</span>
        <Ring value={score.total} size={150} label={exam ? 'результат' : 'за сессию'} />
        {exam && <span className={`level-badge tone-${level.tone}`}>{level.label}</span>}
        <p className="small muted">{exam ? level.description : 'Прогресс сохранён. Регулярные короткие тренировки работают лучше, чем одна длинная.'}</p>
      </div>
      <div className="card stack">
        <Metric icon={<IconBrain width={16} height={16} />} label="Память" value={score.memory} />
        <Metric
          icon={<IconWave width={16} height={16} />}
          label="Произношение"
          value={score.pronunciation ?? 0}
          disabled={score.pronunciation === null ? 'Не проверялось — нужен микрофон' : undefined}
        />
      </div>
      {uniqueMistakes.length > 0 && (
        <>
          <h3 className="section-title">Над чем поработать</h3>
          <div className="stack">
            {uniqueMistakes.map((o) => (
              <div className="card card--flat row" key={o.exercise.key}>
                <div className="grow stack stack--sm">
                  <span style={{ fontWeight: 600 }} lang="en">{o.exercise.phrase.en}</span>
                  {data.settings.showTranscription && <span className="phrase__tr small">{o.exercise.phrase.tr}</span>}
                  <span className="small muted">{o.exercise.phrase.ru}</span>
                  <div className="phrase__stats">
                    {o.memoryCorrect === false && <span className="chip chip--bad">не вспомнили</span>}
                    {o.pronScore !== undefined && o.pronScore < 65 && <span className="chip chip--bad">произношение {o.pronScore}%</span>}
                  </div>
                </div>
                <SpeakButtons text={o.exercise.phrase.en} showSlow={false} />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="stack">
        <button type="button" className="btn btn--block" onClick={onRetry}>
          {exam ? 'Пройти проверку ещё раз' : 'Ещё одна тренировка'}
        </button>
        <Link className="btn btn--outline btn--block" to={backTo}>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
