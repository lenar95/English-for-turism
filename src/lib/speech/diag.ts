/**
 * Журнал событий распознавания речи — чтобы разобраться, что делает браузер
 * на конкретном телефоне (Safari на iPhone ведёт себя непредсказуемо).
 * Хранится только в памяти вкладки и показывается в «Настройках».
 */
export interface DiagEntry {
  t: number;
  msg: string;
}

const MAX = 80;
const entries: DiagEntry[] = [];
const listeners = new Set<() => void>();
const started = Date.now();

export function diag(msg: string): void {
  entries.push({ t: Date.now(), msg });
  if (entries.length > MAX) entries.shift();
  listeners.forEach((l) => l());
}

export function diagEntries(): DiagEntry[] {
  return entries;
}

export function diagSubscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function diagClear(): void {
  entries.length = 0;
  listeners.forEach((l) => l());
}

export function diagText(): string {
  const head = `UA: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`;
  return [head, ...entries.map((e) => `${((e.t - started) / 1000).toFixed(2).padStart(7)}s  ${e.msg}`)].join('\n');
}
