import { createHash } from 'node:crypto';
import { z } from 'zod';

export const WRITTEN_TYPES = [
  'fill_blank',
  'spot_error',
  'sentence_completion',
  'synonym',
  'antonym',
] as const;
export type QuestionType = (typeof WRITTEN_TYPES)[number];

export const TAGS = [
  'articles',
  'prepositions',
  'tenses',
  'subject_verb_agreement',
  'pronouns',
  'conjunctions',
  'modals',
  'comparatives',
  'word_order',
  'vocabulary',
  'collocations',
] as const;
export type Tag = (typeof TAGS)[number];

/** Answer index meaning "No error" in spot-the-error questions (segments are 0–3). */
export const NO_ERROR = 4;
export const BLANK = '___';

const text = (max: number) => z.string().trim().min(1).max(max);
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const options = z
  .array(text(120))
  .length(4, 'Give exactly 4 options')
  .refine(
    (list) => new Set(list.map(normalize)).size === list.length,
    'Options must all be different',
  );

const base = {
  difficulty: z.number().int().min(1).max(3),
  tags: z.array(z.enum(TAGS)).min(1).max(3),
  explanation: text(500).min(10, 'Explain the answer in a sentence'),
};

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const blankQuestion = (type: 'fill_blank' | 'sentence_completion') =>
  z.object({
    type: z.literal(type),
    prompt: text(300).refine((p) => countOf(p, BLANK) === 1, `Use exactly one ${BLANK} blank`),
    options,
    answer: z.number().int().min(0).max(3),
    ...base,
  });

const wordQuestion = (type: 'synonym' | 'antonym') =>
  z.object({
    type: z.literal(type),
    prompt: text(300).refine(
      (p) => /^[^*]*\*\*[^*]+\*\*[^*]*$/.test(p),
      'Mark exactly one target word like **word**',
    ),
    options,
    answer: z.number().int().min(0).max(3),
    ...base,
  });

const spotErrorQuestion = z
  .object({
    type: z.literal('spot_error'),
    segments: z.array(text(120)).length(4, 'Split the sentence into exactly 4 parts'),
    answer: z.number().int().min(0).max(NO_ERROR),
    correction: text(400).optional(),
    ...base,
  })
  .superRefine((q, ctx) => {
    const original = q.segments.join(' ');
    if (q.answer === NO_ERROR) {
      if (q.correction && normalize(q.correction) !== normalize(original)) {
        ctx.addIssue({
          code: 'custom',
          path: ['correction'],
          message: 'A "No error" item cannot have a different correction',
        });
      }
      return;
    }
    if (!q.correction) {
      ctx.addIssue({
        code: 'custom',
        path: ['correction'],
        message: 'Give the corrected sentence',
      });
      return;
    }
    const fixed = normalize(q.correction);
    if (fixed === normalize(original)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correction'],
        message: 'The correction must differ from the original sentence',
      });
    }
    // Only the marked part may change: every other part must survive unchanged, in order.
    let from = 0;
    q.segments.forEach((segment, i) => {
      if (i === q.answer) return;
      const at = fixed.indexOf(normalize(segment), from);
      if (at < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['correction'],
          message: `Part ${'ABCD'[i]} must stay unchanged in the correction`,
        });
      } else {
        from = at + normalize(segment).length;
      }
    });
  });

/** The authoring format of a question (seed files, admin editor, AI drafts). */
export const questionContentSchema = z.discriminatedUnion('type', [
  blankQuestion('fill_blank'),
  blankQuestion('sentence_completion'),
  wordQuestion('synonym'),
  wordQuestion('antonym'),
  spotErrorQuestion,
]);
export type QuestionContent = z.infer<typeof questionContentSchema>;

/** Text shown to the student: the sentence (spot-the-error parts are joined). */
export function promptOf(q: QuestionContent): string {
  return q.type === 'spot_error' ? q.segments.join(' ') : q.prompt;
}

/** Stable fingerprint used to block duplicates (independent of the order of the options). */
export function contentHash(q: QuestionContent): string {
  const options = q.type === 'spot_error' ? [...q.segments] : [...q.options];
  return createHash('sha256')
    .update([q.type, normalize(promptOf(q)), ...options.map(normalize).sort()].join('|'))
    .digest('hex');
}

/** Small deterministic PRNG so shuffling the same question always gives the same order. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Puts the options of a multiple-choice question in a stable pseudo-random order (seeded by the
 * prompt) and moves `answer` with them, so the right option is not always in the same place.
 * Spot-the-error questions are returned unchanged: their parts must stay in sentence order.
 */
export function shuffleOptions<T extends QuestionContent>(q: T): T {
  if (q.type === 'spot_error') return q;
  const seed = parseInt(createHash('sha256').update(q.prompt).digest('hex').slice(0, 8), 16);
  const random = mulberry32(seed);
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { ...q, options: order.map((i) => q.options[i]!), answer: order.indexOf(q.answer) };
}
