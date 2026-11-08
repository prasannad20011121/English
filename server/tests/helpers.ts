import request from 'supertest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/user.model.js';
import { hashPassword } from '../src/utils/password.js';

export const app = createApp();

export const validUser = {
  name: 'Asha Kumar',
  email: 'asha@example.com',
  password: 'secret123',
  college: 'Anna University',
  consentAudio: true,
};

/** A supertest agent keeps cookies (the refresh token) between requests, like a browser. */
export function newAgent() {
  return request.agent(app);
}

export async function registerAndLogin(overrides: Partial<typeof validUser> = {}) {
  const agent = newAgent();
  const res = await agent
    .post('/api/auth/register')
    .send({ ...validUser, ...overrides })
    .expect(201);
  return { agent, accessToken: res.body.accessToken as string, user: res.body.user };
}

export async function createAdmin(email = 'admin@example.com', password = 'admin1234') {
  await User.create({
    name: 'Admin',
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
  });
  const agent = newAgent();
  const res = await agent.post('/api/auth/login').send({ email, password }).expect(200);
  return { agent, accessToken: res.body.accessToken as string };
}

/** The raw `rt=...` refresh cookie from a response. */
export function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('rt='))?.split(';')[0];
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
