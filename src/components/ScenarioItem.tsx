import { Link } from 'react-router-dom';
import type { Scenario } from '../data/types';
import type { Readiness } from '../lib/readiness';
import { Bar, toneOf } from './Readiness';
import { stageStyle } from './stage';

export function ScenarioItem({ scenario, readiness }: { scenario: Scenario; readiness: Readiness }) {
  const started = readiness.practiced > 0;
  return (
    <Link to={`/scenario/${scenario.id}`} className="scenario-item" style={stageStyle(scenario.stage)}>
      <span className="scenario-item__emoji" aria-hidden>{scenario.emoji}</span>
      <div className="grow stack stack--sm">
        <span className="scenario-item__title">{scenario.title}</span>
        {started ? (
          <>
            <Bar value={readiness.total} />
            <span className="tiny muted">Изучено {readiness.practiced} из {readiness.phrases} фраз</span>
          </>
        ) : (
          <span className="tiny muted">{readiness.phrases} фраз</span>
        )}
      </div>
      {started ? (
        <span className={`scenario-item__pct tone-${toneOf(readiness.total)}`}>{readiness.total}%</span>
      ) : (
        <span className="chip chip--new">новое</span>
      )}
    </Link>
  );
}
