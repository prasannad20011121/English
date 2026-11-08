import { Schema, model, type InferSchemaType } from 'mongoose';

/** Only reuse of a `rotated` token looks like theft; the others are normal session ends. */
export const REVOKE_REASONS = ['rotated', 'logout', 'password_change', 'reuse_detected'] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];

/**
 * A refresh token session. Only the SHA-256 hash of the opaque token is stored.
 * Tokens are rotated on every refresh; reuse of an old token revokes the whole session family.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: REVOKE_REASONS },
    replacedByHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: true },
);

// MongoDB deletes expired sessions automatically.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenFields = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshToken = model('RefreshToken', refreshTokenSchema);
