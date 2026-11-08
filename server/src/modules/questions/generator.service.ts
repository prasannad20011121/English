import type { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { Question, type QuestionFields } from '../../models/question.model.js';
import { getGrammarChecker } from '../../services/grammar/grammar-checker.js';
import { getLlm, parseJsonReply, type LlmClient } from '../../services/llm/llm.client.js';
import { AppError } from '../../utils/app-error.js';
import {
  NO_ERROR,
  contentHash,
  promptOf,
  questionContentSchema,
  shuffleOptions,
  type QuestionContent,
  type QuestionType,
  type Tag,
} from './question.schemas.js';
import { toQuestionFields } from './seed-bank.js';

export interface GenerateRequest {
  type: QuestionType;
  tag: Tag;
  difficulty: 1 | 2 | 3;
  count: number;
}

export interface Rejection {
  prompt: string | null;
  reason: string;
}

export interface GenerateReport {
  model: string;
  requested: number;
  created: string[];
  rejected: Rejection[];
  grammarChecked: boolean;
}

type StoredQuestion = QuestionFields & { _id: Types.ObjectId };

const TAG_NAMES: Record<Tag, string> = {
  articles: 'articles (a, an, the, no article)',
  prepositions: 'prepositions',
  tenses: 'verb tenses',
  subject_verb_agreement: 'subject–verb agreement',
  pronouns: 'pronouns',
  conjunctions: 'conjunctions and linking words',
  modals: 'modal verbs',
  comparatives: 'comparatives and superlatives',
  word_order: 'word order',
  vocabulary: 'vocabulary (word meaning)',
  collocations: 'collocations and fixed phrases',
};

const LEVELS = {
  1: 'easy: short everyday sentences testing very common rules',
  2: 'medium: typical placement-test sentences with intermediate rules',
  3: 'hard: longer sentences with tricky rules (inversion, conditionals, formal grammar, less common words)',
} as const;

const FORMATS: Record<QuestionType, string> = {
  fill_blank:
    '{"prompt": "a sentence with exactly one ___ blank replacing one word or short phrase", "options": ["4 options of the same kind; exactly one is correct"], "answer": <index 0-3 of the correct option>, "explanation": "one short sentence stating the rule"}',
  sentence_completion:
    '{"prompt": "the first part of a sentence, ending with ___", "options": ["4 possible endings; exactly one is grammatically correct"], "answer": <index 0-3>, "explanation": "one short sentence stating the rule"}',
  synonym:
    '{"prompt": "a sentence with ONE target word wrapped in **double asterisks**", "options": ["4 single words; exactly one is closest in meaning to the target word"], "answer": <index 0-3>, "explanation": "one short sentence explaining the meaning"}',
  antonym:
    '{"prompt": "a sentence with ONE target word wrapped in **double asterisks**", "options": ["4 single words; exactly one is most opposite in meaning to the target word"], "answer": <index 0-3>, "explanation": "one short sentence explaining the meaning"}',
  spot_error:
    '{"segments": ["the sentence split into 4 consecutive parts"], "answer": <index 0-3 of the part with the error, or 4 if the sentence is correct>, "correction": "the full corrected sentence, changing ONLY the wrong part (omit when answer is 4)", "explanation": "one short sentence stating the rule"}',
};

/** A question in the JSON shape the writer is asked to produce. */
function asAuthoring(q: StoredQuestion): Record<string, unknown> {
  return q.type === 'spot_error'
    ? {
        segments: q.segments,
        answer: q.answer,
        ...(q.correction ? { correction: q.correction } : {}),
        explanation: q.explanation,
      }
    : { prompt: q.prompt, options: q.options, answer: q.answer, explanation: q.explanation };
}

function writerMessages(req: GenerateRequest, examples: StoredQuestion[]) {
  const extra =
    req.type === 'spot_error'
      ? ' Make about one in five sentences fully correct (answer 4).'
      : ' Put the correct option in different positions across the questions.';
  return [
    {
      role: 'system' as const,
      content:
        'You write practice questions for Indian college students preparing for the SHL English test used in campus placements. ' +
        'Write ORIGINAL sentences in clear, natural British English about everyday, college and workplace situations. Never copy real test questions. ' +
        'Every question must have exactly one correct answer that any careful English teacher would agree with. ' +
        'Avoid anything that depends on American vs British usage, informal speech or regional variants. Reply with JSON only.',
    },
    {
      role: 'user' as const,
      content:
        `Write ${req.count} new ${req.type.replace('_', ' ')} questions.\n` +
        `Topic: ${TAG_NAMES[req.tag]}.\nDifficulty: ${LEVELS[req.difficulty]}.${extra}\n\n` +
        `Each question is a JSON object like:\n${FORMATS[req.type]}\n\n` +
        (examples.length
          ? `Examples of the style (do not repeat them):\n${examples.map((e) => JSON.stringify(asAuthoring(e))).join('\n')}\n\n`
          : '') +
        `Return {"questions": [ ... ]} with exactly ${req.count} items.`,
    },
  ];
}

function solverMessages(items: QuestionContent[]) {
  const listed = items.map((q, i) => {
    if (q.type === 'spot_error') {
      return {
        n: i + 1,
        task: 'Which part contains a grammatical error? Answer 0-3 for the part, or 4 if there is no error.',
        parts: q.segments,
      };
    }
    const task = {
      fill_blank: 'Which option correctly fills the blank (___)?',
      sentence_completion: 'Which option correctly completes the sentence?',
      synonym: 'Which option is closest in meaning to the word in **asterisks**?',
      antonym: 'Which option is most opposite in meaning to the word in **asterisks**?',
    }[q.type];
    return {
      n: i + 1,
      task: `${task} Answer with the option index 0-3.`,
      sentence: q.prompt,
      options: q.options,
    };
  });
  return [
    {
      role: 'system' as const,
      content:
        'You are a careful English teacher checking test questions. Solve each question on its own. Reply with JSON only.',
    },
    {
      role: 'user' as const,
      content: `Questions:\n${JSON.stringify(listed, null, 1)}\n\nReturn {"answers": [{"n": 1, "answer": <index>}, ...]} for every question.`,
    },
  ];
}

/** The sentence with the right answer in place (what should read as correct English). */
export function correctSentence(q: QuestionContent): string {
  switch (q.type) {
    case 'spot_error':
      return q.answer === NO_ERROR ? q.segments.join(' ') : q.correction!;
    case 'synonym':
    case 'antonym':
      return q.prompt.replace(/\*\*/g, '');
    default: {
      const option = q.options[q.answer]!;
      const fill = /^\(.*\)$/.test(option.trim()) ? '' : option;
      return q.prompt
        .replace('___', fill)
        .replace(/\s+/g, ' ')
        .replace(/\s([.,;?!])/g, '$1')
        .trim();
    }
  }
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

/** Share of words two sentences have in common (Jaccard similarity). */
export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

const NEAR_DUPLICATE = 0.75;

function describe(item: unknown): string | null {
  if (item && typeof item === 'object') {
    const o = item as { prompt?: unknown; segments?: unknown };
    if (typeof o.prompt === 'string') return o.prompt;
    if (Array.isArray(o.segments)) return o.segments.join(' ');
  }
  return null;
}

/**
 * Asks the AI to write questions, then keeps only the ones that pass every check. Survivors are
 * saved as drafts for an admin to review; nothing is shown to students until it is approved.
 */
export async function generateQuestions(
  req: GenerateRequest,
  createdBy?: string,
  llm: LlmClient | null = getLlm(),
): Promise<GenerateReport> {
  if (!llm) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'AI question writing is not set up. Add LLM_BASE_URL, LLM_MODEL and LLM_API_KEY to the server settings.',
    );
  }

  const examples = await Question.aggregate<StoredQuestion>([
    { $match: { type: req.type, status: 'published', tags: req.tag } },
    { $sample: { size: 3 } },
  ]);

  const reply = await llm.complete(writerMessages(req, examples), { temperature: 0.8, json: true });
  let rawItems: unknown[];
  try {
    const parsed = parseJsonReply(reply) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) throw new Error('missing "questions" array');
    rawItems = parsed.questions.slice(0, req.count);
  } catch (err) {
    logger.warn({ err, reply: reply.slice(0, 500) }, 'AI writer reply was not usable');
    throw new AppError(
      502,
      'LLM_BAD_REPLY',
      'The AI reply was not in the expected format. Try again.',
    );
  }

  const rejected: Rejection[] = [];
  const reject = (item: unknown, reason: string) =>
    rejected.push({ prompt: describe(item), reason });

  // 1. Structure, 2. duplicates.
  const existing = await Question.find({ type: req.type }).select('prompt contentHash').lean();
  const existingHashes = new Set(existing.map((q) => q.contentHash));
  const candidates: QuestionContent[] = [];
  for (const item of rawItems) {
    const withMeta =
      item && typeof item === 'object'
        ? { ...item, type: req.type, difficulty: req.difficulty, tags: [req.tag] }
        : item;
    const parsed = questionContentSchema.safeParse(withMeta);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      reject(item, `Format problem: ${issue.path.join('.') || 'question'} — ${issue.message}`);
      continue;
    }
    const q = shuffleOptions(parsed.data);
    const hash = contentHash(q);
    const prompt = promptOf(q);
    if (existingHashes.has(hash)) {
      reject(item, 'Duplicate of a question already in the bank');
      continue;
    }
    const twin = [...existing.map((e) => e.prompt), ...candidates.map(promptOf)].find(
      (p) => similarity(p, prompt) >= NEAR_DUPLICATE,
    );
    if (twin) {
      reject(item, `Too similar to an existing question: “${twin}”`);
      continue;
    }
    existingHashes.add(hash);
    candidates.push(q);
  }

  // 3. Blind solve: a second, independent pass must reach the same answer.
  let checked: QuestionContent[] = [];
  if (candidates.length) {
    const solved = await llm.complete(solverMessages(candidates), { temperature: 0, json: true });
    let answers = new Map<number, number>();
    try {
      const parsed = parseJsonReply(solved) as { answers?: { n?: unknown; answer?: unknown }[] };
      answers = new Map(
        (parsed.answers ?? [])
          .filter((a) => typeof a.n === 'number' && typeof a.answer === 'number')
          .map((a) => [a.n as number, a.answer as number]),
      );
    } catch {
      logger.warn({ reply: solved.slice(0, 500) }, 'AI checker reply was not usable');
    }
    candidates.forEach((q, i) => {
      const got = answers.get(i + 1);
      if (got === undefined) reject(q, 'The answer check did not return a result');
      else if (got !== q.answer) {
        reject(
          q,
          `The answer check chose ${q.type === 'spot_error' ? (got === NO_ERROR ? '"No error"' : `part ${'ABCD'[got] ?? got}`) : `option ${'ABCD'[got] ?? got}`} — the key may be wrong or the question ambiguous`,
        );
      } else checked.push(q);
    });
  }

  // 4. Optional grammar check of the corrected sentence.
  const grammar = getGrammarChecker();
  let grammarChecked = false;
  if (grammar && checked.length) {
    const kept: QuestionContent[] = [];
    try {
      for (const q of checked) {
        const problems = await grammar(correctSentence(q));
        if (problems.length)
          reject(q, `Grammar checker flagged the correct sentence: ${problems[0]}`);
        else kept.push(q);
      }
      checked = kept;
      grammarChecked = true;
    } catch (err) {
      logger.warn({ err }, 'Grammar check skipped (LanguageTool unavailable)');
    }
  }

  const created = checked.length
    ? await Question.insertMany(
        checked.map((q) => ({
          ...toQuestionFields(q),
          status: 'draft',
          source: 'ai',
          aiModel: llm.model,
          ...(createdBy ? { createdBy } : {}),
        })),
      )
    : [];

  logger.info(
    { type: req.type, tag: req.tag, created: created.length, rejected: rejected.length },
    'AI drafts generated',
  );
  return {
    model: llm.model,
    requested: req.count,
    created: created.map((q) => String(q._id)),
    rejected,
    grammarChecked,
  };
}
