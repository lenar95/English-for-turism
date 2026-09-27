import type { Scenario } from '../data/types';
import { scenarioReadiness, tripReadiness, type ProgressMap } from './readiness';

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  /** Что нужно сделать, чтобы получить значок. */
  hint: string;
}

/** Готовность ситуации, с которой она считается освоенной. */
export const SCENARIO_MASTERED = 80;

export interface BadgeInput {
  progress: ProgressMap;
  exams: { total: number }[];
  streak: number;
  tripScenarios: Scenario[];
  now: number;
  speechOn: boolean;
}

interface BadgeRule extends Badge {
  earned: (i: BadgeInput) => boolean;
}

const GENERAL: BadgeRule[] = [
  {
    id: 'first-step',
    emoji: '👣',
    title: 'Первый шаг',
    hint: 'Ответить на первое задание',
    earned: (i) => Object.keys(i.progress).length > 0,
  },
  { id: 'streak-3', emoji: '🔥', title: '3 дня подряд', hint: 'Заниматься 3 дня подряд', earned: (i) => i.streak >= 3 },
  { id: 'streak-7', emoji: '⚡', title: 'Неделя подряд', hint: 'Заниматься 7 дней подряд', earned: (i) => i.streak >= 7 },
  { id: 'exam-first', emoji: '🎯', title: 'Первая проверка', hint: 'Пройти проверку готовности', earned: (i) => i.exams.length > 0 },
  {
    id: 'exam-80',
    emoji: '🏆',
    title: 'Отличник',
    hint: 'Набрать 80% в проверке',
    earned: (i) => i.exams.some((e) => e.total >= 80),
  },
  {
    id: 'trip-ready',
    emoji: '✈️',
    title: 'Готов к поездке',
    hint: 'Общая готовность 60%',
    earned: (i) => i.tripScenarios.length > 0 && tripReadiness(i.tripScenarios, i.progress, i.now, i.speechOn).total >= 60,
  },
];

/** Все значки, доступные в текущей поездке: общие и по одному на каждую ситуацию. */
export function allBadges(input: BadgeInput): (Badge & { earned: boolean })[] {
  const general = GENERAL.map(({ earned, ...b }) => ({ ...b, earned: earned(input) }));
  const perScenario = input.tripScenarios.map((s) => ({
    id: `scenario:${s.id}`,
    emoji: s.emoji,
    title: s.title,
    hint: `Готовность ${SCENARIO_MASTERED}% в ситуации`,
    earned: scenarioReadiness(s, input.progress, input.now, input.speechOn).total >= SCENARIO_MASTERED,
  }));
  return [...general, ...perScenario];
}
