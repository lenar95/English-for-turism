import { Link } from 'react-router-dom';
import { ScenarioItem } from '../components/ScenarioItem';
import { STAGES, cities, scenarios } from '../data';
import { scenarioReadiness } from '../lib/readiness';
import { useApp } from '../state/AppContext';

export function ScenariosPage() {
  const { data, speechOn } = useApp();
  const now = Date.now();
  return (
    <div className="page">
      <header className="stack stack--sm" style={{ paddingTop: 8 }}>
        <h1>Ситуации</h1>
        <p className="muted">Все ситуации по порядку поездки: от прилёта до отъезда.</p>
      </header>
      <section className="stack">
        <h2 className="section-title">Наборы для городов</h2>
        {cities.map((c) => (
          <Link key={c.id} to={`/city/${c.id}`} className="scenario-item">
            <span className="scenario-item__emoji" aria-hidden>{c.emoji}</span>
            <div className="grow stack stack--sm">
              <span className="scenario-item__title">
                {c.name}
                {data.trip.cityId === c.id && <span className="chip chip--good" style={{ marginLeft: 8 }}>в поездке</span>}
              </span>
              <span className="small muted">{c.scenarios.map((s) => s.title).join(' · ')}</span>
            </div>
          </Link>
        ))}
        <p className="tiny muted" style={{ margin: '0 4px' }}>Скоро будут и другие города.</p>
      </section>
      {STAGES.map((stage) => {
        const list = scenarios.filter((s) => s.stage === stage.id);
        if (!list.length) return null;
        return (
          <section key={stage.id} className="stack">
            <h2 className="section-title">{stage.title}</h2>
            {list.map((s) => (
              <ScenarioItem key={s.id} scenario={s} readiness={scenarioReadiness(s, data.progress, now, speechOn)} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
