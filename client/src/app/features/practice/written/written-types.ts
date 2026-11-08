import type { AppIcon } from '../../../core/icons';
import type { QuestionType, Tag } from '../../../core/models/practice';

export type Tone = 'lavender' | 'mint' | 'peach' | 'butter' | 'sky' | 'rose';

export interface TypeInfo {
  title: string;
  short: string;
  description: string;
  instruction: string;
  icon: AppIcon;
  tone: Tone;
}

export const TYPE_INFO: Record<QuestionType, TypeInfo> = {
  fill_blank: {
    title: 'Fill in the blanks',
    short: 'Fill blanks',
    description:
      'Pick the word that completes the sentence: articles, prepositions, tenses and more.',
    instruction: 'Choose the word that fits the blank.',
    icon: 'lucidePenLine',
    tone: 'lavender',
  },
  spot_error: {
    title: 'Spot the error',
    short: 'Spot error',
    description: 'Find the part of the sentence with a grammar mistake, or say there is none.',
    instruction: 'Which part of the sentence has an error?',
    icon: 'lucideSearch',
    tone: 'peach',
  },
  sentence_completion: {
    title: 'Sentence completion',
    short: 'Complete',
    description: 'Choose the ending that makes a correct, natural sentence.',
    instruction: 'Choose the best way to complete the sentence.',
    icon: 'lucideArrowRight',
    tone: 'mint',
  },
  synonym: {
    title: 'Synonyms',
    short: 'Synonyms',
    description: 'Find the word closest in meaning to the highlighted word.',
    instruction: 'Choose the word closest in meaning to the highlighted word.',
    icon: 'lucideBookOpen',
    tone: 'sky',
  },
  antonym: {
    title: 'Antonyms',
    short: 'Antonyms',
    description: 'Find the word most opposite in meaning to the highlighted word.',
    instruction: 'Choose the word most opposite in meaning to the highlighted word.',
    icon: 'lucideSparkles',
    tone: 'butter',
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
};

export const DIFFICULTY_LABELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const;

export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;
