import { applyAnswer, type AnswerKind } from '../lib/memory';
import { emptyPhraseProgress, pushPron, type PhraseProgress } from '../lib/progress';
import type { Accent } from '../lib/speech/tts';

export interface Settings {
  accent: Accent;
  /** Показывать произношение русскими буквами. */
  showTranscription: boolean;
  /** Учитывать произношение (нужен микрофон). Без него готовность считается только по памяти. */
  pronunciation: boolean;
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
}

export const defaultData = (): AppData => ({
  version: 1,
  onboarded: false,
  progress: {},
  exams: [],
  trip: { destination: '', date: '', scenarioIds: [], cityId: '' },
  settings: { accent: 'en-US', showTranscription: true, pronunciation: true },
  activeDays: [],
  badges: [],
});

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
      };
    }
    case 'pronunciation': {
      const prev = data.progress[action.phraseId] ?? emptyPhraseProgress();
      return {
        ...data,
        progress: { ...data.progress, [action.phraseId]: pushPron(prev, action.score) },
        activeDays: markActive(data, action.now),
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
    case 'badges':
      return { ...data, badges: [...data.badges, ...action.ids.filter((id) => !data.badges.includes(id))] };
    case 'reset':
      return { ...defaultData(), onboarded: true, settings: data.settings };
  }
}

/** Серия дней подряд с занятиями (включая сегодня или вчера). */
export function streak(activeDays: string[], now: number): number {
  const set = new Set(activeDays);
  const DAY = 86400000;
  let cursor = now;
  if (!set.has(dayKey(cursor))) cursor -= DAY;
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor -= DAY;
  }
  return n;
}

/** Мягкая миграция: добавить поля, появившиеся в новых версиях. */
export function migrate(raw: unknown): AppData {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  return {
    ...base,
    ...r,
    version: 1,
    trip: { ...base.trip, ...(r.trip ?? {}) },
    settings: { ...base.settings, ...(r.settings ?? {}) },
    progress: r.progress ?? {},
    exams: r.exams ?? [],
    activeDays: r.activeDays ?? [],
    badges: r.badges ?? [],
  };
}
