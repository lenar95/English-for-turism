import { useEffect } from 'react';
import { useActions, useAppData } from '../state/AppContext';
import { Burst } from './Burst';

/** Уведомление о новом значке. Показывается по одному, исчезает само через 4 секунды. */
export function Toasts() {
  const { toasts } = useAppData();
  const { dismissToast } = useActions();
  const current = toasts[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => dismissToast(current.id), 4000);
    return () => clearTimeout(t);
  }, [current, dismissToast]);
  if (!current) return null;
  const isScenario = current.id.startsWith('scenario:');
  const isCan = current.kind === 'can';
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <button type="button" className="toast" key={current.id} onClick={() => dismissToast(current.id)}>
        <span className="toast__emoji" style={{ position: 'relative' }}>
          {current.emoji}
          <Burst />
        </span>
        <span style={{ textAlign: 'left' }}>
          <span className="tiny muted" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {isCan ? 'Теперь вы можете' : 'Новый значок'}
          </span>
          <br />
          <b>{isCan ? current.title : isScenario ? `${current.title}: освоено!` : current.title}</b>
        </span>
      </button>
    </div>
  );
}
