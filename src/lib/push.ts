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
export async function enablePush(identity: PushIdentity, time: string, snapshot: PushSnapshot): Promise<'ok' | 'denied' | 'error'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const keyRes = await fetch('./api/push/key');
  if (!keyRes.ok) return 'error';
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  const res = await api('subscribe', { ...identity, subscription: sub.toJSON(), time, tz: timeZone(), snapshot });
  return res.ok ? 'ok' : 'error';
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
