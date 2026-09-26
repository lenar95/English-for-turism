import { describe, expect, it } from 'vitest';
import { scenarios } from '../data';
import { buildExam, buildPracticeSession, isBuildCorrect, phraseWords } from './exercises';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('упражнения', () => {
  it('сборка фразы не зависит от регистра и пунктуации', () => {
    expect(phraseWords('Where is the taxi rank?')).toEqual(['Where', 'is', 'the', 'taxi', 'rank']);
    expect(isBuildCorrect('I don’t understand.', ['i', "don't", 'understand'])).toBe(true);
    expect(isBuildCorrect('Where is the taxi rank?', ['Where', 'the', 'is', 'taxi', 'rank'])).toBe(false);
  });

  it('тренировка отдаёт нужное число заданий с корректными вариантами', () => {
    const session = buildPracticeSession(scenarios.slice(0, 3), {}, Date.now(), true, 10, seeded(1));
    expect(session).toHaveLength(10);
    for (const ex of session) {
      if (ex.options) {
        expect(ex.options).toHaveLength(4);
        expect(ex.options.some((o) => o.id === ex.phrase.id)).toBe(true);
        expect(new Set(ex.options.map((o) => o.en)).size).toBe(4);
      }
      // Новые фразы начинаются с узнавания.
      expect(['choose-en', 'listen']).toContain(ex.type);
    }
  });

  it('проверка сбалансирована: есть задания на слух, память и произношение', () => {
    const exam = buildExam(scenarios, true, 20, seeded(7));
    expect(exam).toHaveLength(20);
    const types = new Set(exam.map((e) => e.type));
    for (const t of ['listen', 'choose-en', 'build', 'speak', 'recall-speak']) expect(types).toContain(t);
    expect(new Set(exam.map((e) => e.phrase.id)).size).toBe(20);
  });

  it('без микрофона в проверке нет речевых заданий', () => {
    const exam = buildExam(scenarios, false, 20, seeded(3));
    expect(exam.some((e) => e.type === 'speak' || e.type === 'recall-speak')).toBe(false);
  });
});
