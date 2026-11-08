import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Question } from '../src/models/question.model.js';
import { questionContentSchema } from '../src/modules/questions/question.schemas.js';
import { toQuestionFields } from '../src/modules/questions/seed-bank.js';
import { setLlmClient } from '../src/services/llm/llm.client.js';
import { FakeLlm } from './fake-llm.js';
import { app, bearer, createAdmin, registerAndLogin } from './helpers.js';

const content = (n: number) => ({
  type: 'fill_blank',
  difficulty: 2,
  tags: ['articles'],
  prompt: `Draft sentence ${n} needs ___ article.`,
  options: ['an', 'a', 'the', 'some'],
  answer: 0,
  explanation: 'Use "an" before a vowel sound.',
});

async function insert(n: number, status: 'draft' | 'published' | 'flagged') {
  const q = await Question.create({
    ...toQuestionFields(questionContentSchema.parse(content(n))),
    status,
    source: 'ai',
  });
  return String(q._id);
}

describe('admin question bank', () => {
  let admin: string;
  let student: string;

  beforeEach(async () => {
    admin = (await createAdmin()).accessToken;
    student = (await registerAndLogin()).accessToken;
  });

  afterEach(() => setLlmClient(undefined));

  it('is for admins only', async () => {
    await request(app).get('/api/admin/questions').set(bearer(student)).expect(403);
    await request(app)
      .post('/api/admin/questions/generate')
      .set(bearer(student))
      .send({})
      .expect(403);
  });

  it('lists questions with filters and per-status counts', async () => {
    await insert(1, 'draft');
    await insert(2, 'draft');
    await insert(3, 'published');
    const res = await request(app)
      .get('/api/admin/questions?status=draft')
      .set(bearer(admin))
      .expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.counts).toEqual({ draft: 2, published: 1, flagged: 0, retired: 0 });
    expect(res.body.items[0]).toHaveProperty('answer');
    expect(res.body.items[0]).toHaveProperty('explanation');

    const search = await request(app)
      .get('/api/admin/questions?q=sentence 3')
      .set(bearer(admin))
      .expect(200);
    expect(search.body.items).toHaveLength(1);
  });

  it('approves a draft so students can practise it, and approving clears reports', async () => {
    const id = await insert(1, 'flagged');
    await Question.updateOne({ _id: id }, { $push: { reports: { userId: id, reason: 'typo' } } });

    const res = await request(app)
      .post(`/api/admin/questions/${id}/status`)
      .set(bearer(admin))
      .send({ status: 'published' })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'published', reports: [] });
    expect(res.body.reviewedAt).toBeTruthy();

    // Published fill-in-the-blank items are practised by voice as "listen & complete".
    const session = await request(app)
      .post('/api/practice/sessions')
      .set(bearer(student))
      .send({ task: 'listen_complete', count: 5 })
      .expect(201);
    expect(session.body.prompts.map((q: { id: string }) => q.id)).toEqual([id]);
  });

  it('edits content with the same rules as the seed bank', async () => {
    const id = await insert(1, 'draft');
    await insert(2, 'draft');

    const bad = await request(app)
      .put(`/api/admin/questions/${id}`)
      .set(bearer(admin))
      .send({ ...content(1), prompt: 'No blank here.' })
      .expect(400);
    expect(bad.body.error.details.fields.prompt).toMatch(/blank/);

    await request(app)
      .put(`/api/admin/questions/${id}`)
      .set(bearer(admin))
      .send(content(2))
      .expect(409);

    const spot = {
      type: 'spot_error',
      difficulty: 1,
      tags: ['tenses'],
      segments: ['Yesterday we', 'go', 'to the park', 'after class.'],
      answer: 1,
      correction: 'Yesterday we went to the park after class.',
      explanation: 'Yesterday needs the past tense.',
    };
    const ok = await request(app)
      .put(`/api/admin/questions/${id}`)
      .set(bearer(admin))
      .send(spot)
      .expect(200);
    expect(ok.body).toMatchObject({
      type: 'spot_error',
      segments: spot.segments,
      correction: spot.correction,
    });
    expect(ok.body.options).toBeUndefined();
  });

  it('changes many statuses at once', async () => {
    const ids = [await insert(1, 'draft'), await insert(2, 'draft')];
    const res = await request(app)
      .post('/api/admin/questions/bulk-status')
      .set(bearer(admin))
      .send({ ids, status: 'retired' })
      .expect(200);
    expect(res.body.updated).toBe(2);
    expect(await Question.countDocuments({ status: 'retired' })).toBe(2);
  });

  it('reports AI status and generates drafts through the API', async () => {
    const off = await request(app)
      .get('/api/admin/questions/ai-status')
      .set(bearer(admin))
      .expect(200);
    expect(off.body).toMatchObject({ enabled: false, model: null });
    const notSetUp = await request(app)
      .post('/api/admin/questions/generate')
      .set(bearer(admin))
      .send({ type: 'fill_blank', tag: 'articles', difficulty: 1, count: 1 })
      .expect(503);
    expect(notSetUp.body.error.code).toBe('AI_NOT_CONFIGURED');

    const draft = {
      ...content(9),
      prompt: 'She is ___ honest and kind teacher.',
      options: ['an', 'a', 'the', 'one'],
    };
    setLlmClient(new FakeLlm(JSON.stringify({ questions: [draft] }), { [draft.prompt]: 'an' }));
    const on = await request(app)
      .get('/api/admin/questions/ai-status')
      .set(bearer(admin))
      .expect(200);
    expect(on.body).toMatchObject({ enabled: true, model: 'fake-model' });

    const res = await request(app)
      .post('/api/admin/questions/generate')
      .set(bearer(admin))
      .send({ type: 'fill_blank', tag: 'articles', difficulty: 1, count: 1 })
      .expect(201);
    expect(res.body.created).toHaveLength(1);
    const saved = await Question.findById(res.body.created[0]).lean();
    expect(saved).toMatchObject({ status: 'draft', source: 'ai' });
    expect(String(saved!.createdBy)).toBeTruthy();
  });
});
