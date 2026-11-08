import type { AuthResponse, User } from '../models/user';

export const testUser: User = {
  id: 'u1',
  name: 'Asha Kumar',
  email: 'asha@example.com',
  role: 'student',
  college: null,
  targetExamDate: null,
  settings: { ttsAccent: 'en-IN' },
  createdAt: '2026-11-01T00:00:00.000Z',
  lastLoginAt: null,
};

export const authResponse = (token = 'access-1', user: User = testUser): AuthResponse => ({
  user,
  accessToken: token,
});
