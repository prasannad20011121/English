import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PracticeSession } from '../src/models/practice-session.model.js';
import { Question, type QuestionStatus } from '../src/models/question.model.js';
import {
  questionContentSchema,
  type QuestionContent,
} from '../src/modules/questions/question.schemas.js';
import { toQuestionFields } from '../src/modules/questions/seed-bank.js';
import { app, bearer, registerAndLogin } from './helpers.js';

const fillBlank = (n: number, tag = 'articles'): QuestionContent =>
  questionContentSchema.parse({
    type: 'fill_blank',
    difficulty: (n % 3) + 1,
    tags: [tag],
    prompt: `Sentence number ${n} has ___ blank.`,
    options: ['a', 'an', 'the', 'one'],
    answer: 0,
    explanation: `Explanation for sentence ${n}.`,
  });

const spotError: QuestionContent = questionContentSchema.parse({
  type: 'spot_error',
  difficulty: 1,
  tags: ['subject_verb_agreement'],
  segments: ['Each of the students', 'have submitted', 'the work', 'on time.'],
  answer: 1,
  correction: 'Each of the students has submitted the work on time.',
  explanation: "'Each' takes a singular verb.",
});

async function insert(q: QuestionContent, status: QuestionStatus = 'published') {
  return Question.create({ ...toQuestionFields(q), status, source: 'manual' });
}

async function start(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/practice/sessions').set(bearer(token)).send(body);
}

async function answer(token: string, sessionId: string, questionId: string, chosen: number) {
  return request(app)
    .post(`/api/practice/sessions/${sessionId}/answers`)
    .set(bearer(token))
    .send({ questionId, chosen, timeMs: 3000 });
}

