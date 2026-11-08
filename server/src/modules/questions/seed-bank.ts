import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Question } from '../../models/question.model.js';
import {
  contentHash,
  promptOf,
  questionContentSchema,
  shuffleOptions,
  type QuestionContent,
} from './question.schemas.js';

/** server/seed/questions, both from src/ (tsx) and dist/ (node). */
export const SEED_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../seed/questions',
);

export interface SeedProblem {
  file: string;
  index: number;
  message: string;
}

/** Reads and validates every seed file. Returns the questions and any problems found. */
export function loadSeedQuestions(dir = SEED_DIR): {
  questions: QuestionContent[];
  problems: SeedProblem[];
} {
  const questions: QuestionContent[] = [];
  const problems: SeedProblem[] = [];
  const seen = new Map<string, string>();

  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const raw: unknown = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    if (!Array.isArray(raw)) {
      problems.push({ file, index: -1, message: 'File must contain a JSON array' });
      continue;
    }
    raw.forEach((item, index) => {
      const parsed = questionContentSchema.safeParse(item);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        problems.push({ file, index, message: `${issue.path.join('.')}: ${issue.message}` });
        return;
      }
      const hash = contentHash(parsed.data);
      const duplicateOf = seen.get(hash);
      if (duplicateOf) {
        problems.push({ file, index, message: `Duplicate of ${duplicateOf}` });
        return;
      }
      seen.set(hash, `${file}#${index}`);
      questions.push(shuffleOptions(parsed.data));
    });
  }
  return { questions, problems };
}

/** Database fields for a validated question. */
export function toQuestionFields(q: QuestionContent) {
  const common = {
    type: q.type,
    tags: q.tags,
    difficulty: q.difficulty,
    prompt: promptOf(q),
    contentHash: contentHash(q),
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...('prepSeconds' in q && q.prepSeconds !== undefined ? { prepSeconds: q.prepSeconds } : {}),
    ...('answerSeconds' in q && q.answerSeconds !== undefined
      ? { answerSeconds: q.answerSeconds }
      : {}),
  };
  switch (q.type) {
    case 'spot_error':
      return {
        ...common,
        segments: q.segments,
        answer: q.answer,
        ...(q.correction ? { correction: q.correction } : {}),
      };
    case 'fill_blank':
    case 'sentence_completion':
    case 'synonym':
    case 'antonym':
      return { ...common, options: q.options, answer: q.answer };
    case 'short_answer':
      return { ...common, acceptedAnswers: q.acceptedAnswers };
    case 'conversation':
      return { ...common, script: q.script, acceptedAnswers: q.acceptedAnswers };
    case 'sentence_build':
      return { ...common, phrases: q.phrases };
    case 'story_retell':
      return { ...common, passage: q.passage, keyPoints: q.keyPoints };
    case 'topic_talk':
      return {
        ...common,
        hints: q.hints,
        ...(q.sampleAnswer ? { sampleAnswer: q.sampleAnswer } : {}),
      };
    default:
      return common;
  }
}

/**
 * Inserts seed questions that are not in the database yet (matched by content hash).
 * Existing questions are left alone so admin edits, statuses and stats survive re-seeding.
 */
export async function seedQuestions(
  questions: QuestionContent[],
): Promise<{ inserted: number; existing: number }> {
  if (!questions.length) return { inserted: 0, existing: 0 };
  const result = await Question.bulkWrite(
    questions.map((q) => {
      const fields = toQuestionFields(q);
      return {
        updateOne: {
          filter: { contentHash: fields.contentHash },
          update: { $setOnInsert: { ...fields, status: 'published', source: 'seed' } },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );
  return { inserted: result.upsertedCount, existing: questions.length - result.upsertedCount };
}
