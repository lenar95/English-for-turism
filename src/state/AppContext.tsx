import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { cityById, phraseById, scenarioById, scenarios } from '../data';
import type { Scenario } from '../data/types';
import { allBadges, type Badge } from '../lib/badges';
import { hapticSuccess } from '../lib/haptics';
import type { AnswerKind } from '../lib/memory';
import { freezePlan, planIsCurrent, todayPlan, type DailyPlan } from '../lib/motivation';
import {
  applyUpdate,
  newIdentity,
  onUpdateReady,
  probeBackend,
  registerServiceWorker,
  sendStatus,
  type BackendState,
  type PushIdentity,
  type PushSnapshot,
} from '../lib/push';
import { recognitionAvailable, recognitionLikelyAvailable } from '../lib/speech/recognition';
import { defaultData, reducer, streak, type AppData, type ExamRecord, type SessionLog, type Settings, type Trip } from './model';
import { loadData, saveData } from './storage';
import { useNow } from './useNow';

/**
 * Состояние приложения разложено на три контекста:
 * - данные меняются при каждом ответе — на них подписаны страницы;
 * - настройки и возможности устройства меняются редко — на них подписаны кнопки озвучки
 *   и микрофона, чтобы не перерисовываться посреди записи;
 * - действия стабильны — подписка на них перерисовок не вызывает вовсе.
 */

export interface AppDataValue {
  data: AppData;
  ready: boolean;
  tripScenarios: Scenario[];
  /** План на сегодня: зафиксирован на день, «сделано» считается живьём. */
  plan: DailyPlan;
  /** Только что полученные значки — показываются всплывающим уведомлением. */
  toasts: Badge[];
  /** Скачана новая версия приложения; applyUpdate включает её и перезагружает страницу. */
  updateReady: boolean;
}

export interface AppSettingsValue {
  settings: Settings;
  /** Можно ли сейчас проверять произношение (есть распознавание и оно включено). */
  speechOn: boolean;
  /** Поддерживает ли устройство распознавание речи вообще. */
  speechSupported: boolean;
  /** Есть ли за сайтом сервис напоминаний (на GitHub Pages и в нативном приложении его нет). */
  backend: BackendState;
}

export interface AppActions {
  answer(phraseId: string, correct: boolean, kind: AnswerKind): void;
  pronunciation(phraseId: string, score: number): void;
  saveExam(record: ExamRecord): void;
  logSession(log: SessionLog): void;
  setWeeklyGoal(days: number): void;
  updateTrip(trip: Partial<Trip>): void;
  updateSettings(settings: Partial<Settings>): void;
  finishOnboarding(): void;
  resetProgress(): void;
  dismissToast(id: string): void;
  /** Анонимный id для напоминаний (создаётся при первом включении). */
  ensurePushId(): PushIdentity;
  /** Сводка для сервера напоминаний: без личных данных, только цифры плана. */
  pushSnapshot(): PushSnapshot;
  applyUpdate(): void;
}

export type AppContextValue = AppDataValue & AppSettingsValue & AppActions;

const DataCtx = createContext<AppDataValue | null>(null);
const SettingsCtx = createContext<AppSettingsValue | null>(null);
const ActionsCtx = createContext<AppActions | null>(null);

