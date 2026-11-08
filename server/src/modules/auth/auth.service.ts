import type { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { RefreshToken, type RevokeReason } from '../../models/refresh-token.model.js';
import { User, toPublicUser, type PublicUser, type UserDoc } from '../../models/user.model.js';
import { mailer } from '../../services/mail/mailer.js';
import { AppError } from '../../utils/app-error.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../utils/password.js';
import { randomToken, sha256, signAccessToken } from '../../utils/tokens.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
/**
 * Two browser tabs can refresh with the same cookie at almost the same moment. A token that was
 * rotated within this window is treated as that harmless race, not as theft.
 */
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const invalidCredentials = () =>
  AppError.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
const sessionExpired = () =>
  AppError.unauthorized('Your session has expired. Please log in again.', 'SESSION_EXPIRED');

async function issueSession(user: UserDoc, meta: ClientMeta): Promise<Session> {
  const refreshToken = randomToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip?.slice(0, 64),
  });
  return {
    user: toPublicUser(user),
    accessToken: signAccessToken({ id: user.id as string, role: user.role }),
    refreshToken,
    refreshExpiresAt,
  };
}

export async function revokeAllSessions(
  userId: Types.ObjectId | string,
  reason: RevokeReason,
): Promise<void> {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: reason },
  );
}

export async function register(input: RegisterInput, meta: ClientMeta): Promise<Session> {
  if (await User.exists({ email: input.email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
      fields: { email: 'An account with this email already exists' },
    });
  }
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    college: input.college || undefined,
    targetExamDate: input.targetExamDate ?? undefined,
    consentAudioAt: new Date(),
    role: 'student',
    lastLoginAt: new Date(),
  });
  return issueSession(user, meta);
}

export async function login(input: LoginInput, meta: ClientMeta): Promise<Session> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) {
    await burnPasswordCheck(input.password);
    throw invalidCredentials();
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    throw invalidCredentials();
  }
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, meta);
}

/** Exchanges a refresh token for a new access token, rotating the refresh token. */
export async function refresh(token: string | undefined, meta: ClientMeta): Promise<Session> {
  if (!token) throw sessionExpired();
  const now = new Date();
  const tokenHash = sha256(token);

  const current = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now, revokedReason: 'rotated' },
  );

  if (!current) {
    const existing = await RefreshToken.findOne({ tokenHash });
    if (!existing || existing.expiresAt <= now || existing.revokedReason !== 'rotated') {
      // Unknown, expired, or ended by logout / password change.
      throw sessionExpired();
    }

    const revokedAgo = now.getTime() - (existing.revokedAt?.getTime() ?? 0);
    if (revokedAgo > REFRESH_REUSE_GRACE_MS) {
      // An already-rotated token was used again: it may have been stolen. End every session.
      logger.warn({ userId: String(existing.userId) }, 'Refresh token reuse detected');
      await revokeAllSessions(existing.userId, 'reuse_detected');
      throw AppError.unauthorized(
        'Your session has ended. Please log in again.',
        'SESSION_REVOKED',
      );
    }
    // Harmless race between tabs: let this one continue with a fresh token.
    const user = await User.findById(existing.userId);
    if (!user) throw sessionExpired();
    return issueSession(user, meta);
  }

  const user = await User.findById(current.userId);
  if (!user) throw sessionExpired();
  const session = await issueSession(user, meta);
  await RefreshToken.updateOne(
    { _id: current._id },
    { replacedByHash: sha256(session.refreshToken) },
  );
  return session;
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await RefreshToken.updateOne(
    { tokenHash: sha256(token), revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'logout' },
  );
}

export async function getUser(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId);
  if (!user) throw AppError.unauthorized('Your account no longer exists.', 'USER_NOT_FOUND');
  return toPublicUser(user);
}

/** Always resolves, whether or not the email exists, so accounts cannot be discovered. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user) return;

  const token = randomToken(32);
  user.passwordResetTokenHash = sha256(token);
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await mailer.send({
      to: user.email,
      subject: 'Reset your SHL English Practice password',
      text:
        `Hi ${user.name},\n\n` +
        `Use this link to set a new password. It works once and expires in 30 minutes:\n${link}\n\n` +
        `If you did not ask for this, you can ignore this email.`,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send password reset email');
  }
}

export async function resetPassword(
  token: string,
  password: string,
  meta: ClientMeta,
): Promise<Session> {
  const user = await User.findOne({
    passwordResetTokenHash: sha256(token),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) {
    throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.');
  }
  user.passwordHash = await hashPassword(password);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = new Date();
  await user.save();
  await revokeAllSessions(user._id, 'password_change');
  return issueSession(user, meta);
}

/** Changes the password and ends all other sessions; returns a fresh session for this device. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta: ClientMeta,
): Promise<Session> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw AppError.unauthorized('Your account no longer exists.', 'USER_NOT_FOUND');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect.', {
      fields: { currentPassword: 'Current password is incorrect' },
    });
  }
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await revokeAllSessions(user._id, 'password_change');
  return issueSession(user, meta);
}
