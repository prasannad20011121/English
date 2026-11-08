import type { Types } from 'mongoose';
import type { QuestionFields } from '../../models/question.model.js';
import { BLANK } from '../questions/question.schemas.js';
import { TASKS, type VoiceTask } from './tasks.js';

type StoredQuestion = QuestionFields & { _id: Types.ObjectId };

/** One step of the audio the browser plays: speech, a beep or a pause. */
export type SpeakPart =
  { text: string; voice?: 'A' | 'B' | 'narrator' } | { beep: true } | { pauseMs: number };

/** What a student gets before answering: what to play and show, never the answer. */
export interface VoicePrompt {
  id: string;
  task: VoiceTask;
  difficulty: number;
  tags: string[];
  /** Text shown on screen (read aloud, topic). Listening tasks show nothing. */
  display?: string;
  title?: string;
  hints?: string[];
  speak: SpeakPart[];
  prepSeconds: number;
  answerSeconds: number;
  autoStop: boolean;
  /** Whether the audio may be replayed once (never in a mock test). */
  replayable: boolean;
  section?: number;
}

export function speakPartsFor(task: VoiceTask, q: QuestionFields): SpeakPart[] {
  switch (task) {
    case 'read_aloud':
      return [];
    case 'listen_complete': {
      const [before = '', after = ''] = q.prompt.split(BLANK);
      return [
        ...(before.trim() ? [{ text: before.trim() }] : []),
        { beep: true as const },
        ...(after.trim() ? [{ text: after.trim() }] : []),
      ];
    }
    case 'sentence_build':
      return (q.phrases ?? []).flatMap((p) => [{ text: p }, { pauseMs: 700 }]);
    case 'conversation':
      return [
        ...(q.script ?? []).map((t) => ({
          text: t.text ?? '',
          voice: (t.speaker ?? 'A') as 'A' | 'B',
        })),
        { pauseMs: 800 },
        { text: q.prompt, voice: 'narrator' as const },
      ];
    case 'story_retell':
      return [{ text: q.passage ?? '' }];
    default:
      // repeat, listen_correct, short_answer, topic_talk: the prompt itself
      return [{ text: q.prompt }];
  }
}

export function toVoicePrompt(
  q: StoredQuestion,
  task: VoiceTask,
  opts: { test?: boolean; section?: number } = {},
): VoicePrompt {
  const info = TASKS[task];
  return {
    id: String(q._id),
    task,
    difficulty: q.difficulty,
    tags: [...(q.tags ?? [])],
    ...(task === 'read_aloud' || task === 'topic_talk' ? { display: q.prompt } : {}),
    ...(task === 'story_retell' ? { title: q.prompt } : {}),
    ...(task === 'topic_talk' && q.hints?.length ? { hints: [...q.hints] } : {}),
    speak: speakPartsFor(task, q),
    prepSeconds: q.prepSeconds ?? info.prepSeconds,
    answerSeconds: info.answerSeconds(q),
    autoStop: info.autoStop,
    replayable: !opts.test && info.replayable,
    ...(opts.section !== undefined ? { section: opts.section } : {}),
  };
}