const mustSpeak = (id: string) => phraseById[id]?.phrase.speaker !== 'them';

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, defaultData);
  const [ready, setReady] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(recognitionLikelyAvailable());
  const [backend, setBackend] = useState<BackendState>('unknown');
  const [updateReady, setUpdateReady] = useState(false);
  const [toasts, setToasts] = useState<Badge[]>([]);
  const loaded = useRef(false);
  const now = useNow();

  useEffect(() => {
    void loadData().then((d) => {
      dispatch({ type: 'load', data: d });
      loaded.current = true;
      setReady(true);
    });
    void recognitionAvailable().then(setSpeechSupported);
    void probeBackend().then(setBackend);
    void registerServiceWorker();
    return onUpdateReady(() => setUpdateReady(true));
  }, []);

  useEffect(() => {
    if (loaded.current) saveData(data);
  }, [data]);

  const tripScenarios = useMemo(() => {
    const ids = data.trip.scenarioIds;
    const general = ids.length
      ? ids.map((id) => scenarioById[id]).filter((s): s is Scenario => Boolean(s))
      : scenarios;
    const city = cityById[data.trip.cityId];
    return city ? [...general, ...city.scenarios] : general;
  }, [data.trip.scenarioIds, data.trip.cityId]);

  const speechOn = speechSupported && data.settings.pronunciation;

  // План на день фиксируется при первом расчёте за день (см. TodayPlan в model.ts).
  const plan = useMemo(() => todayPlan(data, tripScenarios, now), [data, tripScenarios, now]);
  useEffect(() => {
    if (!ready || planIsCurrent(data.todayPlan, data.trip, now)) return;
    dispatch({ type: 'todayPlan', plan: freezePlan(plan, data.trip, now) });
  }, [ready, data.todayPlan, data.trip, now, plan]);

  // Значки: считаем после каждого изменения данных. Полученные ещё до запуска
  // (например, при обновлении приложения) добавляем молча, без уведомлений.
  // Готовность для значков считается с произношением, если устройство его поддерживает:
  // выключение проверки в настройках не должно выдавать награды.
  const badgesPrimed = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const at = Date.now();
    const earned = allBadges({
      progress: data.progress,
      exams: data.exams,
      streak: streak(data.activeDays, at),
      tripScenarios,
      now: at,
      speechOn: speechSupported,
    }).filter((b) => b.earned && !data.badges.includes(b.id));
    if (earned.length) {
      dispatch({ type: 'badges', ids: earned.map((b) => b.id) });
      if (badgesPrimed.current) {
        setToasts((t) => [...t, ...earned]);
        hapticSuccess();
      }
    }
    badgesPrimed.current = true;
  }, [ready, data.progress, data.exams, data.activeDays, data.badges, tripScenarios, speechSupported]);

  // Действия читают свежие данные через ref, поэтому сами остаются стабильными.
  const latest = useRef({ data, plan });
  useEffect(() => {
    latest.current = { data, plan };
  }, [data, plan]);

  const pushSnapshot = useCallback((): PushSnapshot => {
    const { data: d, plan: p } = latest.current;
    const days = [...d.activeDays].sort();
    return {
      lastActiveDay: days[days.length - 1] ?? null,
      doneToday: p.done,
      goal: p.goal,
      tripDate: d.trip.date,
      minimal: p.minimal,
    };
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      answer: (phraseId, correct, kind) =>
        dispatch({ type: 'answer', phraseId, correct, kind, mustSpeak: mustSpeak(phraseId), now: Date.now() }),
      pronunciation: (phraseId, score) => dispatch({ type: 'pronunciation', phraseId, score, now: Date.now() }),
      saveExam: (record) => dispatch({ type: 'exam', record }),
      logSession: (log) => dispatch({ type: 'session', log }),
      setWeeklyGoal: (days) => dispatch({ type: 'weeklyGoal', days }),
      updateTrip: (trip) => dispatch({ type: 'trip', trip }),
      updateSettings: (settings) => dispatch({ type: 'settings', settings }),
      finishOnboarding: () => dispatch({ type: 'onboarded' }),
      resetProgress: () => dispatch({ type: 'reset' }),
      dismissToast: (id) => setToasts((t) => t.filter((b) => b.id !== id)),
      ensurePushId: () => {
        const existing = latest.current.data.pushId;
        if (existing) return existing;
        const identity = newIdentity();
        dispatch({ type: 'pushId', pushId: identity });
        return identity;
      },
      pushSnapshot,
      applyUpdate,
    }),
    [pushSnapshot],
  );

  // После занятий сообщаем серверу, чтобы он не напоминал зря (с задержкой, пачкой).
  const statusKey = `${data.activeDays[data.activeDays.length - 1] ?? ''}|${data.answers.length}|${data.trip.date}|${data.settings.reminderTime}`;
  useEffect(() => {
    if (!ready || !data.settings.reminders || !data.pushId) return;
    const t = setTimeout(() => void sendStatus(data.pushId!, data.settings.reminderTime, pushSnapshot()), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, statusKey, data.settings.reminders]);

  const dataValue = useMemo<AppDataValue>(
    () => ({ data, ready, tripScenarios, plan, toasts, updateReady }),
    [data, ready, tripScenarios, plan, toasts, updateReady],
  );
  const settingsValue = useMemo<AppSettingsValue>(
    () => ({ settings: data.settings, speechOn, speechSupported, backend }),
    [data.settings, speechOn, speechSupported, backend],
  );

  return (
    <ActionsCtx.Provider value={actions}>
      <SettingsCtx.Provider value={settingsValue}>
        <DataCtx.Provider value={dataValue}>{children}</DataCtx.Provider>
      </SettingsCtx.Provider>
    </ActionsCtx.Provider>
  );
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} вне AppProvider`);
  return value;
}

/** Данные: для страниц и карточек, которые их показывают. */
export function useAppData(): AppDataValue {
  return required(useContext(DataCtx), 'useAppData');
}

/** Настройки и возможности устройства: для кнопок озвучки, микрофона и напоминаний. */
export function useSettings(): AppSettingsValue {
  return required(useContext(SettingsCtx), 'useSettings');
}

/** Действия: стабильные ссылки, подписка не вызывает перерисовок. */
export function useActions(): AppActions {
  return required(useContext(ActionsCtx), 'useActions');
}

/** Всё сразу — для страниц. Листовые компоненты берут только нужный срез. */
export function useApp(): AppContextValue {
  return { ...useAppData(), ...useSettings(), ...useActions() };
}
