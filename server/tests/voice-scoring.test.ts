import { describe, expect, it } from 'vitest';
import type { QuestionFields } from '../src/models/question.model.js';
import { align } from '../src/modules/voice/scoring/align.js';
import { evaluate, vocabularyScore } from '../src/modules/voice/scoring/evaluate.js';
import { clarity, fluency, rateScore } from '../src/modules/voice/scoring/fluency.js';
import {
  canonical,
  containsPhrase,
  normalize,
  numberToWords,
  words,
} from '../src/modules/voice/scoring/normalize.js';
import { bandFor, skillAverages } from '../src/modules/voice/scoring/report.js';
import { TASKS } from '../src/modules/voice/tasks.js';

const q = (fields: Partial<QuestionFields>) => fields as QuestionFields;

describe('normalize', () => {
  it('lower-cases, strips punctuation and expands contractions', () => {
    expect(normalize("It's late, isn't it? Let's go!")).toBe('it is late is not it let us go');
    expect(normalize("I'm sure they'll come; we've won't")).toBe(
      'i am sure they will come we have will not',
    );
    expect(normalize('Kavya’s bus')).toBe("kavya's bus");
  });

  it('writes numbers, times and ordinals as words', () => {
    expect(normalize('The 3rd floor at 10:15 a.m.')).toBe('the third floor at ten fifteen am');
    expect(normalize('24 hours, 80% of 1,500')).toBe(
      'twenty four hours eighty percent of one thousand five hundred',
    );
    expect(normalize('the 21st and 15th')).toBe('the twenty first and fifteenth');
    expect(numberToWords(120)).toBe('one hundred twenty');
  });

  it('treats British and American spellings alike', () => {
    expect(canonical('colour')).toBe(canonical('color'));
    expect(canonical('organise')).toBe(canonical('organize'));
    expect(canonical('travelled')).toBe(canonical('traveled'));
    expect(canonical('programme')).toBe(canonical('program'));
  });

  it('finds phrases ignoring simple endings', () => {
    const heard = words('He returned the wallets to Mr Rao');
    expect(containsPhrase(heard, 'wallet')).toBe(true);
    expect(containsPhrase(heard, 'gave back')).toBe(false);
    expect(containsPhrase(words('it is on the 3rd floor'), 'third')).toBe(true);
  });
});

describe('align', () => {
  it('scores a perfect reading as 100', () => {
    const a = align(words('The bus leaves at seven.'), words('the bus leaves at seven'));
    expect(a.accuracy).toBe(100);
    expect(a.ops.every((o) => o.type === 'ok')).toBe(true);
  });

  it('marks missing, wrong, close and extra words', () => {
    const a = align(
      words('Please submit your assignment today'),
      words('please submit you assignments now really'),
    );
    const types = a.ops.map((o) => o.type);
    expect(types).toContain('close'); // assignment / assignments
    expect(types).toContain('sub'); // your / you  or today / now
    expect(types).toContain('extra');
    expect(a.accuracy).toBeLessThan(70);
    expect(a.accuracy).toBeGreaterThan(20);
  });

  it('handles empty input', () => {
    expect(align(words('one two'), []).accuracy).toBe(0);
    expect(align([], []).accuracy).toBe(0);
  });
});

describe('fluency', () => {
  it('rewards a comfortable speaking rate', () => {
    expect(rateScore(130)).toBe(100);
    expect(rateScore(70)).toBeLessThan(70);
    expect(rateScore(220)).toBeLessThan(70);
  });

  it('uses Whisper word timings when present', () => {
    const timed = 'the bus leaves at half past seven'
      .split(' ')
      .map((w, i) => ({ word: w, start: 0.5 + i * 0.4, end: 0.8 + i * 0.4 }));
    const f = fluency({ wordCount: 7, fillers: 0, durationMs: 6000, words: timed });
    expect(f.latencyMs).toBe(500);
    expect(f.longPauses).toBe(0);
    expect(f.wpm).toBe(Math.round((7 / 2.7) * 60));
    expect(f.score).toBe(100);
  });

  it('falls back to browser measurements and penalises long pauses and fillers', () => {
    const smooth = fluency({
      wordCount: 60,
      fillers: 0,
      durationMs: 31000,
      metrics: { firstSoundMs: 1000, speechMs: 26000, longPauses: 0 },
    });
    const halting = fluency({
      wordCount: 60,
      fillers: 6,
      durationMs: 31000,
      metrics: { firstSoundMs: 4000, speechMs: 26000, longPauses: 4 },
    });
    expect(smooth.score).toBeGreaterThan(90);
    expect(halting.score).toBeLessThan(smooth.score - 30);
  });

  it('turns Whisper confidence into a clarity score', () => {
    expect(clarity([{ avgLogprob: -0.05 }])).toBeGreaterThan(90);
    expect(clarity([{ avgLogprob: -1.2 }])).toBe(0);
    expect(clarity([])).toBeNull();
  });
});

