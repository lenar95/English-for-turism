import { describe, expect, it } from 'vitest';
import { decide, isAllowedEndpoint, localNow, type Subscriber } from './schedule';

// 1 октября 2026, 19:05 по Москве (UTC+3) = 16:05 UTC.
const NOW = Date.UTC(2026, 9, 1, 16, 5);

const sub = (over: Partial<Subscriber> = {}, snap: Partial<Subscriber['snapshot']> = {}): Subscriber => ({
  id: 'a',
  tokenHash: 'x',
  subscription: { endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'p', auth: 'a' } },
  time: '19:00',
  tz: 'Europe/Moscow',
  snapshot: { lastActiveDay: '2026-09-30', doneToday: 0, goal: 12, tripDate: '2026-10-10', minimal: false, ...snap },
  variant: 0,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

describe('расписание напоминаний', () => {
  it('учитывает часовой пояс', () => {
    expect(localNow(NOW, 'Europe/Moscow')).toEqual({ date: '2026-10-01', minutes: 19 * 60 + 5 });
    expect(localNow(NOW, 'Asia/Novosibirsk').minutes).toBe(23 * 60 + 5);
  });

  it('напоминает в выбранное время с дневным планом и отсчётом до вылета', () => {
    const m = decide(sub(), NOW)!;
    expect(m.type).toBe('daily');
    expect(m.url).toBe('/#/practice/trip');
  });

  it('не напоминает раньше времени и позже окна в 3 часа', () => {
    expect(decide(sub({ time: '20:00' }), NOW)).toBeNull();
    expect(decide(sub({ time: '15:00' }), NOW)).toBeNull();
  });

  it('не напоминает, если сегодня уже занимались или уже напоминали', () => {
    expect(decide(sub({}, { lastActiveDay: '2026-10-01' }), NOW)).toBeNull();
    expect(decide(sub({ lastSentDay: '2026-10-01' }), NOW)).toBeNull();
  });

  it('минимальный шаг и возвращение после перерыва', () => {
    expect(decide(sub({}, { minimal: true }), NOW)!.type).toBe('minimal');
    const r = decide(sub({}, { lastActiveDay: '2026-09-26' }), NOW)!;
    expect(r.type).toBe('returning');
    expect(r.url).toContain('m=warmup');
  });

  it('после перерыва напоминает через день, после 14 дней — перестаёт', () => {
    expect(decide(sub({ lastSentDay: '2026-09-30' }, { lastActiveDay: '2026-09-26' }), NOW)).toBeNull();
    expect(decide(sub({ lastSentDay: '2026-09-29' }, { lastActiveDay: '2026-09-26' }), NOW)).not.toBeNull();
    expect(decide(sub({}, { lastActiveDay: '2026-09-10' }), NOW)).toBeNull();
  });

  it('после временного сбоя отправки ждёт назначенного момента', () => {
    expect(decide(sub({ retryAt: NOW + 60_000 }), NOW)).toBeNull();
    expect(decide(sub({ retryAt: NOW - 1 }), NOW)).not.toBeNull();
  });

  it('перед вылетом напоминает даже после долгого перерыва', () => {
    expect(decide(sub({}, { lastActiveDay: '2026-09-10', tripDate: '2026-10-02' }), NOW)!.type).toBe('tomorrow');
  });

  it('разрешает только настоящие push-сервисы', () => {
    expect(isAllowedEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedEndpoint('https://evil.example.com/')).toBe(false);
    expect(isAllowedEndpoint('http://web.push.apple.com/abc')).toBe(false);
  });
});
