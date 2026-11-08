import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { env } from '../../config/env.js';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { getStt } from '../../services/speech/stt.client.js';
import { AppError } from '../../utils/app-error.js';
import {
  answerFieldsSchema,
  reportSchema,
  startSessionSchema,
  statsQuerySchema,
} from './practice.schemas.js';
import * as practice from './practice.service.js';

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/** Audio answers are kept in memory only long enough to store and transcribe them. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 10 },
  fileFilter: (_req, file, done) => {
    if (!/^(audio\/|video\/webm)/.test(file.mimetype)) {
      done(new AppError(415, 'UNSUPPORTED_AUDIO', 'Please upload an audio recording.'));
      return;
    }
    done(null, true);
  },
});

const answerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
});

export const practiceRouter = Router();
practiceRouter.use(requireAuth);

practiceRouter.get('/voice/catalog', async (req, res) => {
  res.json(await practice.voiceCatalog(authUser(req).id));
});

practiceRouter.get('/voice/config', (_req, res) => {
  res.json({ stt: getStt() ? 'whisper' : 'browser', maxAudioBytes: MAX_AUDIO_BYTES });
});

practiceRouter.get('/tests', async (req, res) => {
  res.json({ items: await practice.testHistory(authUser(req).id) });
});

practiceRouter.post('/sessions', validateBody(startSessionSchema), async (req, res) => {
  res.status(201).json(await practice.startSession(authUser(req).id, req.body));
});

practiceRouter.get('/sessions/:id', async (req, res) => {
  res.json(await practice.getSession(authUser(req).id, String(req.params.id)));
});

practiceRouter.post(
  '/sessions/:id/answers',
  answerLimiter,
  upload.single('audio'),
  validateBody(answerFieldsSchema),
  async (req, res) => {
    res.json(
      await practice.answerQuestion(authUser(req).id, String(req.params.id), req.body, req.file),
    );
  },
);

practiceRouter.post('/sessions/:id/finish', async (req, res) => {
  res.json(await practice.finishSession(authUser(req).id, String(req.params.id)));
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
