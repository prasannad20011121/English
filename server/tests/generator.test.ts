import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Question } from '../src/models/question.model.js';
import {
  correctSentence,
  generateQuestions,
  similarity,
} from '../src/modules/questions/generator.service.js';
import { questionContentSchema } from '../src/modules/questions/question.schemas.js';
import { toQuestionFields } from '../src/modules/questions/seed-bank.js';
import { setGrammarChecker } from '../src/services/grammar/grammar-checker.js';
import { FakeLlm } from './fake-llm.js';

const request = { type: 'fill_blank', tag: 'prepositions', difficulty: 1, count: 5 } as const;
const base = { explanation: 'A short rule that explains the answer.' };

const good = {
  ...base,
  prompt: 'Please wait for me ___ the main gate.',
  options: ['at', 'in', 'on', 'to'],
  answer: 0,
};
const twoBlanks = {
  ...base,
  prompt: 'She ___ to the ___ yesterday.',
  options: ['went', 'go', 'goes', 'going'],
  answer: 0,
};
const duplicate = {
  ...base,
  prompt: 'The meeting will start ___ 10 a.m.',
  options: ['in', 'on', 'at', 'for'],
  answer: 2,
};
const wrongKey = {
  ...base,
  prompt: 'He was born ___ 2004 in Madurai.',
  options: ['in', 'on', 'at', 'by'],
  answer: 1,
};
const nearTwin = {
  ...base,
  prompt: 'Please wait for me ___ the main gate today.',
  options: ['at', 'in', 'on', 'by'],
  answer: 0,
};

const writer = (questions: unknown[]) => JSON.stringify({ questions });

describe('AI question generator', () => {
  beforeEach(async () => {
    const seeded = questionContentSchema.parse({
      type: 'fill_blank',
      difficulty: 1,
      tags: ['prepositions'],
      ...duplicate,
    });
    await Question.create({ ...toQuestionFields(seeded), status: 'published', source: 'seed' });
    setGrammarChecker(null);
  });

  afterEach(() => setGrammarChecker(undefined));

  it('refuses to run when no AI is configured', async () => {
    await expect(generateQuestions(request, undefined, null)).rejects.toMatchObject({
      status: 503,
      code: 'AI_NOT_CONFIGURED',
    });
  });

  it('keeps only drafts that pass structure, duplicate and blind-solve checks', async () => {
    const llm = new FakeLlm(
      // The writer wraps its JSON in a code fence, which must be tolerated.
      '```json\n' + writer([good, twoBlanks, duplicate, wrongKey, nearTwin]) + '\n```',
      { [good.prompt]: 'at', [wrongKey.prompt]: 'in' },
    );
    const report = await generateQuestions(request, undefined, llm);

    expect(report.created).toHaveLength(1);
    expect(report.rejected.map((r) => r.reason)).toEqual([
      expect.stringMatching(/Format problem.*exactly one/),
      'Duplicate of a question already in the bank',
      expect.stringMatching(/Too similar/),
      expect.stringMatching(/answer check chose option [ABCD]/),
    ]);

    const draft = await Question.findById(report.created[0]).lean();
    expect(draft).toMatchObject({
      status: 'draft',
      source: 'ai',
      aiModel: 'fake-model',
      prompt: good.prompt,
      tags: ['prepositions'],
      difficulty: 1,
    });
    expect(draft!.options![draft!.answer!]).toBe('at');
    // The examples sent to the writer come from the published bank.
    expect(llm.calls[0]![1]!.content).toContain('10 a.m.');
  });

  it('reports an unusable reply clearly', async () => {
    const llm = new FakeLlm('Sorry, I cannot help with that.');
    await expect(generateQuestions(request, undefined, llm)).rejects.toMatchObject({
      status: 502,
      code: 'LLM_BAD_REPLY',
    });
  });

  it('rejects drafts the grammar checker flags, and skips the check if it is down', async () => {
    setGrammarChecker(async (s) => (s.includes('main gate') ? ['Possible agreement error'] : []));
    const flagged = await generateQuestions(
      request,
      undefined,
      new FakeLlm(writer([good]), { [good.prompt]: 'at' }),
    );
    expect(flagged.created).toHaveLength(0);
    expect(flagged.rejected[0]!.reason).toMatch(/Grammar checker flagged/);
    expect(flagged.grammarChecked).toBe(true);

    setGrammarChecker(async () => {
      throw new Error('LanguageTool is down');
    });
    const skipped = await generateQuestions(
      request,
      undefined,
      new FakeLlm(writer([good]), { [good.prompt]: 'at' }),
    );
    expect(skipped.created).toHaveLength(1);
    expect(skipped.grammarChecked).toBe(false);
  });

  it('checks spot-the-error drafts, including "No error" items', async () => {
    const spot = {
      ...base,
      segments: ['My cousin', 'have been living', 'in Pune', 'since 2020.'],
      answer: 1,
      correction: 'My cousin has been living in Pune since 2020.',
    };
    const correct = {
      ...base,
      segments: ['The students', 'were waiting', 'outside the hall', 'for an hour.'],
      answer: 4,
    };
    const llm = new FakeLlm(writer([spot, correct]), {
      'My cousin': 'have been living',
      'The students': 'No error',
    });
    const report = await generateQuestions(
      { type: 'spot_error', tag: 'tenses', difficulty: 2, count: 2 },
      undefined,
      llm,
    );
    expect(report.created).toHaveLength(2);
    expect(report.rejected).toEqual([]);
  });
});

describe('generator helpers', () => {
  it('builds the sentence with the right answer in place', () => {
    const fill = questionContentSchema.parse({
      type: 'fill_blank',
      difficulty: 1,
      tags: ['articles'],
      ...base,
      prompt: 'We had ___ breakfast early.',
      options: ['a', 'the', 'an', '(no article)'],
      answer: 3,
    });
    expect(correctSentence(fill)).toBe('We had breakfast early.');
    const syn = questionContentSchema.parse({
      type: 'synonym',
      difficulty: 1,
      tags: ['vocabulary'],
      ...base,
      prompt: 'A **brief** talk.',
      options: ['short', 'long', 'loud', 'dull'],
      answer: 0,
    });
    expect(correctSentence(syn)).toBe('A brief talk.');
  });

  it('measures how similar two sentences are', () => {
    expect(
      similarity('Please wait for me at the gate.', 'Please wait for me at the gate today.'),
    ).toBeGreaterThan(0.75);
    expect(similarity('The cat sat on the mat.', 'Results will be announced next week.')).toBe(0);
  });
});
