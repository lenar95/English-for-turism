import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cities, scenarios } from '../src/data';

/** README обещает конкретные числа — они должны совпадать с данными, иначе описание устаревает молча. */
describe('README и данные', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

  it('число сценариев, фраз и диалогов', () => {
    const m = /## Ситуации \((\d+) сценар\S*, (\d+) фраз\S*, (\d+) диалог\S*\)/.exec(readme);
    expect(m, 'заголовок «## Ситуации (N сценариев, M фраз, K диалогов)»').not.toBeNull();
    expect(Number(m![1])).toBe(scenarios.length);
    expect(Number(m![2])).toBe(scenarios.reduce((n, s) => n + s.phrases.length, 0));
    expect(Number(m![3])).toBe(scenarios.reduce((n, s) => n + s.dialogues.length, 0));
  });

  it('число местных слов в наборе города', () => {
    for (const c of cities) {
      const m = new RegExp(`Плюс (\\d+) ${c.localLanguage.name === 'по-турецки' ? 'турецких' : '\\S+'} слов`).exec(readme);
      expect(m, `README: «Плюс N … слов» для ${c.name}`).not.toBeNull();
      expect(Number(m![1])).toBe(c.localLanguage.words.length);
    }
  });
});
