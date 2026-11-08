import { z } from 'zod';

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address' }));

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password is too long');

export const nameSchema = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters');

export const collegeSchema = z.string().trim().max(120, 'At most 120 characters');

/** Accepts `YYYY-MM-DD` or a full ISO timestamp; `null` clears the value. */
export const optionalDateSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], {
    error: 'Enter a valid date',
  })
  .transform((v) => new Date(v))
  .nullable()
  .optional();

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  college: collegeSchema.optional(),
  targetExamDate: optionalDateSchema,
  consentAudio: z.literal(true, {
    error: 'Please agree to voice recording to use the speaking practice',
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'Invalid reset link').max(200, 'Invalid reset link'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: passwordSchema,
});
