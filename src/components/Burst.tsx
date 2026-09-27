import type { CSSProperties } from 'react';

const COLORS = ['var(--accent)', 'var(--good)', 'var(--primary)', 'var(--stage-departure)', 'var(--stage-hotel)'];

/** Короткий праздничный «взрыв» конфетти вокруг центра родителя. */
export function Burst({ count = 14 }: { count?: number }) {
  return (
    <span className="burst" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i + (i % 2 ? 8 : -8);
        const dist = 46 + (i % 3) * 16;
        return (
          <span
            key={i}
            style={
              {
                '--a': `${angle}deg`,
                '--d': `${dist}px`,
                background: COLORS[i % COLORS.length],
                animationDelay: `${(i % 4) * 25}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </span>
  );
}
