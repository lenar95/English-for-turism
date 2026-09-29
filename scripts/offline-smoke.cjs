/**
 * Дымовая проверка офлайн-режима на собранном dist/:
 * поднимает vite preview, даёт service worker'у заполнить кэш, отключает сеть
 * и открывает главную, разговорник и страницу ситуации.
 *
 *   npm run build && npm run test:offline
 *
 * Браузер: CHROME_PATH (путь к Chromium) или установленный Google Chrome.
 */
const { spawn } = require('node:child_process');
const { chromium } = require('playwright-core');

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  try {
    const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });

      let opened = false;
      for (let i = 0; i < 40 && !opened; i++) {
        try {
          await page.goto(`${BASE}/`, { waitUntil: 'load' });
          opened = true;
        } catch {
          await sleep(500);
        }
      }
      if (!opened) throw new Error('vite preview не поднялся');

      // Пропускаем онбординг, как сделал бы вернувшийся пользователь.
      await page.evaluate(() =>
        localStorage.setItem('CapacitorStorage.english-for-tourism:v1', JSON.stringify({ version: 1, onboarded: true })),
      );
      await page.evaluate(() => navigator.serviceWorker.ready);
      await sleep(2000); // прекэш заканчивается после activate
      const cached = await page.evaluate(async () => {
        const keys = await caches.keys();
        const cache = await caches.open(keys.find((k) => k.includes('precache')) ?? keys[0]);
        return (await cache.keys()).length;
      });
      if (cached < 10) throw new Error(`в кэше только ${cached} файлов`);
      console.log(`в кэше ${cached} файлов`);

      await context.setOffline(true);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('text=Английский в поездку', { timeout: 10000 });
      console.log('офлайн: главная открылась');
      await page.goto(`${BASE}/#/phrasebook`, { waitUntil: 'load' });
      await page.waitForSelector('text=Hello!', { timeout: 10000 });
      console.log(`офлайн: разговорник открылся, карточек: ${await page.locator('article.phrase').count()}`);
      await page.goto(`${BASE}/#/scenario/hotel-checkin`, { waitUntil: 'load' });
      await page.waitForSelector('text=Заселение', { timeout: 10000 });
      console.log('офлайн: страница ситуации открылась');

      const unexpected = errors.filter((e) => !/api\/health|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
      if (unexpected.length) throw new Error(`ошибки в консоли:\n${unexpected.join('\n')}`);
      console.log('ошибок в консоли нет');
    } finally {
      await browser.close();
    }
  } finally {
    preview.kill();
  }
}

main().catch((e) => {
  console.error('Офлайн-проверка не прошла:', e.message ?? e);
  process.exit(1);
});
