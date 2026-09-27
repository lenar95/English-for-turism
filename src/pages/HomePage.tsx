import { Link } from 'react-router-dom';
import { BoardingPass } from '../components/BoardingPass';
import { IconArrow, IconTarget } from '../components/Icons';
import { RouteMap } from '../components/RouteMap';
import { stageStyle } from '../components/stage';
import { cities, cityById } from '../data';
import { isDue } from '../lib/memory';
import { scenarioReadiness, tripReadiness } from '../lib/readiness';
import { streak } from '../state/model';
import { useApp } from '../state/AppContext';

function daysUntil(date: string, now: number): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(new Date(now).toDateString()).getTime();
  return Math.round((target - today) / 86400000);
}

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function HomePage() {
  const { data, tripScenarios, speechOn } = useApp();
  const now = Date.now();
  const trip = tripReadiness(tripScenarios, data.progress, now, speechOn);
  const perScenario = tripScenarios.map((s) => ({ s, r: scenarioReadiness(s, data.progress, now, speechOn) }));
  const due = tripScenarios.flatMap((s) => s.phrases).filter((p) => isDue(data.progress[p.id]?.memory, now)).length;
  const weakest = [...perScenario].sort((a, b) => a.r.total - b.r.total)[0];
  const days = daysUntil(data.trip.date, now);
  const series = streak(data.activeDays, now);
  const city = cityById[data.trip.cityId];

  return (
    <div className="page">
      <header className="home-head">
        <div>
          <p className="home-hello">{greeting(now)}</p>
          <h1>Английский в поездку</h1>
        </div>
        {series > 0 && (
          <span className="streak" title="Дней подряд">
            🔥 {series}
          </span>
        )}
      </header>

      <BoardingPass
        destination={data.trip.destination}
        city={city}
        date={data.trip.date}
        days={days}
        readiness={trip}
        speechOn={speechOn}
      />

      <section className="stack">
        <Link to="/practice/trip" className="btn btn--block btn--lg">
          {due > 0 ? `Повторить фразы · ${due}` : 'Тренировка на 5 минут'}
          <IconArrow />
        </Link>
        <Link to="/exam/trip" className="btn btn--secondary btn--block">
          <IconTarget />
          Проверить готовность к поездке
        </Link>
      </section>

      {weakest && weakest.r.total < 85 && (
        <Link to={`/scenario/${weakest.s.id}`} className="tip-card" style={stageStyle(weakest.s.stage)}>
          <span className="tip-card__emoji" aria-hidden>{weakest.s.emoji}</span>
          <span className="grow">
            <span className="tip-card__label">{weakest.r.practiced ? 'Подтяните слабое место' : 'Начните отсюда'}</span>
            <b>{weakest.s.title}</b>
            <span className="small muted">{weakest.s.goal}</span>
          </span>
          <IconArrow width={20} height={20} />
        </Link>
      )}

      {!city && (
        <Link to="/scenarios" className="banner" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span aria-hidden style={{ fontSize: 22 }}>🏙️</span>
          <span className="grow">Есть наборы для городов ({cities.map((c) => c.name).join(', ')}): местные нюансы, которых нет в общих ситуациях.</span>
        </Link>
      )}

      <h2 className="section-title">Ваш маршрут</h2>
      <RouteMap scenarios={tripScenarios} progress={data.progress} now={now} speechOn={speechOn} />
      <Link to="/settings" className="btn btn--ghost">Изменить ситуации поездки</Link>
    </div>
  );
}
