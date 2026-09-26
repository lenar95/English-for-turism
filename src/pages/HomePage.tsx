import { Link } from 'react-router-dom';
import { IconArrow, IconBrain, IconTarget, IconWave } from '../components/Icons';
import { LevelBadge, Metric, Ring } from '../components/Readiness';
import { ScenarioItem } from '../components/ScenarioItem';
import { isDue } from '../lib/memory';
import { readinessLevel, scenarioReadiness, tripReadiness } from '../lib/readiness';
import { streak } from '../state/model';
import { useApp } from '../state/AppContext';

function daysUntil(date: string, now: number): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date(new Date(now).toDateString()).getTime();
  return Math.round((target - today) / 86400000);
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function HomePage() {
  const { data, tripScenarios, speechOn } = useApp();
  const now = Date.now();
  const trip = tripReadiness(tripScenarios, data.progress, now, speechOn);
  const level = readinessLevel(trip.total);
  const perScenario = tripScenarios.map((s) => ({ s, r: scenarioReadiness(s, data.progress, now, speechOn) }));
  const due = tripScenarios.flatMap((s) => s.phrases).filter((p) => isDue(data.progress[p.id]?.memory, now)).length;
  const weakest = [...perScenario].sort((a, b) => a.r.total - b.r.total)[0];
  const days = daysUntil(data.trip.date, now);
  const series = streak(data.activeDays, now);

  return (
    <div className="page">
      <header className="stack stack--sm" style={{ paddingTop: 8 }}>
        <h1>{data.trip.destination ? `Поездка: ${data.trip.destination}` : 'Английский в поездку'}</h1>
        {days !== null && days >= 0 && (
          <p className="muted">
            {days === 0 ? 'Вылет сегодня — удачной поездки! ✈️' : `До вылета ${days} ${plural(days, 'день', 'дня', 'дней')}`}
          </p>
        )}
        {days === null && <p className="muted">Выучите главные фразы и проверьте, готовы ли вы к поездке.</p>}
      </header>

      <section className="card stack">
        <div className="hero">
          <Ring value={trip.total} size={128} />
          <div className="hero__text">
            <LevelBadge total={trip.total} />
            <p className="small muted">{level.description}</p>
          </div>
        </div>
        <Metric icon={<IconBrain width={16} height={16} />} label="Память" value={trip.memory} />
        <Metric
          icon={<IconWave width={16} height={16} />}
          label="Произношение"
          value={trip.pronunciation}
          disabled={speechOn ? undefined : 'Без микрофона готовность считается только по памяти'}
        />
      </section>

      <section className="stack">
        <Link to="/practice/trip" className="btn btn--block">
          {due > 0 ? `Повторить фразы (${due})` : 'Тренировка на 5 минут'}
          <IconArrow />
        </Link>
        <Link to="/exam/trip" className="btn btn--secondary btn--block">
          <IconTarget />
          Проверить готовность к поездке
        </Link>
      </section>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__num">{trip.practiced}</div>
          <div className="stat__label">из {trip.phrases} фраз изучено</div>
        </div>
        <div className="stat">
          <div className="stat__num">{due}</div>
          <div className="stat__label">{plural(due, 'фразу', 'фразы', 'фраз')} пора повторить</div>
        </div>
        <div className="stat">
          <div className="stat__num">{series}</div>
          <div className="stat__label">{plural(series, 'день', 'дня', 'дней')} подряд</div>
        </div>
      </div>

      {weakest && weakest.r.total < 85 && (
        <Link to={`/scenario/${weakest.s.id}`} className="banner banner--info" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span style={{ fontSize: 24 }} aria-hidden>{weakest.s.emoji}</span>
          <span className="grow">
            <b>Слабое место: {weakest.s.title}</b>
            <br />
            <span className="muted">Готовность {weakest.r.total}%. {weakest.s.goal}</span>
          </span>
        </Link>
      )}

      <h2 className="section-title">Ваш маршрут</h2>
      <div className="route">
        {perScenario.map(({ s, r }) => (
          <ScenarioItem key={s.id} scenario={s} readiness={r} />
        ))}
      </div>
      <Link to="/settings" className="btn btn--ghost">Изменить ситуации поездки</Link>
    </div>
  );
}
