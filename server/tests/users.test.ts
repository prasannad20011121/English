import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, bearer, createAdmin, registerAndLogin } from './helpers.js';

describe('/api/users/me', () => {
  it('requires login', async () => {
    await request(app).get('/api/users/me').expect(401);
    await request(app).patch('/api/users/me').send({ name: 'X Y' }).expect(401);
  });

  it('updates the profile', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(accessToken))
      .send({ name: 'Asha K', targetExamDate: '2027-01-15', settings: { ttsAccent: 'en-GB' } })
      .expect(200);
    expect(res.body.user).toMatchObject({
      name: 'Asha K',
      targetExamDate: '2027-01-15T00:00:00.000Z',
      settings: { ttsAccent: 'en-GB' },
      college: 'Anna University',
    });

    const cleared = await request(app)
      .patch('/api/users/me')
      .set(bearer(accessToken))
      .send({ college: '', targetExamDate: null })
      .expect(200);
    expect(cleared.body.user.college).toBeNull();
    expect(cleared.body.user.targetExamDate).toBeNull();
  });

  it('cannot change role or email through the profile', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(accessToken))
      .send({ name: 'Asha K', role: 'admin', email: 'x@example.com' })
      .expect(200);
    expect(res.body.user.role).toBe('student');
    expect(res.body.user.email).toBe('asha@example.com');
  });

  it('rejects invalid values', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(accessToken))
      .send({ settings: { ttsAccent: 'fr-FR' }, targetExamDate: 'tomorrow' })
      .expect(400);
    expect(Object.keys(res.body.error.details.fields)).toEqual(
      expect.arrayContaining(['settings.ttsAccent', 'targetExamDate']),
    );
  });
});

describe('GET /api/admin/users', () => {
  it('is forbidden for students', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app).get('/api/admin/users').set(bearer(accessToken)).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists and searches users for admins', async () => {
    await registerAndLogin();
    await registerAndLogin({ name: 'Ravi Shankar', email: 'ravi@example.com', college: 'VIT' });
    const { accessToken } = await createAdmin();

    const all = await request(app).get('/api/admin/users').set(bearer(accessToken)).expect(200);
    expect(all.body.total).toBe(3);
    expect(all.body.items[0]).not.toHaveProperty('passwordHash');

    const search = await request(app)
      .get('/api/admin/users?q=vit&role=student')
      .set(bearer(accessToken))
      .expect(200);
    expect(search.body.items.map((u: { email: string }) => u.email)).toEqual(['ravi@example.com']);

    const paged = await request(app)
      .get('/api/admin/users?limit=1&page=2')
      .set(bearer(accessToken))
      .expect(200);
    expect(paged.body).toMatchObject({ total: 3, page: 2, limit: 1 });
    expect(paged.body.items).toHaveLength(1);
  });

  it('validates query parameters', async () => {
    const { accessToken } = await createAdmin();
    await request(app).get('/api/admin/users?limit=1000').set(bearer(accessToken)).expect(400);
  });
});
