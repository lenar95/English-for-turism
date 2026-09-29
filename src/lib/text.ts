/**
 * Нормализация английского текста для сравнения того, что сказал пользователь,
 * с эталонной фразой. Распознаватель речи возвращает текст в разном виде
 * («I'm» / «I am», «2» / «two», «OK» / «okay»), поэтому обе стороны приводятся
 * к одному словарю.
 */

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "he's": 'he is',
  "she's": 'she is',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "what's": 'what is',
  "where's": 'where is',
  "how's": 'how is',
  "here's": 'here is',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "we'll": 'we will',
  "it'll": 'it will',
  "i'd": 'i would',
  "you'd": 'you would',
  "we'd": 'we would',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "can't": 'cannot',
  "cannot": 'cannot',
  "couldn't": 'could not',
  "won't": 'will not',
  "wouldn't": 'would not',
  "shouldn't": 'should not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "let's": 'let us',
};

const NUMBERS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
  '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven',
  '12': 'twelve', '13': 'thirteen', '14': 'fourteen', '15': 'fifteen', '16': 'sixteen',
  '17': 'seventeen', '18': 'eighteen', '19': 'nineteen', '20': 'twenty', '30': 'thirty',
  '40': 'forty', '50': 'fifty', '60': 'sixty', '100': 'hundred',
  '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth',
};

/**
 * Слова, которые распознаватель пишет по-разному, но звучат одинаково.
 * Составные слова всегда приводим к раздельной форме («takeaway» → «take away»),
 * чтобы эталон и распознанный текст разбивались на слова одинаково.
 */
const SPELLING: Record<string, string> = {
  ok: 'okay',
  wifi: 'wi fi',
  mr: 'mister',
  mrs: 'missus',
  colour: 'color',
  centre: 'center',
  theatre: 'theater',
  metre: 'meter',
  travelling: 'traveling',
  cheque: 'check',
  favourite: 'favorite',
  grey: 'gray',
  email: 'e mail',
  checkin: 'check in',
  checkout: 'check out',
  takeaway: 'take away',
  passcode: 'pass code',
  timetable: 'time table',
};

/** Привести апострофы, регистр и пробелы к единому виду. */
export function basicClean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Разбить английский текст на нормализованные слова. */
export function tokenize(text: string): string[] {
  const t = basicClean(text);
  const words: string[] = [];
  for (const raw of t.split(/[\s,.!?;:()/]+/)) {
    const w = raw.replace(/^'+|'+$/g, '');
    if (!w) continue;
    if (CONTRACTIONS[w]) {
      words.push(...CONTRACTIONS[w].split(' '));
      continue;
    }
    if (NUMBERS[w]) {
      words.push(NUMBERS[w]);
      continue;
    }
    // Дефисы превращаем в пробелы, чтобы «wi-fi», «wi fi» и «wifi» совпадали.
    for (const part of w.split('-')) {
      if (!part) continue;
      const spelled = SPELLING[part] ?? part;
      words.push(...spelled.split(' '));
    }
  }
  return words;
}

/** Расстояние Левенштейна между двумя строками (по символам). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Похожесть двух слов от 0 до 1. */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

const TR_DIGITS = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TR_TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

/** Число до 9999 турецкими словами: 500 → «beş yüz», 40 → «kırk». */
function turkishNumber(n: number): string[] {
  if (n === 0) return ['sıfır'];
  const out: string[] = [];
  const th = Math.floor(n / 1000);
  const h = Math.floor((n % 1000) / 100);
  const rest = n % 100;
  if (th) out.push(...(th > 1 ? [TR_DIGITS[th]] : []), 'bin');
  if (h) out.push(...(h > 1 ? [TR_DIGITS[h]] : []), 'yüz');
  if (rest >= 10) out.push(TR_TENS[Math.floor(rest / 10)]);
  if (rest % 10) out.push(TR_DIGITS[rest % 10]);
  return out;
}

/**
 * Разбить турецкий текст на нормализованные слова.
 * Регистр — по турецким правилам (İ → i, I → ı); апостроф перед окончанием
 * убираем («Kadıköy'e» = «Kadıköye»), цифры переводим в слова.
 * Буквы с точками и седилями приводим к базовым: распознаватель иногда их теряет,
 * а для понимания собеседником это почти не важно.
 */
export function tokenizeTurkish(text: string): string[] {
  const t = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[’‘`´']/g, '')
    .replace(/[“”«»"]/g, ' ')
    .replace(/(\p{L})(\d)/gu, '$1 $2');
  const words: string[] = [];
  for (const raw of t.split(/[\s,.!?;:()/-]+/)) {
    if (!raw) continue;
    if (/^\d{1,4}$/.test(raw)) {
      words.push(...turkishNumber(Number(raw)).map(foldTurkish));
      continue;
    }
    words.push(foldTurkish(raw));
  }
  return words;
}

function foldTurkish(w: string): string {
  return w
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}
