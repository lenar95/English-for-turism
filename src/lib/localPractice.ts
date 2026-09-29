import type { CityPack, Phrase } from '../data/types';
import type { PhraseProgress } from './progress';

/**
 * Тренировка фраз на местном языке города (например, по-турецки).
 * Прогресс хранится отдельно от английского — под ключом `<id фразы>@local`,
 * поэтому на готовность к поездке (английский) он не влияет.
 */
export const localProgressKey = (phraseId: string) => `${phraseId}@local`;

/** С какого уровня памяти фразу нужно вспоминать самому, а не повторять за диктором. */
export const LOCAL_RECALL_LEVEL = 2;

export interface LocalItem {
  phrase: Phrase;
  scenarioId: string;
  /** repeat — видим фразу и повторяем за диктором; recall — вспоминаем по-русски. */
  mode: 'repeat' | 'recall';
}

/** Фразы, которые говорит турист и у которых есть перевод, — в порядке «сначала слабые». */
export function localSession(
  city: CityPack,
  progress: Record<string, PhraseProgress>,
  size: number,
  scenarioId?: string,
): LocalItem[] {
  const pool = city.scenarios
    .filter((s) => !scenarioId || s.id === scenarioId)
    .flatMap((s) => s.phrases.filter((p) => p.speaker === 'you' && p.local).map((phrase, order) => ({ phrase, scenarioId: s.id, order })));
  const level = (p: Phrase) => progress[localProgressKey(p.id)]?.memory.level ?? 0;
  const last = (p: Phrase) => progress[localProgressKey(p.id)]?.memory.last ?? 0;
  return pool
    .sort(
      (a, b) =>
        level(a.phrase) - level(b.phrase) ||
        Number(Boolean(b.phrase.key)) - Number(Boolean(a.phrase.key)) ||
        last(a.phrase) - last(b.phrase) ||
        a.order - b.order,
    )
    .slice(0, size)
    .map(({ phrase, scenarioId: sid }) => ({
      phrase,
      scenarioId: sid,
      mode: level(phrase) >= LOCAL_RECALL_LEVEL ? 'recall' : 'repeat',
    }));
}

/** Сколько фраз города начато (уровень ≥ 1) и освоено (уровень ≥ 3) на местном языке. */
export function localLearned(
  city: CityPack,
  progress: Record<string, PhraseProgress>,
): { started: number; learned: number; total: number } {
  const phrases = city.scenarios.flatMap((s) => s.phrases.filter((p) => p.speaker === 'you' && p.local));
  const level = (id: string) => progress[localProgressKey(id)]?.memory.level ?? 0;
  return {
    started: phrases.filter((p) => level(p.id) >= 1).length,
    learned: phrases.filter((p) => level(p.id) >= 3).length,
    total: phrases.length,
  };
}
