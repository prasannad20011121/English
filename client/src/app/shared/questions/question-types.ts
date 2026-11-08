import type { AppIcon } from '../../core/icons';
import type { QuestionType, Tag } from '../../core/models/practice';

export type Tone = 'lavender' | 'mint' | 'peach' | 'butter' | 'sky' | 'rose';

export interface TypeInfo {
  title: string;
  icon: AppIcon;
  tone: Tone;
  /** Written-only types are kept in the bank but not shown to students (voice-only app). */
  voice: boolean;
}

/** Labels for question types in the admin question bank. */
export const TYPE_INFO: Record<QuestionType, TypeInfo> = {
  read_aloud: { title: 'Read aloud', icon: 'lucideBookText', tone: 'lavender', voice: true },
  repeat: { title: 'Listen & repeat', icon: 'lucideRepeat', tone: 'sky', voice: true },
  fill_blank: {
    title: 'Listen & complete (fill in the blank)',
    icon: 'lucidePenLine',
    tone: 'mint',
    voice: true,
  },
  spot_error: {
    title: 'Listen & correct (spot the error)',
    icon: 'lucideSearch',
    tone: 'peach',
    voice: true,
  },
  short_answer: {
    title: 'Short answer',
    icon: 'lucideMessageCircleQuestion',
    tone: 'butter',
    voice: true,
  },
  sentence_build: { title: 'Sentence build', icon: 'lucideBlocks', tone: 'rose', voice: true },
  conversation: { title: 'Conversation', icon: 'lucideMessagesSquare', tone: 'sky', voice: true },
  story_retell: { title: 'Story retelling', icon: 'lucideBookOpen', tone: 'mint', voice: true },
  topic_talk: { title: 'Topic talk', icon: 'lucideSpeech', tone: 'lavender', voice: true },
  sentence_completion: {
    title: 'Sentence completion (written only)',
    icon: 'lucideArrowRight',
    tone: 'butter',
    voice: false,
  },
  synonym: { title: 'Synonyms (written only)', icon: 'lucideBookOpen', tone: 'sky', voice: false },
  antonym: {
    title: 'Antonyms (written only)',
    icon: 'lucideSparkles',
    tone: 'peach',
    voice: false,
  },
};

export const TAG_LABELS: Record<Tag, string> = {
  articles: 'Articles',
  prepositions: 'Prepositions',
  tenses: 'Tenses',
  subject_verb_agreement: 'Subject–verb agreement',
  pronouns: 'Pronouns',
  conjunctions: 'Conjunctions',
  modals: 'Modals',
  comparatives: 'Comparatives',
  word_order: 'Word order',
  vocabulary: 'Vocabulary',
  collocations: 'Collocations',
  pronunciation: 'Pronunciation',
  fluency: 'Fluency',
  listening: 'Listening',
  comprehension: 'Comprehension',
};

export const DIFFICULTY_LABELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const;

export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
