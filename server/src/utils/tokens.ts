import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ROLES, type Role } from '../models/user.model.js';

const ISSUER = 'shl-english-practice';

export interface AuthUser {
  id: string;
  role: Role;
}

export function signAccessToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: user.id,
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

/** Returns the user in a valid access token, or null if it is missing, expired or tampered with. */
export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    if (typeof payload === 'string' || !payload.sub) return null;
    const role = (payload as { role?: unknown }).role;
    if (!ROLES.includes(role as Role)) return null;
    return { id: payload.sub, role: role as Role };
  } catch {
    return null;
  }
}

/** A URL-safe random token (refresh tokens, password reset tokens). */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
