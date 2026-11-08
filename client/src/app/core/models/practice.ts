export type QuestionType =
  'fill_blank' | 'spot_error' | 'sentence_completion' | 'synonym' | 'antonym';

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
  | 'collocations';

/** A question as sent before answering (no answer key). */
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  segments?: string[];
  options?: string[];
  tags: Tag[];
  difficulty: 1 | 2 | 3;
}

export interface QuestionReveal {
  answer: number;
  correction: string | null;
  explanation: string;
}

export interface AnswerResult extends QuestionReveal {
  correct: boolean;
  progress: { answered: number; score: number; total: number };
}

/** An answered question, as kept by the player. */
export interface AnsweredQuestion extends QuestionReveal {
  correct: boolean;
  chosen: number;
}

export interface SessionView {
  session: {
    id: string;
    mode: 'practice' | 'review';
    type: QuestionType | null;
    status: 'active' | 'finished';
    total: number;
    answered: number;
    score: number;
  };
  questions: PublicQuestion[];
  answers: ({ questionId: string } & AnsweredQuestion)[];
}

export interface StartSessionRequest {
  mode?: 'practice' | 'review';
  type?: QuestionType;
  count: 5 | 10 | 20;
  difficulty?: 1 | 2 | 3;
  tags?: Tag[];
}

export interface SessionSummary {
  sessionId: string;
  mode: 'practice' | 'review';
  type: QuestionType | null;
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  timeMs: number;
  byTag: { tag: Tag; total: number; correct: number }[];
  mistakes: (PublicQuestion & QuestionReveal & { chosen: number })[];
}

export interface WrittenCatalog {
  types: { type: QuestionType; available: number; done: number; accuracy: number | null }[];
  tags: { tag: Tag; available: number }[];
  mistakes: number;
}

export interface PracticeStats {
  answeredToday: number;
  dailyGoal: number;
  streakDays: number;
  /** Monday → Sunday of the current week. */
  week: boolean[];
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number | null;
}

export type ReportReason = 'wrong_answer' | 'unclear' | 'typo' | 'other';
