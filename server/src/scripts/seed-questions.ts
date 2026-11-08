/**
 * Loads the question bank from server/seed/questions/*.json into MongoDB.
 * Safe to run again: questions already in the database are not changed.
 * Usage: npm run seed:questions   (or in Docker: node dist/scripts/seed-questions.js)
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { loadSeedQuestions, seedQuestions } from '../modules/questions/seed-bank.js';

const { questions, problems } = loadSeedQuestions();
if (problems.length) {
  console.error('Seed files have problems:');
  for (const p of problems) console.error(`  ${p.file} #${p.index}: ${p.message}`);
  process.exit(1);
}

await connectDB();
const { inserted, existing } = await seedQuestions(questions);
console.log(
  `Question bank: ${inserted} added, ${existing} already present (${questions.length} in seed files).`,
);
await disconnectDB();
