import { Preferences } from '@capacitor/preferences';
import { defaultData, migrate, type AppData } from './model';

const KEY = 'english-for-tourism:v1';

export async function loadData(): Promise<AppData> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return value ? migrate(JSON.parse(value)) : defaultData();
  } catch {
    return defaultData();
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;

/** Сохранение с небольшой задержкой, чтобы не писать на диск на каждый клик. */
export function saveData(data: AppData): void {
  clearTimeout(pending);
  pending = setTimeout(() => {
    void Preferences.set({ key: KEY, value: JSON.stringify(data) }).catch(() => undefined);
  }, 300);
}
