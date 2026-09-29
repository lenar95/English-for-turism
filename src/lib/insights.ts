import type { Scenario } from '../data/types';
import type { AppData } from '../state/model';
import { isSuccess, type OutcomeLike } from './adaptive';
import { activeThisWeek } from './motivation';
import { INSIGHT_RECORD_MIN } from './thresholds';

/**
 * «Открытие» после тренировки — небольшая награда, которую нельзя предсказать заранее.
 * Предсказуемые награды быстро приедаются, поэтому показываем не каждый раз
 * и каждый раз разное — но всегда правду о реальном прогрессе.
 */
export function sessionInsight(
  outcomes: OutcomeLike[],
  data: AppData,
  scenarios: Scenario[],
  now: number,
  rng: () => number = Math.random,
): string | null {
  if (rng() > 0.7) return null;
  const candidates: string[] = [];

  // Личный рекорд произношения.
  for (const o of outcomes) {
    if (o.pronScore === undefined) continue;
    const hist = data.progress[o.exercise.phrase.id]?.pron ?? [];
    const before = hist.slice(0, -1);
    if (before.length && o.pronScore > Math.max(...before) && o.pronScore >= INSIGHT_RECORD_MIN) {
      candidates.push(`Личный рекорд произношения: «${o.exercise.phrase.en}» — ${o.pronScore}% (было ${Math.max(...before)}%).`);
      break;
    }
  }

  // Ошибка, исправленная в той же тренировке.
  const failed = new Set<string>();
  for (const o of outcomes) {
    const id = o.exercise.phrase.id;
    if (!isSuccess(o)) failed.add(id);
    else if (failed.has(id)) {
      candidates.push(`Вы исправили ошибку в «${o.exercise.phrase.en}» в той же тренировке — так память закрепляется лучше всего.`);
      break;
    }
  }

  // Сколько фраз уже знаете уверенно.
  const phrases = scenarios.flatMap((s) => s.phrases);
  const solid = phrases.filter((p) => (data.progress[p.id]?.memory.level ?? 0) >= 3).length;
  if (solid >= 5) {
    const share = Math.round((solid / phrases.length) * 100);
    candidates.push(`Вы уже уверенно знаете ${solid} фраз — это ${share}% всего, что пригодится в поездке.`);
  }

  // Цель недели.
  const week = activeThisWeek(data.activeDays, now);
  if (week.count >= data.weeklyGoal) {
    candidates.push(`Цель недели выполнена: ${week.count} из ${data.weeklyGoal} дней. Каждый следующий день — бонус для памяти.`);
  }

  // Ключевые фразы, которые получились.
  const keyOk = outcomes.filter((o) => o.exercise.phrase.key && isSuccess(o)).length;
  if (keyOk >= 3) candidates.push(`${keyOk} ключевые фразы получились — именно они выручают в поездке чаще всего.`);

  if (!candidates.length) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}
