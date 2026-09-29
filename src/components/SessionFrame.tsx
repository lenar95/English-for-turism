import type { ReactNode } from 'react';
import { IconClose } from './Icons';

interface Props {
  /** Модификатор фона «арены»: этап поездки или city. */
  arena: string;
  index: number;
  planned: number;
  /** Слово для подписи прогресса: «Задание» или «Фраза». */
  unit?: string;
  onExit: () => void;
  footer: ReactNode;
  children: ReactNode;
}

/**
 * Рамка любой сессии: яркий фон в цвете этапа (энергичный фон нужен в момент действия,
 * экраны статистики остаются спокойными), кнопка выхода, точки прогресса и липкий футер.
 */
export function SessionFrame({ arena, index, planned, unit = 'Задание', onExit, footer, children }: Props) {
  return (
    <div className={`arena arena--${arena}`}>
      <div className="page page--bare" style={{ minHeight: '100dvh' }}>
        <div className="row">
          <button type="button" className="icon-btn icon-btn--plain" onClick={onExit} aria-label="Выйти">
            <IconClose />
          </button>
          <div className="progress-dots grow" aria-label={`${unit} ${index + 1} из ${planned}`}>
            {Array.from({ length: planned }, (_, i) => (
              <span key={i} className={i < index ? 'done' : i === index ? 'current' : ''} />
            ))}
          </div>
          <span className="small muted" style={{ minWidth: 44, textAlign: 'right' }}>
            {index + 1}/{planned}
          </span>
        </div>
        {children}
        <div className="sticky-footer">{footer}</div>
      </div>
    </div>
  );
}
