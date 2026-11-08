import type { QuestionFields } from '../../../models/question.model.js';
import type { Skill, VoiceTask } from '../tasks.js';
import { align, type AlignOp } from './align.js';
import { clarity, fluency, type ClientMetrics, type TimedWord } from './fluency.js';
import { FILLERS, containsPhrase, stem, words } from './normalize.js';

/** What the checker may use to judge open answers (grammar). Optional. */
export interface OpenAnswerHelpers {
  grammarIssues?: (text: string) => Promise<string[]>;
}

export interface EvalInput {
  task: VoiceTask;
  question: QuestionFields;
  transcript: string;
  durationMs: number;
  words?: TimedWord[];
  segments?: { avgLogprob?: number }[];
  metrics?: ClientMetrics;
}

export interface EvalMetrics {
  wpm?: number | null;
  longPauses?: number;
  fillers?: number;
  latencyMs?: number | null;
  clarity?: number | null;
  speakingSec?: number;
  wordCount?: number;
}

export interface EvalResult {
  score: number;
  correct: boolean;
  skills: Partial<Record<Skill, number>>;
  transcript: string;
  alignment?: AlignOp[];
  metrics: EvalMetrics;
  /** Short, actionable tips. */
  feedback: string[];
  /** What a good answer looked like (shown after answering). */
  reveal: Record<string, unknown>;
  /** Key points covered (story retelling). */
  keyPoints?: { label: string; covered: boolean }[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function heardWords(transcript: string) {
  const all = words(transcript);
  const fillers = all.filter((w) => FILLERS.has(w)).length;
  return { heard: all.filter((w) => !FILLERS.has(w)), fillers };
}

function fillBlank(prompt: string, option: string) {
  return prompt.replace('___', option).replace(/\s+/g, ' ');
}

function revealFor(task: VoiceTask, q: QuestionFields): Record<string, unknown> {
  switch (task) {
    case 'read_aloud':
    case 'repeat':
      return { reference: q.prompt };
    case 'listen_complete':
      return {
        sentence: fillBlank(q.prompt, q.options![q.answer!]!),
        answer: q.options![q.answer!],
        explanation: q.explanation,
      };
    case 'listen_correct':
      return { original: q.prompt, correction: q.correction, explanation: q.explanation };
    case 'short_answer':
    case 'conversation':
      return {
        question: q.prompt,
        acceptedAnswers: q.acceptedAnswers,
        explanation: q.explanation,
        ...(q.script ? { script: q.script } : {}),
      };
    case 'sentence_build':
      return { reference: q.prompt, phrases: q.phrases };
    case 'story_retell':
      return { passage: q.passage, keyPoints: q.keyPoints?.map((k) => k.label ?? '') };
    case 'topic_talk':
      return { hints: q.hints, ...(q.sampleAnswer ? { sampleAnswer: q.sampleAnswer } : {}) };
  }
}

function paceTips(wpm: number | null | undefined, longPauses: number, fillers: number): string[] {
  const tips: string[] = [];
  if (wpm && wpm < 95) tips.push('Speak a little faster: aim for a steady, natural pace.');
  if (wpm && wpm > 180) tips.push('Slow down slightly so every word is clear.');
  if (longPauses >= 2) tips.push('Try to avoid long pauses; keep the sentence flowing.');
  if (fillers >= 3) tips.push('Use fewer filler sounds like "um" and "uh".');
  return tips;
}

function missingTip(ops: AlignOp[]): string[] {
  const missing = ops.filter((o) => o.type === 'missing' || o.type === 'sub').map((o) => o.ref);
  if (!missing.length) return [];
  const list = missing
    .slice(0, 5)
    .map((w) => `"${w}"`)
    .join(', ');
  return [`Check these words: ${list}${missing.length > 5 ? '…' : ''}.`];
}

/** Scores one spoken answer. Pure apart from the optional grammar helper. */
export async function evaluate(
  input: EvalInput,
  helpers: OpenAnswerHelpers = {},
): Promise<EvalResult> {
  const { task, question: q, transcript } = input;
  const { heard, fillers } = heardWords(transcript);
  const reveal = revealFor(task, q);

  if (!heard.length) {
    return {
      score: 0,
      correct: false,
      skills: {},
      transcript,
      metrics: { wordCount: 0, fillers },
      feedback: [
        "We couldn't hear an answer. Check your microphone and speak clearly after the beep.",
      ],
      reveal,
    };
  }

  const flu = () =>
    fluency({
      wordCount: heard.length,
      fillers,
      durationMs: input.durationMs,
      words: input.words,
      metrics: input.metrics,
    });
  const clar = clarity(input.segments);

  switch (task) {
    case 'read_aloud':
    case 'repeat': {
      const a = align(words(q.prompt), heard);
      const f = flu();
      const pron = clar ?? a.accuracy;
      const score =
        task === 'read_aloud'
          ? 0.5 * a.accuracy + 0.3 * f.score + 0.2 * pron
          : 0.7 * a.accuracy + 0.3 * f.score;
      return {
        score: clamp(score),
        correct: a.accuracy >= 80,
        skills:
          task === 'read_aloud'
            ? { accuracy: a.accuracy, fluency: f.score, pronunciation: pron }
            : { listening: a.accuracy, fluency: f.score, pronunciation: pron },
        transcript,
        alignment: a.ops,
        metrics: { ...f, clarity: clar, wordCount: heard.length },
        feedback: [...missingTip(a.ops), ...paceTips(f.wpm, f.longPauses, f.fillers)],
        reveal,
      };
    }

    case 'listen_complete': {
      const options = q.options!;
      const expected = options[q.answer!]!;
      let pick: number;
      if (heard.length <= words(expected).length + 2) {
        // A short reply: which option was said?
        const said = options.map((o) => containsPhrase(heard, o));
        pick =
          said[q.answer!] && said.filter(Boolean).length === 1 ? q.answer! : said.indexOf(true);
      } else {
        // The whole sentence was said: which version fits best?
        const scores = options.map((o) => align(words(fillBlank(q.prompt, o)), heard).accuracy);
        const best = Math.max(...scores);
        pick = scores.indexOf(best);
      }
      const correct = pick === q.answer;
      return {
        score: correct ? 100 : 0,
        correct,
        skills: { listening: correct ? 100 : 0, accuracy: correct ? 100 : 0 },
        transcript,
        metrics: { wordCount: heard.length },
        feedback: correct ? [] : [`The missing word was "${expected}".`],
        reveal,
      };
    }

    case 'listen_correct': {
      const target = words(q.correction ?? q.prompt);
      const original = words(q.prompt);
      // Words the correction adds, and words it removes, compared with the original.
      const diff = align(original, target).ops;
      const added = diff.filter((o) => o.type !== 'ok' && o.heard).map((o) => stem(o.heard!));
      const removed = diff
        .filter((o) => (o.type === 'missing' || o.type === 'sub') && o.ref)
        .map((o) => stem(o.ref!))
        .filter((w) => !target.map(stem).includes(w));
      const heardStems = heard.map(stem);
      const fixed =
        added.every((w) => heardStems.includes(w)) && removed.every((w) => !heardStems.includes(w));
      const a = align(target, heard);
      const score = fixed ? a.accuracy : a.accuracy * 0.4;
      return {
        score: clamp(score),
        correct: fixed && a.accuracy >= 60,
        skills: { listening: a.accuracy, accuracy: fixed ? 100 : 0 },
        transcript,
        alignment: a.ops,
        metrics: { wordCount: heard.length },
        feedback: fixed
          ? missingTip(a.ops)
          : ['The mistake was not fixed. Compare with the correct sentence.'],
        reveal,
      };
    }

    case 'short_answer':
    case 'conversation': {
      const correct = (q.acceptedAnswers ?? []).some((ans) => containsPhrase(heard, ans));
      return {
        score: correct ? 100 : 0,
        correct,
        skills:
          task === 'short_answer'
            ? { listening: correct ? 100 : 0, vocabulary: correct ? 100 : 0 }
            : { listening: correct ? 100 : 0 },
        transcript,
        metrics: { wordCount: heard.length },
        feedback: correct ? [] : [`A good answer: "${q.acceptedAnswers?.[0]}".`],
        reveal,
      };
    }

    case 'sentence_build': {
      const a = align(words(q.prompt), heard);
      return {
        score: a.accuracy,
        correct: a.accuracy >= 90,
        skills: { listening: a.accuracy, accuracy: a.accuracy },
        transcript,
        alignment: a.ops,
        metrics: { wordCount: heard.length },
        feedback:
          a.accuracy >= 90 ? [] : ['Put the phrases in an order that makes a correct sentence.'],
        reveal,
      };
    }

    case 'story_retell': {
      const points = (q.keyPoints ?? []).map((kp) => ({
        label: kp.label ?? '',
        covered: kp.keywords.some((k) => containsPhrase(heard, k)),
      }));
      const coverage = points.length
        ? Math.round((points.filter((p) => p.covered).length / points.length) * 100)
        : 0;
      const f = flu();
      const vocab = vocabularyScore(heard);
      const missed = points.filter((p) => !p.covered).map((p) => p.label);
      return {
        score: clamp(0.6 * coverage + 0.4 * f.score),
        correct: coverage >= 60,
        skills: { listening: coverage, fluency: f.score, vocabulary: vocab },
        transcript,
        metrics: { ...f, clarity: clar, wordCount: heard.length },
        keyPoints: points,
        feedback: [
          ...(missed.length ? [`You missed: ${missed.slice(0, 3).join('; ')}.`] : []),
          ...paceTips(f.wpm, f.longPauses, f.fillers),
        ],
        reveal,
      };
    }

    case 'topic_talk': {
      const f = flu();
      const target = q.answerSeconds ?? 90;
      const length = clamp((f.speakingSec / (target * 0.75)) * 100);
      const vocab = vocabularyScore(heard);
      let grammar: number | null = null;
      if (helpers.grammarIssues) {
        try {
          const issues = await helpers.grammarIssues(transcript);
          grammar = clamp(100 - (issues.length / Math.max(heard.length / 100, 0.5)) * 12);
        } catch {
          grammar = null;
        }
      }
      const score =
        grammar === null
          ? 0.5 * f.score + 0.25 * length + 0.25 * vocab
          : 0.4 * f.score + 0.2 * length + 0.2 * vocab + 0.2 * grammar;
      const tips = paceTips(f.wpm, f.longPauses, f.fillers);
      if (length < 70) tips.unshift(`Try to keep talking for most of the ${target} seconds.`);
      if (vocab < 60) tips.push('Use a wider range of words: give examples and reasons.');
      return {
        score: clamp(score),
        correct: score >= 60,
        skills: {
          fluency: f.score,
          vocabulary: vocab,
          ...(grammar !== null ? { accuracy: grammar } : {}),
          ...(clar !== null ? { pronunciation: clar } : {}),
        },
        transcript,
        metrics: { ...f, clarity: clar, wordCount: heard.length },
        feedback: tips,
        reveal,
      };
    }
  }
}

/** Range of vocabulary: share of different words in the first 100 words, scaled to 0–100. */
export function vocabularyScore(heard: string[]): number {
  const sample = heard.slice(0, 100);
  if (sample.length < 10) return clamp(sample.length * 5);
  const ratio = new Set(sample.map(stem)).size / sample.length;
  return clamp(((ratio - 0.3) / 0.35) * 100);
}
