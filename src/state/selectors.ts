import { useMemo } from 'react';
import type { Scenario } from '../data/types';
import { readMotivation, type MotivationReading } from '../lib/motivation';
import { tripReadiness, type Readiness } from '../lib/readiness';
import { useAppData, useSettings } from './AppContext';
import { useNow } from './useNow';

/** Готовность по списку ситуаций (по умолчанию — по всей поездке). */
export function useReadiness(scenarios?: Scenario[]): Readiness {
  const { data, tripScenarios } = useAppData();
  const { speechOn } = useSettings();
  const now = useNow();
  const list = scenarios ?? tripScenarios;
  return useMemo(() => tripReadiness(list, data.progress, now, speechOn), [list, data.progress, now, speechOn]);
}

/** Состояние ученика по поведению: как давно, как часто, насколько успешно занимается. */
export function useMotivation(): MotivationReading {
  const { data } = useAppData();
  const now = useNow();
  return useMemo(
    () => readMotivation(data.answers, data.sessions, data.activeDays, now),
    [data.answers, data.sessions, data.activeDays, now],
  );
}
