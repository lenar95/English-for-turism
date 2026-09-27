/**
 * Когда и что напоминать. Это «сигнал к действию» в модели поведения:
 * напоминание должно помогать, а не раздражать, поэтому правила такие:
 * - если сегодня уже занимались — не напоминаем;
 * - одно напоминание в день, в выбранное время (окно 3 часа, если сервер был недоступен);
 * - после перерыва 3+ дней — через день, после 14 дней тишины — перестаём (кроме последних дней перед вылетом);
 * - текст зависит от ситуации и чередуется, чтобы не приедался.
 */

export interface Snapshot {
  /** Последний день занятий по местному времени, YYYY-MM-DD. */
  lastActiveDay: string | null;
  doneToday: number;
  goal: number;
  /** Дата вылета YYYY-MM-DD или пустая строка. */
  tripDate: string;
  /** План сжат до минимального шага. */
  minimal: boolean;
}

export interface Subscriber {
  id: string;
  tokenHash: string;
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  /** Время напоминания HH:MM по местному времени. */
  time: string;
  tz: string;
  snapshot: Snapshot;
  lastSentDay?: string;
  variant: number;
  createdAt: number;
  updatedAt: number;
}

export type MessageType = 'daily' | 'minimal' | 'returning' | 'tomorrow' | 'today' | 'trip' | 'test';

export interface Message {
  type: MessageType;
  title: string;
  body: string;
  url: string;
}

const DAY = 86400000;

/** Местные дата и минуты от начала суток в часовом поясе пользователя. */
export function localNow(now: number, tz: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(now));
  } catch {
    return localNow(now, 'UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Разница в днях между двумя датами YYYY-MM-DD (a − b). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
}

function parseTime(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return 19 * 60;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

const TEXTS: Record<Exclude<MessageType, 'test'>, { title: string; body: string }[]> = {
  daily: [
    { title: 'Пять минут английского? ✈️', body: 'В плане на сегодня {goal} заданий. До вылета {days}.' },
    { title: 'Время для фраз в дорогу', body: 'Короткая тренировка сейчас — и сегодняшний день засчитан.' },
    { title: 'Память любит повторение', body: 'Несколько минут сегодня — и выученное не забудется к поездке.' },
  ],
  minimal: [
    { title: 'Всего одна минута', body: '5 заданий — и день засчитан. Маленький шаг лучше, чем никакого.' },
    { title: 'Одна минута для поездки', body: 'Не нужно много: пять лёгких заданий, и всё.' },
  ],
  returning: [
    { title: 'Вы помните больше, чем кажется', body: 'Разминка на минуту по знакомым фразам — без штрафов за перерыв.' },
    { title: 'Продолжим с того, что вы знаете', body: 'Одна минута — и вы снова в ритме.' },
  ],
  tomorrow: [{ title: 'Завтра вылет! ✈️', body: 'Повторите ключевые фразы ★ — пять минут, и вы готовы.' }],
  today: [{ title: 'Сегодня вылет — удачной поездки!', body: 'Пролистайте ключевые фразы перед выходом: паспортный контроль и такси.' }],
  trip: [{ title: 'Как поездка?', body: 'Перед выходом откройте разговорник — нужная фраза найдётся за секунды.' }],
};

const URLS: Record<Exclude<MessageType, 'test'>, string> = {
  daily: '/#/practice/trip',
  minimal: '/#/practice/trip?m=minimal',
  returning: '/#/practice/trip?m=warmup',
  tomorrow: '/#/practice/trip',
  today: '/#/phrasebook',
  trip: '/#/phrasebook',
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Решить, отправлять ли напоминание сейчас. null — не отправлять. */
export function decide(sub: Subscriber, now: number): Message | null {
  const { date, minutes } = localNow(now, sub.tz);
  const at = parseTime(sub.time);
  if (minutes < at || minutes > at + 180) return null;
  if (sub.lastSentDay === date) return null;

  const s = sub.snapshot;
  if (s.lastActiveDay === date) return null; // сегодня уже занимались — не надоедаем

  const daysSinceLast = s.lastActiveDay ? dayDiff(date, s.lastActiveDay) : 0;
  const daysToTrip = s.tripDate && /^\d{4}-\d{2}-\d{2}$/.test(s.tripDate) ? dayDiff(s.tripDate, date) : null;
  const tripSoon = daysToTrip !== null && daysToTrip >= 0 && daysToTrip <= 3;

  if (daysToTrip !== null && daysToTrip < -14) return null; // поездка давно закончилась
  if (daysSinceLast >= 14 && !tripSoon) return null; // человек не вернулся — не спамим
  if (daysSinceLast >= 3 && !tripSoon && sub.lastSentDay && dayDiff(date, sub.lastSentDay) < 2) return null;

  let type: Exclude<MessageType, 'test'>;
  if (daysToTrip === 1) type = 'tomorrow';
  else if (daysToTrip === 0) type = 'today';
  else if (daysToTrip !== null && daysToTrip < 0) type = 'trip';
  else if (daysSinceLast >= 3) type = 'returning';
  else if (s.minimal) type = 'minimal';
  else type = 'daily';

  const variants = TEXTS[type];
  const t = variants[sub.variant % variants.length];
  const days =
    daysToTrip !== null && daysToTrip > 0 ? `${daysToTrip} ${plural(daysToTrip, 'день', 'дня', 'дней')}` : 'совсем немного';
  const body = t.body.replace('{goal}', String(Math.max(5, s.goal))).replace('{days}', days);
  return { type, title: t.title, body, url: URLS[type] };
}

/** Разрешённые push-сервисы — сервер не отправляет запросы на произвольные адреса. */
const PUSH_HOSTS = [
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && endpoint.length < 1024 && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
