import { Preferences } from '@capacitor/preferences';
import { defaultData, migrate, type AppData } from './model';

const KEY = 'english-for-tourism:v1';
const SAVE_DELAY = 300;

export async function loadData(): Promise<AppData> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value ? migrate(JSON.parse(value)) : defaultData();
  } catch {
    return defaultData();
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;
let latest: AppData | null = null;

/** Сохранение с небольшой задержкой, чтобы не писать на диск на каждый клик. */
export function saveData(data: AppData): void {
  latest = data;
  clearTimeout(pending);
  pending = setTimeout(flushSave, SAVE_DELAY);
}

/** Записать немедленно: при закрытии вкладки или уходе приложения в фон отложенная запись не успела бы. */
export function flushSave(): void {
  clearTimeout(pending);
  pending = undefined;
  if (!latest) return;
  const data = latest;
  latest = null;
  void Preferences.set({ key: KEY, value: JSON.stringify(data) }).catch(() => undefined);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave();
  });
  window.addEventListener('pagehide', flushSave);
}
