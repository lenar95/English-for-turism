import { tokenize, tokenizeTurkish, wordSimilarity } from './text';

/** Язык фразы: английский (по умолчанию) или турецкий. */
export type ScoreLang = 'en' | 'tr';

const tokenizerFor = (lang: ScoreLang) => (lang === 'tr' ? tokenizeTurkish : tokenize);

/**
 * Оценка произношения.
 *
 * Идея: если система распознавания речи (та же технология, что в Siri и Google)
 * услышала именно те слова, что стоят во фразе, то и живой англоговорящий
 * собеседник, скорее всего, вас поймёт. Мы выравниваем распознанный текст
 * с эталоном по словам и начисляем баллы за каждое совпавшее слово;
 * слово, распознанное «почти правильно», получает частичный балл.
 */

export type WordStatus = 'ok' | 'close' | 'miss';

export interface WordResult {
  /** Слово эталона в исходном написании (для подсветки). */
  word: string;
  status: WordStatus;
  /** Что услышал распознаватель на месте этого слова. */
  heard?: string;
}

export interface PronunciationResult {
  /** 0–100. */
  score: number;
  words: WordResult[];
  /** Какой из допустимых вариантов фразы был засчитан. */
  matchedTarget: string;
  /** Какая из гипотез распознавателя была засчитана. */
  transcript: string;
}

/** Служебные слова весят меньше: их проглатывают даже носители языка. */
const LIGHT_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'is', 'are', 'am', 'do', 'at', 'in', 'on', 'for']);
const EXTRA_WORD_PENALTY = 0.25;
const CLOSE_THRESHOLD = 0.5;
const OK_THRESHOLD = 0.85;

/** Слова эталона вместе с «видимыми» исходными словами для подсветки. */
function targetWords(target: string, lang: ScoreLang): { norm: string; display: string }[] {
  const display = target.split(/\s+/).filter(Boolean);
  const out: { norm: string; display: string }[] = [];
  for (const d of display) {
    const parts = tokenizerFor(lang)(d);
    // «I’m» разворачивается в два нормализованных слова, но подсвечивается одно.
    parts.forEach((norm, i) => out.push({ norm, display: i === 0 ? d : '' }));
  }
  return out;
}

function weight(word: string, lang: ScoreLang): number {
  return lang === 'en' && LIGHT_WORDS.has(word) ? 0.5 : 1;
}

function credit(sim: number): number {
  if (sim >= OK_THRESHOLD) return sim >= 0.999 ? 1 : 0.9;
  if (sim >= CLOSE_THRESHOLD) return sim * 0.8;
  return 0;
}

interface Alignment {
  gained: number;
  extra: number;
  heardFor: (string | undefined)[];
  sims: number[];
}

/** Выравнивание по словам: максимизируем набранный балл (вариант алгоритма Нидлмана — Вунша). */
function align(target: string[], heard: string[], lang: ScoreLang): Alignment {
  const n = target.length;
  const m = heard.length;
  // dp[i][j] — лучший балл для первых i слов эталона и j слов распознанного текста.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const move: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] - EXTRA_WORD_PENALTY;
    move[0][j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0];
    move[i][0] = 1;
    const w = weight(target[i - 1], lang);
    for (let j = 1; j <= m; j++) {
      const sim = wordSimilarity(target[i - 1], heard[j - 1]);
      const diag = dp[i - 1][j - 1] + credit(sim) * w;
      const skipTarget = dp[i - 1][j];
      const skipHeard = dp[i][j - 1] - EXTRA_WORD_PENALTY;
      if (diag >= skipTarget && diag >= skipHeard) {
        dp[i][j] = diag;
        move[i][j] = 0;
      } else if (skipTarget >= skipHeard) {
        dp[i][j] = skipTarget;
        move[i][j] = 1;
      } else {
        dp[i][j] = skipHeard;
        move[i][j] = 2;
      }
    }
  }
  const heardFor: (string | undefined)[] = new Array(n).fill(undefined);
  const sims: number[] = new Array(n).fill(0);
  let extra = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = move[i][j];
    if (i > 0 && j > 0 && mv === 0) {
      heardFor[i - 1] = heard[j - 1];
      sims[i - 1] = wordSimilarity(target[i - 1], heard[j - 1]);
      i--;
      j--;
    } else if (i > 0 && (j === 0 || mv === 1)) {
      i--;
    } else {
      extra++;
      j--;
    }
  }
  return { gained: dp[n][m] + extra * EXTRA_WORD_PENALTY, extra, heardFor, sims };
}

function scoreOne(target: string, transcript: string, lang: ScoreLang): PronunciationResult {
  const tw = targetWords(target, lang);
  const heard = tokenizerFor(lang)(transcript);
  const norms = tw.map((t) => t.norm);
  const total = norms.reduce((s, w) => s + weight(w, lang), 0) || 1;
  const a = align(norms, heard, lang);
  // Лишние слова штрафуем умеренно: распознаватель иногда добавляет «um», «the».
  const penalty = Math.min(a.extra * EXTRA_WORD_PENALTY, total * 0.3);
  const raw = (a.gained - penalty) / total;
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);

  const words: WordResult[] = [];
  tw.forEach((t, idx) => {
    const sim = a.sims[idx];
    const status: WordStatus = sim >= OK_THRESHOLD ? 'ok' : sim >= CLOSE_THRESHOLD ? 'close' : 'miss';
    if (t.display) {
      words.push({ word: t.display, status, heard: a.heardFor[idx] });
    } else if (words.length) {
      // Вторая половина сокращения: берём худший статус из двух частей.
      const prev = words[words.length - 1];
      const rank = { ok: 0, close: 1, miss: 2 } as const;
      if (rank[status] > rank[prev.status]) prev.status = status;
    }
  });
  return { score, words, matchedTarget: target, transcript };
}

/**
 * Оценить сказанное.
 * @param targets допустимые варианты фразы (первый — основной).
 * @param transcripts гипотезы распознавателя (обычно до 5 вариантов).
 * @param lang язык фразы.
 */
export function scorePronunciation(targets: string[], transcripts: string[], lang: ScoreLang = 'en'): PronunciationResult {
  const cleanTranscripts = transcripts.map((t) => t.trim()).filter(Boolean);
  if (!cleanTranscripts.length) {
    const r = scoreOne(targets[0], '', lang);
    return { ...r, transcript: '' };
  }
  let best: PronunciationResult | null = null;
  for (const target of targets) {
    for (const tr of cleanTranscripts) {
      const r = scoreOne(target, tr, lang);
      if (!best || r.score > best.score) best = r;
    }
  }
  return best!;
}

/** Текстовая оценка для пользователя. */
export function pronunciationVerdict(score: number): { label: string; tone: 'good' | 'mid' | 'bad' } {
  if (score >= 85) return { label: 'Отлично! Вас поймут', tone: 'good' };
  if (score >= 65) return { label: 'Хорошо, но можно чище', tone: 'mid' };
  if (score >= 40) return { label: 'Понятно лишь частично', tone: 'mid' };
  return { label: 'Пока не понятно — попробуйте ещё', tone: 'bad' };
}
