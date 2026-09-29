import { describe, expect, it } from 'vitest';
import { cityById, translationOf } from '../data';
import { localLearned, localProgressKey, localSession, LOCAL_NEW_PER_SESSION } from './localPractice';
import { scorePronunciation } from './pronunciation';
import { applyAnswer, emptyMemory } from './memory';
import { emptyPhraseProgress, type PhraseProgress } from './progress';

const DAY = 86400000;
const NOW = new Date(2026, 9, 1, 12).getTime();
import { tokenizeTurkish } from './text';

const istanbul = cityById.istanbul;

describe('турецкий: нормализация и оценка', () => {
  it('турецкий регистр, апострофы и цифры', () => {
    expect(tokenizeTurkish("İstanbulkart'ı nereden")).toEqual(['istanbulkarti', 'nereden']);
    expect(tokenizeTurkish('500 lira')).toEqual(['bes', 'yuz', 'lira']);
    expect(tokenizeTurkish('T1 tramvayına')).toEqual(['t', 'bir', 'tramvayina']);
    expect(tokenizeTurkish('KIRK')).toEqual(['kirk']);
  });

  it('распознанные варианты написания засчитываются полностью', () => {
    const cases: [string, string][] = [
      ["İstanbulkart'ı nereden alabilirim?", 'istanbulkartı nereden alabilirim'],
      ["Bu vapur Kadıköy'e gidiyor mu?", 'Bu vapur Kadıköye gidiyor mu'],
      ['Beş yüz lira verebilirim.', '500 lira verebilirim'],
      ['Kırk dakika sonra gelin.', '40 dakika sonra gelin'],
    ];
    for (const [target, heard] of cases) expect(scorePronunciation([target], [heard], 'tr').score, heard).toBe(100);
  });

  it('каждая турецкая фраза, прочитанная точно, получает 100%', () => {
    for (const s of istanbul.scenarios)
      for (const p of s.phrases)
        for (const t of [translationOf(p, 'tr-TR')].filter(Boolean)) expect(scorePronunciation([t!.text], [t!.text.replace(/[.,!?]/g, '')], 'tr').score, p.id).toBe(100);
  });

  it('другая фраза получает низкую оценку', () => {
    expect(scorePronunciation(['Bu ne kadar?'], ['Merhaba nasılsınız'], 'tr').score).toBeLessThan(40);
  });
});

describe('тренировка на местном языке', () => {
  it('только фразы туриста с переводом, сначала новые', () => {
    const items = localSession(istanbul, {}, 8);
    expect(items).toHaveLength(8);
    expect(items.every((i) => i.phrase.speaker === 'you' && translationOf(i.phrase, 'tr-TR') && i.mode === 'repeat')).toBe(true);
    expect(items[0].phrase.key).toBe(true);
  });

  it('освоенную фразу нужно вспомнить самому, и она идёт перед новыми', () => {
    const first = localSession(istanbul, {}, 1, undefined, NOW)[0].phrase;
    const learned = { ...emptyPhraseProgress(), memory: { ...emptyMemory(), level: 3, last: NOW, due: NOW + 7 * DAY, reviews: 3, correct: 3 } };
    const progress = { [localProgressKey(first.id, 'tr-TR')]: learned };
    const all = localSession(istanbul, progress, 100, undefined, NOW);
    expect(all[0].phrase.id).toBe(first.id);
    expect(all[0].mode).toBe('recall');
    expect(new Set(all.map((i) => i.phrase.id)).size).toBe(all.length);
    expect(localLearned(istanbul, progress).learned).toBe(1);
  });

  it('фраза, разученная вчера, возвращается раньше новых', () => {
    const session = localSession(istanbul, {}, 8, undefined, NOW - DAY);
    const yesterday = session[5].phrase;
    const progress = { [localProgressKey(yesterday.id, 'tr-TR')]: { ...emptyPhraseProgress(), memory: applyAnswer(emptyMemory(), true, 'recognition', true, NOW - DAY) } };
    const items = localSession(istanbul, progress, 8, undefined, NOW);
    expect(items[0].phrase.id).toBe(yesterday.id);
    expect(items[0].mode).toBe('repeat');
    expect(items).toHaveLength(8);
  });

  it('когда есть что повторять, новых фраз за сессию немного', () => {
    const progress: Record<string, PhraseProgress> = {};
    for (const item of localSession(istanbul, {}, 10, undefined, NOW - DAY)) {
      progress[localProgressKey(item.phrase.id, 'tr-TR')] = { ...emptyPhraseProgress(), memory: applyAnswer(emptyMemory(), true, 'recognition', true, NOW - DAY) };
    }
    const items = localSession(istanbul, progress, 8, undefined, NOW);
    const fresh = items.filter((i) => !progress[localProgressKey(i.phrase.id, 'tr-TR')]);
    expect(fresh).toHaveLength(LOCAL_NEW_PER_SESSION);
    expect(items).toHaveLength(8);
  });

  it('фильтр по ситуации', () => {
    const items = localSession(istanbul, {}, 100, 'istanbul-bazaar');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.scenarioId === 'istanbul-bazaar')).toBe(true);
  });
});
