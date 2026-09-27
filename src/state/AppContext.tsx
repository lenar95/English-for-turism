import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { cityById, phraseById, scenarioById, scenarios } from '../data';
import type { Scenario } from '../data/types';
import { allBadges, type Badge } from '../lib/badges';
import { hapticSuccess } from '../lib/haptics';
import type { AnswerKind } from '../lib/memory';
import { recognitionAvailable, recognitionLikelyAvailable } from '../lib/speech/recognition';
import { defaultData, reducer, streak, type AppData, type ExamRecord, type Settings, type Trip } from './model';
import { loadData, saveData } from './storage';

interface AppContextValue {
  data: AppData;
  ready: boolean;
  /** Можно ли сейчас проверять произношение (есть распознавание и оно включено). */
  speechOn: boolean;
  /** Поддерживает ли устройство распознавание речи вообще. */
  speechSupported: boolean;
  tripScenarios: Scenario[];
  answer(phraseId: string, correct: boolean, kind: AnswerKind): void;
  pronunciation(phraseId: string, score: number): void;
  saveExam(record: ExamRecord): void;
  updateTrip(trip: Partial<Trip>): void;
  updateSettings(settings: Partial<Settings>): void;
  finishOnboarding(): void;
  resetProgress(): void;
  /** Только что полученные значки — показываются всплывающим уведомлением. */
  toasts: Badge[];
  dismissToast(id: string): void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, defaultData);
  const [ready, setReady] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(recognitionLikelyAvailable());
  const loaded = useRef(false);

  useEffect(() => {
    void loadData().then((d) => {
      dispatch({ type: 'load', data: d });
      loaded.current = true;
      setReady(true);
    });
    void recognitionAvailable().then(setSpeechSupported);
  }, []);

  useEffect(() => {
    if (loaded.current) saveData(data);
  }, [data]);

  const mustSpeak = (id: string) => phraseById[id]?.phrase.speaker !== 'them';

  const answer = useCallback((phraseId: string, correct: boolean, kind: AnswerKind) => {
    dispatch({ type: 'answer', phraseId, correct, kind, mustSpeak: mustSpeak(phraseId), now: Date.now() });
  }, []);
  const pronunciation = useCallback((phraseId: string, score: number) => {
    dispatch({ type: 'pronunciation', phraseId, score, now: Date.now() });
  }, []);
  const saveExam = useCallback((record: ExamRecord) => dispatch({ type: 'exam', record }), []);
  const updateTrip = useCallback((trip: Partial<Trip>) => dispatch({ type: 'trip', trip }), []);
  const updateSettings = useCallback((settings: Partial<Settings>) => dispatch({ type: 'settings', settings }), []);
  const finishOnboarding = useCallback(() => dispatch({ type: 'onboarded' }), []);
  const resetProgress = useCallback(() => dispatch({ type: 'reset' }), []);

  const tripScenarios = useMemo(() => {
    const ids = data.trip.scenarioIds;
    const general = ids.length
      ? ids.map((id) => scenarioById[id]).filter((s): s is Scenario => Boolean(s))
      : scenarios;
    const city = cityById[data.trip.cityId];
    return city ? [...general, ...city.scenarios] : general;
  }, [data.trip.scenarioIds, data.trip.cityId]);

  // Значки: считаем после каждого изменения данных. Полученные ещё до запуска
  // (например, при обновлении приложения) добавляем молча, без уведомлений.
  const [toasts, setToasts] = useState<Badge[]>([]);
  const badgesPrimed = useRef(false);
  const speechOn = speechSupported && data.settings.pronunciation;
  useEffect(() => {
    if (!ready) return;
    const now = Date.now();
    const earned = allBadges({
      progress: data.progress,
      exams: data.exams,
      streak: streak(data.activeDays, now),
      tripScenarios,
      now,
      speechOn,
    }).filter((b) => b.earned && !data.badges.includes(b.id));
    if (earned.length) {
      dispatch({ type: 'badges', ids: earned.map((b) => b.id) });
      if (badgesPrimed.current) {
        setToasts((t) => [...t, ...earned]);
        hapticSuccess();
      }
    }
    badgesPrimed.current = true;
  }, [ready, data.progress, data.exams, data.activeDays, data.badges, tripScenarios, speechOn]);
  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((b) => b.id !== id)), []);

  const value: AppContextValue = {
    data,
    ready,
    speechOn,
    speechSupported,
    tripScenarios,
    answer,
    pronunciation,
    saveExam,
    updateTrip,
    updateSettings,
    finishOnboarding,
    resetProgress,
    toasts,
    dismissToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp вне AppProvider');
  return v;
}
