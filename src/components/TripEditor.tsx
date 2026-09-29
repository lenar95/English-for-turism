import { STAGES, cities, scenarios } from '../data';
import { useApp } from '../state/AppContext';
import { stageStyle } from './stage';

/** Выбор ситуаций, которые понадобятся в поездке. */
export function TripScenarioPicker() {
  const { data, updateTrip } = useApp();
  const selected = data.trip.allScenarios ? scenarios.map((s) => s.id) : data.trip.scenarioIds;
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    // Храним в порядке маршрута. Пустой выбор не допускаем. Если отмечены все — включаем режим «все»,
    // чтобы новые ситуации из будущих версий добавлялись сами.
    const ordered = scenarios.map((s) => s.id).filter((x) => next.includes(x));
    if (!ordered.length) return;
    const all = ordered.length === scenarios.length;
    updateTrip({ allScenarios: all, scenarioIds: all ? [] : ordered });
  };
  return (
    <div className="stack">
      {STAGES.map((stage) => (
        <div key={stage.id} className="stack stack--sm">
          <span className="section-title" style={{ margin: '4px 4px 0' }}>{stage.title}</span>
          {scenarios
            .filter((s) => s.stage === stage.id)
            .map((s) => {
              const on = selected.includes(s.id);
              return (
                <label key={s.id} className={`check-item ${on ? 'checked' : ''}`} style={stageStyle(s.stage)}>
                  <input type="checkbox" checked={on} onChange={() => toggle(s.id)} />
                  <span className="check-item__emoji" aria-hidden>{s.emoji}</span>
                  <span className="grow">
                    <b>{s.title}</b>
                    <br />
                    <span className="small muted">{s.goal}</span>
                  </span>
                </label>
              );
            })}
        </div>
      ))}
    </div>
  );
}

export function TripDetails() {
  const { data, updateTrip } = useApp();
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="trip-dest">Куда едете</label>
        <input
          id="trip-dest"
          className="input"
          placeholder="Например: Дубай, Таиланд, Лондон"
          value={data.trip.destination}
          onChange={(e) => updateTrip({ destination: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="trip-city">Набор для города</label>
        <select
          id="trip-city"
          className="input"
          value={data.trip.cityId}
          onChange={(e) => updateTrip({ cityId: e.target.value })}
        >
          <option value="">Без города — только общие ситуации</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}, {c.country}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="trip-date">Дата вылета</label>
        <input id="trip-date" className="input" type="date" value={data.trip.date} onChange={(e) => updateTrip({ date: e.target.value })} />
      </div>
    </div>
  );
}
