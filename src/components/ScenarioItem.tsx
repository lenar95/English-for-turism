import { Link } from 'react-router-dom';
import type { Scenario } from '../data/types';
import type { Readiness } from '../lib/readiness';
import { Bar, toneOf } from './Readiness';

export function ScenarioItem({ scenario, readiness }: { scenario: Scenario; readiness: Readiness }) {
  return (
    <Link to={`/scenario/${scenario.id}`} className="scenario-item">
      <span className="scenario-item__emoji" aria-hidden>{scenario.emoji}</span>
      <div className="grow stack stack--sm">
        <span className="scenario-item__title">{scenario.title}</span>
        <Bar value={readiness.total} />
        <span className="tiny muted">
          {readiness.practiced ? `Изучено ${readiness.practiced} из ${readiness.phrases} фраз` : `${readiness.phrases} фраз · ещё не начато`}
        </span>
      </div>
      <span className={`scenario-item__pct tone-${toneOf(readiness.total)}`}>{readiness.total}%</span>
    </Link>
  );
}
