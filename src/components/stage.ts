import type { CSSProperties } from 'react';
import type { Stage } from '../data/types';

/** CSS-переменная --stage с цветом этапа поездки. */
export const stageStyle = (stage: Stage | 'destination'): CSSProperties =>
  ({ '--stage': stage === 'destination' ? 'var(--accent)' : `var(--stage-${stage})` }) as CSSProperties;
