/// <reference lib="webworker" />
/**
 * Service worker «Английский в поездку».
 *
 * 1. Офлайн. Оболочка приложения, шрифты и иконки кладутся в кэш при установке
 *    (список файлов подставляет vite-plugin-pwa при сборке), поэтому разговорник,
 *    «Показать собеседнику» и озвучка на локальных голосах работают без интернета.
 *    Статические страницы разговорника и сервис напоминаний (/api) всегда идут в сеть.
 * 2. Push-напоминания и переход по нажатию на уведомление.
 *
 * Новая версия скачивается заранее, но включается только по просьбе страницы
 * (сообщение SKIP_WAITING): так открытая тренировка не остаётся без своих файлов.
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & typeof globalThis & { __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
clientsClaim();

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/\/api\//, /\/phrases\//, /\/city\//, /\/sitemap\.xml$/, /\/robots\.txt$/],
  }),
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {};
  try {
    data = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    data = { title: 'Английский в поездку', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Английский в поездку', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'daily-reminder',
      data: { url: data.url || '/#/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/#/';
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          await c.focus();
          if ('navigate' in c) await c.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
