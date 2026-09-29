import { STAGES, cityById } from '../data';
import type { Scenario, Stage } from '../data/types';
import { scenarioReadiness, type ProgressMap } from '../lib/readiness';
import { IconCheck } from './Icons';
import { ScenarioItem } from './ScenarioItem';
import { stageStyle } from './stage';

interface Group {
  key: string;
  title: string;
  stage: Stage | 'destination';
  scenarios: Scenario[];
}

/** Ситуации поездки, сгруппированные по этапам маршрута; город — отдельной остановкой после «В городе». */
function groupByStage(list: Scenario[]): Group[] {
  const groups: Group[] = [];
  for (const stage of STAGES) {
    const items = list.filter((s) => s.stage === stage.id && !s.cityId);
    if (items.length) groups.push({ key: stage.id, title: stage.title, stage: stage.id, scenarios: items });
    if (stage.id === 'city') {
      const byCity = new Map<string, Scenario[]>();
      for (const s of list) if (s.cityId) byCity.set(s.cityId, [...(byCity.get(s.cityId) ?? []), s]);
      for (const [cityId, cityItems] of byCity) {
        const city = cityById[cityId];
        groups.push({ key: cityId, title: city ? `${city.emoji} ${city.name}` : cityId, stage: 'destination', scenarios: cityItems });
      }
    }
  }
  return groups;
}

export function RouteMap({ scenarios, progress, now, speechOn }: { scenarios: Scenario[]; progress: ProgressMap; now: number; speechOn: boolean }) {
  return (
    <div className="route-map">
      {groupByStage(scenarios).map((g) => {
        const rs = g.scenarios.map((s) => scenarioReadiness(s, progress, now, speechOn));
        const avg = Math.round(rs.reduce((a, r) => a + r.total, 0) / rs.length);
        const started = rs.some((r) => r.practiced > 0);
        const done = avg >= 60;
        return (
          <section key={g.key} className={`stop ${done ? 'stop--done' : ''} ${started ? 'stop--started' : ''}`} style={stageStyle(g.stage)}>
            <div className="stop__node" aria-hidden>
              {done ? <IconCheck width={14} height={14} /> : null}
            </div>
            <div className="stop__head">
              <span className="stop__title">{g.title}</span>
              <span className="stop__pct">{started ? `${avg}%` : ''}</span>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {g.scenarios.map((s, i) => (
                <ScenarioItem key={s.id} scenario={s} readiness={rs[i]} />
              ))}
            </div>
          </section>
        );
      })}
      <div className="stop stop--end" aria-hidden>
        <div className="stop__node">✈</div>
        <div className="stop__head">
          <span className="stop__title">Вы готовы к поездке</span>
        </div>
      </div>
    </div>
  );
}
