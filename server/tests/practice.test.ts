import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Question, type QuestionStatus } from '../src/models/question.model.js';
import {
  questionContentSchema,
  type QuestionContent,
} from '../src/modules/questions/question.schemas.js';
import {
  loadSeedQuestions,
  seedQuestions,
  toQuestionFields,
} from '../src/modules/questions/seed-bank.js';
import { setSttClient, type SttClient } from '../src/services/speech/stt.client.js';
import { deleteOldRecordings } from '../src/services/storage/recordings.js';
import { AppError } from '../src/utils/app-error.js';
import { app, bearer, createAdmin, registerAndLogin } from './helpers.js';

const AUDIO = Buffer.from('RIFF....WAVEfmt fake audio bytes for tests');

const content = (c: Record<string, unknown>) =>
  questionContentSchema.parse({ difficulty: 1, tags: ['listening'], ...c });

async function insert(q: QuestionContent, status: QuestionStatus = 'published') {
  const doc = await Question.create({ ...toQuestionFields(q), status, source: 'manual' });
  return String(doc._id);
}

const repeatSentences = [
  'The bus leaves at half past seven.',
  'Please close the door when you leave.',
  'I have an interview tomorrow morning.',
  'Our class starts at nine every day.',
  'She bought a new laptop last week.',
  'Can you speak a little more slowly?',
];

function start(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/practice/sessions').set(bearer(token)).send(body);
}

function answer(
  token: string,
  sessionId: string,
  questionId: string,
  opts: { transcript?: string; audio?: Buffer | null; type?: string; metrics?: object } = {},
) {
  const req = request(app)
    .post(`/api/practice/sessions/${sessionId}/answers`)
    .set(bearer(token))
    .field('questionId', questionId)
    .field('durationMs', '4000')
    .field('timeMs', '5000');
  if (opts.transcript !== undefined) req.field('clientTranscript', opts.transcript);
  if (opts.metrics) req.field('clientMetrics', JSON.stringify(opts.metrics));
  if (opts.audio !== null) {
    req.attach('audio', opts.audio ?? AUDIO, {
      filename: 'answer.webm',
      contentType: opts.type ?? 'audio/webm',
    });
  }
  return req;
}

const recordingCount = () =>
  mongoose.connection.db!.collection('recordings.files').countDocuments();

class FakeWhisper implements SttClient {
  readonly model = 'fake-whisper';
  calls = 0;
  constructor(private readonly reply: string | Error) {}
  async transcribe() {
    this.calls++;
    if (this.reply instanceof Error) throw this.reply;
    const tokens = this.reply.split(' ');
    return {
      text: this.reply,
      words: tokens.map((word, i) => ({ word, start: 0.4 + i * 0.4, end: 0.7 + i * 0.4 })),
      segments: [{ avgLogprob: -0.1 }],
    };
  }
}

