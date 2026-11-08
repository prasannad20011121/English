/**
 * Writes AI draft questions from the command line (they still need admin approval).
 * Usage: npm run generate:questions -- --type spot_error --tag tenses --difficulty 2 --count 10
 */
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { connectDB, disconnectDB } from '../config/db.js';
import { generateQuestions } from '../modules/questions/generator.service.js';
import { TAGS, WRITTEN_TYPES } from '../modules/questions/question.schemas.js';
import { AppError } from '../utils/app-error.js';

const { values } = parseArgs({
  options: {
    type: { type: 'string' },
    tag: { type: 'string' },
    difficulty: { type: 'string', default: '2' },
    count: { type: 'string', default: '10' },
  },
});

const args = z
  .object({
    type: z.enum(WRITTEN_TYPES),
    tag: z.enum(TAGS),
    difficulty: z.coerce.number().pipe(z.union([z.literal(1), z.literal(2), z.literal(3)])),
    count: z.coerce.number().int().min(1).max(20),
  })
  .safeParse(values);

if (!args.success) {
  console.error(
    `Usage: npm run generate:questions -- --type <${WRITTEN_TYPES.join('|')}> --tag <${TAGS.join('|')}> [--difficulty 1-3] [--count 1-20]`,
  );
  console.error(z.prettifyError(args.error));
  process.exit(1);
}

await connectDB();
try {
  const report = await generateQuestions(args.data);
  console.log(`Model: ${report.model}`);
  console.log(
    `Saved ${report.created.length} of ${report.requested} as drafts (review them in Admin › Questions).`,
  );
  for (const r of report.rejected)
    console.log(`  rejected: ${r.reason}${r.prompt ? `\n            ${r.prompt}` : ''}`);
} catch (err) {
  console.error(err instanceof AppError ? err.message : err);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
