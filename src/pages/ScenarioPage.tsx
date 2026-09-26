import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { IconBrain, IconChat, IconChevron, IconPlay, IconTarget, IconWave } from '../components/Icons';
import { TopBar } from '../components/Layout';
import { PhraseCard } from '../components/PhraseCard';
import { Metric, Ring } from '../components/Readiness';
import { scenarioById } from '../data';
import { scenarioReadiness } from '../lib/readiness';
import { useApp } from '../state/AppContext';

type Filter = 'all' | 'you' | 'them';

export function ScenarioPage() {
  const { id = '' } = useParams();
  const { data, speechOn } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const scenario = scenarioById[id];
  if (!scenario) {
    return (
      <div className="page">
        <TopBar back="/scenarios" />
        <p className="empty">Ситуация не найдена.</p>
      </div>
    );
  }
  const r = scenarioReadiness(scenario, data.progress, Date.now(), speechOn);
  const phrases = scenario.phrases.filter((p) => filter === 'all' || p.speaker === filter);

  return (
    <div className="page">
      <TopBar back={scenario.cityId ? `/city/${scenario.cityId}` : '/scenarios'} title={scenario.title} />
      <header className="row">
        <span className="big-emoji" aria-hidden>{scenario.emoji}</span>
        <div className="grow stack stack--sm">
          <h1>{scenario.title}</h1>
          <p className="muted small">{scenario.goal}</p>
        </div>
      </header>

      <section className="card row" style={{ alignItems: 'center' }}>
        <Ring value={r.total} size={96} stroke={10} />
        <div className="grow stack">
          <Metric icon={<IconBrain width={16} height={16} />} label="Память" value={r.memory} />
          <Metric
            icon={<IconWave width={16} height={16} />}
            label="Произношение"
            value={r.pronunciation}
            disabled={speechOn ? undefined : 'Нужен микрофон'}
          />
        </div>
      </section>

      <section className="stack">
        <Link to={`/practice/${scenario.id}`} className="btn btn--block">
          <IconPlay /> Тренировка
        </Link>
        <div className="row">
          <Link to={`/scenario/${scenario.id}/dialogue/${scenario.dialogues[0]?.id ?? ''}`} className="btn btn--secondary grow">
            <IconChat /> Диалог
          </Link>
          <Link to={`/exam/${scenario.id}`} className="btn btn--secondary grow">
            <IconTarget /> Проверка
          </Link>
        </div>
      </section>

      {scenario.dialogues.length > 1 && (
        <section className="stack stack--sm">
          <h2 className="section-title">Диалоги</h2>
          {scenario.dialogues.map((d) => (
            <Link key={d.id} to={`/scenario/${scenario.id}/dialogue/${d.id}`} className="card card--flat row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <IconChat width={20} height={20} />
              <span className="grow">{d.title}</span>
              <span className="small muted">{d.lines.length} реплик</span>
            </Link>
          ))}
        </section>
      )}

      <details className="card">
        <summary>
          Советы для этой ситуации <IconChevron className="chev" />
        </summary>
        <ul className="tips" style={{ marginTop: 12 }}>
          {scenario.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>

      <h2 className="section-title">Фразы</h2>
      <div className="segmented" role="tablist" aria-label="Фильтр фраз">
        {(
          [
            ['all', `Все · ${scenario.phrases.length}`],
            ['you', 'Говорю я'],
            ['them', 'Мне говорят'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="stack">
        {phrases.map((p) => (
          <PhraseCard key={p.id} phrase={p} />
        ))}
      </div>
    </div>
  );
}
