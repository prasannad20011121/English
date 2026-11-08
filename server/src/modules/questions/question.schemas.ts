import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Tap-to-answer types. fill_blank and spot_error are also reused as listening tasks. */
export const WRITTEN_TYPES = [
  'fill_blank',
  'spot_error',
  'sentence_completion',
  'synonym',
  'antonym',
] as const;

/** Question types answered by speaking. */
export const VOICE_TYPES = [
  'read_aloud',
  'repeat',
  'short_answer',
  'sentence_build',
  'conversation',
  'story_retell',
  'topic_talk',
] as const;

export const QUESTION_TYPES = [...WRITTEN_TYPES, ...VOICE_TYPES] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type VoiceType = (typeof VOICE_TYPES)[number];

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
  'pronunciation',
  'fluency',
  'listening',
  'comprehension',
] as const;
export type Tag = (typeof TAGS)[number];

/** Answer index meaning "No error" in spot-the-error questions (segments are 0–3). */
export const NO_ERROR = 4;
export const BLANK = '___';

const text = (max: number) => z.string().trim().min(1).max(max);
export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const options = z
  .array(text(120))
  .length(4, 'Give exactly 4 options')
  .refine(
    (list) => new Set(list.map(normalizeText)).size === list.length,
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
      if (q.correction && normalizeText(q.correction) !== normalizeText(original)) {
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
    const fixed = normalizeText(q.correction);
    if (fixed === normalizeText(original)) {
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
      const at = fixed.indexOf(normalizeText(segment), from);
      if (at < 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['correction'],
          message: `Part ${'ABCD'[i]} must stay unchanged in the correction`,
        });
      } else {
        from = at + normalizeText(segment).length;
      }
    });
  });

// ---- Voice types -----------------------------------------------------------------------------

const voiceBase = {
  difficulty: z.number().int().min(1).max(3),
  tags: z.array(z.enum(TAGS)).min(1).max(3),
  /** Optional tip or explanation shown after answering. */
  explanation: text(500).optional(),
  /** Overrides the task's default preparation / answer time. */
  prepSeconds: z.number().int().min(0).max(120).optional(),
  answerSeconds: z.number().int().min(3).max(180).optional(),
};

const sentence = text(300).refine(
  (s) => !s.includes(BLANK),
  'A spoken sentence cannot have a blank',
);
const answers = z
  .array(text(60))
  .min(1, 'Give at least one accepted answer')
  .max(8)
  .refine(
    (list) => new Set(list.map(normalizeText)).size === list.length,
    'Accepted answers must all be different',
  );

const wordsOf = (s: string) => normalizeText(s).split(' ').filter(Boolean);

const readAloud = z.object({ type: z.literal('read_aloud'), prompt: sentence, ...voiceBase });
const repeat = z.object({ type: z.literal('repeat'), prompt: sentence, ...voiceBase });

const shortAnswer = z.object({
  type: z.literal('short_answer'),
  /** The question that is read aloud. */
  prompt: text(300),
  acceptedAnswers: answers,
  ...voiceBase,
  explanation: text(500).min(10, 'Explain the answer in a sentence'),
});

const sentenceBuild = z
  .object({
    type: z.literal('sentence_build'),
    /** The correct sentence (never read aloud). */
    prompt: sentence,
    /** The phrases in the jumbled order they are read aloud. */
    phrases: z.array(text(120)).min(3, 'Give 3 phrases').max(4),
    ...voiceBase,
  })
  .superRefine((q, ctx) => {
    const fromPhrases = q.phrases.flatMap(wordsOf).sort().join(' ');
    if (fromPhrases !== wordsOf(q.prompt).sort().join(' ')) {
      ctx.addIssue({
        code: 'custom',
        path: ['phrases'],
        message: 'The phrases must use exactly the words of the sentence',
      });
    }
    if (wordsOf(q.phrases.join(' ')).join(' ') === wordsOf(q.prompt).join(' ')) {
      ctx.addIssue({
        code: 'custom',
        path: ['phrases'],
        message: 'Put the phrases in a jumbled order',
      });
    }
  });

const conversation = z.object({
  type: z.literal('conversation'),
  script: z
    .array(z.object({ speaker: z.enum(['A', 'B']), text: text(300) }))
    .min(2, 'Write at least 2 turns')
    .max(6),
  /** The question asked after the dialogue. */
  prompt: text(300),
  acceptedAnswers: answers,
  ...voiceBase,
  explanation: text(500).min(10, 'Explain the answer in a sentence'),
});

const storyRetell = z.object({
  type: z.literal('story_retell'),
  /** A short title. */
  prompt: text(80),
  passage: text(900).refine((p) => wordsOf(p).length >= 35, 'Write a story of at least 35 words'),
  keyPoints: z
    .array(
      z.object({
        label: text(120),
        /** Any of these words in the retelling counts as covering the point. */
        keywords: z.array(text(40)).min(1).max(6),
      }),
    )
    .min(3, 'Give at least 3 key points')
    .max(6),
  ...voiceBase,
});

const topicTalk = z.object({
  type: z.literal('topic_talk'),
  prompt: text(200),
  hints: z.array(text(120)).min(2, 'Give 2–4 hints').max(4),
  sampleAnswer: text(1500).optional(),
  ...voiceBase,
});

/** The authoring format of a question (seed files, admin editor, AI drafts). */
export const questionContentSchema = z.discriminatedUnion('type', [
  blankQuestion('fill_blank'),
  blankQuestion('sentence_completion'),
  wordQuestion('synonym'),
  wordQuestion('antonym'),
  spotErrorQuestion,
  readAloud,
  repeat,
  shortAnswer,
  sentenceBuild,
  conversation,
  storyRetell,
  topicTalk,
]);
export type QuestionContent = z.infer<typeof questionContentSchema>;

/** Stored `prompt`: the sentence (spot-the-error parts joined), question, title or topic. */
export function promptOf(q: QuestionContent): string {
  return q.type === 'spot_error' ? q.segments.join(' ') : q.prompt;
}

/** Extra content that makes two questions with the same prompt different. */
function extrasOf(q: QuestionContent): string[] {
  switch (q.type) {
    case 'spot_error':
      return [...q.segments];
    case 'fill_blank':
    case 'sentence_completion':
    case 'synonym':
    case 'antonym':
      return [...q.options];
    case 'short_answer':
      return [...q.acceptedAnswers];
    case 'sentence_build':
      return [...q.phrases];
    case 'conversation':
      return q.script.map((t) => t.text);
    case 'story_retell':
      return [q.passage];
    default:
      return [];
  }
}

/** Stable fingerprint used to block duplicates (independent of the order of the options). */
export function contentHash(q: QuestionContent): string {
  return createHash('sha256')
    .update(
      [q.type, normalizeText(promptOf(q)), ...extrasOf(q).map(normalizeText).sort()].join('|'),
    )
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
 * Questions without options (spot-the-error and the voice types) are returned unchanged.
 */
export function shuffleOptions<T extends QuestionContent>(q: T): T {
  if (!('options' in q)) return q;
  const seed = parseInt(createHash('sha256').update(q.prompt).digest('hex').slice(0, 8), 16);
  const random = mulberry32(seed);
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { ...q, options: order.map((i) => q.options[i]!), answer: order.indexOf(q.answer) };
}
