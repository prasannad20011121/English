import { Router } from 'express';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import {
  practiceRouter,
  questionsRouter,
  statsHandler,
} from '../modules/practice/practice.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users/me/stats', statsHandler);
apiRouter.use('/users', usersRouter);
apiRouter.use('/practice', practiceRouter);
apiRouter.use('/questions', questionsRouter);
apiRouter.use('/admin', adminRouter);
