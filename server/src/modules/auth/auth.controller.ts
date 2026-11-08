import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env.js';
import { authUser } from '../../middleware/auth.js';
import * as auth from './auth.service.js';

export const REFRESH_COOKIE = 'rt';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/auth',
  };
}

function clientMeta(req: Request): auth.ClientMeta {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sendSession(res: Response, session: auth.Session, status = 200): void {
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...cookieOptions(),
    expires: session.refreshExpiresAt,
  });
  res.status(status).json({ user: session.user, accessToken: session.accessToken });
}

export const register: RequestHandler = async (req, res) => {
  sendSession(res, await auth.register(req.body, clientMeta(req)), 201);
};

export const login: RequestHandler = async (req, res) => {
  sendSession(res, await auth.login(req.body, clientMeta(req)));
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    sendSession(res, await auth.refresh(readRefreshCookie(req), clientMeta(req)));
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await auth.logout(readRefreshCookie(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  res.status(204).end();
};

export const me: RequestHandler = async (req, res) => {
  res.json({ user: await auth.getUser(authUser(req).id) });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await auth.requestPasswordReset(req.body.email);
  res.json({ message: 'If an account exists for this email, a reset link has been sent.' });
};

export const resetPassword: RequestHandler = async (req, res) => {
  sendSession(res, await auth.resetPassword(req.body.token, req.body.password, clientMeta(req)));
};

export const changePassword: RequestHandler = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  sendSession(
    res,
    await auth.changePassword(authUser(req).id, currentPassword, newPassword, clientMeta(req)),
  );
};
