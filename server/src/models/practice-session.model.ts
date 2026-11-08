import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { TAGS, WRITTEN_TYPES } from '../modules/questions/question.schemas.js';

export const PRACTICE_MODES = ['practice', 'review'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

const itemSchema = new Schema(
  {
    question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    chosen: { type: Number, default: null },
    correct: { type: Boolean, default: null },
    timeMs: { type: Number, default: null },
    answeredAt: { type: Date, default: null },
  },
  { _id: false },
);

const practiceSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mode: { type: String, enum: PRACTICE_MODES, default: 'practice' },
    /** Null for a mixed "review my mistakes" session. */
    type: { type: String, enum: [...WRITTEN_TYPES, null], default: null },
    filters: {
      difficulty: { type: Number, min: 1, max: 3 },
      tags: { type: [String], enum: TAGS, default: undefined },
    },
    items: { type: [itemSchema], default: [] },
    score: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'finished'], default: 'active' },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

practiceSessionSchema.index({ userId: 1, createdAt: -1 });
practiceSessionSchema.index({ userId: 1, 'items.answeredAt': 1 });

export type PracticeSessionFields = InferSchemaType<typeof practiceSessionSchema>;
export type PracticeSessionDoc = HydratedDocument<PracticeSessionFields>;
export const PracticeSession = model('PracticeSession', practiceSessionSchema);
