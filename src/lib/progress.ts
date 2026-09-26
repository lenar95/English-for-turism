import { emptyMemory, type MemoryState } from './memory';

/** Сколько последних оценок произношения хранить по фразе. */
export const PRON_HISTORY = 5;

export interface PhraseProgress {
  memory: MemoryState;
  /** Последние оценки произношения 0–100, новые в конце. */
  pron: number[];
}

export const emptyPhraseProgress = (): PhraseProgress => ({ memory: emptyMemory(), pron: [] });

/** Текущая оценка произношения фразы: среднее трёх последних попыток. */
export function pronunciationOf(p: PhraseProgress | undefined): number | null {
  if (!p || !p.pron.length) return null;
  const recent = p.pron.slice(-3);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

export function pushPron(p: PhraseProgress, score: number): PhraseProgress {
  return { ...p, pron: [...p.pron, Math.round(score)].slice(-PRON_HISTORY) };
}
