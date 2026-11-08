import { describe, expect, it } from 'vitest';
import { Question } from '../src/models/question.model.js';
import {
  contentHash,
  questionContentSchema,
  shuffleOptions,
  WRITTEN_TYPES,
} from '../src/modules/questions/question.schemas.js';
import { loadSeedQuestions, seedQuestions } from '../src/modules/questions/seed-bank.js';

describe('seed question bank', () => {
  const { questions, problems } = loadSeedQuestions();

  it('has no invalid or duplicate items', () => {
    expect(problems).toEqual([]);
    expect(questions.length).toBeGreaterThanOrEqual(150);
  });

  it('covers every written type at all three difficulties', () => {
    for (const type of WRITTEN_TYPES) {
      const ofType = questions.filter((q) => q.type === type);
      expect(ofType.length, type).toBeGreaterThanOrEqual(10);
      expect(new Set(ofType.map((q) => q.difficulty)), type).toEqual(new Set([1, 2, 3]));
    }
  });

  it('includes some "No error" spot-the-error items', () => {
    const noError = questions.filter((q) => q.type === 'spot_error' && q.answer === 4);
    expect(noError.length).toBeGreaterThanOrEqual(5);
  });

  it('seeds idempotently', async () => {
    const first = await seedQuestions(questions);
    expect(first).toEqual({ inserted: questions.length, existing: 0 });
    const again = await seedQuestions(questions);
    expect(again).toEqual({ inserted: 0, existing: questions.length });
    expect(await Question.countDocuments({ status: 'published', source: 'seed' })).toBe(
      questions.length,
    );
  });
});

describe('question content rules', () => {
  const base = { difficulty: 1, tags: ['articles'], explanation: 'Because of a clear rule.' };
  const fill = {
    ...base,
    type: 'fill_blank',
    prompt: 'She is ___ honest person.',
    options: ['a', 'an', 'the', 'some'],
    answer: 1,
  };
  const spot = {
    ...base,
    type: 'spot_error',
    segments: ['Each of the students', 'have submitted', 'the work', 'on time.'],
    answer: 1,
    correction: 'Each of the students has submitted the work on time.',
  };
  const error = (q: unknown) => {
    const r = questionContentSchema.safeParse(q);
    return r.success ? null : r.error.issues[0]!.message;
  };

  it('accepts well-formed questions', () => {
    expect(error(fill)).toBeNull();
    expect(error(spot)).toBeNull();
    expect(error({ ...spot, answer: 4, correction: undefined })).toBeNull();
  });

  it('rejects blanks, options and answers that do not fit', () => {
    expect(error({ ...fill, prompt: 'She ___ is ___ person.' })).toMatch(/exactly one/);
    expect(error({ ...fill, options: ['a', 'an', 'A', 'the'] })).toMatch(/different/);
    expect(error({ ...fill, options: ['a', 'an', 'the'] })).toMatch(/4 options/);
    expect(error({ ...fill, answer: 4 })).not.toBeNull();
    expect(error({ ...fill, type: 'synonym', prompt: 'A plain sentence.' })).toMatch(
      /\*\*word\*\*/,
    );
  });

  it('checks that a spot-the-error correction only changes the marked part', () => {
    expect(error({ ...spot, correction: undefined })).toMatch(/corrected sentence/);
    expect(error({ ...spot, correction: spot.segments.join(' ') })).toMatch(/differ/);
    expect(
      error({ ...spot, correction: 'Each of the pupils has submitted the work on time.' }),
    ).toMatch(/Part A must stay unchanged/);
    expect(error({ ...spot, answer: 4 })).toMatch(/No error/);
  });

  it('shuffles options deterministically and keeps the right answer', () => {
    const parsed = questionContentSchema.parse({
      ...fill,
      type: 'sentence_completion',
      prompt: 'Although it rained, ___',
      options: ['we played.', 'but we played.', 'so we played.', 'because we played.'],
      answer: 0,
    });
    const a = shuffleOptions(parsed);
    const b = shuffleOptions(parsed);
    expect(a).toEqual(b);
    if (a.type === 'spot_error') throw new Error('unexpected');
    expect(a.options[a.answer]).toBe('we played.');
    expect(contentHash(a)).toBe(contentHash(parsed));
  });
});
