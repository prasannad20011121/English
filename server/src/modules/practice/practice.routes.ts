import { Router } from 'express';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import {
  answerSchema,
  reportSchema,
  startSessionSchema,
  statsQuerySchema,
} from './practice.schemas.js';
import * as practice from './practice.service.js';

export const practiceRouter = Router();
practiceRouter.use(requireAuth);

practiceRouter.get('/written/catalog', async (req, res) => {
  res.json(await practice.writtenCatalog(authUser(req).id));
});

practiceRouter.post('/sessions', validateBody(startSessionSchema), async (req, res) => {
  res.status(201).json(await practice.startSession(authUser(req).id, req.body));
});

practiceRouter.get('/sessions/:id', async (req, res) => {
  res.json(await practice.getSession(authUser(req).id, req.params.id));
});

practiceRouter.post('/sessions/:id/answers', validateBody(answerSchema), async (req, res) => {
  res.json(await practice.answerQuestion(authUser(req).id, String(req.params.id), req.body));
});

practiceRouter.post('/sessions/:id/finish', async (req, res) => {
  res.json(await practice.finishSession(authUser(req).id, req.params.id));
});

/** Mounted at /api/questions. */
export const questionsRouter = Router();
questionsRouter.use(requireAuth);

questionsRouter.post('/:id/report', validateBody(reportSchema), async (req, res) => {
  await practice.reportQuestion(
    authUser(req).id,
    String(req.params.id),
    req.body.reason,
    req.body.note,
  );
  res.status(202).json({ message: 'Thanks! We will review this question.' });
});

/** Mounted at /api/users/me/stats. */
export const statsHandler = Router();
statsHandler.get('/', requireAuth, async (req, res) => {
  const { tz } = statsQuerySchema.parse(req.query);
  res.json(await practice.practiceStats(authUser(req).id, tz));
});
