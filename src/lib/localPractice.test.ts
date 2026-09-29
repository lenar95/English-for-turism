import { describe, expect, it } from 'vitest';
import { cityById } from '../data';
import { localLearned, localProgressKey, localSession } from './localPractice';
import { scorePronunciation } from './pronunciation';
import { emptyPhraseProgress } from './progress';
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
        if (p.local) expect(scorePronunciation([p.local.text], [p.local.text.replace(/[.,!?]/g, '')], 'tr').score, p.id).toBe(100);
  });

  it('другая фраза получает низкую оценку', () => {
    expect(scorePronunciation(['Bu ne kadar?'], ['Merhaba nasılsınız'], 'tr').score).toBeLessThan(40);
  });
});

describe('тренировка на местном языке', () => {
  it('только фразы туриста с переводом, сначала новые', () => {
    const items = localSession(istanbul, {}, 8);
    expect(items).toHaveLength(8);
    expect(items.every((i) => i.phrase.speaker === 'you' && i.phrase.local && i.mode === 'repeat')).toBe(true);
    expect(items[0].phrase.key).toBe(true);
  });

  it('освоенные фразы уходят в конец и требуют вспомнить самому', () => {
    const first = localSession(istanbul, {}, 1)[0].phrase;
    const learned = { ...emptyPhraseProgress(), memory: { level: 3, last: Date.now(), reviews: 3, correct: 3 } };
    const progress = { [localProgressKey(first.id)]: learned };
    const all = localSession(istanbul, progress, 100);
    expect(all[all.length - 1].phrase.id).toBe(first.id);
    expect(all[all.length - 1].mode).toBe('recall');
    expect(localLearned(istanbul, progress).learned).toBe(1);
  });

  it('фильтр по ситуации', () => {
    const items = localSession(istanbul, {}, 100, 'istanbul-bazaar');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.scenarioId === 'istanbul-bazaar')).toBe(true);
  });
});
