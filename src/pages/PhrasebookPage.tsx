import { useMemo, useState } from 'react';
import { IconSearch } from '../components/Icons';
import { PhraseCard } from '../components/PhraseCard';
import { allPhrases, allScenarios } from '../data';

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').toLowerCase().replace(/ё/g, 'е').replace(/[’']/g, "'");

export function PhrasebookPage() {
  const [q, setQ] = useState('');
  const [scenarioId, setScenarioId] = useState('');
  const [keyOnly, setKeyOnly] = useState(false);

  const found = useMemo(() => {
    const query = norm(q.trim());
    return allPhrases.filter(({ phrase, scenario }) => {
      if (scenarioId && scenario.id !== scenarioId) return false;
      if (keyOnly && !phrase.key) return false;
      if (!query) return true;
      return [phrase.en, phrase.ru, phrase.tr, ...(phrase.alt ?? []), phrase.local?.text ?? '', phrase.local?.tr ?? ''].some((t) => norm(t).includes(query));
    });
  }, [q, scenarioId, keyOnly]);

  return (
    <div className="page">
      <header className="stack stack--sm" style={{ paddingTop: 8 }}>
        <h1>Разговорник</h1>
        <p className="muted">Найдите фразу по-русски или по-английски. Кнопка ⤢ покажет её собеседнику крупным шрифтом.</p>
      </header>
      <div className="search">
        <IconSearch />
        <input
          className="input"
          type="search"
          placeholder="Например: такси, счёт, аптека…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Поиск фразы"
        />
      </div>
      <div className="row">
        <select className="input grow" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} aria-label="Ситуация">
          <option value="">Все ситуации</option>
          {allScenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.title}
            </option>
          ))}
        </select>
        <button type="button" className={`btn btn--sm ${keyOnly ? '' : 'btn--outline'}`} onClick={() => setKeyOnly(!keyOnly)} aria-pressed={keyOnly} style={{ minHeight: 48 }}>
          ★ Ключевые
        </button>
      </div>
      <p className="small muted">Найдено: {found.length}</p>
      <div className="stack">
        {found.slice(0, 80).map(({ phrase, scenario }) => (
          <PhraseCard key={phrase.id} phrase={phrase} context={scenarioId ? undefined : `${scenario.emoji} ${scenario.title}`} />
        ))}
        {found.length > 80 && <p className="small muted center">Показаны первые 80. Уточните поиск.</p>}
        {!found.length && <p className="empty">Ничего не нашлось. Попробуйте другое слово.</p>}
      </div>
    </div>
  );
}
