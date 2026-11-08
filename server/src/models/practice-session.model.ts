import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { VOICE_TASKS } from '../modules/voice/tasks.js';

export const PRACTICE_MODES = ['practice', 'review', 'test'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

const itemSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    task: { type: String, enum: VOICE_TASKS, required: true },
    /** Index into the test template's sections (mock tests only). */
    section: { type: Number },
    answeredAt: { type: Date, default: null },
    /** Time from the prompt finishing to submitting. */
    timeMs: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    score: { type: Number, default: null },
    correct: { type: Boolean, default: null },
    skills: { type: Schema.Types.Mixed, default: null },
    transcript: { type: String, default: null },
    audioId: { type: Schema.Types.ObjectId, default: null },
    sttSource: { type: String, enum: ['whisper', 'browser', 'none', null], default: null },
    /** Alignment, metrics, feedback, reveal and key points from the evaluator. */
    result: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const practiceSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: PRACTICE_MODES, default: 'practice' },
    /** The task of a practice round; null for reviews and mock tests (mixed tasks). */
    task: { type: String, enum: [...VOICE_TASKS, null], default: null },
    filters: { difficulty: { type: Number, min: 1, max: 3 } },
    items: { type: [itemSchema], default: [] },
    /** Number of answers judged correct. */
    score: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'finished'], default: 'active' },
    finishedAt: { type: Date },
    /** Overall result, stored when a session finishes. */
    overall: { type: Number, default: null },
  },
  { timestamps: true },
);

practiceSessionSchema.index({ userId: 1, createdAt: -1 });
practiceSessionSchema.index({ userId: 1, 'items.answeredAt': 1 });
practiceSessionSchema.index({ userId: 1, mode: 1, status: 1 });

export type PracticeSessionFields = InferSchemaType<typeof practiceSessionSchema>;
export type PracticeSessionDoc = HydratedDocument<PracticeSessionFields>;
export const PracticeSession = model('PracticeSession', practiceSessionSchema);
