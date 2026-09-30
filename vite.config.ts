import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Короткий хеш коммита: виден в настройках и в журнале диагностики, чтобы понимать, какая сборка открыта. */
function buildId(): string {
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [
    react(),
    // Service worker собирается из src/sw.ts, список файлов для офлайн-кэша подставляется при сборке.
    // Регистрация (src/lib/push.ts) и манифест (public/manifest.webmanifest) — свои.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: null,
      manifest: false,
      disable: Boolean(process.env.VITEST),
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Картинка для соцсетей велика и офлайн не нужна; файл подтверждения Яндекса — тоже.
        globIgnores: ['og.png', 'yandex_*.html'],
      },
    }),
  ],
  // Относительные пути: одна и та же сборка работает на GitHub Pages, любом хостинге и внутри iOS-приложения.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD__: JSON.stringify(buildId()) },
  build: { target: 'es2020' },
  // Локально /api проксируется на сервис напоминаний (npm run server).
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: { environment: 'node' },
});
