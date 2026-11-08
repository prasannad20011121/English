import type { AppIcon } from '../../core/icons';
import type { Skill, VoiceTask } from '../../core/models/voice';
import type { Tone } from '../../shared/questions/question-types';

export interface TaskInfo {
  title: string;
  short: string;
  icon: AppIcon;
  tone: Tone;
  group: 'speaking' | 'listening';
  /** One line for task tiles. */
  description: string;
  /** Shown (and read aloud) before the first question. */
  howTo: string;
  /** Short reminder during the question. */
  cue: string;
}

export const TASK_INFO: Record<VoiceTask, TaskInfo> = {
  read_aloud: {
    title: 'Read aloud',
    short: 'Read',
    icon: 'lucideBookText',
    tone: 'lavender',
    group: 'speaking',
    description: 'Read a sentence aloud clearly. Scores pronunciation and fluency.',
    howTo:
      'A sentence will appear. Read it silently first. After the beep, read it aloud clearly at a natural pace.',
    cue: 'Read the sentence aloud.',
  },
  repeat: {
    title: 'Listen & repeat',
    short: 'Repeat',
    icon: 'lucideRepeat',
    tone: 'sky',
    group: 'listening',
    description: 'Hear a sentence once, then say it back exactly.',
    howTo: 'You will hear a sentence. After the beep, repeat it exactly as you heard it.',
    cue: 'Repeat the sentence.',
  },
  listen_complete: {
    title: 'Listen & complete',
    short: 'Complete',
    icon: 'lucidePenLine',
    tone: 'mint',
    group: 'listening',
    description: 'A soft tone hides one word. Say the missing word.',
    howTo:
      'You will hear a sentence with a soft tone in place of one word. After the beep, say the missing word.',
    cue: 'Say the missing word.',
  },
  listen_correct: {
    title: 'Listen & correct',
    short: 'Correct',
    icon: 'lucideSearch',
    tone: 'peach',
    group: 'listening',
    description: 'Hear a sentence with one grammar mistake. Say it correctly.',
    howTo:
      'You will hear a sentence with one grammar mistake. After the beep, say the whole sentence correctly.',
    cue: 'Say the sentence correctly.',
  },
  short_answer: {
    title: 'Short answers',
    short: 'Answer',
    icon: 'lucideMessageCircleQuestion',
    tone: 'butter',
    group: 'listening',
    description: 'Hear a question and answer in one to three words.',
    howTo: 'You will hear a question. After the beep, answer in one to three words.',
    cue: 'Answer in a few words.',
  },
  sentence_build: {
    title: 'Sentence builds',
    short: 'Build',
    icon: 'lucideBlocks',
    tone: 'rose',
    group: 'listening',
    description: 'Hear three jumbled phrases. Say them as one correct sentence.',
    howTo:
      'You will hear three groups of words in a jumbled order. After the beep, say them as one correct sentence.',
    cue: 'Say the phrases as one sentence.',
  },
  conversation: {
    title: 'Conversations',
    short: 'Conversation',
    icon: 'lucideMessagesSquare',
    tone: 'sky',
    group: 'listening',
    description: 'Hear a short conversation, then answer a question about it.',
    howTo:
      'You will hear a short conversation and then a question. After the beep, answer in a few words.',
    cue: 'Answer the question.',
  },
  story_retell: {
    title: 'Story retelling',
    short: 'Retell',
    icon: 'lucideBookOpen',
    tone: 'mint',
    group: 'speaking',
    description: 'Hear a short story and retell it in your own words.',
    howTo:
      'You will hear a short story. After the beep, retell it in your own words with as many details as you can.',
    cue: 'Retell the story in your own words.',
  },
  topic_talk: {
    title: 'Topic talk',
    short: 'Topic',
    icon: 'lucideSpeech',
    tone: 'lavender',
    group: 'speaking',
    description: 'Plan for 30 seconds, then talk about a topic for 1–2 minutes.',
    howTo:
      'You will see and hear a topic. Use the preparation time to plan, then keep talking until the time runs out.',
    cue: 'Talk about the topic.',
  },
};

export const SKILL_LABELS: Record<Skill, string> = {
  pronunciation: 'Pronunciation',
  fluency: 'Fluency',
  accuracy: 'Grammar & accuracy',
  listening: 'Listening',
  vocabulary: 'Vocabulary',
};

export const SKILL_ORDER: Skill[] = [
  'pronunciation',
  'fluency',
  'accuracy',
  'listening',
  'vocabulary',
];

/** Order of tasks on the practice page. */
export const TASK_ORDER: VoiceTask[] = [
  'read_aloud',
  'repeat',
  'topic_talk',
  'story_retell',
  'short_answer',
  'listen_complete',
  'listen_correct',
  'sentence_build',
  'conversation',
];

/** Letters for the parts of the mock test. */
export const PART_LETTERS = 'ABCDEFGHIJ';

/** Parts of the mock voice test, in order (the server's test template has the same list). */
export const TEST_PARTS: { task: VoiceTask; title: string; count: number }[] = [
  { task: 'read_aloud', title: 'Read aloud', count: 4 },
  { task: 'repeat', title: 'Listen and repeat', count: 6 },
  { task: 'short_answer', title: 'Short answers', count: 4 },
  { task: 'sentence_build', title: 'Sentence builds', count: 4 },
  { task: 'listen_complete', title: 'Listen and complete', count: 4 },
  { task: 'listen_correct', title: 'Listen and correct', count: 3 },
  { task: 'conversation', title: 'Conversations', count: 3 },
  { task: 'story_retell', title: 'Story retelling', count: 1 },
  { task: 'topic_talk', title: 'Topic talk', count: 1 },
];
