import type { ReactNode } from 'react';

/** Цвет прогресса: янтарный — в процессе, зелёный — готово. Красный оставляем для ошибок. */
export function toneOf(value: number): 'mid' | 'good' {
  return value >= 60 ? 'good' : 'mid';
}

const toneColor = (v: number) => (v === 0 ? 'var(--neutral)' : `var(--${toneOf(v)})`);

export function Ring({ value, size = 120, stroke = 12, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label ?? 'Готовность'}: ${v}%`}>
      <svg width={size} height={size}>
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__value"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={toneColor(v)}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
        />
      </svg>
      <div className="ring__label" aria-hidden>
        <span className="ring__num" style={{ fontSize: size * 0.28 }}>{v}%</span>
        {size >= 100 && <span className="ring__unit">{label ?? 'готовность'}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, color }: { value: number; color?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="bar" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar__fill" style={{ width: `${v}%`, background: color ?? toneColor(v) }} />
    </div>
  );
}

export function Metric({ icon, label, value, disabled }: { icon?: ReactNode; label: string; value: number; disabled?: string }) {
  return (
    <div className="metric">
      <span className="metric__label">{icon}{label}</span>
      <span className="metric__value">{disabled ? '—' : `${value}%`}</span>
      {disabled ? <span className="tiny muted" style={{ gridColumn: '1 / -1' }}>{disabled}</span> : <Bar value={value} />}
    </div>
  );
}
