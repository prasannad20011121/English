import { z } from 'zod';
import { TTS_ACCENTS } from '../../models/user.model.js';
import { collegeSchema, nameSchema, optionalDateSchema } from '../auth/auth.schemas.js';

export const updateProfileSchema = z
  .object({
    name: nameSchema.optional(),
    /** Empty string or null clears it. */
    college: collegeSchema.nullable().optional(),
    targetExamDate: optionalDateSchema,
    settings: z.object({ ttsAccent: z.enum(TTS_ACCENTS).optional() }).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
