import { Router } from 'express';
import { dbStatus } from '../../config/db.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = dbStatus();
  res.status(db === 'up' ? 200 : 503).json({
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    uptime: Math.round(process.uptime()),
  });
});
