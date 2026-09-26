import { describe, expect, it } from 'vitest';
import type { Scenario } from '../data/types';
import { applyAnswer, emptyMemory } from './memory';
import type { PhraseProgress } from './progress';
import { readinessLevel, scenarioReadiness, tripReadiness } from './readiness';

const NOW = Date.UTC(2026, 5, 1);

const scenario: Scenario = {
  id: 't',
  title: 'T',
  emoji: '🧪',
  stage: 'basics',
  goal: '',
  tips: [],
  dialogues: [],
  phrases: [
    { id: 't-01', en: 'Hello!', ru: '', tr: '', speaker: 'you', key: true },
    { id: 't-02', en: 'Thank you.', ru: '', tr: '', speaker: 'you' },
    { id: 't-03', en: 'How can I help you?', ru: '', tr: '', speaker: 'them' },
  ],
};

function mastered(pron: number[]): PhraseProgress {
  let m = emptyMemory();
  for (let d = 10; d > 0; d--) m = applyAnswer(m, true, 'recall', true, NOW - d * 86400000);
  m = { ...m, last: NOW };
  return { memory: m, pron };
}

describe('готовность', () => {
  it('без занятий — ноль', () => {
    const r = scenarioReadiness(scenario, {}, NOW);
    expect(r).toMatchObject({ total: 0, memory: 0, pronunciation: 0, practiced: 0, phrases: 3 });
  });

  it('всё выучено и отлично произнесено — 100', () => {
    const progress = { 't-01': mastered([100]), 't-02': mastered([100]), 't-03': mastered([]) };
    expect(scenarioReadiness(scenario, progress, NOW).total).toBe(100);
  });

  it('произношение учитывает только фразы, которые говорит турист, с весом ключевых', () => {
    const progress = { 't-01': mastered([90]), 't-02': mastered([30]) };
    // (90·2 + 30·1) / 3 = 70
    expect(scenarioReadiness(scenario, progress, NOW).pronunciation).toBe(70);
  });

  it('без микрофона готовность равна памяти', () => {
    const progress = { 't-01': mastered([]), 't-02': mastered([]), 't-03': mastered([]) };
    const r = scenarioReadiness(scenario, progress, NOW, false);
    expect(r.total).toBe(r.memory);
    expect(r.total).toBe(100);
  });

  it('готовность снижается, если долго не повторять', () => {
    const progress = { 't-01': mastered([100]), 't-02': mastered([100]), 't-03': mastered([]) };
    const later = scenarioReadiness(scenario, progress, NOW + 120 * 86400000);
    expect(later.memory).toBeLessThan(100);
  });

  it('общая готовность — среднее по ситуациям', () => {
    const progress = { 't-01': mastered([100]), 't-02': mastered([100]), 't-03': mastered([]) };
    const empty = { ...scenario, id: 'e', phrases: scenario.phrases.map((p) => ({ ...p, id: `e-${p.id}` })) };
    expect(tripReadiness([scenario, empty], progress, NOW).total).toBe(50);
  });

  it('уровни готовности', () => {
    expect(readinessLevel(10).tone).toBe('bad');
    expect(readinessLevel(45).tone).toBe('mid');
    expect(readinessLevel(70).tone).toBe('good');
    expect(readinessLevel(90).tone).toBe('great');
  });
});
