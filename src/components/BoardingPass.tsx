import type { CityPack } from '../data/types';
import { readinessLevel, type Readiness } from '../lib/readiness';
import { IconBrain, IconWave } from './Icons';
import { Metric, Ring } from './Readiness';

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

interface Props {
  destination: string;
  city?: CityPack;
  date: string;
  days: number | null;
  readiness: Readiness;
  speechOn: boolean;
}

/** Главная карточка в виде посадочного талона: куда, когда и насколько вы готовы. */
export function BoardingPass({ destination, city, date, days, readiness, speechOn }: Props) {
  const level = readinessLevel(readiness.total);
  const place = city?.name ?? (destination || 'За границу');
  const code = city?.code ?? (destination ? destination.slice(0, 3).toUpperCase() : '✈︎');
  const when = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : 'дата не выбрана';
  const countdown =
    days === null ? '—' : days < 0 ? 'уже в пути' : days === 0 ? 'сегодня!' : `${days} ${plural(days, 'день', 'дня', 'дней')}`;

  return (
    <section className="pass" aria-label="Посадочный талон">
      <div className="pass__top">
        <div className="pass__label">
          <span>Посадочный талон</span>
          <span>Boarding pass</span>
        </div>
        <div className="pass__route">
          <div className="pass__end">
            <span className="pass__code">RU</span>
            <span className="pass__city">Дом</span>
          </div>
          <div className="pass__flight" aria-hidden>
            <span className="pass__dash" />
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z" fill="currentColor" transform="rotate(90 12 12)" />
            </svg>
            <span className="pass__dash" />
          </div>
          <div className="pass__end pass__end--right">
            <span className="pass__code">{code}</span>
            <span className="pass__city">{place}</span>
          </div>
        </div>
        <div className="pass__meta">
          <div>
            <span className="pass__meta-label">Вылет</span>
            <span className="pass__meta-value">{when}</span>
          </div>
          <div>
            <span className="pass__meta-label">До вылета</span>
            <span className="pass__meta-value">{countdown}</span>
          </div>
          <div>
            <span className="pass__meta-label">Фраз изучено</span>
            <span className="pass__meta-value">{readiness.practiced}/{readiness.phrases}</span>
          </div>
        </div>
      </div>
      <div className="pass__tear" aria-hidden />
      <div className="pass__bottom">
        <div className="hero">
          <Ring value={readiness.total} size={112} stroke={11} />
          <div className="hero__text">
            <span className={`level-badge tone-${readiness.total === 0 ? 'none' : level.tone}`}>{level.label}</span>
            <p className="small muted">{level.description}</p>
          </div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Metric icon={<IconBrain width={16} height={16} />} label="Память" value={readiness.memory} />
          <Metric
            icon={<IconWave width={16} height={16} />}
            label="Произношение"
            value={readiness.pronunciation}
            disabled={speechOn ? undefined : 'Без микрофона готовность считается только по памяти'}
          />
        </div>
      </div>
    </section>
  );
}
