import { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import { PracticeSession, type PracticeSessionDoc } from '../../models/practice-session.model.js';
import { FLAG_THRESHOLD, Question, type QuestionFields } from '../../models/question.model.js';
import { SeenQuestion } from '../../models/seen-question.model.js';
import { getGrammarChecker } from '../../services/grammar/grammar-checker.js';
import { getStt } from '../../services/speech/stt.client.js';
import { deleteRecording, saveRecording } from '../../services/storage/recordings.js';
import { AppError } from '../../utils/app-error.js';
import { toVoicePrompt, type VoicePrompt } from '../voice/prompts.js';
import { evaluate, type EvalResult } from '../voice/scoring/evaluate.js';
import { bandFor, skillAverages, type Band } from '../voice/scoring/report.js';
import { TASKS, VOICE_TASKS, type Skill, type VoiceTask } from '../voice/tasks.js';
import { TEST_SECTIONS } from '../voice/test-template.js';
import type { AnswerFields, StartSessionInput } from './practice.schemas.js';
import { computeStreak, dayKey, safeTimeZone, weekActivity } from './stats.js';

type StoredQuestion = QuestionFields & { _id: Types.ObjectId };

export const DAILY_GOAL = 5;
/** An answer scoring at least this counts as "correct" (streaks, reviews). */
export const PASS_MARK = 60;

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const sessionNotFound = () => AppError.notFound('Practice session not found.');

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The published questions a task can use. */
function taskFilter(task: VoiceTask, difficulty?: number): Record<string, unknown> {
  const info = TASKS[task];
  return {
    status: 'published',
    type: info.questionType,
    ...(info.filter ?? {}),
    ...(difficulty ? { difficulty } : {}),
  };
}

/** Which task a question is practised as, or null if it cannot be answered by voice. */
async function taskOf(q: StoredQuestion): Promise<VoiceTask | null> {
  for (const task of VOICE_TASKS) {
    if (TASKS[task].questionType !== q.type) continue;
    if (await Question.exists({ _id: q._id, ...taskFilter(task) })) return task;
  }
  return null;
}

/**
 * Never-seen questions first (random), then ones answered badly (oldest first), then the least
 * recently seen — so there are no repeats until the pool runs out.
 */
export async function pickQuestions(
  userId: string,
  task: VoiceTask,
  count: number,
  difficulty?: number,
): Promise<StoredQuestion[]> {
  const filter = taskFilter(task, difficulty);
  const seen = await SeenQuestion.find({ userId: oid(userId), type: TASKS[task].questionType })
    .select('questionId lastCorrect lastSeenAt')
    .lean();
  const seenIds = seen.map((s) => s.questionId);

  const fresh = await Question.aggregate<StoredQuestion>([
    { $match: { ...filter, _id: { $nin: seenIds } } },
    { $sample: { size: count } },
  ]);
  if (fresh.length >= count || !seenIds.length) return fresh;

  const seenById = new Map(seen.map((s) => [String(s.questionId), s]));
  const repeats = await Question.find({ ...filter, _id: { $in: seenIds } }).lean<
    StoredQuestion[]
  >();
  repeats.sort((a, b) => {
    const sa = seenById.get(String(a._id))!;
    const sb = seenById.get(String(b._id))!;
    if (sa.lastCorrect !== sb.lastCorrect) return sa.lastCorrect ? 1 : -1;
    return sa.lastSeenAt.getTime() - sb.lastSeenAt.getTime();
  });
  return [...fresh, ...shuffle(repeats.slice(0, count - fresh.length))];
}

export interface SessionView {
  session: {
    id: string;
    mode: string;
    task: VoiceTask | null;
    status: string;
    total: number;
    answered: number;
  };
  sections?: { title: string; task: VoiceTask; count: number }[];
  prompts: VoicePrompt[];
  /** Results for answered prompts (empty for an unfinished mock test). */
  answers: AnswerView[];
  /** Ids of prompts already answered (also in mock tests). */
  answeredIds: string[];
}

export interface AnswerView extends Omit<EvalResult, 'correct'> {
  questionId: string;
  task: VoiceTask;
  correct: boolean;
  audioId: string | null;
  sttSource: string | null;
}

function answerView(item: PracticeSessionDoc['items'][number]): AnswerView {
  const result = (item.result ?? {}) as Partial<EvalResult>;
  return {
    questionId: String(item.question),
    task: item.task as VoiceTask,
    score: item.score ?? 0,
    correct: !!item.correct,
    skills: (item.skills ?? {}) as Partial<Record<Skill, number>>,
    transcript: item.transcript ?? '',
    alignment: result.alignment,
    metrics: result.metrics ?? {},
    feedback: result.feedback ?? [],
    reveal: result.reveal ?? {},
    keyPoints: result.keyPoints,
    audioId: item.audioId ? String(item.audioId) : null,
    sttSource: item.sttSource ?? null,
  };
}

async function questionsFor(session: PracticeSessionDoc): Promise<Map<string, StoredQuestion>> {
  const found = await Question.find({ _id: { $in: session.items.map((i) => i.question) } }).lean<
    StoredQuestion[]
  >();
  return new Map(found.map((q) => [String(q._id), q]));
}

function buildView(session: PracticeSessionDoc, byId: Map<string, StoredQuestion>): SessionView {
  const test = session.mode === 'test';
  const answered = session.items.filter((i) => i.answeredAt);
  return {
    session: {
      id: String(session._id),
      mode: session.mode,
      task: (session.task ?? null) as VoiceTask | null,
      status: session.status,
      total: session.items.length,
      answered: answered.length,
    },
    ...(test
      ? { sections: TEST_SECTIONS.map(({ title, task, count }) => ({ title, task, count })) }
      : {}),
    prompts: session.items.flatMap((item) => {
      const q = byId.get(String(item.question));
      return q
        ? [toVoicePrompt(q, item.task as VoiceTask, { test, section: item.section ?? undefined })]
        : [];
    }),
    // No feedback during a mock test, only after it is finished.
    answers: test && session.status !== 'finished' ? [] : answered.map(answerView),
    answeredIds: answered.map((i) => String(i.question)),
  };
}

export async function startSession(userId: string, input: StartSessionInput): Promise<SessionView> {
  let items: { question: Types.ObjectId; task: VoiceTask; section?: number }[] = [];

  if (input.mode === 'practice') {
    const task = input.task!;
    const questions = await pickQuestions(userId, task, input.count, input.difficulty);
    items = questions.map((q) => ({ question: q._id, task }));
  } else if (input.mode === 'review') {
    const wrong = await SeenQuestion.find({ userId: oid(userId), lastCorrect: false })
      .sort({ lastSeenAt: 1 })
      .limit(input.count * 3)
      .select('questionId')
      .lean();
    const questions = await Question.find({
      _id: { $in: wrong.map((w) => w.questionId) },
      status: 'published',
    }).lean<StoredQuestion[]>();
    for (const q of questions) {
      if (items.length >= input.count) break;
      const task = await taskOf(q);
      if (task && (!input.task || input.task === task)) items.push({ question: q._id, task });
    }
  } else {
    for (const [section, { task, count }] of TEST_SECTIONS.entries()) {
      const questions = await pickQuestions(userId, task, count);
      items.push(...questions.map((q) => ({ question: q._id, task, section })));
    }
  }

  if (!items.length) {
    throw new AppError(
      404,
      input.mode === 'review' ? 'NO_MISTAKES' : 'NO_QUESTIONS',
      input.mode === 'review'
        ? 'No mistakes to review. Nice work!'
        : 'No questions are available for this yet. Try another task or difficulty.',
    );
  }

  const session = await PracticeSession.create({
    userId: oid(userId),
    mode: input.mode,
    task: input.mode === 'practice' ? input.task : null,
    filters: { difficulty: input.difficulty },
    items,
  });
  return buildView(session, await questionsFor(session));
}

async function loadSession(userId: string, sessionId: string): Promise<PracticeSessionDoc> {
  if (!Types.ObjectId.isValid(sessionId)) throw sessionNotFound();
  const session = await PracticeSession.findOne({ _id: sessionId, userId: oid(userId) });
  if (!session) throw sessionNotFound();
  return session;
}

export async function getSession(userId: string, sessionId: string): Promise<SessionView> {
  const session = await loadSession(userId, sessionId);
  return buildView(session, await questionsFor(session));
}

export interface UploadedAudio {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface AnswerResponse {
  /** Full result in practice; only `received` during a mock test. */
  result: AnswerView | null;
  received: true;
  progress: { answered: number; total: number };
}

/**
 * Stores the recording, turns it into text (Whisper, else the browser's transcript), scores it
 * and saves the first answer for each question. Answering again returns the first result.
 */
export async function answerQuestion(
  userId: string,
  sessionId: string,
  fields: AnswerFields,
  audio: UploadedAudio | undefined,
): Promise<AnswerResponse> {
  const session = await loadSession(userId, sessionId);
  const item = session.items.find((i) => String(i.question) === fields.questionId);
  if (!item) throw AppError.notFound('That question is not part of this session.');

  const progress = () => ({
    answered: session.items.filter((i) => i.answeredAt).length,
    total: session.items.length,
  });
  const respond = (it: typeof item): AnswerResponse => ({
    result: session.mode === 'test' ? null : answerView(it),
    received: true,
    progress: progress(),
  });

  if (item.answeredAt) return respond(item);
  if (session.status !== 'active') {
    throw new AppError(409, 'SESSION_FINISHED', 'This session has already finished.');
  }
  if (!audio?.buffer.length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please record an answer.', {
      fields: { audio: 'Recording is missing' },
    });
  }

  const question = await Question.findById(item.question).lean<StoredQuestion>();
  if (!question) throw AppError.notFound('Question not found.');

  const audioId = await saveRecording(audio.buffer, audio.mimetype, {
    userId,
    sessionId: String(session._id),
    questionId: fields.questionId,
    durationMs: fields.durationMs,
  });

  // 1. Speech → text.
  let transcript = fields.clientTranscript?.trim() ?? '';
  let sttSource: 'whisper' | 'browser' | 'none' = transcript ? 'browser' : 'none';
  let words: { word: string; start: number; end: number }[] | undefined;
  let segments: { avgLogprob?: number }[] | undefined;
  const stt = getStt();
  if (stt) {
    try {
      const t = await stt.transcribe(
        audio.buffer,
        audio.mimetype,
        audio.originalname || 'answer.webm',
      );
      transcript = t.text;
      words = t.words;
      segments = t.segments;
      sttSource = 'whisper';
    } catch (err) {
      if (!transcript) {
        await deleteRecording(audioId);
        throw err;
      }
      logger.warn({ err }, 'Whisper failed; using the browser transcript instead');
    }
  }

  // 2. Score.
  const task = item.task as VoiceTask;
  const grammar = getGrammarChecker();
  const result = await evaluate(
    {
      task,
      question,
      transcript,
      durationMs: fields.durationMs,
      words,
      segments,
      metrics: fields.clientMetrics,
    },
    task === 'topic_talk' && grammar ? { grammarIssues: grammar } : {},
  );

  // 3. Save — only the first answer counts, even if two uploads race.
  const now = new Date();
  const { alignment, metrics, feedback, reveal, keyPoints } = result;
  const update = await PracticeSession.updateOne(
    {
      _id: session._id,
      status: 'active',
      items: { $elemMatch: { question: question._id, answeredAt: null } },
    },
    {
      $set: {
        'items.$.answeredAt': now,
        'items.$.timeMs': fields.timeMs,
        'items.$.durationMs': fields.durationMs,
        'items.$.score': result.score,
        'items.$.correct': result.correct,
        'items.$.skills': result.skills,
        'items.$.transcript': transcript,
        'items.$.audioId': audioId,
        'items.$.sttSource': sttSource,
        'items.$.result': { alignment, metrics, feedback, reveal, keyPoints },
      },
      $inc: { score: result.correct ? 1 : 0 },
    },
  );

  if (update.modifiedCount === 1) {
    await Promise.all([
      Question.updateOne(
        { _id: question._id },
        { $inc: { 'stats.attempts': 1, 'stats.correct': result.correct ? 1 : 0 } },
      ),
      SeenQuestion.updateOne(
        { userId: oid(userId), questionId: question._id },
        {
          $set: { type: question.type, lastCorrect: result.correct, lastSeenAt: now },
          $inc: { timesSeen: 1, timesCorrect: result.correct ? 1 : 0 },
        },
        { upsert: true },
      ),
    ]);
  } else {
    await deleteRecording(audioId);
  }

  const fresh = (await PracticeSession.findById(session._id))!;
  const saved = fresh.items.find((i) => String(i.question) === fields.questionId)!;
  return {
    result: fresh.mode === 'test' ? null : answerView(saved),
    received: true,
    progress: {
      answered: fresh.items.filter((i) => i.answeredAt).length,
      total: fresh.items.length,
    },
  };
}

