import { User, toPublicUser, type PublicUser } from '../../models/user.model.js';
import { AppError } from '../../utils/app-error.js';
import type { UpdateProfileInput } from './users.schemas.js';

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  if (input.name !== undefined) set.name = input.name;
  if (input.college !== undefined) {
    if (input.college) set.college = input.college;
    else unset.college = '';
  }
  if (input.targetExamDate !== undefined) {
    if (input.targetExamDate) set.targetExamDate = input.targetExamDate;
    else unset.targetExamDate = '';
  }
  if (input.settings?.ttsAccent) set['settings.ttsAccent'] = input.settings.ttsAccent;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { returnDocument: 'after', runValidators: true },
  );
  if (!user) throw AppError.notFound('User not found.');
  return toPublicUser(user);
}
