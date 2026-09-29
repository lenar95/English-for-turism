import { DAY, dayKey } from '../lib/dates';
import { applyAnswer, MAX_LEVEL, stabilityDays, type AnswerKind, type MemoryState } from '../lib/memory';
import { emptyPhraseProgress, PRON_HISTORY, pushPron, type PhraseProgress } from '../lib/progress';
import { PRON_OK } from '../lib/thresholds';
import type { Accent } from '../lib/speech/tts';

export interface Settings {
  accent: Accent;
  /** Показывать произношение русскими буквами. */
  showTranscription: boolean;
  /** Учитывать произношение (нужен микрофон). Без него готовность считается только по памяти. */
  pronunciation: boolean;
  /** Напоминания включены. */
  reminders: boolean;
  /** Время напоминания HH:MM. */
  reminderTime: string;
}

export interface Trip {
  destination: string;
  /** Дата вылета, YYYY-MM-DD. */
  date: string;
  /** Выбранные ситуации. Пустой список = все. */
  scenarioIds: string[];
  /** Городской набор (например, istanbul). Пустая строка — без города. */
  cityId: string;
}

export interface ExamRecord {
  at: number;
  /** null — проверка по всей поездке. */
  scenarioId: string | null;
  total: number;
  memory: number;
  pronunciation: number | null;
  questions: number;
  /** Проверялось ли произношение. Без него итог считается только по памяти и с другими проверками не сравним. */
  withPronunciation: boolean;
}

/** Один ответ пользователя — для оценки точности и дневного прогресса. */
export interface AnswerEvent {
  t: number;
  phraseId: string;
  ok: boolean;
}

export type SessionKind = 'practice' | 'minimal' | 'warmup' | 'exam' | 'dialogue';

/** Одна сессия занятий — для оценки вовлечённости (досрочные выходы, длительность). */
export interface SessionLog {
  start: number;
  end: number;
  kind: SessionKind;
  planned: number;
  done: number;
  correct: number;
  exitedEarly: boolean;
}

/**
 * План на день, зафиксированный при первом расчёте. Цель не меняется до полуночи,
 * даже если состояние ученика изменилось: после «разминки на минуту» человек не должен
 * увидеть, что план вырос до 25 заданий.
 */
export interface TodayPlan {
  day: string;
  /** Отпечаток поездки: смена даты вылета или набора ситуаций пересчитывает план. */
  tripKey: string;
  goal: number;
  minimal: boolean;
  focusKey: boolean;
  message: string;
}

export interface AppData {
  version: 1;
  onboarded: boolean;
  progress: Record<string, PhraseProgress>;
  exams: ExamRecord[];
  trip: Trip;
  settings: Settings;
  /** Дни занятий (YYYY-MM-DD) — для серии дней подряд. */
  activeDays: string[];
  /** Полученные значки (id). Однажды полученный значок не отнимается. */
  badges: string[];
  /** Последние ответы (до 300). */
  answers: AnswerEvent[];
  /** Последние сессии (до 100). */
  sessions: SessionLog[];
  /** Сколько дней в неделю заниматься (цель недели). */
  weeklyGoal: number;
  /** Анонимный идентификатор для напоминаний (без личных данных). */
  pushId: { id: string; token: string } | null;
  todayPlan: TodayPlan | null;
}

export const defaultData = (): AppData => ({
  version: 1,
  onboarded: false,
  progress: {},
  exams: [],
  trip: { destination: '', date: '', scenarioIds: [], cityId: '' },
  settings: { accent: 'en-US', showTranscription: true, pronunciation: true, reminders: false, reminderTime: '19:00' },
  activeDays: [],
  badges: [],
  answers: [],
  sessions: [],
  weeklyGoal: 4,
  pushId: null,
  todayPlan: null,
});

/**
 * Добавить ответ. Несколько оценок одной фразы в пределах 20 секунд
 * (например, память и произношение одного задания) считаются одним ответом.
 */
function pushAnswer(list: AnswerEvent[], ev: AnswerEvent): AnswerEvent[] {
  const last = list[list.length - 1];
  if (last && last.phraseId === ev.phraseId && ev.t - last.t < 20000) {
    return [...list.slice(0, -1), { ...last, t: ev.t, ok: last.ok && ev.ok }];
  }
  return [...list, ev].slice(-300);
}

