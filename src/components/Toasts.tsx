import { useEffect } from 'react';
import { useApp } from '../state/AppContext';
import { Burst } from './Burst';

/** Уведомление о новом значке. Показывается по одному, исчезает само через 4 секунды. */
export function Toasts() {
  const { toasts, dismissToast } = useApp();
  const current = toasts[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => dismissToast(current.id), 4000);
    return () => clearTimeout(t);
  }, [current, dismissToast]);
  if (!current) return null;
  const isScenario = current.id.startsWith('scenario:');
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <button type="button" className="toast" key={current.id} onClick={() => dismissToast(current.id)}>
        <span className="toast__emoji" style={{ position: 'relative' }}>
          {current.emoji}
          <Burst />
        </span>
        <span style={{ textAlign: 'left' }}>
          <span className="tiny muted" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Новый значок
          </span>
          <br />
          <b>{isScenario ? `${current.title}: освоено!` : current.title}</b>
        </span>
      </button>
    </div>
  );
}
