import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';
import { logger } from '../../config/logger.js';

const BUCKET = 'recordings';

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

export interface RecordingMeta {
  userId: string;
  sessionId: string;
  questionId: string;
  durationMs: number;
}

/** Stores an answer recording in GridFS and returns its id. */
export async function saveRecording(
  audio: Buffer,
  contentType: string,
  meta: RecordingMeta,
): Promise<Types.ObjectId> {
  const upload = bucket().openUploadStream(`${meta.sessionId}-${meta.questionId}`, {
    metadata: { ...meta, userId: new Types.ObjectId(meta.userId), contentType },
  });
  await new Promise<void>((resolve, reject) => {
    Readable.from(audio)
      .pipe(upload)
      .on('finish', () => resolve())
      .on('error', reject);
  });
  return upload.id as Types.ObjectId;
}

export interface StoredRecording {
  id: Types.ObjectId;
  length: number;
  contentType: string;
  userId: string;
}

export async function findRecording(id: string): Promise<StoredRecording | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const file = await bucket()
    .find({ _id: new Types.ObjectId(id) })
    .next();
  if (!file) return null;
  const meta = (file.metadata ?? {}) as { userId?: unknown; contentType?: string };
  return {
    id: file._id as Types.ObjectId,
    length: file.length,
    contentType: meta.contentType ?? 'audio/webm',
    userId: String(meta.userId ?? ''),
  };
}

/** Streams bytes [start, end] (inclusive) of a recording. */
export function streamRecording(id: Types.ObjectId, start?: number, end?: number) {
  return bucket().openDownloadStream(id, {
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end: end + 1 } : {}),
  });
}

export async function deleteRecording(id: Types.ObjectId): Promise<void> {
  await bucket()
    .delete(id)
    .catch(() => undefined);
}

/** Deletes recordings older than `days`. Returns how many were removed. */
export async function deleteOldRecordings(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const old = await bucket()
    .find({ uploadDate: { $lt: cutoff } })
    .project({ _id: 1 })
    .toArray();
  for (const file of old) await deleteRecording(file._id as Types.ObjectId);
  if (old.length) logger.info({ removed: old.length, days }, 'Old recordings deleted');
  return old.length;
}

/** Runs the retention clean-up now and then every 6 hours (timer does not keep the process alive). */
export function scheduleRecordingCleanup(days: number): NodeJS.Timeout {
  const run = () =>
    void deleteOldRecordings(days).catch((err: unknown) =>
      logger.error({ err }, 'Recording clean-up failed'),
    );
  run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
  return timer;
}
