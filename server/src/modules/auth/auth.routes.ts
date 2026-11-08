import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as ctrl from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schemas.js';

/** A separate limit per route: 20 attempts per 15 minutes per IP address. */
const limiter = (limit = 20) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many attempts. Please wait a few minutes and try again.',
        },
      });
    },
  });

export const authRouter = Router();

authRouter.post('/register', limiter(), validateBody(registerSchema), ctrl.register);
authRouter.post('/login', limiter(), validateBody(loginSchema), ctrl.login);
authRouter.post('/refresh', limiter(120), ctrl.refresh);
authRouter.post('/logout', ctrl.logout);
authRouter.get('/me', requireAuth, ctrl.me);
authRouter.post(
  '/forgot-password',
  limiter(5),
  validateBody(forgotPasswordSchema),
  ctrl.forgotPassword,
);
authRouter.post(
  '/reset-password',
  limiter(),
  validateBody(resetPasswordSchema),
  ctrl.resetPassword,
);
authRouter.post(
  '/change-password',
  limiter(),
  requireAuth,
  validateBody(changePasswordSchema),
  ctrl.changePassword,
);
