import { ACCURACY_BAND, STATE_TEXT, TARGET_ACCURACY, dayStart, type MotivationReading } from '../lib/motivation';
import type { AnswerEvent, SessionLog } from '../state/model';

const DAY = 86400000;

/**
 * «Как идёт обучение» — показания датчиков системы мотивации:
 * состояние, точность относительно целевого коридора, дни занятий, брошенные сессии.
 */
export function LearningHealth({
  reading,
  answers,
  sessions,
  activeDays,
  now,
}: {
  reading: MotivationReading;
  answers: AnswerEvent[];
  sessions: SessionLog[];
  activeDays: string[];
  now: number;
}) {
  const text = STATE_TEXT[reading.state];
  const today = dayStart(now);
  const set = new Set(activeDays);
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today - (13 - i) * DAY);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return set.has(key);
  });

  // Точность по дням за 14 дней — видно, держится ли она в коридоре.
  const perDay = Array.from({ length: 14 }, (_, i) => {
    const from = today - (13 - i) * DAY;
    const list = answers.filter((a) => a.t >= from && a.t < from + DAY);
    return list.length ? list.filter((a) => a.ok).length / list.length : null;
  });
  const w = 300;
  const h = 80;
  const x = (i: number) => 6 + (i * (w - 12)) / 13;
  const y = (v: number) => h - 4 - v * (h - 8);
  const pts = perDay.map((v, i) => (v === null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
  const nonExam = sessions.filter((s) => s.kind !== 'exam').slice(-10);
  const avgMin = nonExam.length
    ? nonExam.reduce((s, x2) => s + (x2.end - x2.start), 0) / nonExam.length / 60000
    : null;

  return (
    <section className="card stack">
      <h3>Как идёт обучение</h3>
      <div className="health-state">
        <b>{text.title}</b>
        <span className="small muted">{text.hint}</span>
      </div>

      <div className="stack stack--sm">
        <div className="row row--between small">
          <span className="muted">Верных ответов (цель — около {Math.round(TARGET_ACCURACY * 100)}%)</span>
          <b>{reading.accuracy === null ? '—' : `${Math.round(reading.accuracy * 100)}%`}</b>
        </div>
        <svg className="chart" viewBox={`0 0 ${w} ${h}`} style={{ height: 80 }} role="img" aria-label="Точность по дням">
          <rect
            x={0}
            width={w}
            y={y(ACCURACY_BAND[1])}
            height={y(ACCURACY_BAND[0]) - y(ACCURACY_BAND[1])}
            fill="var(--good-soft)"
            rx={6}
          />
          <line x1={0} x2={w} y1={y(TARGET_ACCURACY)} y2={y(TARGET_ACCURACY)} stroke="var(--good)" strokeDasharray="4 4" opacity={0.6} />
          {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" />}
          {perDay.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill="var(--primary)" />))}
        </svg>
        <span className="tiny muted">Зелёная полоса — комфортный коридор: не слишком легко и не слишком трудно.</span>
      </div>

      <div className="stack stack--sm">
        <div className="row row--between small">
          <span className="muted">Дни занятий за 2 недели</span>
          <b>{last14.filter(Boolean).length} из 14</b>
        </div>
        <div className="days14">
          {last14.map((on, i) => (
            <span key={i} className={on ? 'on' : ''} />
          ))}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__num">{nonExam.length ? Math.round((1 - reading.earlyExitRate) * 100) : '—'}{nonExam.length ? '%' : ''}</div>
          <div className="stat__label">тренировок доведено до конца</div>
        </div>
        <div className="stat">
          <div className="stat__num">{avgMin === null ? '—' : avgMin < 1 ? '<1' : Math.round(avgMin)}</div>
          <div className="stat__label">мин. в среднем на тренировку</div>
        </div>
        <div className="stat">
          <div className="stat__num">{reading.daysSinceLast ?? '—'}</div>
          <div className="stat__label">дн. с последнего занятия</div>
        </div>
      </div>
    </section>
  );
}
