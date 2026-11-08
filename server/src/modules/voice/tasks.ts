import type { QuestionFields } from '../../models/question.model.js';
import type { QuestionType } from '../questions/question.schemas.js';

export const VOICE_TASKS = [
  'read_aloud',
  'repeat',
  'listen_complete',
  'listen_correct',
  'short_answer',
  'sentence_build',
  'conversation',
  'story_retell',
  'topic_talk',
] as const;
export type VoiceTask = (typeof VOICE_TASKS)[number];

export const SKILLS = ['pronunciation', 'fluency', 'accuracy', 'listening', 'vocabulary'] as const;
export type Skill = (typeof SKILLS)[number];

export interface TaskInfo {
  questionType: QuestionType;
  /** Extra MongoDB filter on top of `{ type, status: 'published' }`. */
  filter?: Record<string, unknown>;
  prepSeconds: number;
  answerSeconds: (q: Pick<QuestionFields, 'prompt' | 'answerSeconds'>) => number;
  /** Stop recording automatically after a short silence (short answers). */
  autoStop: boolean;
  /** Questions in a practice round can be replayed once; mock tests play once. */
  replayable: boolean;
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const fixed = (n: number) => (q: Pick<QuestionFields, 'answerSeconds'>) => q.answerSeconds ?? n;

export const TASKS: Record<VoiceTask, TaskInfo> = {
  read_aloud: {
    questionType: 'read_aloud',
    prepSeconds: 5,
    answerSeconds: (q) => q.answerSeconds ?? Math.max(10, Math.ceil(wordCount(q.prompt) * 0.7) + 6),
    autoStop: true,
    replayable: false,
  },
  repeat: {
    questionType: 'repeat',
    prepSeconds: 0,
    answerSeconds: (q) => q.answerSeconds ?? Math.max(8, Math.ceil(wordCount(q.prompt) * 0.6) + 5),
    autoStop: true,
    replayable: true,
  },
  listen_complete: {
    questionType: 'fill_blank',
    // Only blanks whose answer is a spoken word, not "(no article)".
    filter: {
      $expr: {
        $not: { $regexMatch: { input: { $arrayElemAt: ['$options', '$answer'] }, regex: '^\\(' } },
      },
    },
    prepSeconds: 0,
    answerSeconds: fixed(8),
    autoStop: true,
    replayable: true,
  },
  listen_correct: {
    questionType: 'spot_error',
    filter: { answer: { $ne: 4 } },
    prepSeconds: 0,
    answerSeconds: fixed(15),
    autoStop: true,
    replayable: true,
  },
  short_answer: {
    questionType: 'short_answer',
    prepSeconds: 0,
    answerSeconds: fixed(8),
    autoStop: true,
    replayable: true,
  },
  sentence_build: {
    questionType: 'sentence_build',
    prepSeconds: 0,
    answerSeconds: fixed(12),
    autoStop: true,
    replayable: true,
  },
  conversation: {
    questionType: 'conversation',
    prepSeconds: 0,
    answerSeconds: fixed(10),
    autoStop: true,
    replayable: true,
  },
  story_retell: {
    questionType: 'story_retell',
    prepSeconds: 10,
    answerSeconds: fixed(60),
    autoStop: false,
    replayable: true,
  },
  topic_talk: {
    questionType: 'topic_talk',
    prepSeconds: 30,
    answerSeconds: fixed(90),
    autoStop: false,
    replayable: false,
  },
};

/** The task a question type belongs to (inverse of TASKS), for questions met outside a task. */
export function taskForType(type: QuestionType): VoiceTask | null {
  return (VOICE_TASKS.find((t) => TASKS[t].questionType === type) as VoiceTask | undefined) ?? null;
}
