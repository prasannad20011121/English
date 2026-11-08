import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/app-error.js';
import { fieldErrors } from '../utils/zod-issues.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found.`));
};

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(400, 'VALIDATION_ERROR', 'Please check the request.', {
      fields: fieldErrors(err),
    });
  }
  if (err instanceof MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'The recording is too large (10 MB maximum).')
      : new AppError(400, 'BAD_UPLOAD', 'The recording could not be uploaded. Please try again.');
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, 'INVALID_ID', 'Invalid identifier.');
  }
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    return new AppError(409, 'DUPLICATE', 'This record already exists.');
  }
  const bodyErr = err as BodyParserError;
  if (bodyErr?.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (bodyErr?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
    },
  });
};
