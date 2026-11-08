import type { VoiceTask } from './tasks.js';

export interface TestSection {
  task: VoiceTask;
  count: number;
  title: string;
}

/** The SHL-style voice test: about 18 minutes, parts in this order. */
export const TEST_SECTIONS: TestSection[] = [
  { task: 'read_aloud', count: 4, title: 'Read aloud' },
  { task: 'repeat', count: 6, title: 'Listen and repeat' },
  { task: 'short_answer', count: 4, title: 'Short answers' },
  { task: 'sentence_build', count: 4, title: 'Sentence builds' },
  { task: 'listen_complete', count: 4, title: 'Listen and complete' },
  { task: 'listen_correct', count: 3, title: 'Listen and correct' },
  { task: 'conversation', count: 3, title: 'Conversations' },
  { task: 'story_retell', count: 1, title: 'Story retelling' },
  { task: 'topic_talk', count: 1, title: 'Topic talk' },
];
