import { ScenarioItem } from '../components/ScenarioItem';
import { STAGES, scenarios } from '../data';
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
