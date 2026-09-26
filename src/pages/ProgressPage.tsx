import { Link } from 'react-router-dom';
import { Ring } from '../components/Readiness';
import { scenarioById } from '../data';
import { scenarioReadiness, tripReadiness, MEMORY_WEIGHT } from '../lib/readiness';
import { useApp } from '../state/AppContext';
import type { ExamRecord } from '../state/model';

function ExamChart({ exams }: { exams: ExamRecord[] }) {
  const list = exams.slice(-12);
  const w = 320;
  const h = 120;
  const pad = 8;
  const bw = (w - pad * 2) / Math.max(list.length, 1);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Результаты последних проверок">
      {[0, 50, 100].map((g) => (
        <line key={g} x1={0} x2={w} y1={h - (g / 100) * h + 2} y2={h - (g / 100) * h + 2} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
      {list.map((e, i) => {
        const bh = Math.max(3, (e.total / 100) * (h - 4));
        const color = e.total >= 60 ? 'var(--good)' : e.total >= 30 ? 'var(--mid)' : 'var(--bad)';
        return (
          <g key={e.at}>
            <rect x={pad + i * bw + bw * 0.18} y={h - bh + 2} width={bw * 0.64} height={bh} rx={4} fill={color}>
              <title>{`${new Date(e.at).toLocaleDateString('ru-RU')}: ${e.total}%`}</title>
            </rect>
            <text x={pad + i * bw + bw / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="var(--text-3)">
              {e.total}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ProgressPage() {
  const { data, tripScenarios, speechOn } = useApp();
  const now = Date.now();
  const trip = tripReadiness(tripScenarios, data.progress, now, speechOn);
  const exams = [...data.exams].reverse();

  return (
    <div className="page">
      <header className="stack stack--sm" style={{ paddingTop: 8 }}>
        <h1>Прогресс</h1>
      </header>

      <section className="card row">
        <Ring value={trip.total} size={96} stroke={10} />
        <div className="grow stack stack--sm small">
          <span>🧠 Память: <b>{trip.memory}%</b></span>
          <span>🎙 Произношение: <b>{speechOn ? `${trip.pronunciation}%` : '—'}</b></span>
          <span className="muted">Изучено {trip.practiced} из {trip.phrases} фраз</span>
        </div>
      </section>

      <section className="card stack">
        <h3>По ситуациям</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Ситуация</th>
              <th className="num">🧠</th>
              <th className="num">🎙</th>
              <th className="num">Итог</th>
            </tr>
          </thead>
          <tbody>
            {tripScenarios.map((s) => {
              const r = scenarioReadiness(s, data.progress, now, speechOn);
              return (
                <tr key={s.id}>
                  <td>
                    <Link to={`/scenario/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {s.emoji} {s.title}
                    </Link>
                  </td>
                  <td className="num">{r.memory}</td>
                  <td className="num">{speechOn ? r.pronunciation : '—'}</td>
                  <td className="num"><b>{r.total}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <h3>Проверки готовности</h3>
        {exams.length === 0 ? (
          <p className="muted small">
            Вы ещё не проходили проверку. <Link to="/exam/trip">Пройти сейчас</Link>
          </p>
        ) : (
          <>
            <ExamChart exams={data.exams} />
            <table className="table">
              <tbody>
                {exams.slice(0, 10).map((e) => (
                  <tr key={e.at}>
                    <td>
                      {new Date(e.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      <div className="tiny muted">{e.scenarioId ? scenarioById[e.scenarioId]?.title : 'Вся поездка'}</div>
                    </td>
                    <td className="num small muted">🧠 {e.memory} · 🎙 {e.pronunciation ?? '—'}</td>
                    <td className="num"><b>{e.total}%</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <details className="card">
        <summary>Как считается готовность</summary>
        <div className="stack small" style={{ marginTop: 12 }}>
          <p>
            <b>Готовность</b> = {Math.round(MEMORY_WEIGHT * 100)}% память + {Math.round((1 - MEMORY_WEIGHT) * 100)}% произношение. Ключевые
            фразы весят вдвое больше остальных.
          </p>
          <p>
            <b>Память.</b> У каждой фразы есть уровень от 0 до 5. Верный ответ повышает его, ошибка — понижает на 2. Узнать
            фразу среди вариантов проще, чем вспомнить самому, поэтому для фраз, которые нужно говорить, выбор из вариантов
            поднимает уровень максимум до 3 — дальше нужно собрать фразу или сказать её по памяти. Со временем фразы
            забываются: готовность снижается, если долго не повторять (кривая забывания, как в Anki).
          </p>
          <p>
            <b>Произношение.</b> Вы говорите фразу, система распознавания речи (как в Siri или Google) записывает, что
            услышала, и мы сравниваем это с нужной фразой по словам. Если распознаватель понял вас — поймёт и живой человек.
            Учитываются три последние попытки по каждой фразе, которую нужно говорить вам.
          </p>
          <p>
            <b>Проверка готовности</b> — это экзамен без подсказок: узнавание, понимание на слух, сборка фраз, чтение вслух и
            ответ по памяти.
          </p>
        </div>
      </details>
    </div>
  );
}
