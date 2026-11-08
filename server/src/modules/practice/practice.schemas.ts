import { z } from 'zod';
import { REPORT_REASONS } from '../../models/question.model.js';
import { TAGS, WRITTEN_TYPES } from '../questions/question.schemas.js';

export const startSessionSchema = z
  .object({
    mode: z.enum(['practice', 'review']).default('practice'),
    type: z.enum(WRITTEN_TYPES).optional(),
    count: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
    difficulty: z.number().int().min(1).max(3).optional(),
    tags: z.array(z.enum(TAGS)).max(TAGS.length).optional(),
  })
  .refine((v) => v.mode === 'review' || v.type, {
    message: 'Choose a question type',
    path: ['type'],
  });
export type StartSessionInput = z.infer<typeof startSessionSchema>;

export const answerSchema = z.object({
  questionId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid question'),
  chosen: z.number().int().min(0).max(4),
  timeMs: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 1000)
    .default(0),
});
export type AnswerInput = z.infer<typeof answerSchema>;

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(300).optional(),
});

export const statsQuerySchema = z.object({ tz: z.string().max(64).optional() });
