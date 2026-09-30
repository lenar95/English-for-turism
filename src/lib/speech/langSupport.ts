/**
 * Поддержка распознавания по языкам на этом устройстве.
 *
 * На некоторых iPhone распознаватель для языка (например, tr-TR) недоступен, но об этом
 * не сообщает: микрофон включается, а результата и окончания нет. Хуже того, после такой
 * попытки до перезагрузки страницы перестаёт работать и английское распознавание.
 * Поэтому по каждому языку считаем успехи и холостые попытки: если холостых уже две,
 * а успеха не было ни разу, язык считаем неподдерживаемым и больше не пробуем —
 * интерфейс переходит на самопроверку.
 */

export interface LangStats {
  ok: number;
  empty: number;
}

export type LangStatsMap = Record<string, LangStats>;

/** Сколько холостых попыток без единого успеха выдаёт вердикт «не поддерживается». */
export const UNSUPPORTED_AFTER = 2;

export function isSupported(stats: LangStats | undefined): boolean {
  if (!stats) return true;
  return !(stats.ok === 0 && stats.empty >= UNSUPPORTED_AFTER);
}

export function note(map: LangStatsMap, lang: string, ok: boolean): LangStatsMap {
  const prev = map[lang] ?? { ok: 0, empty: 0 };
  return { ...map, [lang]: ok ? { ok: prev.ok + 1, empty: 0 } : { ok: prev.ok, empty: prev.empty + 1 } };
}

const KEY = 'eft:speech-langs';
let cache: LangStatsMap | null = null;
const listeners = new Set<() => void>();

function load(): LangStatsMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as LangStatsMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function langSupported(lang: string): boolean {
  return isSupported(load()[lang]);
}

/** Записать исход попытки; возвращает true, если язык только что стал неподдерживаемым. */
export function noteLang(lang: string, ok: boolean): boolean {
  const before = langSupported(lang);
  cache = note(load(), lang, ok);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  const after = langSupported(lang);
  if (before !== after) listeners.forEach((l) => l());
  return before && !after;
}

export function subscribeLangSupport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
