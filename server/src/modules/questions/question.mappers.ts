import type { Types } from 'mongoose';
import type { QuestionFields } from '../../models/question.model.js';

type StoredQuestion = QuestionFields & { _id: Types.ObjectId };

/** What a student may see before answering: no answer, correction or explanation. */
export interface PublicQuestion {
  id: string;
  type: QuestionFields['type'];
  prompt: string;
  segments?: string[];
  options?: string[];
  tags: string[];
  difficulty: number;
}

/** Shown after the student answers. */
export interface QuestionReveal {
  answer: number;
  correction: string | null;
  explanation: string;
}

export function toPublicQuestion(q: StoredQuestion): PublicQuestion {
  return {
    id: String(q._id),
    type: q.type,
    prompt: q.prompt,
    ...(q.segments?.length ? { segments: [...q.segments] } : {}),
    ...(q.options?.length ? { options: [...q.options] } : {}),
    tags: [...(q.tags ?? [])],
    difficulty: q.difficulty,
  };
}

export function toReveal(q: StoredQuestion): QuestionReveal {
  return {
    answer: q.answer,
    correction: q.correction ?? null,
    explanation: q.explanation,
  };
}
