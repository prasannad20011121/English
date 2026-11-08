import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const ROLES = ['student', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Accent used for text-to-speech prompts in listening tasks (later phases). */
export const TTS_ACCENTS = ['en-IN', 'en-US', 'en-GB'] as const;
export type TtsAccent = (typeof TTS_ACCENTS)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'student', required: true, index: true },
    college: { type: String, trim: true, maxlength: 120 },
    targetExamDate: { type: Date },
    /** When the user agreed to their voice answers being recorded and analysed. */
    consentAudioAt: { type: Date },
    settings: {
      ttsAccent: { type: String, enum: TTS_ACCENTS, default: 'en-IN' },
    },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserFields = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserFields>;

export const User = model('User', userSchema);

/** The only shape of a user that is ever sent to clients. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  college: string | null;
  targetExamDate: string | null;
  settings: { ttsAccent: TtsAccent };
  createdAt: string | null;
  lastLoginAt: string | null;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toPublicUser(user: UserDoc): PublicUser {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    college: user.college ?? null,
    targetExamDate: iso(user.targetExamDate),
    settings: { ttsAccent: (user.settings?.ttsAccent ?? 'en-IN') as TtsAccent },
    createdAt: iso(user.createdAt),
    lastLoginAt: iso(user.lastLoginAt),
  };
}
