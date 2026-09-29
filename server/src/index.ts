/**
 * Сервис напоминаний «Английский в поездку».
 *
 * Хранит push-подписки браузеров (без личных данных: только анонимный id,
 * подписку и цифры для текста напоминания) и раз в минуту решает, кому пора напомнить.
 * Работает за Caddy: запросы /api/* проксируются на 127.0.0.1:PORT.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import webpush from 'web-push';
import { decide, isAllowedEndpoint, localNow, type Message, type Snapshot, type Subscriber } from './schedule';
import { Store } from './store';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.DATA_DIR ?? './data';
const SUBJECT = process.env.VAPID_SUBJECT ?? 'https://engtrip.ru';
const MAX_SUBSCRIBERS = 50000;
/** Через сколько повторять отправку после временного сбоя (5xx, сеть). */
const RETRY_MS = 10 * 60_000;

const store = new Store(DATA_DIR);

type Vapid = { publicKey: string; privateKey: string };
let vapid = store.readJson<Vapid>('vapid.json');
if (!vapid) {
  vapid = webpush.generateVAPIDKeys();
  store.writeJson('vapid.json', vapid);
  console.log('Созданы новые VAPID-ключи');
}
webpush.setVapidDetails(SUBJECT, vapid.publicKey, vapid.privateKey);

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

function tokenOk(sub: Subscriber, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const a = Buffer.from(hash(token));
  const b = Buffer.from(sub.tokenHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function parseSnapshot(v: unknown): Snapshot {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const day = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1000, Math.round(x))) : 0);
  return {
    lastActiveDay: day(o.lastActiveDay),
    doneToday: num(o.doneToday),
    goal: num(o.goal),
    tripDate: day(o.tripDate) ?? '',
    minimal: o.minimal === true,
  };
}

function validTz(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try {
    Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

const validTime = (t: unknown) => (typeof t === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? t : '19:00');

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 16 * 1024) throw new Error('too large');
    chunks.push(c as Buffer);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (!parsed || typeof parsed !== 'object') throw new Error('bad json');
  return parsed as Record<string, unknown>;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** sent — доставлено push-сервису; gone — подписка удалена; retry — временный сбой; failed — сегодня не выйдет. */
type PushResult = 'sent' | 'gone' | 'retry' | 'failed';

async function push(sub: Subscriber, msg: Message): Promise<PushResult> {
  try {
    await webpush.sendNotification(sub.subscription, JSON.stringify(msg), { TTL: 6 * 3600, urgency: 'normal' });
    return 'sent';
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      // Подписка больше не действует (удалили приложение, отозвали разрешение).
      store.delete(sub.id);
      console.log(`подписка ${sub.id.slice(0, 8)} удалена (${code})`);
      return 'gone';
    }
    console.warn(`ошибка отправки ${sub.id.slice(0, 8)}: ${code ?? String(err)}`);
    // Сеть, 5xx и 429 — временные: попробуем позже в том же окне. Остальное — ошибка подписки.
    return code === undefined || code >= 500 || code === 429 ? 'retry' : 'failed';
  }
}

const server = createServer(async (req, res) => {
  const url = (req.url ?? '').split('?')[0];
  try {
    if (req.method === 'GET' && url === '/api/health') return send(res, 200, { ok: true, subscribers: store.size });
    if (req.method === 'GET' && url === '/api/push/key') return send(res, 200, { publicKey: vapid!.publicKey });
    if (req.method !== 'POST') return send(res, 404, { error: 'not found' });

    const body = await readBody(req);
    const id = str(body.id, 64);
    const token = str(body.token, 128);
    if (!id || !token) return send(res, 400, { error: 'id и token обязательны' });
    const existing = store.get(id);
    if (existing && !tokenOk(existing, token)) return send(res, 403, { error: 'forbidden' });

    if (url === '/api/push/subscribe') {
      const subscription = body.subscription as Subscriber['subscription'] | undefined;
      if (
        !subscription ||
        !isAllowedEndpoint(subscription.endpoint) ||
        !str(subscription.keys?.p256dh, 256) ||
        !str(subscription.keys?.auth, 64)
      ) {
        return send(res, 400, { error: 'неверная подписка' });
      }
      if (!existing && store.size >= MAX_SUBSCRIBERS) return send(res, 503, { error: 'limit' });
      const now = Date.now();
      store.set({
        id,
        tokenHash: existing?.tokenHash ?? hash(token),
        subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
        time: validTime(body.time),
        tz: validTz(body.tz),
        snapshot: parseSnapshot(body.snapshot),
        lastSentDay: existing?.lastSentDay,
        variant: existing?.variant ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return send(res, 200, { ok: true });
    }

    if (!existing) return send(res, 404, { error: 'не подписан' });

    if (url === '/api/push/status') {
      existing.snapshot = parseSnapshot(body.snapshot);
      if (body.time !== undefined) existing.time = validTime(body.time);
      if (body.tz !== undefined) existing.tz = validTz(body.tz);
      existing.updatedAt = Date.now();
      store.set(existing);
      return send(res, 200, { ok: true });
    }
    if (url === '/api/push/unsubscribe') {
      store.delete(id);
      return send(res, 200, { ok: true });
    }
    if (url === '/api/push/test') {
      const ok =
        (await push(existing, {
          type: 'test',
          title: 'Напоминания работают ✓',
          body: `Будем напоминать в ${existing.time}, если в этот день вы ещё не занимались.`,
          url: '/#/',
        })) === 'sent';
      return send(res, ok ? 200 : 502, { ok });
    }
    return send(res, 404, { error: 'not found' });
  } catch (err) {
    // Подробности — в журнал, клиенту — общий ответ без внутренних сообщений.
    console.warn(`плохой запрос ${req.method} ${url}: ${(err as Error).message ?? String(err)}`);
    return send(res, 400, { error: 'bad request' });
  }
});

/** Раз в минуту проверяем, кому пора напомнить. День отмечаем отправленным только после отправки. */
async function tick() {
  const now = Date.now();
  for (const sub of store.all()) {
    const msg = decide(sub, now);
    if (!msg) continue;
    const result = await push(sub, msg);
    if (result === 'gone') continue;
    if (result === 'retry') {
      sub.retryAt = now + RETRY_MS;
      store.set(sub);
      continue;
    }
    sub.lastSentDay = localNow(now, sub.tz).date;
    sub.variant = (sub.variant + 1) % 1000;
    sub.retryAt = undefined;
    store.set(sub);
    if (result === 'sent') console.log(`напоминание «${msg.type}» → ${sub.id.slice(0, 8)}`);
  }
}

setInterval(() => void tick().catch((e) => console.error('tick', e)), 60_000);
server.listen(PORT, '127.0.0.1', () => console.log(`Сервис напоминаний: 127.0.0.1:${PORT}, подписчиков: ${store.size}`));

// systemd останавливает службу сигналом: дописываем отложенные изменения, иначе они пропадут.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close();
    store.flush();
    process.exit(0);
  });
}
