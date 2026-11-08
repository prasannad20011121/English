import { Router } from 'express';
import { authUser, requireAuth } from '../../middleware/auth.js';
import { findRecording, streamRecording } from '../../services/storage/recordings.js';
import { AppError } from '../../utils/app-error.js';

/** Mounted at /api/recordings. Students can play only their own recordings; admins any. */
export const recordingsRouter = Router();
recordingsRouter.use(requireAuth);

recordingsRouter.get('/:id', async (req, res) => {
  const user = authUser(req);
  const file = await findRecording(String(req.params.id));
  // Same answer for "not found" and "not yours", so ids cannot be probed.
  if (!file || (file.userId !== user.id && user.role !== 'admin')) {
    throw AppError.notFound('Recording not found.');
  }

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.get('range') ?? '');
  if (range && file.length > 0) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1;
    if (start > end || start >= file.length) {
      res.status(416).setHeader('Content-Range', `bytes */${file.length}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${file.length}`);
    res.setHeader('Content-Length', String(end - start + 1));
    streamRecording(file.id, start, end).pipe(res);
    return;
  }
  res.setHeader('Content-Length', String(file.length));
  streamRecording(file.id).pipe(res);
});
