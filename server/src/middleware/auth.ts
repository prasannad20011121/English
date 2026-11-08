import type { Request, RequestHandler } from 'express';
import type { Role } from '../models/user.model.js';
import { AppError } from '../utils/app-error.js';
import { verifyAccessToken, type AuthUser } from '../utils/tokens.js';

/** Requires a valid `Authorization: Bearer <access token>` header. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw AppError.unauthorized();
  }
  const user = verifyAccessToken(token);
  if (!user) {
    throw AppError.unauthorized('Your session has expired. Please log in again.', 'TOKEN_INVALID');
  }
  req.user = user;
  next();
};

/** Must run after `requireAuth`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
}

/** The authenticated user; only call in handlers behind `requireAuth`. */
export function authUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
