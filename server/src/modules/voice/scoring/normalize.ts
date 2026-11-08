/** Text normalisation used to compare what was said with what was expected. */

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–999 999 in words ("one hundred twenty three"). Larger numbers are left as digits. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return String(n);
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberToWords(rest)}` : ''}`;
  }
  const rest = n % 1000;
  return `${numberToWords(Math.floor(n / 1000))} thousand${rest ? ` ${numberToWords(rest)}` : ''}`;
}

const ORDINAL_WORDS: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
  twenty: 'twentieth',
  thirty: 'thirtieth',
};

/** 21 → "twenty first". */
function ordinalWords(n: number): string {
  const words = numberToWords(n).split(' ');
  const last = words.pop()!;
  const ord =
    ORDINAL_WORDS[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return [...words, ord].join(' ');
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bshan't\b/g, 'shall not'],
  [/\blet's\b/g, 'let us'],
  [/\b(it|that|there|here|what|where|who|he|she|how)'s\b/g, '$1 is'],
  [/n't\b/g, ' not'],
  [/'re\b/g, ' are'],
  [/'m\b/g, ' am'],
  [/'ll\b/g, ' will'],
  [/'ve\b/g, ' have'],
  [/'d\b/g, ' would'],
];

/**
 * Lower-case words without punctuation, with contractions expanded and numbers written out,
 * e.g. "It's 3:30 p.m. on the 21st!" → "it is three thirty pm on the twenty first".
 */
export function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\ba\.m\./g, 'am')
    .replace(/\bp\.m\./g, 'pm')
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ');
  for (const [pattern, replacement] of CONTRACTIONS) s = s.replace(pattern, replacement);
  s = s
    // 10:15 → ten fifteen, 8:00 → eight
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) =>
      Number(m)
        ? `${numberToWords(Number(h))} ${numberToWords(Number(m))}`
        : numberToWords(Number(h)),
    )
    // 21st → twenty first
    .replace(/\b(\d{1,6})(st|nd|rd|th)\b/g, (_, n: string) => ordinalWords(Number(n)))
    // 1,500 → 1500 → one thousand five hundred
    .replace(/\b\d{1,3}(,\d{3})+\b/g, (m) => m.replace(/,/g, ''))
    .replace(/\b\d+\b/g, (n) => numberToWords(Number(n)))
    .replace(/-/g, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/(^|\s)'+|'+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

export function words(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

export const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'hmm', 'mm', 'ah']);

/**
 * A spelling-insensitive form for comparing words: British and American spellings and simple
 * plural/past endings are treated alike (colour/color, organise/organize, travelled/traveled).
 */
export function canonical(word: string): string {
  return word
    .replace(/isation/g, 'ization')
    .replace(/is(e|ed|es|ing)$/, 'iz$1')
    .replace(/our$/, 'or')
    .replace(/ours$/, 'ors')
    .replace(/tre$/, 'ter')
    .replace(/mme$/, 'm')
    .replace(/ll(ed|ing|er)$/, 'l$1');
}

/** A rough stem for matching keywords ("returned" ≈ "return", "fees" ≈ "fee"). */
export function stem(word: string): string {
  const w = canonical(word);
  if (w.length <= 4) return w;
  return w.replace(/(ing|ed|es|s)$/, '');
}

/** Does the word sequence `phrase` occur in `inWords` (comparing stems)? */
export function containsPhrase(inWords: string[], phrase: string): boolean {
  const target = words(phrase).map(stem);
  if (!target.length) return false;
  const hay = inWords.map(stem);
  outer: for (let i = 0; i + target.length <= hay.length; i++) {
    for (let j = 0; j < target.length; j++) if (hay[i + j] !== target[j]) continue outer;
    return true;
  }
  return false;
}
