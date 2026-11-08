import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import {
  QUESTION_SOURCES,
  QUESTION_STATUSES,
  Question,
  type QuestionFields,
} from '../../models/question.model.js';
import { getGrammarChecker } from '../../services/grammar/grammar-checker.js';
import { getLlm } from '../../services/llm/llm.client.js';
import { AppError } from '../../utils/app-error.js';
import { generateQuestions } from './generator.service.js';
import { TAGS, WRITTEN_TYPES, contentHash, questionContentSchema } from './question.schemas.js';
import { toQuestionFields } from './seed-bank.js';

type StoredQuestion = QuestionFields & { _id: Types.ObjectId };

/** Everything an admin sees, including the answer key and reports. */
function toAdminQuestion(q: StoredQuestion) {
  return {
    id: String(q._id),
    type: q.type,
    tags: q.tags ?? [],
    difficulty: q.difficulty,
    prompt: q.prompt,
    segments: q.segments?.length ? q.segments : undefined,
    options: q.options?.length ? q.options : undefined,
    answer: q.answer,
    correction: q.correction ?? null,
    explanation: q.explanation,
    status: q.status,
    source: q.source,
    aiModel: q.aiModel ?? null,
    stats: { attempts: q.stats?.attempts ?? 0, correct: q.stats?.correct ?? 0 },
    reports: (q.reports ?? []).map((r) => ({
      reason: r.reason,
      note: r.note ?? null,
      createdAt: r.createdAt,
    })),
    createdAt: (q as { createdAt?: Date }).createdAt ?? null,
    reviewedAt: q.reviewedAt ?? null,
  };
}

const listQuery = z.object({
  status: z.enum(QUESTION_STATUSES).optional(),
  type: z.enum(WRITTEN_TYPES).optional(),
  tag: z.enum(TAGS).optional(),
  source: z.enum(QUESTION_SOURCES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const generateSchema = z.object({
  type: z.enum(WRITTEN_TYPES),
  tag: z.enum(TAGS),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  count: z.number().int().min(1).max(20).default(10),
});

const statusSchema = z.object({ status: z.enum(['draft', 'published', 'retired']) });
const bulkSchema = z.object({
  ids: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .min(1)
    .max(100),
  status: z.enum(['draft', 'published', 'retired']),
});

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function statusUpdate(status: string, adminId: string) {
  return status === 'published'
    ? // Approving also clears old reports, so a fixed question is not re-flagged at once.
      { status, reviewedBy: adminId, reviewedAt: new Date(), reports: [] }
    : { status };
}

/** Mounted at /api/admin/questions. */
export const adminQuestionsRouter = Router();
adminQuestionsRouter.use(requireAuth, requireRole('admin'));

adminQuestionsRouter.get('/', async (req, res) => {
  const { status, type, tag, source, q, page, limit } = listQuery.parse(req.query);
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (tag) filter.tags = tag;
  if (source) filter.source = source;
  if (q) filter.prompt = new RegExp(escapeRegex(q), 'i');

  // Status counts use the other filters only, so every tab shows its own total.
  const withoutStatus = { ...filter };
  delete withoutStatus.status;
  const [items, total, counts] = await Promise.all([
    Question.find(filter)
      .sort({ status: 1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<StoredQuestion[]>(),
    Question.countDocuments(filter),
    Question.aggregate<{ _id: string; n: number }>([
      { $match: withoutStatus },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    items: items.map(toAdminQuestion),
    total,
    page,
    limit,
    counts: Object.fromEntries(
      QUESTION_STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.n ?? 0]),
    ),
  });
});

adminQuestionsRouter.get('/ai-status', (_req, res) => {
  const llm = getLlm();
  res.json({
    enabled: !!llm,
    model: llm?.model ?? null,
    provider: llm && env.LLM_BASE_URL ? new URL(env.LLM_BASE_URL).host : null,
    grammarCheck: !!getGrammarChecker(),
  });
});

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many AI requests. Please wait a few minutes.',
      },
    });
  },
});

adminQuestionsRouter.post(
  '/generate',
  generateLimiter,
  validateBody(generateSchema),
  async (req, res) => {
    res.status(201).json(await generateQuestions(req.body, authUser(req).id));
  },
);

adminQuestionsRouter.post('/bulk-status', validateBody(bulkSchema), async (req, res) => {
  const { ids, status } = req.body as z.infer<typeof bulkSchema>;
  const result = await Question.updateMany(
    { _id: { $in: ids } },
    statusUpdate(status, authUser(req).id),
  );
  res.json({ updated: result.modifiedCount });
});

async function findOr404(id: string) {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Question not found.');
  const q = await Question.findById(id);
  if (!q) throw AppError.notFound('Question not found.');
  return q;
}

/** Replace the content of a question (any status). */
adminQuestionsRouter.put('/:id', validateBody(questionContentSchema), async (req, res) => {
  const q = await findOr404(String(req.params.id));
  const content = req.body as z.infer<typeof questionContentSchema>;
  const hash = contentHash(content);
  if (await Question.exists({ contentHash: hash, _id: { $ne: q._id } })) {
    throw new AppError(409, 'DUPLICATE', 'Another question already has exactly this content.');
  }
  // Clear the fields that belong to the other question shape (e.g. options on spot-the-error).
  q.set({ segments: undefined, options: undefined, correction: undefined });
  q.set(toQuestionFields(content));
  await q.save();
  res.json(toAdminQuestion(q.toObject() as StoredQuestion));
});

adminQuestionsRouter.post('/:id/status', validateBody(statusSchema), async (req, res) => {
  const q = await findOr404(String(req.params.id));
  q.set(statusUpdate(req.body.status, authUser(req).id));
  await q.save();
  res.json(toAdminQuestion(q.toObject() as StoredQuestion));
});
