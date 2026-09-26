import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExerciseRunner, type Outcome } from '../components/ExerciseRunner';
import { SessionResult, scoreSession } from '../components/SessionResult';
import { scenarioById } from '../data';
import { buildExam, buildPracticeSession } from '../lib/exercises';
import { useApp } from '../state/AppContext';

/**
 * Тренировка или проверка готовности.
 * scope = 'trip' — по всем ситуациям поездки, иначе id сценария.
 */
export function SessionPage({ mode }: { mode: 'practice' | 'exam' }) {
  const { scope = 'trip' } = useParams();
  const navigate = useNavigate();
  const app = useApp();
  const [round, setRound] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const scenario = scope === 'trip' ? null : scenarioById[scope];
  const pool = scenario ? [scenario] : app.tripScenarios;
  const backTo = scenario ? `/scenario/${scenario.id}` : '/';

  // Набор заданий фиксируется на время раунда, чтобы не перестраиваться после каждого ответа.
  const exercises = useMemo(
    () =>
      mode === 'exam'
        ? buildExam(pool, app.speechOn, scenario ? 10 : 20)
        : buildPracticeSession(pool, app.data.progress, Date.now(), app.speechOn, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, scope, mode, app.ready],
  );

  if (!app.ready) return null;
  if (scope !== 'trip' && !scenario) {
    return <div className="page"><p className="empty">Ситуация не найдена.</p></div>;
  }

  const title = mode === 'exam'
    ? `Проверка готовности · ${scenario ? scenario.title : 'вся поездка'}`
    : `Тренировка · ${scenario ? scenario.title : 'вся поездка'}`;

  if (outcomes) {
    const score = scoreSession(outcomes, app.speechOn);
    return (
      <SessionResult
        title={title}
        outcomes={outcomes}
        score={score}
        exam={mode === 'exam'}
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
      exercises={exercises}
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
