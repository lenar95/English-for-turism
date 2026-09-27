import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ExerciseRunner, type Outcome } from '../components/ExerciseRunner';
import { SessionResult, scoreSession } from '../components/SessionResult';
import { scenarioById } from '../data';
import { createAdaptiveSession, fixedSource, type SessionMode } from '../lib/adaptive';
import { buildExam } from '../lib/exercises';
import { sessionInsight } from '../lib/insights';
import { dailyPlan, readMotivation } from '../lib/motivation';
import { useApp } from '../state/AppContext';

/**
 * Тренировка или проверка готовности.
 * scope = 'trip' — по всем ситуациям поездки, иначе id сценария.
 */
export function SessionPage({ mode }: { mode: 'practice' | 'exam' }) {
  const { scope = 'trip' } = useParams();
  const [search] = useSearchParams();
  const sessionMode: SessionMode = mode === 'exam' ? 'normal' : ((search.get('m') as SessionMode | null) ?? 'normal');
  const size = sessionMode === 'normal' ? 10 : 5;
  const navigate = useNavigate();
  const app = useApp();
  const [round, setRound] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const scenario = scope === 'trip' ? null : scenarioById[scope];
  const pool = scenario ? [scenario] : app.tripScenarios;
  const backTo = scenario ? `/scenario/${scenario.id}` : '/';

  // Набор заданий фиксируется на время раунда, чтобы не перестраиваться после каждого ответа.
  // Если к вылету всё не успеть, план сужается до ключевых фраз — тренировка тоже.
  const now = Date.now();
  const focusKey = dailyPlan(
    pool,
    app.data.progress,
    app.data.answers,
    app.data.trip.date,
    readMotivation(app.data.answers, app.data.sessions, app.data.activeDays, now),
    now,
  ).focusKey;
  const source = useMemo(
    () =>
      mode === 'exam'
        ? fixedSource(buildExam(pool, app.speechOn, scenario ? 10 : 20))
        : createAdaptiveSession(pool, app.data.progress, Date.now(), app.speechOn, size, sessionMode, Math.random, focusKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, scope, mode, sessionMode, app.ready],
  );

  // Выбираем «открытие» один раз на результат, чтобы оно не менялось при перерисовке.
  const insight = useMemo(
    () => (outcomes && mode === 'practice' ? sessionInsight(outcomes, app.data, pool, Date.now()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outcomes],
  );

  if (!app.ready) return null;
  if (scope !== 'trip' && !scenario) {
    return <div className="page"><p className="empty">Ситуация не найдена.</p></div>;
  }

  const title = mode === 'exam'
    ? `Проверка готовности · ${scenario ? scenario.title : 'вся поездка'}`
    : sessionMode === 'warmup'
      ? 'Разминка после перерыва'
      : sessionMode === 'minimal'
        ? 'Одна минута'
        : `Тренировка · ${scenario ? scenario.title : 'вся поездка'}`;

  if (outcomes) {
    const score = scoreSession(outcomes, app.speechOn);
    return (
      <SessionResult
        title={title}
        outcomes={outcomes}
        score={score}
        exam={mode === 'exam'}
        insight={insight}
        onRetry={() => {
          setOutcomes(null);
          setRound((r) => r + 1);
        }}
        backTo={backTo}
        backLabel={scenario ? 'К ситуации' : 'На главную'}
      />
    );
  }

  return (
    <ExerciseRunner
      key={round}
      source={source}
      kind={mode === 'exam' ? 'exam' : sessionMode === 'normal' ? 'practice' : sessionMode}
      mode={mode}
      onExit={() => navigate(backTo)}
      onFinish={(all) => {
        setOutcomes(all);
        if (mode === 'exam') {
          const s = scoreSession(all, app.speechOn);
          app.saveExam({
            at: Date.now(),
            scenarioId: scenario?.id ?? null,
            total: s.total,
            memory: s.memory,
            pronunciation: s.pronunciation,
            questions: all.length,
          });
        }
      }}
    />
  );
}
