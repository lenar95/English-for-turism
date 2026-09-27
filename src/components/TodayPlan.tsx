import { Link } from 'react-router-dom';
import type { DailyPlan, MotivationReading } from '../lib/motivation';
import { IconArrow } from './Icons';
import { Bar } from './Readiness';

/** Карточка «План на сегодня» — средний контур: дневная норма от даты вылета и минимальный шаг. */
export function TodayPlan({ plan, reading, remembered }: { plan: DailyPlan; reading: MotivationReading; remembered: number | null }) {
  const done = plan.done >= plan.goal;
  const left = Math.max(0, plan.goal - plan.done);

  if (reading.state === 'returning' && plan.done === 0) {
    return (
      <section className="plan plan--return">
        <span className="plan__label">С возвращением 👋</span>
        <b className="plan__title">
          {remembered !== null
            ? `Вы помните примерно ${Math.round(remembered * 100)}% выученного`
            : 'Хорошо, что вы вернулись'}
        </b>
        <p className="small muted">Начнём с разминки на минуту — только то, что вы уже знаете. Никаких штрафов за перерыв.</p>
        <Link to="/practice/trip?m=warmup" className="btn btn--block btn--lg">
          Разминка · 1 минута <IconArrow />
        </Link>
      </section>
    );
  }

  return (
    <section className={`plan ${done ? 'plan--done' : ''}`}>
      <div className="row row--between">
        <span className="plan__label">План на сегодня</span>
        <span className="plan__count">
          {Math.min(plan.done, plan.goal)}/{plan.goal}
        </span>
      </div>
      <Bar value={(Math.min(plan.done, plan.goal) / plan.goal) * 100} color={done ? 'var(--good)' : 'var(--primary)'} />
      <p className="small muted">{done ? 'План выполнен! Можно отдохнуть — или позаниматься ещё, если хочется.' : plan.message}</p>
      {!done && (
        <Link to={plan.minimal ? '/practice/trip?m=minimal' : '/practice/trip'} className="btn btn--block btn--lg">
          {plan.minimal ? 'Одна минута · 5 заданий' : plan.done ? `Продолжить · осталось ${left}` : 'Начать занятие'}
          <IconArrow />
        </Link>
      )}
      {done && (
        <Link to="/practice/trip" className="btn btn--secondary btn--block">
          Ещё одна тренировка
        </Link>
      )}
      {!done && !plan.minimal && (
        <Link to="/practice/trip?m=minimal" className="btn btn--ghost btn--sm" style={{ alignSelf: 'center' }}>
          Нет сил? Только 1 минута
        </Link>
      )}
    </section>
  );
}

/** Недельная цель: прощающая замена серии дней подряд. */
export function WeekDots({ days, count, goal }: { days: boolean[]; count: number; goal: number }) {
  const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <div className="week" title={`Цель недели: ${goal} дн.`}>
      <div className="week__dots">
        {days.map((on, i) => (
          <span key={i} className={`week__dot ${on ? 'on' : ''} ${i === todayIdx ? 'today' : ''}`}>
            <span>{labels[i]}</span>
          </span>
        ))}
      </div>
      <span className={`week__count ${count >= goal ? 'tone-good' : ''}`}>
        {count}/{goal}
      </span>
    </div>
  );
}