function markActive(data: AppData, now: number): string[] {
  const today = dayKey(now);
  if (data.activeDays.includes(today)) return data.activeDays;
  return [...data.activeDays, today].slice(-60);
}

export type Action =
  | { type: 'load'; data: AppData }
  | { type: 'answer'; phraseId: string; correct: boolean; kind: AnswerKind; mustSpeak: boolean; now: number }
  | { type: 'pronunciation'; phraseId: string; score: number; now: number }
  | { type: 'exam'; record: ExamRecord }
  | { type: 'trip'; trip: Partial<Trip> }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'onboarded' }
  | { type: 'badges'; ids: string[] }
  | { type: 'session'; log: SessionLog }
  | { type: 'weeklyGoal'; days: number }
  | { type: 'pushId'; pushId: { id: string; token: string } }
  | { type: 'todayPlan'; plan: TodayPlan }
  | { type: 'reset' };

export function reducer(data: AppData, action: Action): AppData {
  switch (action.type) {
    case 'load':
      return action.data;
    case 'answer': {
      const prev = data.progress[action.phraseId] ?? emptyPhraseProgress();
      const next: PhraseProgress = {
        ...prev,
        memory: applyAnswer(prev.memory, action.correct, action.kind, action.mustSpeak, action.now),
      };
      return {
        ...data,
        progress: { ...data.progress, [action.phraseId]: next },
        activeDays: markActive(data, action.now),
        answers: pushAnswer(data.answers, { t: action.now, phraseId: action.phraseId, ok: action.correct }),
      };
    }
    case 'pronunciation': {
      const prev = data.progress[action.phraseId] ?? emptyPhraseProgress();
      return {
        ...data,
        progress: { ...data.progress, [action.phraseId]: pushPron(prev, action.score) },
        activeDays: markActive(data, action.now),
        answers: pushAnswer(data.answers, { t: action.now, phraseId: action.phraseId, ok: action.score >= PRON_OK }),
      };
    }
    case 'exam':
      return { ...data, exams: [...data.exams, action.record].slice(-100) };
    case 'trip':
      return { ...data, trip: { ...data.trip, ...action.trip } };
    case 'settings':
      return { ...data, settings: { ...data.settings, ...action.settings } };
    case 'onboarded':
      return { ...data, onboarded: true };
    case 'session':
      return { ...data, sessions: [...data.sessions, action.log].slice(-100) };
    case 'pushId':
      return { ...data, pushId: action.pushId };
    case 'todayPlan':
      return { ...data, todayPlan: action.plan };
    case 'weeklyGoal':
      return { ...data, weeklyGoal: Math.max(1, Math.min(7, action.days)) };
    case 'badges':
      return { ...data, badges: [...data.badges, ...action.ids.filter((id) => !data.badges.includes(id))] };
    case 'reset':
      return { ...defaultData(), onboarded: true, settings: data.settings, pushId: data.pushId };
  }
}

/** Серия дней подряд с занятиями (включая сегодня или вчера). */
export function streak(activeDays: string[], now: number): number {
  const set = new Set(activeDays);
  let cursor = now;
  if (!set.has(dayKey(cursor))) cursor -= DAY;
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor -= DAY;
  }
  return n;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object';
