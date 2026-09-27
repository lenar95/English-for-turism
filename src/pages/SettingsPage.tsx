import { useState } from 'react';
import { PronunciationCheck } from '../components/PronunciationCheck';
import { SpeakButtons } from '../components/Speak';
import { SpeechDiagnostics } from '../components/SpeechDiagnostics';
import { TripDetails, TripScenarioPicker } from '../components/TripEditor';
import { useApp } from '../state/AppContext';

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch-row">
      <span className="grow">
        {label}
        {hint && <><br /><span className="small muted">{hint}</span></>}
      </span>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function SettingsPage() {
  const { data, updateSettings, resetProgress, speechSupported, setWeeklyGoal } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const s = data.settings;

  return (
    <div className="page">
      <header style={{ paddingTop: 8 }}>
        <h1>Настройки</h1>
      </header>

      <section className="card stack">
        <h3>Поездка</h3>
        <TripDetails />
      </section>

      <section className="card stack">
        <h3>Цель недели</h3>
        <p className="small muted">
          Сколько дней в неделю заниматься. Пропустить день не страшно — важно набрать цель за неделю.
        </p>
        <div className="segmented">
          {[3, 4, 5, 7].map((d) => (
            <button key={d} type="button" className={data.weeklyGoal === d ? 'active' : ''} onClick={() => setWeeklyGoal(d)}>
              {d} дн.
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h3>Звук и подсказки</h3>
        <div className="field">
          <label>Произношение диктора</label>
          <div className="segmented">
            <button type="button" className={s.accent === 'en-US' ? 'active' : ''} onClick={() => updateSettings({ accent: 'en-US' })}>
              🇺🇸 Американское
            </button>
            <button type="button" className={s.accent === 'en-GB' ? 'active' : ''} onClick={() => updateSettings({ accent: 'en-GB' })}>
              🇬🇧 Британское
            </button>
          </div>
        </div>
        <div className="row">
          <span className="grow small muted">Проверить звук:</span>
          <SpeakButtons text="Hello! Welcome to our hotel." />
        </div>
        <Switch
          checked={s.showTranscription}
          onChange={(v) => updateSettings({ showTranscription: v })}
          label="Произношение русскими буквами"
          hint="Помогает на старте. Когда освоитесь — выключите, чтобы читать по-английски."
        />
        <Switch
          checked={s.pronunciation && speechSupported}
          onChange={(v) => updateSettings({ pronunciation: v })}
          label="Проверять произношение"
          hint={
            speechSupported
              ? 'Нужен микрофон. Если выключить, готовность считается только по памяти.'
              : 'Недоступно в этом браузере. Используйте Chrome, Edge, Safari или iOS-приложение.'
          }
        />
      </section>

      {speechSupported && s.pronunciation && (
        <section className="card stack">
          <h3>Проверка микрофона</h3>
          <p className="small muted">Скажите: <b lang="en">Hello, how are you?</b> (Хэлоу, хау а ю?)</p>
          <PronunciationCheck targets={['Hello, how are you?']} />
        </section>
      )}

      {speechSupported && <SpeechDiagnostics />}

      <section className="card stack">
        <h3>Ситуации в поездке</h3>
        <p className="small muted">Готовность считается только по выбранным ситуациям.</p>
        <TripScenarioPicker />
      </section>

      <section className="card stack">
        <h3>Данные</h3>
        <p className="small muted">Прогресс хранится только на этом устройстве.</p>
        {!confirmReset ? (
          <button type="button" className="btn btn--danger" onClick={() => setConfirmReset(true)}>
            Сбросить прогресс
          </button>
        ) : (
          <div className="stack">
            <p className="small">Весь прогресс и история проверок будут удалены. Точно?</p>
            <div className="row">
              <button type="button" className="btn btn--outline grow" onClick={() => setConfirmReset(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--danger grow"
                onClick={() => {
                  resetProgress();
                  setConfirmReset(false);
                }}
              >
                Да, сбросить
              </button>
            </div>
          </div>
        )}
      </section>
      <p className="tiny muted center">Английский в поездку · версия {__APP_VERSION__}</p>
    </div>
  );
}