describe('voice practice', () => {
  let token: string;
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    token = (await registerAndLogin()).accessToken;
    for (const [i, s] of repeatSentences.entries())
      ids[`repeat${i}`] = await insert(content({ type: 'repeat', prompt: s }));
    ids.short = await insert(
      content({
        type: 'short_answer',
        prompt: 'How many days are there in a week?',
        acceptedAnswers: ['seven'],
        explanation: 'A week has seven days.',
      }),
    );
    ids.blankWord = await insert(
      content({
        type: 'fill_blank',
        tags: ['prepositions'],
        prompt: 'She is good ___ chess.',
        options: ['in', 'at', 'on', 'for'],
        answer: 1,
        explanation: "The phrase is 'good at'.",
      }),
    );
    ids.blankNone = await insert(
      content({
        type: 'fill_blank',
        tags: ['articles'],
        prompt: 'We had ___ lunch early.',
        options: ['a', 'an', 'the', '(no article)'],
        answer: 3,
        explanation: 'Meals take no article.',
      }),
    );
    ids.spotError = await insert(
      content({
        type: 'spot_error',
        tags: ['tenses'],
        segments: ['Yesterday we', 'go', 'to the park', 'after class.'],
        answer: 1,
        correction: 'Yesterday we went to the park after class.',
        explanation: 'Yesterday needs the past tense.',
      }),
    );
    ids.spotOk = await insert(
      content({
        type: 'spot_error',
        tags: ['tenses'],
        segments: ['The children', 'were playing', 'when it', 'started to rain.'],
        answer: 4,
        explanation: 'This sentence is correct.',
      }),
    );
  });

  afterEach(() => setSttClient(undefined));

  it('validates the request', async () => {
    await request(app).post('/api/practice/sessions').send({ task: 'repeat' }).expect(401);
    const noTask = await start(token, { count: 5 });
    expect(noTask.status).toBe(400);
    expect(noTask.body.error.details.fields.task).toBeDefined();
    expect((await start(token, { task: 'repeat', count: 7 })).status).toBe(400);
    expect((await start(token, { task: 'read_aloud', count: 5 })).body.error.code).toBe(
      'NO_QUESTIONS',
    );
  });

  it('sends what to play and show, but never the answer', async () => {
    const res = await start(token, { task: 'repeat', count: 5 });
    expect(res.status).toBe(201);
    const p = res.body.prompts[0];
    expect(p).toMatchObject({ task: 'repeat', replayable: true, autoStop: true, prepSeconds: 0 });
    expect(p.display).toBeUndefined();
    expect(p.speak[0].text).toMatch(/\w/);

    const complete = await start(token, { task: 'listen_complete', count: 5 });
    expect(complete.body.prompts.map((x: { id: string }) => x.id)).toEqual([ids.blankWord]);
    expect(complete.body.prompts[0].speak).toEqual([
      { text: 'She is good' },
      { beep: true },
      { text: 'chess.' },
    ]);
    expect(JSON.stringify(complete.body)).not.toMatch(/"at"|options|explanation/);

    const correct = await start(token, { task: 'listen_correct', count: 5 });
    expect(correct.body.prompts.map((x: { id: string }) => x.id)).toEqual([ids.spotError]);
    expect(JSON.stringify(correct.body)).not.toContain('went');

    const short = await start(token, { task: 'short_answer', count: 5 });
    expect(JSON.stringify(short.body)).not.toContain('seven');
  });

  it('scores a spoken answer from the browser transcript and stores the recording', async () => {
    const { body } = await start(token, { task: 'short_answer', count: 5 });
    const res = await answer(token, body.session.id, ids.short!, {
      transcript: 'There are 7 days.',
    }).expect(200);
    expect(res.body.result).toMatchObject({
      score: 100,
      correct: true,
      sttSource: 'browser',
      transcript: 'There are 7 days.',
    });
    expect(res.body.result.reveal).toMatchObject({ acceptedAnswers: ['seven'] });
    expect(res.body.progress).toEqual({ answered: 1, total: 1 });

    const audio = await request(app)
      .get(`/api/recordings/${res.body.result.audioId}`)
      .set(bearer(token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(audio.headers['content-type']).toBe('audio/webm');
    expect(Buffer.compare(audio.body as Buffer, AUDIO)).toBe(0);

    const ranged = await request(app)
      .get(`/api/recordings/${res.body.result.audioId}`)
      .set(bearer(token))
      .set('Range', 'bytes=0-3')
      .expect(206);
    expect(ranged.headers['content-range']).toBe(`bytes 0-3/${AUDIO.length}`);

    const other = (await registerAndLogin({ email: 'other@example.com' })).accessToken;
    await request(app)
      .get(`/api/recordings/${res.body.result.audioId}`)
      .set(bearer(other))
      .expect(404);
    const admin = (await createAdmin()).accessToken;
    await request(app)
      .get(`/api/recordings/${res.body.result.audioId}`)
      .set(bearer(admin))
      .expect(200);
  });

  it('prefers Whisper when configured, with timings and clarity', async () => {
    const whisper = new FakeWhisper('The bus leaves at half past seven.');
    setSttClient(whisper);
    const config = await request(app)
      .get('/api/practice/voice/config')
      .set(bearer(token))
      .expect(200);
    expect(config.body.stt).toBe('whisper');

    const { body } = await start(token, { task: 'repeat', count: 5 });
    const prompt = body.prompts.find((p: { speak: { text: string }[] }) =>
      p.speak[0]!.text.startsWith('The bus'),
    );
    const res = await answer(token, body.session.id, prompt.id, {
      transcript: 'something else entirely',
    }).expect(200);
    expect(whisper.calls).toBe(1);
    expect(res.body.result).toMatchObject({
      sttSource: 'whisper',
      transcript: 'The bus leaves at half past seven.',
      correct: true,
    });
    expect(res.body.result.metrics.clarity).toBeGreaterThan(80);
    expect(res.body.result.alignment.every((o: { type: string }) => o.type === 'ok')).toBe(true);
  });

  it('falls back to the browser transcript if Whisper fails, and cleans up when nothing is usable', async () => {
    setSttClient(new FakeWhisper(new AppError(429, 'STT_RATE_LIMITED', 'Quota used up')));
    const { body } = await start(token, { task: 'short_answer', count: 5 });
    const fallback = await answer(token, body.session.id, ids.short!, {
      transcript: 'seven',
    }).expect(200);
    expect(fallback.body.result.sttSource).toBe('browser');

    const second = await start(token, { task: 'listen_complete', count: 5 });
    const failed = await answer(token, second.body.session.id, ids.blankWord!).expect(429);
    expect(failed.body.error.code).toBe('STT_RATE_LIMITED');
    expect(await recordingCount()).toBe(1);
  });

  it('rejects missing, non-audio and oversized uploads', async () => {
    const { body } = await start(token, { task: 'short_answer', count: 5 });
    const missing = await answer(token, body.session.id, ids.short!, {
      audio: null,
      transcript: 'seven',
    }).expect(400);
    expect(missing.body.error.details.fields.audio).toBeDefined();
    await answer(token, body.session.id, ids.short!, { type: 'text/plain' }).expect(415);
    await answer(token, body.session.id, ids.short!, {
      audio: Buffer.alloc(10 * 1024 * 1024 + 1),
    }).expect(413);
    await answer(token, body.session.id, ids.blankWord!).expect(404);
  });

  it('keeps only the first answer', async () => {
    const { body } = await start(token, { task: 'short_answer', count: 5 });
    await answer(token, body.session.id, ids.short!, { transcript: 'eight' }).expect(200);
    const again = await answer(token, body.session.id, ids.short!, { transcript: 'seven' }).expect(
      200,
    );
    expect(again.body.result.correct).toBe(false);
    expect(await recordingCount()).toBe(1);
    const q = await Question.findById(ids.short).lean();
    expect(q!.stats).toEqual({ attempts: 1, correct: 0 });
  });

  it('avoids repeats, then brings back weak answers first; reviews use them too', async () => {
    const first = await start(token, { task: 'repeat', count: 5 });
    const seen: string[] = first.body.prompts.map((p: { id: string }) => p.id);
    for (const [i, id] of seen.entries()) {
      await answer(token, first.body.session.id, id, {
        transcript: i === 0 ? 'no idea' : first.body.prompts[i].speak[0].text,
      });
    }
    const second = await start(token, { task: 'repeat', count: 5 });
    const next: string[] = second.body.prompts.map((p: { id: string }) => p.id);
    expect(next.filter((id) => !seen.includes(id))).toHaveLength(1);
    expect(next).toContain(seen[0]);

    const review = await start(token, { mode: 'review', count: 5 });
    expect(review.body.prompts.map((p: { id: string }) => p.id)).toEqual([seen[0]]);
    expect(review.body.prompts[0].task).toBe('repeat');
  });

  it('reports catalog, stats and the practice summary', async () => {
    const { body } = await start(token, { task: 'repeat', count: 5 });
    await answer(token, body.session.id, body.prompts[0].id, {
      transcript: body.prompts[0].speak[0].text,
      metrics: { firstSoundMs: 300, speechMs: 2500 },
    });
    await answer(token, body.session.id, body.prompts[1].id, { transcript: 'hmm' });

    const summary = await request(app)
      .post(`/api/practice/sessions/${body.session.id}/finish`)
      .set(bearer(token))
      .expect(200);
    expect(summary.body).toMatchObject({
      mode: 'practice',
      task: 'repeat',
      total: 5,
      answered: 2,
      correct: 1,
    });
    expect(summary.body.items).toHaveLength(5);
    expect(summary.body.items[0]).toMatchObject({ answered: true });
    expect(summary.body.skills.listening).toBeGreaterThan(0);
    expect(summary.body.band.cefr).toBeDefined();

    const catalog = await request(app)
      .get('/api/practice/voice/catalog')
      .set(bearer(token))
      .expect(200);
    const repeat = catalog.body.tasks.find((t: { task: string }) => t.task === 'repeat');
    expect(repeat).toMatchObject({ available: 6, done: 2 });
    expect(
      catalog.body.tasks.find((t: { task: string }) => t.task === 'listen_complete').available,
    ).toBe(1);
    expect(catalog.body.stt).toBe('browser');

    const stats = await request(app)
      .get('/api/users/me/stats?tz=Asia/Kolkata')
      .set(bearer(token))
      .expect(200);
    expect(stats.body).toMatchObject({
      answeredToday: 2,
      streakDays: 1,
      totalAnswered: 2,
      testsTaken: 0,
    });
  });

  it('runs a mock test without feedback until the end', async () => {
    await Question.deleteMany({});
    await seedQuestions(loadSeedQuestions().questions);
    const res = await start(token, { mode: 'test' }).expect(201);
    expect(res.body.sections).toHaveLength(9);
    expect(res.body.prompts).toHaveLength(30);
    expect(res.body.prompts.every((p: { replayable: boolean }) => !p.replayable)).toBe(true);
    expect(res.body.prompts.at(-1).task).toBe('topic_talk');

    const first = res.body.prompts[0];
    expect(first.task).toBe('read_aloud');
    const reply = await answer(token, res.body.session.id, first.id, {
      transcript: first.display,
    }).expect(200);
    expect(reply.body).toEqual({
      result: null,
      received: true,
      progress: { answered: 1, total: 30 },
    });

    const during = await request(app)
      .get(`/api/practice/sessions/${res.body.session.id}`)
      .set(bearer(token))
      .expect(200);
    expect(during.body.answers).toEqual([]);
    expect(during.body.answeredIds).toEqual([first.id]);

    const report = await request(app)
      .post(`/api/practice/sessions/${res.body.session.id}/finish`)
      .set(bearer(token))
      .expect(200);
    expect(report.body.sections[0]).toMatchObject({
      title: 'Read aloud',
      answered: 1,
      total: 4,
    });
    expect(report.body.overall).toBeLessThan(10); // 29 unanswered items count as 0
    const after = await request(app)
      .get(`/api/practice/sessions/${res.body.session.id}`)
      .set(bearer(token))
      .expect(200);
    expect(after.body.answers).toHaveLength(1);

    const history = await request(app).get('/api/practice/tests').set(bearer(token)).expect(200);
    expect(history.body.items[0]).toMatchObject({ status: 'finished', answered: 1, total: 30 });
    const stats = await request(app).get('/api/users/me/stats').set(bearer(token)).expect(200);
    expect(stats.body.testsTaken).toBe(1);

    const late = await answer(token, res.body.session.id, res.body.prompts[1].id, {
      transcript: 'x',
    }).expect(409);
    expect(late.body.error.code).toBe('SESSION_FINISHED');
  });

  it('hides a question after two students report it', async () => {
    const report = (t: string) =>
      request(app)
        .post(`/api/questions/${ids.short}/report`)
        .set(bearer(t))
        .send({ reason: 'wrong_answer' });
    await report(token).expect(202);
    await report(token).expect(202);
    expect((await Question.findById(ids.short))!.status).toBe('published');
    const other = (await registerAndLogin({ email: 'other@example.com' })).accessToken;
    await report(other).expect(202);
    expect((await Question.findById(ids.short))!.status).toBe('flagged');
    expect((await start(token, { task: 'short_answer', count: 5 })).status).toBe(404);
  });

  it('deletes recordings after the retention period', async () => {
    const { body } = await start(token, { task: 'short_answer', count: 5 });
    await answer(token, body.session.id, ids.short!, { transcript: 'seven' }).expect(200);
    expect(await deleteOldRecordings(60)).toBe(0);
    await mongoose.connection
      .db!.collection('recordings.files')
      .updateMany({}, { $set: { uploadDate: new Date(Date.now() - 61 * 864e5) } });
    expect(await deleteOldRecordings(60)).toBe(1);
    expect(await recordingCount()).toBe(0);
  });
});
