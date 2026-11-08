/**
 * Creates an admin account, or promotes an existing user and sets their password.
 * Usage: set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD (e.g. in server/.env) and run `npm run seed:admin`.
 */
import { z } from 'zod';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/user.model.js';
import { emailSchema, nameSchema, passwordSchema } from '../modules/auth/auth.schemas.js';
import { revokeAllSessions } from '../modules/auth/auth.service.js';
import { hashPassword } from '../utils/password.js';

const input = z
  .object({
    ADMIN_NAME: nameSchema.default('Admin'),
    ADMIN_EMAIL: emailSchema,
    ADMIN_PASSWORD: passwordSchema,
  })
  .safeParse(process.env);

if (!input.success) {
  console.error(`Cannot seed admin:\n${z.prettifyError(input.error)}`);
  process.exit(1);
}

const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = input.data;
await connectDB();

const passwordHash = await hashPassword(ADMIN_PASSWORD);
const existing = await User.findOne({ email: ADMIN_EMAIL });
if (existing) {
  existing.role = 'admin';
  existing.passwordHash = passwordHash;
  existing.passwordChangedAt = new Date();
  await existing.save();
  await revokeAllSessions(existing._id, 'password_change');
  console.log(`Updated ${ADMIN_EMAIL}: role=admin, password reset.`);
} else {
  await User.create({ name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash, role: 'admin' });
  console.log(`Created admin ${ADMIN_EMAIL}.`);
}

await disconnectDB();
