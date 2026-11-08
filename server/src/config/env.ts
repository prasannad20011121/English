import { existsSync } from 'node:fs';
import { z } from 'zod';

// Load server/.env for local development. Tests and containers pass real environment variables.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

const durationSchema = z.string().regex(/^\d+[smhd]$/, 'Use a duration like 15m, 1h or 7d');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    MONGO_URI: z.string().min(1).default('mongodb://localhost:27017/shl_english'),

    /** Comma-separated list of browser origins allowed to call the API. */
    CLIENT_ORIGIN: z.string().default('http://localhost:4200'),
    /** Public URL of the Angular app, used in emails (password reset links). */
    APP_URL: z.url().default('http://localhost:4200'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: durationSchema.default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(90).default(7),
    COOKIE_SECURE: z.stringbool().default(false),
    /** Use "none" (with COOKIE_SECURE=true) when the client and API are on different sites. */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    /** Set to true behind a reverse proxy (Render, Railway, nginx) so client IPs are correct. */
    TRUST_PROXY: z.stringbool().default(false),

    SMTP_URL: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined)),
    MAIL_FROM: z.string().default('SHL English Practice <no-reply@example.com>'),

    SERVE_CLIENT: z.stringbool().default(false),
    CLIENT_DIST: z.string().default('../client/dist/client/browser'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && /change-me/i.test(cfg.JWT_ACCESS_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Set a real random JWT_ACCESS_SECRET in production',
      });
    }
    if (cfg.COOKIE_SAMESITE === 'none' && !cfg.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
export type Env = typeof env;

export const allowedOrigins = env.CLIENT_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
