import { translationOf } from '../data';
import type { CityPack, Phrase } from '../data/types';
import { isDue, memoryStrength } from './memory';
import type { PhraseProgress } from './progress';

/**
 * Тренировка фраз на местном языке города (например, по-турецки).
 * Прогресс хранится отдельно от английского — под ключом `<id фразы>@<язык>`
 * (например, `istanbul-transport-01@tr-TR`), поэтому на готовность к поездке он не влияет.
 */
export const localProgressKey = (phraseId: string, lang: string) => `${phraseId}@${lang}`;

/** С какого уровня памяти фразу нужно вспоминать самому, а не повторять за диктором. */
export const LOCAL_RECALL_LEVEL = 2;

/** Сколько новых фраз брать за сессию, когда уже есть что повторять. */
export const LOCAL_NEW_PER_SESSION = 4;

export interface LocalItem {
  phrase: Phrase;
  scenarioId: string;
  /** repeat — видим фразу и повторяем за диктором; recall — вспоминаем по-русски. */
  mode: 'repeat' | 'recall';
}

interface Located {
  phrase: Phrase;
  scenarioId: string;
  order: number;
}

/**
 * Сессия на местном языке: сначала повторение выученного (слабые и просроченные — первыми,
 * той же формулой, что и в английской тренировке), потом немного новых фраз.
 * Так фраза, разученная вчера, вернётся раньше, чем начнётся следующая порция новых,
 * а не после того, как все фразы города будут начаты.
 */
export function localSession(
  city: CityPack,
  progress: Record<string, PhraseProgress>,
  size: number,
  scenarioId?: string,
  now: number = Date.now(),
): LocalItem[] {
  const { lang } = city.localLanguage;
  const pool: Located[] = city.scenarios
    .filter((s) => !scenarioId || s.id === scenarioId)
    .flatMap((s) =>
      s.phrases.filter((p) => p.speaker === 'you' && translationOf(p, lang)).map((phrase, order) => ({ phrase, scenarioId: s.id, order })),
    );
  const memoryOf = (p: Phrase) => progress[localProgressKey(p.id, lang)]?.memory;
  const byKeyThenOrder = (a: Located, b: Located) => Number(Boolean(b.phrase.key)) - Number(Boolean(a.phrase.key)) || a.order - b.order;

  const fresh = pool.filter((x) => !(memoryOf(x.phrase)?.reviews ?? 0)).sort(byKeyThenOrder);
  const learned = pool
    .filter((x) => (memoryOf(x.phrase)?.reviews ?? 0) > 0)
    .map((x) => {
      const m = memoryOf(x.phrase)!;
      const priority = 1 - memoryStrength(m, now) + (x.phrase.key ? 0.3 : 0) + (isDue(m, now) ? 0.5 : 0);
      return { x, m, priority };
    })
    .sort((a, b) => b.priority - a.priority || a.m.last - b.m.last || a.x.order - b.x.order)
    .map((a) => a.x);

  const newCount = Math.min(fresh.length, size, Math.max(LOCAL_NEW_PER_SESSION, size - learned.length));
  const reviewCount = Math.min(learned.length, size - newCount);
  return [...learned.slice(0, reviewCount), ...fresh.slice(0, newCount)].map(({ phrase, scenarioId: sid }) => ({
    phrase,
    scenarioId: sid,
    mode: (memoryOf(phrase)?.level ?? 0) >= LOCAL_RECALL_LEVEL ? 'recall' : 'repeat',
  }));
}

/** Сколько фраз города начато (уровень ≥ 1) и освоено (уровень ≥ 3) на местном языке. */
export function localLearned(
  city: CityPack,
  progress: Record<string, PhraseProgress>,
): { started: number; learned: number; total: number } {
  const { lang } = city.localLanguage;
  const phrases = city.scenarios.flatMap((s) => s.phrases.filter((p) => p.speaker === 'you' && translationOf(p, lang)));
  const level = (id: string) => progress[localProgressKey(id, lang)]?.memory.level ?? 0;
  return {
    started: phrases.filter((p) => level(p.id) >= 1).length,
    learned: phrases.filter((p) => level(p.id) >= 3).length,
    total: phrases.length,
  };
}
