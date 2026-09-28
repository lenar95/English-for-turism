import { Capacitor } from '@capacitor/core';

/**
 * Push-напоминания в веб-версии.
 * На iPhone работают только если сайт добавлен на экран «Домой» (iOS 16.4+) и открыт оттуда.
 */

export type PushSupport = 'ok' | 'ios-install' | 'unsupported' | 'native';

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function pushSupport(): PushSupport {
  if (Capacitor.isNativePlatform()) return 'native';
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-install';
  return has ? 'ok' : 'unsupported';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || Capacitor.isNativePlatform()) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js');
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface PushIdentity {
  id: string;
  token: string;
}

export function newIdentity(): PushIdentity {
  const rnd = () => crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
  return { id: rnd(), token: rnd() + rnd() };
}

export interface PushSnapshot {
  lastActiveDay: string | null;
  doneToday: number;
  goal: number;
  tripDate: string;
  minimal: boolean;
}

async function api(path: string, body: unknown): Promise<Response> {
  return fetch(`./api/push/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Запросить разрешение и подписаться. Вызывать только из обработчика нажатия (требование iOS). */
export type EnableResult = { status: 'ok' } | { status: 'denied' } | { status: 'error'; detail: string };

/** Текст ответа сервера (для диагностики). */
async function describe(res: Response): Promise<string> {
  const text = (await res.text().catch(() => '')).slice(0, 120);
  return `HTTP ${res.status}${text && !text.startsWith('<') ? `: ${text}` : text.startsWith('<') ? ' (вернулась страница вместо ответа сервиса)' : ''}`;
}

export async function enablePush(identity: PushIdentity, time: string, snapshot: PushSnapshot): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  let keyRes: Response;
  try {
    keyRes = await fetch('./api/push/key', { cache: 'no-store' });
  } catch (e) {
    return { status: 'error', detail: `ключ: сеть (${e instanceof Error ? e.message : String(e)})` };
  }
  const type = keyRes.headers.get('content-type') ?? '';
  if (!keyRes.ok || !type.includes('json')) return { status: 'error', detail: `ключ: ${await describe(keyRes)}` };
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  let sub: PushSubscription | null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    }
  } catch (e) {
    return { status: 'error', detail: `подписка браузера: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}` };
  }
  const res = await api('subscribe', { ...identity, subscription: sub.toJSON(), time, tz: timeZone(), snapshot });
  return res.ok ? { status: 'ok' } : { status: 'error', detail: `сохранение: ${await describe(res)}` };
}

export async function disablePush(identity: PushIdentity): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    /* ignore */
  }
  await api('unsubscribe', identity).catch(() => undefined);
}

/** Сообщить серверу, как дела, чтобы он не напоминал, если сегодня уже занимались. */
export async function sendStatus(identity: PushIdentity, time: string, snapshot: PushSnapshot): Promise<boolean> {
  try {
    const res = await api('status', { ...identity, time, tz: timeZone(), snapshot });
    return res.ok;
  } catch {
    return false;
  }
}

export async function testPush(identity: PushIdentity): Promise<boolean> {
  try {
    return (await api('test', identity)).ok;
  } catch {
    return false;
  }
}
