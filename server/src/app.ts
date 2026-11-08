import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { allowedOrigins, env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        // Only ask browsers to upgrade to HTTPS when the app is actually served over HTTPS.
        directives: { upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null },
      },
    }),
  );
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use('/api', apiRouter);
  app.use('/api', notFound);

  if (env.SERVE_CLIENT) serveClient(app);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

/** Serves the built Angular app, falling back to index.html for client-side routes. */
function serveClient(app: Express): void {
  const dist = path.resolve(env.CLIENT_DIST);
  const indexHtml = path.join(dist, 'index.html');
  if (!existsSync(indexHtml)) {
    logger.warn({ dist }, 'SERVE_CLIENT is on but the client build was not found');
    return;
  }
  app.use(express.static(dist, { index: false, maxAge: '7d' }));
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}
