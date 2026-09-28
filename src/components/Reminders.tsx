import { useState } from 'react';
import { disablePush, enablePush, pushSupport, sendStatus, testPush } from '../lib/push';
import { useApp } from '../state/AppContext';

const PRESETS = [
  { time: '08:30', label: 'Утром', hint: 'за завтраком' },
  { time: '13:00', label: 'Днём', hint: 'в обед' },
  { time: '19:00', label: 'Вечером', hint: 'после работы' },
  { time: '21:30', label: 'Перед сном', hint: '' },
];

/** Настройка напоминаний: включение, время («когда будете заниматься») и проверка. */
export function Reminders() {
  const app = useApp();
  const { settings } = app.data;
  const support = pushSupport();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const setTime = (time: string) => {
    app.updateSettings({ reminderTime: time });
    if (settings.reminders && app.data.pushId) void sendStatus(app.data.pushId, time, app.pushSnapshot());
  };

  const toggle = async (on: boolean) => {
    setNote('');
    setBusy(true);
    try {
      if (on) {
        const id = app.ensurePushId();
        const r = await enablePush(id, settings.reminderTime, app.pushSnapshot());
        if (r.status === 'ok') {
          app.updateSettings({ reminders: true });
          setNote('Готово! Напоминание придёт в выбранное время, если в этот день вы ещё не занимались.');
        } else if (r.status === 'denied') {
          setNote('Уведомления запрещены. Разрешите их в настройках iPhone: Настройки → Уведомления → В поездку.');
        } else {
          setNote(`Не удалось включить напоминания. Подробности для разработчика: ${r.detail}`);
        }
      } else {
        if (app.data.pushId) await disablePush(app.data.pushId);
        app.updateSettings({ reminders: false });
      }
    } catch (e) {
      setNote(`Не получилось включить напоминания: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" id="reminders">
      <h3>Напоминания</h3>
      {support === 'ios-install' ? (
        <div className="banner banner--info">
          <span aria-hidden>📲</span>
          <span>
            На iPhone напоминания работают, только если приложение добавлено на экран «Домой»: в Safari нажмите
            «Поделиться» → «На экран “Домой”», затем откройте приложение с иконки и включите напоминания здесь.
          </span>
        </div>
      ) : support === 'unsupported' ? (
        <p className="small muted">Этот браузер не поддерживает уведомления.</p>
      ) : support === 'native' ? (
        <p className="small muted">В iOS-приложении напоминания появятся в следующей версии.</p>
      ) : (
        <>
          <p className="small muted">
            Одно короткое напоминание в день. Если вы уже позанимались — не побеспокоим. После долгого перерыва будем
            напоминать реже, а через две недели тишины перестанем.
          </p>
          <label className="switch-row">
            <span className="grow">Напоминать заниматься</span>
            <span className="switch">
              <input type="checkbox" checked={settings.reminders} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
              <span />
            </span>
          </label>
        </>
      )}

      <div className="field">
        <label htmlFor="reminder-time">Когда вам удобно заниматься?</label>
        <p className="tiny muted" style={{ margin: 0 }}>
          Лучше привязать к привычке: «после утреннего кофе», «в метро по дороге домой» — так занятие само встраивается в
          день.
        </p>
        <div className="time-presets">
          {PRESETS.map((p) => (
            <button
              key={p.time}
              type="button"
              className={`chip ${settings.reminderTime === p.time ? 'chip--you' : ''}`}
              onClick={() => setTime(p.time)}
            >
              {p.label} · {p.time}
            </button>
          ))}
        </div>
        <input id="reminder-time" className="input" type="time" value={settings.reminderTime} onChange={(e) => setTime(e.target.value)} />
      </div>

      {settings.reminders && app.data.pushId && support === 'ok' && (
        <button
          type="button"
          className="btn btn--outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await testPush(app.data.pushId!);
            setBusy(false);
            setNote(ok ? 'Пробное уведомление отправлено.' : 'Не удалось отправить. Выключите и снова включите напоминания.');
          }}
        >
          Прислать пробное уведомление
        </button>
      )}
      {note && <p className="small">{note}</p>}
    </section>
  );
}
