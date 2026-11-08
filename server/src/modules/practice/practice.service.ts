import { Types } from 'mongoose';
import { PracticeSession, type PracticeSessionDoc } from '../../models/practice-session.model.js';
import { FLAG_THRESHOLD, Question, type QuestionFields } from '../../models/question.model.js';
import { SeenQuestion } from '../../models/seen-question.model.js';
import { AppError } from '../../utils/app-error.js';
import {
  toPublicQuestion,
  toReveal,
  type PublicQuestion,
  type QuestionReveal,
} from '../questions/question.mappers.js';
import { NO_ERROR, TAGS, WRITTEN_TYPES, type QuestionType } from '../questions/question.schemas.js';
import type { AnswerInput, StartSessionInput } from './practice.schemas.js';
import { computeStreak, dayKey, safeTimeZone, weekActivity } from './stats.js';

type StoredQuestion = QuestionFields & { _id: Types.ObjectId };

export const DAILY_GOAL = 5;

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const sessionNotFound = () => AppError.notFound('Practice session not found.');

/**
 * Picks published questions for a student: never-seen ones first (random), then ones they got
 * wrong (oldest first), then the least recently seen. So no repeats until the pool runs out.
 */
export async function pickQuestions(
  userId: string,
  opts: { type: QuestionType; count: number; difficulty?: number; tags?: string[] },
): Promise<StoredQuestion[]> {
  const filter: Record<string, unknown> = { status: 'published', type: opts.type };
  if (opts.difficulty) filter.difficulty = opts.difficulty;
  if (opts.tags?.length) filter.tags = { $in: opts.tags };

  const seen = await SeenQuestion.find({ userId: oid(userId), type: opts.type })
    .select('questionId lastCorrect lastSeenAt')
    .lean();
  const seenIds = seen.map((s) => s.questionId);

  const fresh = await Question.aggregate<StoredQuestion>([
    { $match: { ...filter, _id: { $nin: seenIds } } },
    { $sample: { size: opts.count } },
  ]);
  if (fresh.length >= opts.count || seenIds.length === 0) return fresh;

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
  return [...fresh, ...shuffle(repeats.slice(0, opts.count - fresh.length))];
}

/** Questions this student last answered wrong, oldest first. */
async function pickMistakes(
  userId: string,
  count: number,
  type?: QuestionType,
): Promise<StoredQuestion[]> {
  const wrong = await SeenQuestion.find({
    userId: oid(userId),
    lastCorrect: false,
    ...(type ? { type } : {}),
  })
    .sort({ lastSeenAt: 1 })
    .limit(count * 2)
    .select('questionId')
    .lean();
  const questions = await Question.find({
    _id: { $in: wrong.map((w) => w.questionId) },
    status: 'published',
  }).lean<StoredQuestion[]>();
  const order = new Map(wrong.map((w, i) => [String(w.questionId), i]));
  return questions
    .sort((a, b) => order.get(String(a._id))! - order.get(String(b._id))!)
    .slice(0, count);
}

export interface SessionView {
  session: {
    id: string;
    mode: string;
    type: string | null;
    status: string;
    total: number;
    answered: number;
    score: number;
  };
  questions: PublicQuestion[];
  /** Results for questions already answered (so a reloaded page can resume). */
  answers: ({ questionId: string; chosen: number; correct: boolean } & QuestionReveal)[];
}

export async function startSession(userId: string, input: StartSessionInput): Promise<SessionView> {
  const questions =
    input.mode === 'review'
      ? await pickMistakes(userId, input.count, input.type)
      : await pickQuestions(userId, {
          type: input.type!,
          count: input.count,
          difficulty: input.difficulty,
          tags: input.tags,
        });

  if (!questions.length) {
    throw new AppError(
      404,
      input.mode === 'review' ? 'NO_MISTAKES' : 'NO_QUESTIONS',
      input.mode === 'review'
        ? 'No mistakes to review. Nice work!'
        : 'No questions match these filters yet. Try another topic or difficulty.',
    );
  }

  const session = await PracticeSession.create({
    userId: oid(userId),
    mode: input.mode,
    type: input.mode === 'review' ? (input.type ?? null) : input.type,
    filters: { difficulty: input.difficulty, tags: input.tags },
    items: questions.map((q) => ({ question: q._id })),
  });
  return buildView(session, questions);
}

async function loadSession(userId: string, sessionId: string): Promise<PracticeSessionDoc> {
  if (!Types.ObjectId.isValid(sessionId)) throw sessionNotFound();
  const session = await PracticeSession.findOne({ _id: sessionId, userId: oid(userId) });
  if (!session) throw sessionNotFound();
  return session;
}

