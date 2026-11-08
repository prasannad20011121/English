import type { AuthUser } from '../utils/tokens.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` once the access token is verified. */
      user?: AuthUser;
    }
  }
}

export {};