describe('evaluators', () => {
  const sentence = 'Please submit your assignment before the end of the week.';

  it('read aloud: accuracy, fluency and pronunciation', async () => {
    const good = await evaluate({
      task: 'read_aloud',
      question: q({ prompt: sentence }),
      transcript: sentence,
      durationMs: 5000,
      metrics: { firstSoundMs: 400, speechMs: 4300 },
    });
    expect(good.score).toBeGreaterThanOrEqual(90);
    expect(good.correct).toBe(true);
    expect(good.skills).toMatchObject({ accuracy: 100, pronunciation: 100 });

    const poor = await evaluate({
      task: 'read_aloud',
      question: q({ prompt: sentence }),
      transcript: 'please submit the before week',
      durationMs: 5000,
    });
    expect(poor.score).toBeLessThan(60);
    expect(poor.feedback[0]).toMatch(/Check these words/);
  });

  it('gives zero with a helpful tip when nothing was heard', async () => {
    const r = await evaluate({
      task: 'repeat',
      question: q({ prompt: sentence }),
      transcript: '  um  ',
      durationMs: 4000,
    });
    expect(r).toMatchObject({ score: 0, correct: false });
    expect(r.feedback[0]).toMatch(/couldn't hear/);
  });

  it('listen & complete: accepts the missing word alone or the whole sentence', async () => {
    const question = q({
      prompt: 'She is very good ___ solving puzzles.',
      options: ['in', 'at', 'on', 'for'],
      answer: 1,
    });
    const short = await evaluate({
      task: 'listen_complete',
      question,
      transcript: 'At.',
      durationMs: 1500,
    });
    expect(short.correct).toBe(true);
    const sentenceReply = await evaluate({
      task: 'listen_complete',
      question,
      transcript: 'She is very good at solving puzzles',
      durationMs: 3000,
    });
    expect(sentenceReply.correct).toBe(true);
    const wrong = await evaluate({
      task: 'listen_complete',
      question,
      transcript: 'in',
      durationMs: 1500,
    });
    expect(wrong.correct).toBe(false);
    expect(wrong.feedback[0]).toContain('"at"');
    const both = await evaluate({
      task: 'listen_complete',
      question,
      transcript: 'in or at',
      durationMs: 1500,
    });
    expect(both.correct).toBe(false);
  });

  it('listen & correct: the mistake must be fixed', async () => {
    const question = q({
      prompt: 'Each of the students have submitted the work on time.',
      correction: 'Each of the students has submitted the work on time.',
    });
    const fixed = await evaluate({
      task: 'listen_correct',
      question,
      transcript: 'Each of the students has submitted the work on time',
      durationMs: 4000,
    });
    expect(fixed.correct).toBe(true);
    expect(fixed.score).toBe(100);
    const repeated = await evaluate({
      task: 'listen_correct',
      question,
      transcript: 'Each of the students have submitted the work on time',
      durationMs: 4000,
    });
    expect(repeated.correct).toBe(false);
    expect(repeated.score).toBeLessThan(50);

    const removal = q({
      prompt: 'My brother is more older than me.',
      correction: 'My brother is older than me.',
    });
    expect(
      (
        await evaluate({
          task: 'listen_correct',
          question: removal,
          transcript: 'my brother is older than me',
          durationMs: 3000,
        })
      ).correct,
    ).toBe(true);
    expect(
      (
        await evaluate({
          task: 'listen_correct',
          question: removal,
          transcript: 'my brother is more older than me',
          durationMs: 3000,
        })
      ).correct,
    ).toBe(false);
  });

  it('short answers and conversations: any accepted answer counts', async () => {
    const question = q({ prompt: 'Which floor is HR on?', acceptedAnswers: ['third', 'three'] });
    expect(
      (
        await evaluate({
          task: 'conversation',
          question,
          transcript: "It's on the 3rd floor.",
          durationMs: 2000,
        })
      ).correct,
    ).toBe(true);
    expect(
      (
        await evaluate({
          task: 'conversation',
          question,
          transcript: 'second floor',
          durationMs: 2000,
        })
      ).correct,
    ).toBe(false);
    const sa = q({ prompt: 'How many hours in a day?', acceptedAnswers: ['twenty four'] });
    expect(
      (await evaluate({ task: 'short_answer', question: sa, transcript: '24', durationMs: 1500 }))
        .correct,
    ).toBe(true);
  });

  it('sentence builds: order matters', async () => {
    const question = q({
      prompt: "The train leaves at six o'clock.",
      phrases: ["at six o'clock", 'the train', 'leaves'],
    });
    expect(
      (
        await evaluate({
          task: 'sentence_build',
          question,
          transcript: "the train leaves at six o'clock",
          durationMs: 3000,
        })
      ).correct,
    ).toBe(true);
    const jumbled = await evaluate({
      task: 'sentence_build',
      question,
      transcript: "at six o'clock the train leaves",
      durationMs: 3000,
    });
    expect(jumbled.correct).toBe(false);
  });

  it('story retelling: key points covered', async () => {
    const question = q({
      passage: 'Anil found a wallet…',
      keyPoints: [
        { label: 'found a wallet', keywords: ['wallet', 'purse'] },
        { label: 'called the owner', keywords: ['called', 'phoned', 'owner'] },
        { label: 'returned it', keywords: ['returned', 'gave back'] },
        { label: 'got sweets', keywords: ['sweets'] },
      ] as QuestionFields['keyPoints'],
    });
    const r = await evaluate({
      task: 'story_retell',
      question,
      transcript:
        'Anil found a purse on the bus. He phoned the owner and gave back the purse the same evening.',
      durationMs: 20000,
      metrics: { firstSoundMs: 800, speechMs: 9000, longPauses: 0 },
    });
    expect(r.keyPoints!.map((k) => k.covered)).toEqual([true, true, true, false]);
    expect(r.skills.listening).toBe(75);
    expect(r.feedback[0]).toContain('got sweets');
  });

  it('topic talk: fluency, length, vocabulary and optional grammar', async () => {
    const talk =
      'My favourite festival is Pongal. We celebrate it in January to thank the sun and the farmers. ' +
      'My family wakes up early, we decorate the house with kolam and cook sweet pongal in a new pot. ' +
      'In the evening we visit relatives, and my cousins and I play games in the street. ' +
      'I enjoy it because the whole village comes together and everyone feels grateful for the harvest.';
    const base = {
      task: 'topic_talk' as const,
      question: q({ prompt: 'Describe a festival', answerSeconds: 60 }),
      transcript: talk,
      durationMs: 60000,
      metrics: { firstSoundMs: 1200, speechMs: 36000, longPauses: 1 },
    };
    const r = await evaluate(base);
    expect(r.score).toBeGreaterThan(60);
    expect(r.skills.accuracy).toBeUndefined();
    const withGrammar = await evaluate(base, {
      grammarIssues: async () => ['agreement error', 'article error'],
    });
    expect(withGrammar.skills.accuracy).toBeLessThan(100);
    const brief = await evaluate({
      ...base,
      transcript: 'I like Pongal festival very much.',
      metrics: { firstSoundMs: 1000, speechMs: 3000 },
    });
    expect(brief.score).toBeLessThan(r.score);
    expect(brief.feedback[0]).toMatch(/keep talking/);
  });

  it('measures vocabulary range', () => {
    expect(vocabularyScore(words('the the the the the the the the the the the the'))).toBe(0);
    expect(
      vocabularyScore(
        words(
          'My favourite festival is Pongal because families cook sweet rice together and visit relatives happily',
        ),
      ),
    ).toBe(100);
  });
});

describe('tasks and reports', () => {
  it('gives sensible answer times', () => {
    expect(
      TASKS.read_aloud.answerSeconds({ prompt: 'a b c d e f g h i j k l m n o p q r s t' }),
    ).toBe(20);
    expect(TASKS.topic_talk.answerSeconds({ prompt: 'x', answerSeconds: 120 })).toBe(120);
  });

  it('averages skills and assigns bands', () => {
    expect(
      skillAverages([
        { skills: { fluency: 80, listening: 100 } },
        { skills: { fluency: 60 } },
        { skills: null },
      ]),
    ).toEqual({ fluency: 70, listening: 100 });
    expect(bandFor(95)).toEqual({ label: 'Expert', cefr: 'C2' });
    expect(bandFor(65).cefr).toBe('B2');
    expect(bandFor(10).cefr).toBe('A2');
  });
});