async function questionsFor(session: PracticeSessionDoc): Promise<StoredQuestion[]> {
  const ids = session.items.map((i) => i.question);
  const found = await Question.find({ _id: { $in: ids } }).lean<StoredQuestion[]>();
  const byId = new Map(found.map((q) => [String(q._id), q]));
  return ids.map((id) => byId.get(String(id))).filter((q): q is StoredQuestion => !!q);
}

function buildView(session: PracticeSessionDoc, questions: StoredQuestion[]): SessionView {
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const answered = session.items.filter((i) => i.answeredAt);
  return {
    session: {
      id: String(session._id),
      mode: session.mode,
      type: session.type ?? null,
      status: session.status,
      total: session.items.length,
      answered: answered.length,
      score: session.score,
    },
    questions: questions.map(toPublicQuestion),
    answers: answered.flatMap((item) => {
      const q = byId.get(String(item.question));
      return q
        ? [
            {
              questionId: String(q._id),
              chosen: item.chosen!,
              correct: !!item.correct,
              ...toReveal(q),
            },
          ]
        : [];
    }),
  };
}

export async function getSession(userId: string, sessionId: string): Promise<SessionView> {
  const session = await loadSession(userId, sessionId);
  return buildView(session, await questionsFor(session));
}

export interface AnswerResult extends QuestionReveal {
  correct: boolean;
  progress: { answered: number; score: number; total: number };
}

/** Checks one answer on the server. Answering the same question twice returns the first result. */
export async function answerQuestion(
  userId: string,
  sessionId: string,
  input: AnswerInput,
): Promise<AnswerResult> {
  const session = await loadSession(userId, sessionId);
  const item = session.items.find((i) => String(i.question) === input.questionId);
  if (!item) throw AppError.notFound('That question is not part of this session.');

  const question = await Question.findById(input.questionId).lean<StoredQuestion>();
  if (!question) throw AppError.notFound('Question not found.');

  const maxChoice = question.type === 'spot_error' ? NO_ERROR : (question.options?.length ?? 4) - 1;
  if (input.chosen > maxChoice) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid choice.', {
      fields: { chosen: 'Invalid choice' },
    });
  }

  const correct = input.chosen === question.answer;
  const now = new Date();

  // Only the first answer counts (atomic, so double-clicks cannot double-count).
  const update = await PracticeSession.updateOne(
    {
      _id: session._id,
      status: 'active',
      items: { $elemMatch: { question: question._id, answeredAt: null } },
    },
    {
      $set: {
        'items.$.chosen': input.chosen,
        'items.$.correct': correct,
        'items.$.timeMs': input.timeMs,
        'items.$.answeredAt': now,
      },
      $inc: { score: correct ? 1 : 0 },
    },
  );

  if (update.modifiedCount === 1) {
    await Promise.all([
      Question.updateOne(
        { _id: question._id },
        { $inc: { 'stats.attempts': 1, 'stats.correct': correct ? 1 : 0 } },
      ),
      SeenQuestion.updateOne(
        { userId: oid(userId), questionId: question._id },
        {
          $set: { type: question.type, lastCorrect: correct, lastSeenAt: now },
          $inc: { timesSeen: 1, timesCorrect: correct ? 1 : 0 },
        },
        { upsert: true },
      ),
    ]);
  } else if (session.status !== 'active' && !item.answeredAt) {
    throw new AppError(409, 'SESSION_FINISHED', 'This practice session has already finished.');
  }

  const fresh = (await PracticeSession.findById(session._id).lean())!;
  const stored = fresh.items.find((i) => String(i.question) === input.questionId)!;
  return {
    correct: !!stored.correct,
    ...toReveal(question),
    progress: {
      answered: fresh.items.filter((i) => i.answeredAt).length,
      score: fresh.score,
      total: fresh.items.length,
    },
  };
}

export interface SessionSummary {
  sessionId: string;
  mode: string;
  type: string | null;
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  timeMs: number;
  byTag: { tag: string; total: number; correct: number }[];
  mistakes: (PublicQuestion & QuestionReveal & { chosen: number })[];
}

