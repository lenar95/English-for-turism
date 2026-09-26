import { Link, useParams } from 'react-router-dom';
import { IconCheck, IconChevron, IconPlay } from '../components/Icons';
import { TopBar } from '../components/Layout';
import { Ring } from '../components/Readiness';
import { ScenarioItem } from '../components/ScenarioItem';
import { SpeakButtons } from '../components/Speak';
import { cityById } from '../data';
import { scenarioReadiness, tripReadiness } from '../lib/readiness';
import { useApp } from '../state/AppContext';

export function CityPage() {
  const { id = '' } = useParams();
  const { data, speechOn, updateTrip } = useApp();
  const city = cityById[id];
  if (!city) {
    return (
      <div className="page">
        <TopBar back="/scenarios" />
        <p className="empty">Город не найден.</p>
      </div>
    );
  }
  const now = Date.now();
  const selected = data.trip.cityId === city.id;
  const r = tripReadiness(city.scenarios, data.progress, now, speechOn);
  const { localLanguage: lang } = city;

  return (
    <div className="page">
      <TopBar back="/scenarios" title={city.name} />
      <header className="row">
        <span className="big-emoji" aria-hidden>{city.emoji}</span>
        <div className="grow stack stack--sm">
          <h1>{city.name}</h1>
          <p className="muted small">{city.country} · {city.scenarios.length} ситуации</p>
        </div>
        <Ring value={r.total} size={72} stroke={8} />
      </header>
      <p>{city.intro}</p>

      {selected ? (
        <div className="stack">
          <div className="banner banner--info">
            <IconCheck width={20} height={20} />
            <span className="grow">Стамбул в вашей поездке: его ситуации учитываются в тренировках и готовности.</span>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => updateTrip({ cityId: '' })}>
            Убрать город из поездки
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--block"
          onClick={() => updateTrip({ cityId: city.id, destination: data.trip.destination || city.name })}
        >
          <IconCheck /> Я еду в {city.name}
        </button>
      )}

      <h2 className="section-title">Ситуации города</h2>
      <div className="stack">
        {city.scenarios.map((s) => (
          <ScenarioItem key={s.id} scenario={s} readiness={scenarioReadiness(s, data.progress, now, speechOn)} />
        ))}
      </div>

      <section className="card stack">
        <h3>Пара слов {lang.name}</h3>
        <p className="small muted">{lang.note}</p>
        <div className="stack stack--sm">
          {lang.words.map((w) => (
            <div key={w.text} className="row" style={{ gap: 10 }}>
              <div className="grow">
                <b lang={lang.lang}>{w.text}</b>
                {data.settings.showTranscription && <span className="phrase__tr small"> · {w.tr}</span>}
                <div className="small muted">{w.ru}</div>
              </div>
              <SpeakButtons text={w.text.replace(' / ', ', ')} lang={lang.lang} showSlow={false} />
            </div>
          ))}
        </div>
      </section>

      <details className="card">
        <summary>
          Советы по городу <IconChevron className="chev" />
        </summary>
        <ul className="tips" style={{ marginTop: 12 }}>
          {city.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>

      {city.scenarios[0] && (
        <Link to={`/practice/${city.scenarios[0].id}`} className="btn btn--secondary btn--block">
          <IconPlay /> Начать с «{city.scenarios[0].title}»
        </Link>
      )}
    </div>
  );
}
