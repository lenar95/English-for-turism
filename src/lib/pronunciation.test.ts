import { describe, expect, it } from 'vitest';
import { scorePronunciation } from './pronunciation';
import { tokenize } from './text';

describe('tokenize', () => {
  it('разворачивает сокращения и типографские апострофы', () => {
    expect(tokenize('I’m sorry, I don’t understand.')).toEqual(['i', 'am', 'sorry', 'i', 'do', 'not', 'understand']);
  });
  it('приводит цифры и варианты написания к одному виду', () => {
    expect(tokenize('2 nights')).toEqual(['two', 'nights']);
    expect(tokenize('What’s the Wi-Fi password?')).toEqual(tokenize('what is the wifi password'));
    expect(tokenize('OK')).toEqual(tokenize('okay'));
    expect(tokenize('colour')).toEqual(tokenize('color'));
    expect(tokenize('Eat in or takeaway?')).toEqual(tokenize('eat in or take-away'));
    expect(tokenize('check-in')).toEqual(tokenize('checkin'));
  });
});

describe('scorePronunciation', () => {
  it('даёт 100 за точное совпадение без учёта регистра и пунктуации', () => {
    const r = scorePronunciation(['Could you repeat that, please?'], ['could you repeat that please']);
    expect(r.score).toBe(100);
    expect(r.words.every((w) => w.status === 'ok')).toBe(true);
  });

  it('засчитывает полную и сокращённую форму как одно и то же', () => {
    expect(scorePronunciation(['I’d like a room, please.'], ['I would like a room please']).score).toBe(100);
  });

  it('помечает пропущенное слово и снижает оценку', () => {
    const r = scorePronunciation(['Can I pay by card?'], ['can I pay by']);
    expect(r.score).toBeLessThan(100);
    expect(r.score).toBeGreaterThan(50);
    expect(r.words.find((w) => w.word.startsWith('card'))?.status).toBe('miss');
  });

  it('даёт частичный балл за похожее слово', () => {
    const r = scorePronunciation(['Thank you very much.'], ['tank you very much']);
    const thank = r.words.find((w) => w.word === 'Thank');
    expect(thank?.status).toBe('close');
    expect(r.score).toBeGreaterThan(70);
    expect(r.score).toBeLessThan(100);
  });

  it('служебные слова весят меньше значимых', () => {
    const noArticle = scorePronunciation(['Where is the toilet?'], ['where is toilet']).score;
    const noNoun = scorePronunciation(['Where is the toilet?'], ['where is the']).score;
    expect(noArticle).toBeGreaterThan(noNoun);
  });

  it('штрафует за лишние слова, но умеренно', () => {
    const r = scorePronunciation(['Hello!'], ['hello hello hello there']);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.score).toBeLessThan(100);
  });

  it('выбирает лучший вариант среди гипотез распознавателя и допустимых фраз', () => {
    const r = scorePronunciation(['Thank you very much.', 'Thanks a lot.'], ['banks a lot', 'thanks a lot']);
    expect(r.score).toBe(100);
    expect(r.matchedTarget).toBe('Thanks a lot.');
  });

  it('совсем другая фраза получает низкий балл', () => {
    expect(scorePronunciation(['I have a reservation.'], ['where is the bus stop']).score).toBeLessThan(30);
  });

  it('пустой результат — ноль', () => {
    expect(scorePronunciation(['Hello!'], []).score).toBe(0);
  });
});
