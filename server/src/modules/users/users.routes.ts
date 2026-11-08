import { Router } from 'express';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { getUser } from '../auth/auth.service.js';
import { updateProfileSchema } from './users.schemas.js';
import { updateProfile } from './users.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get('/me', async (req, res) => {
  res.json({ user: await getUser(authUser(req).id) });
});

usersRouter.patch('/me', validateBody(updateProfileSchema), async (req, res) => {
  res.json({ user: await updateProfile(authUser(req).id, req.body) });
});
