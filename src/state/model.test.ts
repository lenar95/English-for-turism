import { describe, expect, it } from 'vitest';
import { DAY, dayKey } from '../lib/dates';
import { defaultData, migrate, reducer, streak, type AppData } from './model';

const NOW = new Date(2026, 5, 15, 12).getTime();

function withAnswer(data: AppData, phraseId: string, correct: boolean, now: number, kind: 'recognition' | 'recall' = 'recall') {
  return reducer(data, { type: 'answer', phraseId, correct, kind, mustSpeak: true, now });
}

describe('reducer', () => {
  it('ответ создаёт прогресс, отмечает день и пишет событие', () => {
    const d = withAnswer(defaultData(), 'basics-01', true, NOW);
    expect(d.progress['basics-01']?.memory).toMatchObject({ level: 1, reviews: 1, correct: 1, last: NOW });
    expect(d.activeDays).toEqual([dayKey(NOW)]);
    expect(d.answers).toEqual([{ t: NOW, phraseId: 'basics-01', ok: true }]);
  });

  it('несколько оценок одной фразы в пределах 20 секунд — одно событие', () => {
    let d = withAnswer(defaultData(), 'basics-01', true, NOW);
    d = reducer(d, { type: 'pronunciation', phraseId: 'basics-01', score: 40, now: NOW + 5000 });
    expect(d.answers).toEqual([{ t: NOW + 5000, phraseId: 'basics-01', ok: false }]);
    d = withAnswer(d, 'basics-01', true, NOW + 30000);
    expect(d.answers).toHaveLength(2);
    d = withAnswer(d, 'basics-02', true, NOW + 31000);
    expect(d.answers).toHaveLength(3);
  });

  it('история ограничена: 300 ответов, 100 проверок, 100 сессий, 60 дней', () => {
    let d = defaultData();
    for (let i = 0; i < 310; i++) d = withAnswer(d, `p-${i}`, true, NOW + i * 60000);
    expect(d.answers).toHaveLength(300);
    expect(d.answers[0].phraseId).toBe('p-10');
    for (let i = 0; i < 105; i++) {
      d = reducer(d, { type: 'exam', record: { at: NOW + i, scenarioId: null, total: i, memory: i, pronunciation: null, questions: 10 } });
      d = reducer(d, { type: 'session', log: { start: NOW, end: NOW + i, kind: 'practice', planned: 10, done: 10, correct: 5, exitedEarly: false } });
    }
    expect(d.exams).toHaveLength(100);
    expect(d.sessions).toHaveLength(100);
    for (let i = 1; i <= 70; i++) d = withAnswer(d, 'x', true, NOW + i * DAY);
    expect(d.activeDays).toHaveLength(60);
    expect(d.activeDays[59]).toBe(dayKey(NOW + 70 * DAY));
  });

  it('произношение хранит пять последних округлённых оценок', () => {
    let d = defaultData();
    for (const s of [10.4, 20, 30, 40, 50, 60.6]) d = reducer(d, { type: 'pronunciation', phraseId: 'p', score: s, now: NOW });
    expect(d.progress['p']?.pron).toEqual([20, 30, 40, 50, 61]);
  });

  it('настройки и поездка обновляются частично', () => {
    let d = reducer(defaultData(), { type: 'settings', settings: { accent: 'en-GB' } });
    expect(d.settings).toMatchObject({ accent: 'en-GB', showTranscription: true });
    d = reducer(d, { type: 'trip', trip: { cityId: 'istanbul' } });
    expect(d.trip).toMatchObject({ cityId: 'istanbul', scenarioIds: [] });
  });

  it('цель недели в пределах 1–7, значки не дублируются', () => {
    let d = reducer(defaultData(), { type: 'weeklyGoal', days: 12 });
    expect(d.weeklyGoal).toBe(7);
    d = reducer(d, { type: 'weeklyGoal', days: 0 });
    expect(d.weeklyGoal).toBe(1);
    d = reducer(d, { type: 'badges', ids: ['a', 'b'] });
    d = reducer(d, { type: 'badges', ids: ['b', 'c'] });
    expect(d.badges).toEqual(['a', 'b', 'c']);
  });

  it('сброс сохраняет настройки и id напоминаний, но стирает прогресс', () => {
    let d = withAnswer(defaultData(), 'p', true, NOW);
    d = reducer(d, { type: 'settings', settings: { accent: 'en-GB' } });
    d = reducer(d, { type: 'pushId', pushId: { id: 'i', token: 't' } });
    d = reducer(d, { type: 'onboarded' });
    const r = reducer(d, { type: 'reset' });
    expect(r.progress).toEqual({});
    expect(r.answers).toEqual([]);
    expect(r.activeDays).toEqual([]);
    expect(r.onboarded).toBe(true);
    expect(r.settings.accent).toBe('en-GB');
    expect(r.pushId).toEqual({ id: 'i', token: 't' });
  });
});

