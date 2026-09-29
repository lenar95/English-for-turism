import { Link } from 'react-router-dom';
import { BoardingPass } from '../components/BoardingPass';
import { IconArrow, IconTarget } from '../components/Icons';
import { RouteMap } from '../components/RouteMap';
import { TodayPlan, WeekDots } from '../components/TodayPlan';
import { stageStyle } from '../components/stage';
import { cities, cityById } from '../data';
import { daysUntil } from '../lib/dates';
import { activeThisWeek, rememberedShare } from '../lib/motivation';
import { pushSupport } from '../lib/push';
import { scenarioReadiness } from '../lib/readiness';
import { useApp } from '../state/AppContext';
import { useMotivation, useReadiness } from '../state/selectors';
import { useNow } from '../state/useNow';

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function HomePage() {
  const { data, tripScenarios, speechOn, plan, backend } = useApp();
  const now = useNow();
  const trip = useReadiness();
  const perScenario = tripScenarios.map((s) => ({ s, r: scenarioReadiness(s, data.progress, now, speechOn) }));
  const weakest = [...perScenario].sort((a, b) => a.r.total - b.r.total)[0];
  const days = daysUntil(data.trip.date, now);
  const city = cityById[data.trip.cityId];
  const reading = useMotivation();
  const week = activeThisWeek(data.activeDays, now);
  const can = tripScenarios.filter((s) => data.badges.includes(`can:${s.id}`));

  return (
    <div className="page">
      <header className="home-head">
        <div>
          <p className="home-hello">{greeting(now)}</p>
          <h1>Английский в поездку</h1>
        </div>
      </header>
      <BoardingPass
        destination={data.trip.destination}
        city={city}
        date={data.trip.date}
        days={days}
        readiness={trip}
        speechOn={speechOn}
      />

      <WeekDots days={week.days} count={week.count} goal={data.weeklyGoal} todayIndex={(new Date(now).getDay() + 6) % 7} />

      <TodayPlan plan={plan} reading={reading} remembered={rememberedShare(tripScenarios, data.progress, now)} />


      {data.answers.length > 0 && !data.settings.reminders && backend === 'ok' && ['ok', 'ios-install'].includes(pushSupport()) && (
        <Link to="/settings" className="banner" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span aria-hidden style={{ fontSize: 22 }}>⏰</span>
          <span className="grow">
            <b>Когда вам удобно заниматься?</b>
            <br />
            <span className="small">
              {pushSupport() === 'ios-install'
                ? 'Добавьте приложение на экран «Домой» — и мы будем напоминать в удобное время.'
                : 'Выберите время — напомним, только если в этот день вы ещё не занимались.'}
            </span>
          </span>
        </Link>
      )}

      {can.length > 0 && (
        <section className="card stack">
          <h3>Вы уже можете</h3>
          <ul className="can-list">
            {can.map((s) => (
              <li key={s.id}>
                <span aria-hidden>{s.emoji}</span>
                <span>{s.goal}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link to="/exam/trip" className="btn btn--secondary btn--block">
        <IconTarget />
        Проверить готовность к поездке
      </Link>

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