/** Ends a session (idempotent) and returns its summary. */
export async function finishSession(userId: string, sessionId: string): Promise<SessionSummary> {
  const session = await loadSession(userId, sessionId);
  if (session.status === 'active') {
    session.status = 'finished';
    session.finishedAt = new Date();
    await session.save();
  }
  const questions = await questionsFor(session);
  const byId = new Map(questions.map((q) => [String(q._id), q]));

  const byTag = new Map<string, { total: number; correct: number }>();
  const mistakes: SessionSummary['mistakes'] = [];
  let correct = 0;
  let answered = 0;
  let timeMs = 0;

  for (const item of session.items) {
    const q = byId.get(String(item.question));
    if (!q || !item.answeredAt) continue;
    answered++;
    timeMs += item.timeMs ?? 0;
    if (item.correct) correct++;
    else mistakes.push({ ...toPublicQuestion(q), ...toReveal(q), chosen: item.chosen! });
    for (const tag of q.tags ?? []) {
      const t = byTag.get(tag) ?? { total: 0, correct: 0 };
      t.total++;
      if (item.correct) t.correct++;
      byTag.set(tag, t);
    }
  }

  return {
    sessionId: String(session._id),
    mode: session.mode,
    type: session.type ?? null,
    total: session.items.length,
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    timeMs,
    byTag: [...byTag.entries()]
      .map(([tag, v]) => ({ tag, ...v }))
      .sort((a, b) => b.total - a.total),
    mistakes,
  };
}

export interface WrittenCatalog {
  types: { type: QuestionType; available: number; done: number; accuracy: number | null }[];
  tags: { tag: string; available: number }[];
  mistakes: number;
}

export async function writtenCatalog(userId: string): Promise<WrittenCatalog> {
  const [available, tagCounts, seen] = await Promise.all([
    Question.aggregate<{ _id: QuestionType; n: number }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$type', n: { $sum: 1 } } },
    ]),
    Question.aggregate<{ _id: string; n: number }>([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', n: { $sum: 1 } } },
    ]),
    SeenQuestion.aggregate<{
      _id: QuestionType;
      done: number;
      seen: number;
      correct: number;
      wrongNow: number;
    }>([
      { $match: { userId: oid(userId) } },
      {
        $group: {
          _id: '$type',
          done: { $sum: 1 },
          seen: { $sum: '$timesSeen' },
          correct: { $sum: '$timesCorrect' },
          wrongNow: { $sum: { $cond: ['$lastCorrect', 0, 1] } },
        },
      },
    ]),
  ]);

  const availableBy = new Map(available.map((a) => [a._id, a.n]));
  const seenBy = new Map(seen.map((s) => [s._id, s]));
  const tagBy = new Map(tagCounts.map((t) => [t._id, t.n]));

  return {
    types: WRITTEN_TYPES.map((type) => {
      const s = seenBy.get(type);
      return {
        type,
        available: availableBy.get(type) ?? 0,
        done: s?.done ?? 0,
        accuracy: s && s.seen ? Math.round((s.correct / s.seen) * 100) : null,
      };
    }),
    tags: TAGS.map((tag) => ({ tag, available: tagBy.get(tag) ?? 0 })).filter((t) => t.available),
    mistakes: seen.reduce((sum, s) => sum + s.wrongNow, 0),
  };
}

export interface PracticeStats {
  answeredToday: number;
  dailyGoal: number;
  streakDays: number;
  week: boolean[];
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number | null;
}

/** Daily goal, streak and totals, using the student's time zone for day boundaries. */
export async function practiceStats(userId: string, tz?: string): Promise<PracticeStats> {
  const zone = safeTimeZone(tz);
  const perDay = await PracticeSession.aggregate<{ _id: string; n: number; correct: number }>([
    { $match: { userId: oid(userId) } },
    { $unwind: '$items' },
    { $match: { 'items.answeredAt': { $ne: null } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$items.answeredAt', timezone: zone } },
        n: { $sum: 1 },
        correct: { $sum: { $cond: ['$items.correct', 1, 0] } },
      },
    },
  ]);

  const today = dayKey(new Date(), zone);
  const days = new Set(perDay.map((d) => d._id));
  const totalAnswered = perDay.reduce((sum, d) => sum + d.n, 0);
  const totalCorrect = perDay.reduce((sum, d) => sum + d.correct, 0);

  return {
    answeredToday: perDay.find((d) => d._id === today)?.n ?? 0,
    dailyGoal: DAILY_GOAL,
    streakDays: computeStreak(days, today),
    week: weekActivity(days, today),
    totalAnswered,
    totalCorrect,
    accuracy: totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : null,
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
    return; // already reported by this student
  }
  if (question.reports.length >= FLAG_THRESHOLD && question.status === 'published') {
    await Question.updateOne({ _id: question._id }, { status: 'flagged' });
  }
}
