import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { TAGS, WRITTEN_TYPES } from '../modules/questions/question.schemas.js';

export const QUESTION_STATUSES = ['draft', 'published', 'flagged', 'retired'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export const QUESTION_SOURCES = ['seed', 'ai', 'manual'] as const;
export const REPORT_REASONS = ['wrong_answer', 'unclear', 'typo', 'other'] as const;

/** Reports from this many different students hide a question until an admin reviews it. */
export const FLAG_THRESHOLD = 2;

const questionSchema = new Schema(
  {
    type: { type: String, enum: WRITTEN_TYPES, required: true },
    tags: { type: [String], enum: TAGS, default: [] },
    difficulty: { type: Number, min: 1, max: 3, required: true },
    /** The sentence. Fill-blank: contains `___`. Synonym/antonym: target word as **word**. */
    prompt: { type: String, required: true },
    /** Spot-the-error parts A–D. */
    segments: { type: [String], default: undefined },
    options: { type: [String], default: undefined },
    /** Index of the right option; spot-the-error: 0–3 = wrong part, 4 = no error. */
    answer: { type: Number, required: true },
    correction: { type: String },
    explanation: { type: String, required: true },
    status: { type: String, enum: QUESTION_STATUSES, default: 'draft', index: true },
    source: { type: String, enum: QUESTION_SOURCES, required: true },
    contentHash: { type: String, required: true, unique: true },
    /** Who added it (admin generating AI drafts or writing manually). */
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    /** The model that wrote an AI draft. */
    aiModel: { type: String },
    stats: {
      attempts: { type: Number, default: 0 },
      correct: { type: Number, default: 0 },
    },
    reports: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          reason: { type: String, enum: REPORT_REASONS, required: true },
          note: { type: String, maxlength: 300 },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

questionSchema.index({ type: 1, status: 1, difficulty: 1 });
questionSchema.index({ tags: 1 });

export type QuestionFields = InferSchemaType<typeof questionSchema>;
export type QuestionDoc = HydratedDocument<QuestionFields>;
export const Question = model('Question', questionSchema);
