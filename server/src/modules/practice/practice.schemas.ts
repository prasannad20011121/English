import { z } from 'zod';
import { REPORT_REASONS } from '../../models/question.model.js';
import { VOICE_TASKS } from '../voice/tasks.js';

export const startSessionSchema = z
  .object({
    mode: z.enum(['practice', 'review', 'test']).default('practice'),
    task: z.enum(VOICE_TASKS).optional(),
    count: z.union([z.literal(5), z.literal(10)]).default(5),
    difficulty: z.number().int().min(1).max(3).optional(),
  })
  .refine((v) => v.mode !== 'practice' || v.task, {
    message: 'Choose a task',
    path: ['task'],
  });
export type StartSessionInput = z.infer<typeof startSessionSchema>;

/** Text fields sent with the audio file (multipart/form-data). */
export const answerFieldsSchema = z.object({
  questionId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid question'),
  durationMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(10 * 60 * 1000),
  timeMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 1000)
    .default(0),
  /** From the browser's speech recognition, used when Whisper is not configured. */
  clientTranscript: z.string().max(5000).optional(),
  /** JSON of { firstSoundMs, speechMs, pauses, longPauses } measured while recording. */
  clientMetrics: z
    .string()
    .max(2000)
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      try {
        const parsed = z
          .object({
            firstSoundMs: z.number().min(0).optional(),
            speechMs: z.number().min(0).optional(),
            pauses: z.number().int().min(0).optional(),
            longPauses: z.number().int().min(0).optional(),
          })
          .parse(JSON.parse(raw));
        return parsed;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid clientMetrics' });
        return z.NEVER;
      }
    }),
});
export type AnswerFields = z.infer<typeof answerFieldsSchema>;

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  note: z.string().trim().max(300).optional(),
});

export const statsQuerySchema = z.object({ tz: z.string().max(64).optional() });
