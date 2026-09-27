import { useEffect, useState } from 'react';
import { diagClear, diagEntries, diagSubscribe, diagText } from '../lib/speech/diag';

/** Журнал событий распознавания: помогает понять, почему запись не срабатывает на конкретном телефоне. */
export function SpeechDiagnostics() {
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => diagSubscribe(() => setTick((t) => t + 1)), []);
  const text = diagText();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="card stack" id="diag">
      <h3>Диагностика распознавания</h3>
      <p className="small muted">
        Если запись зависает, повторите проблему (например, проверьте произношение двух фраз подряд), вернитесь сюда и
        нажмите «Скопировать журнал» — его можно отправить разработчику.
      </p>
      <pre className="diag-log">{diagEntries().length ? text : 'Пока пусто — событий записи ещё не было.'}</pre>
      <div className="row">
        <button type="button" className="btn btn--secondary grow" onClick={copy} disabled={!diagEntries().length}>
          {copied ? 'Скопировано ✓' : 'Скопировать журнал'}
        </button>
        <button type="button" className="btn btn--outline" onClick={diagClear}>
          Очистить
        </button>
      </div>
    </section>
  );
}
