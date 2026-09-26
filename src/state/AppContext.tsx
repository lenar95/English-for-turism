import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { cityById, phraseById, scenarioById, scenarios } from '../data';
import type { Scenario } from '../data/types';
import type { AnswerKind } from '../lib/memory';
import { recognitionAvailable, recognitionLikelyAvailable } from '../lib/speech/recognition';
import { defaultData, reducer, type AppData, type ExamRecord, type Settings, type Trip } from './model';
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

  const value: AppContextValue = {
    data,
    ready,
    speechOn: speechSupported && data.settings.pronunciation,
    speechSupported,
    tripScenarios,
    answer,
    pronunciation,
    saveExam,
    updateTrip,
    updateSettings,
    finishOnboarding,
    resetProgress,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp вне AppProvider');
  return v;
}
