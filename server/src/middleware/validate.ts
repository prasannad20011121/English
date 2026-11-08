import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/app-error.js';
import { fieldErrors } from '../utils/zod-issues.js';

/** Validates and normalises `req.body` with a Zod schema (unknown keys are stripped). */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields.', {
        fields: fieldErrors(result.error),
      });
    }
    req.body = result.data;
    next();
  };
}