export interface SummaryItem extends AnswerView {
  prompt: VoicePrompt;
  answered: boolean;
}

export interface SessionSummary {
  sessionId: string;
  mode: string;
  task: VoiceTask | null;
  total: number;
  answered: number;
  correct: number;
  overall: number;
  band: Band;
  skills: Partial<Record<Skill, number>>;
  sections?: { title: string; task: VoiceTask; score: number; answered: number; total: number }[];
  items: SummaryItem[];
  finishedAt: string | null;
}

/** Ends a session (idempotent) and returns its report. Unanswered mock-test items count as 0. */
export async function finishSession(userId: string, sessionId: string): Promise<SessionSummary> {
  const session = await loadSession(userId, sessionId);
  const byId = await questionsFor(session);
  const test = session.mode === 'test';

  const scored = session.items.filter((i) => i.answeredAt);
  const pool = test ? session.items : scored;
  const overall = pool.length
    ? Math.round(pool.reduce((sum, i) => sum + (i.score ?? 0), 0) / pool.length)
    : 0;

  if (session.status === 'active') {
    session.status = 'finished';
    session.finishedAt = new Date();
    session.overall = overall;
    await session.save();
  }

  const items: SummaryItem[] = session.items.flatMap((item) => {
    const q = byId.get(String(item.question));
    if (!q) return [];
    const prompt = toVoicePrompt(q, item.task as VoiceTask, {
      test,
      section: item.section ?? undefined,
    });
    const view = answerView(item);
    return [{ ...view, prompt, answered: !!item.answeredAt }];
  });

  return {
    sessionId: String(session._id),
    mode: session.mode,
    task: (session.task ?? null) as VoiceTask | null,
    total: session.items.length,
    answered: scored.length,
    correct: scored.filter((i) => i.correct).length,
    overall,
    band: bandFor(overall),
    skills: skillAverages(
      scored.map((i) => ({ skills: i.skills as Partial<Record<Skill, number>> })),
    ),
    ...(test
      ? {
          sections: TEST_SECTIONS.map((s, index) => {
            const inSection = session.items.filter((i) => i.section === index);
            const sum = inSection.reduce((acc, i) => acc + (i.score ?? 0), 0);
            return {
              title: s.title,
              task: s.task,
              score: inSection.length ? Math.round(sum / inSection.length) : 0,
              answered: inSection.filter((i) => i.answeredAt).length,
              total: inSection.length,
            };
          }),
        }
      : {}),
    items,
    finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
  };
}