describe('written practice', () => {
  let token: string;

  beforeEach(async () => {
    token = (await registerAndLogin()).accessToken;
    for (let i = 0; i < 6; i++) await insert(fillBlank(i, i < 3 ? 'articles' : 'tenses'));
    await insert(fillBlank(100), 'draft');
    await insert(fillBlank(101), 'flagged');
    await insert(spotError);
  });

  it('requires login and validates the request', async () => {
    await request(app).post('/api/practice/sessions').send({ type: 'fill_blank' }).expect(401);
    const res = await start(token, { count: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields.type).toBeDefined();
    expect((await start(token, { type: 'fill_blank', count: 7 })).status).toBe(400);
  });

  it('serves only published questions and never sends the answers early', async () => {
    const res = await start(token, { type: 'fill_blank', count: 10 });
    expect(res.status).toBe(201);
    expect(res.body.questions).toHaveLength(6);
    for (const q of res.body.questions) {
      expect(q).not.toHaveProperty('answer');
      expect(q).not.toHaveProperty('correction');
      expect(q).not.toHaveProperty('explanation');
      expect(q.prompt).not.toMatch(/10[01]/);
    }
    expect(res.body.session).toMatchObject({ total: 6, answered: 0, score: 0, status: 'active' });
  });

  it('filters by topic and difficulty, and says when nothing matches', async () => {
    const byTag = await start(token, { type: 'fill_blank', count: 10, tags: ['tenses'] });
    expect(byTag.body.questions).toHaveLength(3);
    const none = await start(token, { type: 'fill_blank', count: 5, tags: ['modals'] });
    expect(none.status).toBe(404);
    expect(none.body.error.code).toBe('NO_QUESTIONS');
  });

  it('checks answers on the server, reveals the explanation and counts each answer once', async () => {
    const { body } = await start(token, { type: 'spot_error', count: 5 });
    const [q] = body.questions;
    expect(q.segments).toHaveLength(4);

    const wrong = await answer(token, body.session.id, q.id, 4);
    expect(wrong.status).toBe(200);
    expect(wrong.body).toMatchObject({
      correct: false,
      answer: 1,
      correction: 'Each of the students has submitted the work on time.',
      progress: { answered: 1, score: 0, total: 1 },
    });
    expect(wrong.body.explanation).toMatch(/singular/);

    // A second (even correct) answer does not change the first result or the stats.
    const again = await answer(token, body.session.id, q.id, 1);
    expect(again.body.correct).toBe(false);
    const stored = await Question.findById(q.id).lean();
    expect(stored!.stats).toEqual({ attempts: 1, correct: 0 });
  });

  it('rejects invalid choices, foreign questions and other students’ sessions', async () => {
    const { body } = await start(token, { type: 'fill_blank', count: 5 });
    const qid = body.questions[0].id;
    expect((await answer(token, body.session.id, qid, 4)).status).toBe(400);
    const spot = await Question.findOne({ type: 'spot_error' });
    expect((await answer(token, body.session.id, String(spot!._id), 1)).status).toBe(404);

    const other = (await registerAndLogin({ email: 'other@example.com' })).accessToken;
    expect((await answer(other, body.session.id, qid, 0)).status).toBe(404);
    await request(app)
      .get(`/api/practice/sessions/${body.session.id}`)
      .set(bearer(other))
      .expect(404);
    await request(app).get('/api/practice/sessions/not-an-id').set(bearer(token)).expect(404);
  });

  it('avoids repeats, then brings back mistakes first', async () => {
    const first = await start(token, { type: 'fill_blank', count: 5 });
    const ids: string[] = first.body.questions.map((q: { id: string }) => q.id);
    // Answer two wrong (chosen 1) and three right (chosen 0).
    for (const [i, id] of ids.entries()) {
      await answer(token, first.body.session.id, id, i < 2 ? 1 : 0);
    }
    const second = await start(token, { type: 'fill_blank', count: 5 });
    const next: string[] = second.body.questions.map((q: { id: string }) => q.id);
    const unseen = next.filter((id) => !ids.includes(id));
    expect(unseen).toHaveLength(1);
    // The four repeats are the two mistakes plus the two oldest correct ones.
    expect(next).toEqual(expect.arrayContaining([ids[0], ids[1]]));
  });

  it('lets students resume a session and review their mistakes', async () => {
    const noMistakes = await start(token, { mode: 'review', count: 5 });
    expect(noMistakes.status).toBe(404);
    expect(noMistakes.body.error.code).toBe('NO_MISTAKES');

    const { body } = await start(token, { type: 'fill_blank', count: 5 });
    await answer(token, body.session.id, body.questions[0].id, 2);
    await answer(token, body.session.id, body.questions[1].id, 0);

    const resumed = await request(app)
      .get(`/api/practice/sessions/${body.session.id}`)
      .set(bearer(token))
      .expect(200);
    expect(resumed.body.answers).toHaveLength(2);
    expect(resumed.body.answers[0]).toMatchObject({ chosen: 2, correct: false, answer: 0 });

    const review = await start(token, { mode: 'review', count: 5 });
    expect(review.status).toBe(201);
    expect(review.body.questions.map((q: { id: string }) => q.id)).toEqual([body.questions[0].id]);
  });

  it('finishes with a summary and refuses answers afterwards', async () => {
    const { body } = await start(token, { type: 'fill_blank', count: 5 });
    const [a, b, c] = body.questions;
    await answer(token, body.session.id, a.id, 0);
    await answer(token, body.session.id, b.id, 0);
    await answer(token, body.session.id, c.id, 3);

    const finish = await request(app)
      .post(`/api/practice/sessions/${body.session.id}/finish`)
      .set(bearer(token))
      .expect(200);
    expect(finish.body).toMatchObject({
      total: 5,
      answered: 3,
      correct: 2,
      accuracy: 67,
      timeMs: 9000,
    });
    expect(finish.body.mistakes).toHaveLength(1);
    expect(finish.body.mistakes[0]).toMatchObject({ id: c.id, chosen: 3, answer: 0 });
    expect(finish.body.byTag.reduce((n: number, t: { total: number }) => n + t.total, 0)).toBe(3);

    // Finishing again returns the same summary.
    const again = await request(app)
      .post(`/api/practice/sessions/${body.session.id}/finish`)
      .set(bearer(token))
      .expect(200);
    expect(again.body.correct).toBe(2);

    const late = await answer(token, body.session.id, body.questions[3].id, 0);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('SESSION_FINISHED');
  });

  it('reports catalog counts and personal progress', async () => {
    const { body } = await start(token, { type: 'fill_blank', count: 5 });
    await answer(token, body.session.id, body.questions[0].id, 0);
    await answer(token, body.session.id, body.questions[1].id, 1);

    const catalog = await request(app)
      .get('/api/practice/written/catalog')
      .set(bearer(token))
      .expect(200);
    const fb = catalog.body.types.find((t: { type: string }) => t.type === 'fill_blank');
    expect(fb).toEqual({ type: 'fill_blank', available: 6, done: 2, accuracy: 50 });
    expect(catalog.body.mistakes).toBe(1);
    expect(catalog.body.tags).toEqual(
      expect.arrayContaining([
        { tag: 'articles', available: 3 },
        { tag: 'tenses', available: 3 },
      ]),
    );

    const stats = await request(app)
      .get('/api/users/me/stats?tz=Asia/Kolkata')
      .set(bearer(token))
      .expect(200);
    expect(stats.body).toMatchObject({
      answeredToday: 2,
      dailyGoal: 5,
      streakDays: 1,
      totalAnswered: 2,
      totalCorrect: 1,
      accuracy: 50,
    });
    expect(stats.body.week.filter(Boolean)).toHaveLength(1);
  });

  it('starts new students with empty stats', async () => {
    const stats = await request(app).get('/api/users/me/stats').set(bearer(token)).expect(200);
    expect(stats.body).toMatchObject({
      answeredToday: 0,
      streakDays: 0,
      totalAnswered: 0,
      accuracy: null,
    });
    expect(await PracticeSession.countDocuments()).toBe(0);
  });

  it('hides a question once two different students report it', async () => {
    const q = await Question.findOne({ type: 'spot_error' });
    const report = (t: string) =>
      request(app)
        .post(`/api/questions/${q!._id}/report`)
        .set(bearer(t))
        .send({ reason: 'wrong_answer', note: 'I think B is fine' });

    await report(token).expect(202);
    await report(token).expect(202); // same student again: not counted twice
    expect((await Question.findById(q!._id))!.status).toBe('published');

    const other = (await registerAndLogin({ email: 'other@example.com' })).accessToken;
    await report(other).expect(202);
    expect((await Question.findById(q!._id))!.status).toBe('flagged');

    const res = await start(token, { type: 'spot_error', count: 5 });
    expect(res.status).toBe(404);

    await request(app)
      .post(`/api/questions/${q!._id}/report`)
      .set(bearer(token))
      .send({ reason: 'not-a-reason' })
      .expect(400);
    await request(app)
      .post('/api/questions/64b7f0000000000000000000/report')
      .set(bearer(token))
      .send({ reason: 'typo' })
      .expect(404);
  });
});
