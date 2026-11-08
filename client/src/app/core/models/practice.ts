export type QuestionType =
  | 'fill_blank'
  | 'spot_error'
  | 'sentence_completion'
  | 'synonym'
  | 'antonym'
  | 'read_aloud'
  | 'repeat'
  | 'short_answer'
  | 'sentence_build'
  | 'conversation'
  | 'story_retell'
  | 'topic_talk';

export type Tag =
  | 'articles'
  | 'prepositions'
  | 'tenses'
  | 'subject_verb_agreement'
  | 'pronouns'
  | 'conjunctions'
  | 'modals'
  | 'comparatives'
  | 'word_order'
  | 'vocabulary'
  | 'collocations'
  | 'pronunciation'
  | 'fluency'
  | 'listening'
  | 'comprehension';

export type ReportReason = 'wrong_answer' | 'unclear' | 'typo' | 'other';

export interface PracticeStats {
  answeredToday: number;
  dailyGoal: number;
  streakDays: number;
  /** Monday → Sunday of the current week. */
  week: boolean[];
  totalAnswered: number;
  averageScore: number | null;
  testsTaken: number;
  bestTest: number | null;
}