export interface VoiceCatalog {
  tasks: {
    task: VoiceTask;
    available: number;
    done: number;
    average: number | null;
    best: number | null;
  }[];
  mistakes: number;
  stt: 'whisper' | 'browser';
}

export async function voiceCatalog(userId: string): Promise<VoiceCatalog> {
  const [available, mine, mistakes] = await Promise.all([
    Promise.all(VOICE_TASKS.map((task) => Question.countDocuments(taskFilter(task)))),
    PracticeSession.aggregate<{ _id: VoiceTask; done: number; average: number; best: number }>([
      { $match: { userId: oid(userId) } },
      { $unwind: '$items' },
      { $match: { 'items.answeredAt': { $ne: null } } },
      {
        $group: {
          _id: '$items.task',
          done: { $sum: 1 },
          average: { $avg: '$items.score' },
          best: { $max: '$items.score' },
        },
      },
    ]),
    SeenQuestion.countDocuments({ userId: oid(userId), lastCorrect: false }),
  ]);
  const mineBy = new Map(mine.map((m) => [m._id, m]));
  return {
    tasks: VOICE_TASKS.map((task, i) => {
      const m = mineBy.get(task);
      return {
        task,
        available: available[i]!,
        done: m?.done ?? 0,
        average: m ? Math.round(m.average) : null,
        best: m ? Math.round(m.best) : null,
      };
    }),
    mistakes,
    stt: getStt() ? 'whisper' : 'browser',
  };
}

