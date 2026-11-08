import { Schema, model } from 'mongoose';
import { WRITTEN_TYPES } from '../modules/questions/question.schemas.js';

/** What one student has seen: drives "no repeats" and "review my mistakes". */
const seenQuestionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questionId: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
    type: { type: String, enum: WRITTEN_TYPES, required: true },
    timesSeen: { type: Number, default: 0 },
    timesCorrect: { type: Number, default: 0 },
    lastCorrect: { type: Boolean, required: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: false },
);

seenQuestionSchema.index({ userId: 1, questionId: 1 }, { unique: true });
seenQuestionSchema.index({ userId: 1, type: 1, lastCorrect: 1, lastSeenAt: 1 });

export const SeenQuestion = model('SeenQuestion', seenQuestionSchema);
