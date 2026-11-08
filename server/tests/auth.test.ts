import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RefreshToken } from '../src/models/refresh-token.model.js';
import { User } from '../src/models/user.model.js';
import { setMailTransport, type MailMessage } from '../src/services/mail/mailer.js';
import { app, bearer, newAgent, refreshCookie, registerAndLogin, validUser } from './helpers.js';

describe('POST /api/auth/register', () => {
  it('creates a student, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser).expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({
      name: 'Asha Kumar',
      email: 'asha@example.com',
      role: 'student',
      college: 'Anna University',
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('secret123');

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('rt='),
    );
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const saved = await User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(saved?.passwordHash).not.toBe('secret123');
    expect(saved?.consentAudioAt).toBeInstanceOf(Date);
  });

  it('normalises the email and ignores a role sent by the client', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: '  Asha@Example.COM ', role: 'admin' })
      .expect(201);
    expect(res.body.user.email).toBe('asha@example.com');
    expect(res.body.user.role).toBe('student');
  });

  it('rejects a duplicate email with 409', async () => {
    await request(app).post('/api/auth/register').send(validUser).expect(201);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'ASHA@example.com' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates fields and returns per-field messages', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short', consentAudio: false })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.details.fields)).toEqual(
      expect.arrayContaining(['name', 'email', 'password', 'consentAudio']),
    );
  });

  it('requires a password with letters and numbers', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, password: 'onlyletters' })
      .expect(400);
    expect(res.body.error.details.fields.password).toMatch(/number/);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password', async () => {
    await request(app).post('/api/auth/register').send(validUser).expect(201);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ASHA@example.com', password: 'secret123' })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).toBeDefined();
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await request(app).post('/api/auth/register').send(validUser).expect(201);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrong1234' })
      .expect(401);
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong1234' })
      .expect(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me', () => {
  it('requires a valid access token', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const res = await request(app).get('/api/auth/me').set(bearer('garbage')).expect(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('returns the current user', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app).get('/api/auth/me').set(bearer(accessToken)).expect(200);
    expect(res.body.user.email).toBe(validUser.email);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 401 without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh').expect(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('issues a new access token and rotates the refresh token', async () => {
    const { agent } = await registerAndLogin();
    const res = await agent.post('/api/auth/refresh').expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(validUser.email);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(1);
    expect(await RefreshToken.countDocuments()).toBe(2);
    // The rotated cookie keeps working.
    await agent.post('/api/auth/refresh').expect(200);
  });

  it('tolerates two tabs refreshing with the same cookie at once', async () => {
    const reg = await request(app).post('/api/auth/register').send(validUser).expect(201);
    const cookie = refreshCookie(reg)!;
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
  });

  it('revokes every session when an old refresh token is reused later', async () => {
    const reg = await request(app).post('/api/auth/register').send(validUser).expect(201);
    const stolen = refreshCookie(reg)!;
    const rotated = refreshCookie(
      await request(app).post('/api/auth/refresh').set('Cookie', stolen).expect(200),
    )!;
    // Pretend the rotation happened a while ago (outside the multi-tab grace window).
    await RefreshToken.updateMany(
      { revokedAt: { $ne: null } },
      { revokedAt: new Date(Date.now() - 5 * 60 * 1000) },
    );

    const res = await request(app).post('/api/auth/refresh').set('Cookie', stolen).expect(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
    // The legitimate, newer token is now revoked too.
    await request(app).post('/api/auth/refresh').set('Cookie', rotated).expect(401);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    const { agent } = await registerAndLogin();
    const res = await agent.post('/api/auth/logout').expect(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^rt=;/);
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('does not end other devices when a logged-out token is replayed', async () => {
    const reg = await request(app).post('/api/auth/register').send(validUser).expect(201);
    const oldCookie = refreshCookie(reg)!;
    const other = newAgent();
    await other
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'secret123' })
      .expect(200);

    await request(app).post('/api/auth/logout').set('Cookie', oldCookie).expect(204);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
    await other.post('/api/auth/refresh').expect(200);
  });
});

describe('password reset', () => {
  const sent: MailMessage[] = [];
  const transport = { send: vi.fn(async (m: MailMessage) => void sent.push(m)) };
  setMailTransport(transport);

  afterEach(() => {
    sent.length = 0;
    transport.send.mockClear();
  });

  const tokenFrom = (mail: MailMessage) =>
    new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

  it('answers the same way for unknown emails and sends nothing', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(200);
    expect(res.body.message).toMatch(/If an account exists/);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('emails a single-use link that sets a new password and ends old sessions', async () => {
    const { agent } = await registerAndLogin();
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: validUser.email })
      .expect(200);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(validUser.email);
    expect(sent[0]!.text).toContain('http://localhost:4200/reset-password?token=');
    const token = tokenFrom(sent[0]!);

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'newpass456' })
      .expect(200);
    expect(reset.body.accessToken).toEqual(expect.any(String));

    // Single use.
    const again = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'another789' })
      .expect(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');

    // The old session is gone, the old password fails, the new one works.
    await agent.post('/api/auth/refresh').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'secret123' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'newpass456' })
      .expect(200);
  });

  it('rejects an expired reset link', async () => {
    await registerAndLogin();
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: validUser.email })
      .expect(200);
    await User.updateOne({}, { passwordResetExpires: new Date(Date.now() - 1000) });
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: tokenFrom(sent[0]!), password: 'newpass456' })
      .expect(400);
  });
});

describe('POST /api/auth/change-password', () => {
  it('needs the current password', async () => {
    const { agent, accessToken } = await registerAndLogin();
    const res = await agent
      .post('/api/auth/change-password')
      .set(bearer(accessToken))
      .send({ currentPassword: 'wrong1234', newPassword: 'newpass456' })
      .expect(400);
    expect(res.body.error.details.fields.currentPassword).toBeDefined();
  });

  it('changes the password, ends other sessions and keeps this device logged in', async () => {
    const { agent, accessToken } = await registerAndLogin();
    const other = newAgent();
    await other
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'secret123' })
      .expect(200);

    const res = await agent
      .post('/api/auth/change-password')
      .set(bearer(accessToken))
      .send({ currentPassword: 'secret123', newPassword: 'newpass456' })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));

    await other.post('/api/auth/refresh').expect(401);
    await agent.post('/api/auth/refresh').expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'newpass456' })
      .expect(200);
  });
});
