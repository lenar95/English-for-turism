/* Service worker «Английский в поездку»: только push-напоминания, без кэширования страниц. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Английский в поездку', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Английский в поездку';
  event.waitUntil(
    self.registration.showNotification(title, {
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
  const target = new URL(event.notification.data?.url || '/#/', self.location.origin).href;
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