export interface TestHistoryItem {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  overall: number | null;
  band: Band | null;
  answered: number;
  total: number;
}

export async function testHistory(userId: string): Promise<TestHistoryItem[]> {
  const tests = await PracticeSession.find({ userId: oid(userId), mode: 'test' })
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();
  return tests.map((t) => ({
    id: String(t._id),
    status: t.status,
    startedAt: (t as { createdAt: Date }).createdAt.toISOString(),
    finishedAt: t.finishedAt ? t.finishedAt.toISOString() : null,
    overall: t.overall ?? null,
    band: typeof t.overall === 'number' ? bandFor(t.overall) : null,
    answered: t.items.filter((i) => i.answeredAt).length,
    total: t.items.length,
  }));
}

export interface PracticeStats {
  answeredToday: number;
  dailyGoal: number;
  streakDays: number;
  week: boolean[];
  totalAnswered: number;
  averageScore: number | null;
  testsTaken: number;
  bestTest: number | null;
}

/** Daily goal, streak and totals, using the student's time zone for day boundaries. */
export async function practiceStats(userId: string, tz?: string): Promise<PracticeStats> {
  const zone = safeTimeZone(tz);
  const [perDay, tests] = await Promise.all([
    PracticeSession.aggregate<{ _id: string; n: number; scoreSum: number }>([
      { $match: { userId: oid(userId) } },
      { $unwind: '$items' },
      { $match: { 'items.answeredAt': { $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$items.answeredAt', timezone: zone } },
          n: { $sum: 1 },
          scoreSum: { $sum: { $ifNull: ['$items.score', 0] } },
        },
      },
    ]),
    PracticeSession.find({ userId: oid(userId), mode: 'test', status: 'finished' })
      .select('overall')
      .lean(),
  ]);

  const today = dayKey(new Date(), zone);
  const days = new Set(perDay.map((d) => d._id));
  const totalAnswered = perDay.reduce((sum, d) => sum + d.n, 0);
  const scoreSum = perDay.reduce((sum, d) => sum + d.scoreSum, 0);
  const testScores = tests.map((t) => t.overall).filter((v): v is number => typeof v === 'number');

  return {
    answeredToday: perDay.find((d) => d._id === today)?.n ?? 0,
    dailyGoal: DAILY_GOAL,
    streakDays: computeStreak(days, today),
    week: weekActivity(days, today),
    totalAnswered,
    averageScore: totalAnswered ? Math.round(scoreSum / totalAnswered) : null,
    testsTaken: testScores.length,
    bestTest: testScores.length ? Math.max(...testScores) : null,
  };
}

/** A student flags a problem; enough reports hide the question until an admin reviews it. */
export async function reportQuestion(
  userId: string,
  questionId: string,
  reason: string,
  note?: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(questionId)) throw AppError.notFound('Question not found.');
  const question = await Question.findOneAndUpdate(
    { _id: questionId, 'reports.userId': { $ne: oid(userId) } },
    { $push: { reports: { userId: oid(userId), reason, note } } },
    { returnDocument: 'after' },
  );
  if (!question) {
    if (!(await Question.exists({ _id: questionId })))
      throw AppError.notFound('Question not found.');
    return;
  }
  if (question.reports.length >= FLAG_THRESHOLD && question.status === 'published') {
    await Question.updateOne({ _id: question._id }, { status: 'flagged' });
  }
}
