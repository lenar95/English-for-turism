/**
 * Дни по местному времени устройства.
 * Всё, что считает «сегодня», «вчера» и «дней до вылета», берёт функции отсюда,
 * чтобы границы суток совпадали во всём приложении.
 */

export const DAY = 86400000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Ключ дня YYYY-MM-DD по местному времени. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Местная полночь суток, в которые попадает момент ts. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Местная полночь дня YYYY-MM-DD; NaN, если строка не дата. */
export function parseDay(key: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NaN;
  return new Date(`${key}T00:00:00`).getTime();
}

/** Сколько дней от сегодняшнего дня до даты YYYY-MM-DD (отрицательно — уже прошла); null, если даты нет. */
export function daysUntil(key: string, now: number): number | null {
  const target = parseDay(key);
  if (Number.isNaN(target)) return null;
  return Math.round((target - dayStart(now)) / DAY);
}
