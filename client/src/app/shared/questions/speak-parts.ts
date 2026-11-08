import type { AdminQuestion } from '../../core/api/admin-questions.service';
import type { SpeakPart } from '../../core/models/voice';

const BLANK = '___';

/** What students hear for a question (mirrors the server's prompt builder), for admin previews. */
export function speakPartsOf(q: AdminQuestion): SpeakPart[] {
  switch (q.type) {
    case 'read_aloud':
    case 'topic_talk':
    case 'repeat':
    case 'short_answer':
      return [{ text: q.prompt }];
    case 'fill_blank':
    case 'sentence_completion': {
      const [before = '', after = ''] = q.prompt.split(BLANK);
      return [
        ...(before.trim() ? [{ text: before.trim() }] : []),
        { beep: true as const },
        ...(after.trim() ? [{ text: after.trim() }] : []),
      ];
    }
    case 'spot_error':
      return [{ text: (q.segments ?? []).join(' ') || q.prompt }];
    case 'sentence_build':
      return (q.phrases ?? []).flatMap((p) => [{ text: p }, { pauseMs: 700 }]);
    case 'conversation':
      return [
        ...(q.script ?? []).map((t) => ({ text: t.text, voice: t.speaker })),
        { pauseMs: 800 },
        { text: q.prompt, voice: 'narrator' as const },
      ];
    case 'story_retell':
      return [{ text: q.passage ?? '' }];
    default:
      return [{ text: q.prompt.replace(/\*\*/g, '') }];
  }
}

/** The editable JSON for a spoken question (only the fields its type uses). */
export function authoringJson(q: AdminQuestion): string {
  const keys: (keyof AdminQuestion)[] = ['type', 'difficulty', 'tags', 'prompt'];
  switch (q.type) {
    case 'short_answer':
      keys.push('acceptedAnswers');
      break;
    case 'sentence_build':
      keys.push('phrases');
      break;
    case 'conversation':
      keys.push('script', 'acceptedAnswers');
      break;
    case 'story_retell':
      keys.push('passage', 'keyPoints');
      break;
    case 'topic_talk':
      keys.push('hints', 'sampleAnswer');
      break;
    default:
      break;
  }
  keys.push('explanation', 'prepSeconds', 'answerSeconds');
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = q[key];
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return JSON.stringify(out, null, 2);
}
