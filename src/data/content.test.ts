import { describe, expect, it } from 'vitest';
import { scenarios } from '.';
import { scorePronunciation } from '../lib/pronunciation';

describe('контент', () => {
  const allIds = scenarios.flatMap((s) => s.phrases.map((p) => p.id));

  it('id фраз уникальны и соответствуют сценарию', () => {
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const s of scenarios) for (const p of s.phrases) expect(p.id.startsWith(`${s.id}-`)).toBe(true);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  it.each(scenarios.map((s) => [s.id, s] as const))('%s: поля заполнены и диалоги корректны', (_, s) => {
    expect(s.phrases.length).toBeGreaterThanOrEqual(12);
    expect(s.tips.length).toBeGreaterThan(0);
    expect(s.dialogues.length).toBeGreaterThan(0);
    expect(s.phrases.some((p) => p.key)).toBe(true);
    for (const p of s.phrases) {
      expect(p.en.trim()).not.toBe('');
      expect(p.ru.trim()).not.toBe('');
      expect(p.tr.trim()).not.toBe('');
      expect(p.tr).not.toMatch(/[a-z]/i);
      if (p.speaker === 'you') expect(p.en).not.toMatch(/\d/);
    }
    const ids = new Set(s.phrases.map((p) => p.id));
    for (const d of s.dialogues) {
      expect(d.lines.length).toBeGreaterThanOrEqual(4);
      for (const l of d.lines) expect(ids.has(l.phraseId)).toBe(true);
      const speakers = d.lines.map((l) => s.phrases.find((p) => p.id === l.phraseId)!.speaker);
      expect(speakers).toContain('you');
      expect(speakers).toContain('them');
    }
  });

  it('каждая фраза, прочитанная точно, получает 100% (нормализация не ломает эталон)', () => {
    for (const s of scenarios)
      for (const p of s.phrases)
        for (const t of [p.en, ...(p.alt ?? [])]) {
          expect(scorePronunciation([p.en, ...(p.alt ?? [])], [t.replace(/[.,!?]/g, '')]).score, t).toBe(100);
        }
  });
});