describe('streak', () => {
  it('считает дни подряд, включая сегодня или вчера', () => {
    const days = [dayKey(NOW - 2 * DAY), dayKey(NOW - DAY), dayKey(NOW)];
    expect(streak(days, NOW)).toBe(3);
    // Сегодня ещё не занимались — серия жива.
    expect(streak(days.slice(0, 2), NOW)).toBe(2);
    // Пропущен вчерашний день — серия оборвалась.
    expect(streak([dayKey(NOW - 2 * DAY)], NOW)).toBe(0);
    expect(streak([], NOW)).toBe(0);
  });
});

describe('migrate', () => {
  it('мусор и пустота дают данные по умолчанию', () => {
    expect(migrate(null)).toEqual(defaultData());
    expect(migrate('x')).toEqual(defaultData());
    expect(migrate(42)).toEqual(defaultData());
    expect(migrate({})).toEqual(defaultData());
  });

  it('недостающие поля заполняются, вложенные объекты сливаются', () => {
    const d = migrate({ version: 0, onboarded: true, trip: { destination: 'Рим' }, settings: { accent: 'en-GB' }, weeklyGoal: 5.4 });
    expect(d.version).toBe(1);
    expect(d.onboarded).toBe(true);
    expect(d.trip).toEqual({ destination: 'Рим', date: '', scenarioIds: [], cityId: '' });
    expect(d.settings).toEqual({ accent: 'en-GB', showTranscription: true, pronunciation: true, reminders: false, reminderTime: '19:00' });
    expect(d.weeklyGoal).toBe(5);
    expect(d.answers).toEqual([]);
    expect(d.pushId).toBeNull();
  });

  it('битые записи прогресса чинятся, а не роняют приложение', () => {
    const d = migrate({
      progress: {
        ok: { memory: { level: 3, last: 5, reviews: 4, correct: 3 }, pron: [80, 90] },
        noPron: { memory: { level: 2, last: 5, reviews: 2, correct: 2 } },
        badLevel: { memory: { level: 'x', last: -1, reviews: 1.5, correct: null }, pron: [50, 'a', 120, -3] },
        tooHigh: { memory: { level: 9, last: 1, reviews: 1, correct: 1 }, pron: [] },
        garbage: 'nope',
        empty: null,
      },
    });
    expect(d.progress.ok).toEqual({ memory: { level: 3, last: 5, reviews: 4, correct: 3 }, pron: [80, 90] });
    expect(d.progress.noPron).toEqual({ memory: { level: 2, last: 5, reviews: 2, correct: 2 }, pron: [] });
    expect(d.progress.badLevel).toEqual({ memory: { level: 0, last: 0, reviews: 1, correct: 0 }, pron: [50] });
    expect(d.progress.tooHigh.memory.level).toBe(5);
    expect(d.progress.garbage).toBeUndefined();
    expect(d.progress.empty).toBeUndefined();
  });

  it('битые элементы истории отбрасываются, неполные — дополняются', () => {
    const d = migrate({
      answers: [{ t: 1, phraseId: 'a', ok: true }, { t: 'x', phraseId: 'b', ok: true }, null, { t: 2, phraseId: 3, ok: false }],
      exams: [{ at: 1, scenarioId: null, total: 50, memory: 50, pronunciation: null, questions: 10 }, { at: 2, total: 70 }, { at: 'x' }, 'y'],
      sessions: [{ start: 1, end: 2, kind: 'practice', planned: 5, done: 5, correct: 5, exitedEarly: false }, { start: 1, end: 2, kind: 'weird' }, { start: 1 }],
      activeDays: ['2026-06-01', 'вчера', 5],
      badges: ['a', 1, null],
      trip: { destination: 7, date: 'скоро', scenarioIds: ['basics', 3], cityId: null },
      settings: { accent: 'fr-FR', reminderTime: '25', showTranscription: 'no' },
      pushId: { id: 'only-id' },
    });
    expect(d.answers).toEqual([{ t: 1, phraseId: 'a', ok: true }]);
    expect(d.exams).toEqual([
      { at: 1, scenarioId: null, total: 50, memory: 50, pronunciation: null, questions: 10 },
      { at: 2, scenarioId: null, total: 70, memory: 70, pronunciation: null, questions: 0 },
    ]);
    expect(d.sessions).toHaveLength(2);
    expect(d.sessions[1]).toMatchObject({ kind: 'practice', planned: 0, exitedEarly: false });
    expect(d.activeDays).toEqual(['2026-06-01']);
    expect(d.badges).toEqual(['a']);
    expect(d.trip).toEqual({ destination: '', date: '', scenarioIds: ['basics'], cityId: '' });
    expect(d.settings).toMatchObject({ accent: 'en-US', reminderTime: '19:00', showTranscription: true });
    expect(d.pushId).toBeNull();
  });

  it('не выбрасывает неизвестные поля будущих версий', () => {
    const d = migrate({ futureField: { a: 1 } }) as AppData & { futureField?: unknown };
    expect(d.futureField).toEqual({ a: 1 });
  });
});