/** Целое неотрицательное число или запасное значение. */
const count = (v: unknown, fallback = 0): number => (isNum(v) && v >= 0 ? Math.floor(v) : fallback);
const list = <T>(v: unknown, fix: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(fix).filter((x): x is T => x !== null) : [];
const fixStr = (x: unknown): string | null => (isStr(x) ? x : null);
const fixDay = (x: unknown): string | null => (isStr(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

function fixProgress(raw: unknown): PhraseProgress | null {
  if (!isObj(raw)) return null;
  const m = isObj(raw.memory) ? raw.memory : {};
  const level = Math.min(MAX_LEVEL, count(m.level));
  const last = count(m.last);
  const memory: MemoryState = {
    level,
    last,
    // Поле появилось позже: для старых записей срок повтора считаем от последнего ответа.
    due: count(m.due, last + stabilityDays(level) * DAY),
    reviews: count(m.reviews),
    correct: count(m.correct),
  };
  const pron = Array.isArray(raw.pron) ? raw.pron.filter((v): v is number => isNum(v) && v >= 0 && v <= 100) : [];
  return { memory, pron: pron.slice(-PRON_HISTORY) };
}

const SESSION_KINDS: SessionKind[] = ['practice', 'minimal', 'warmup', 'exam', 'dialogue'];

const fixAnswer = (x: unknown): AnswerEvent | null =>
  isObj(x) && isNum(x.t) && isStr(x.phraseId) ? { t: x.t, phraseId: x.phraseId, ok: x.ok === true } : null;

const fixExam = (x: unknown): ExamRecord | null =>
  isObj(x) && isNum(x.at) && isNum(x.total)
    ? {
        at: x.at,
        scenarioId: isStr(x.scenarioId) ? x.scenarioId : null,
        total: x.total,
        memory: isNum(x.memory) ? x.memory : x.total,
        pronunciation: isNum(x.pronunciation) ? x.pronunciation : null,
        questions: count(x.questions),
        withPronunciation: typeof x.withPronunciation === 'boolean' ? x.withPronunciation : isNum(x.pronunciation),
      }
    : null;

const fixPlan = (x: unknown): TodayPlan | null =>
  isObj(x) && fixDay(x.day) && isStr(x.tripKey) && isNum(x.goal) && isStr(x.message)
    ? { day: x.day as string, tripKey: x.tripKey, goal: count(x.goal, 1), minimal: x.minimal === true, focusKey: x.focusKey === true, message: x.message }
    : null;

const fixSession = (x: unknown): SessionLog | null =>
  isObj(x) && isNum(x.start) && isNum(x.end)
    ? {
        start: x.start,
        end: x.end,
        kind: SESSION_KINDS.includes(x.kind as SessionKind) ? (x.kind as SessionKind) : 'practice',
        planned: count(x.planned),
        done: count(x.done),
        correct: count(x.correct),
        exitedEarly: x.exitedEarly === true,
      }
    : null;

/**
 * Мягкая миграция: добавить поля, появившиеся в новых версиях, и починить битые записи,
 * чтобы повреждённое хранилище не роняло приложение и не обнуляло весь прогресс.
 * Неизвестные поля (из будущих версий) сохраняются как есть.
 */
export function migrate(raw: unknown): AppData {
  const base = defaultData();
  if (!isObj(raw)) return base;
  const trip = isObj(raw.trip) ? raw.trip : {};
  const settings = isObj(raw.settings) ? raw.settings : {};
  const progress: Record<string, PhraseProgress> = {};
  if (isObj(raw.progress)) {
    for (const [id, p] of Object.entries(raw.progress)) {
      const fixed = fixProgress(p);
      if (fixed) progress[id] = fixed;
    }
  }
  const pushId =
    isObj(raw.pushId) && isStr(raw.pushId.id) && isStr(raw.pushId.token) ? { id: raw.pushId.id, token: raw.pushId.token } : null;
  return {
    ...base,
    ...raw,
    version: 1,
    onboarded: raw.onboarded === true,
    progress,
    exams: list(raw.exams, fixExam).slice(-100),
    trip: {
      destination: fixStr(trip.destination) ?? '',
      date: fixDay(trip.date) ?? '',
      scenarioIds: list(trip.scenarioIds, fixStr),
      cityId: fixStr(trip.cityId) ?? '',
    },
    settings: {
      accent: settings.accent === 'en-GB' ? 'en-GB' : 'en-US',
      showTranscription: typeof settings.showTranscription === 'boolean' ? settings.showTranscription : base.settings.showTranscription,
      pronunciation: typeof settings.pronunciation === 'boolean' ? settings.pronunciation : base.settings.pronunciation,
      reminders: settings.reminders === true,
      reminderTime: isStr(settings.reminderTime) && /^\d{2}:\d{2}$/.test(settings.reminderTime) ? settings.reminderTime : base.settings.reminderTime,
    },
    activeDays: list(raw.activeDays, fixDay).slice(-60),
    badges: list(raw.badges, fixStr),
    answers: list(raw.answers, fixAnswer).slice(-300),
    sessions: list(raw.sessions, fixSession).slice(-100),
    weeklyGoal: isNum(raw.weeklyGoal) ? Math.max(1, Math.min(7, Math.round(raw.weeklyGoal))) : base.weeklyGoal,
    pushId,
    todayPlan: fixPlan(raw.todayPlan),
  };
}
