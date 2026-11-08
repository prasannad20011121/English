export type VoiceTask =
  | 'read_aloud'
  | 'repeat'
  | 'listen_complete'
  | 'listen_correct'
  | 'short_answer'
  | 'sentence_build'
  | 'conversation'
  | 'story_retell'
  | 'topic_talk';

export type Skill = 'pronunciation' | 'fluency' | 'accuracy' | 'listening' | 'vocabulary';

/** One step of a spoken prompt: speech, a tone that marks a missing word, or a pause. */
export type SpeakPart =
  { text: string; voice?: 'A' | 'B' | 'narrator' } | { beep: true } | { pauseMs: number };

export interface VoicePrompt {
  id: string;
  task: VoiceTask;
  difficulty: 1 | 2 | 3;
  tags: string[];
  display?: string;
  title?: string;
  hints?: string[];
  speak: SpeakPart[];
  prepSeconds: number;
  answerSeconds: number;
  autoStop: boolean;
  replayable: boolean;
  section?: number;
}

export type AlignOpType = 'ok' | 'close' | 'sub' | 'missing' | 'extra';

export interface AlignOp {
  type: AlignOpType;
  ref?: string;
  heard?: string;
}

export interface AnswerMetrics {
  wpm?: number | null;
  longPauses?: number;
  fillers?: number;
  latencyMs?: number | null;
  clarity?: number | null;
  speakingSec?: number;
  wordCount?: number;
}

/** What a good answer looked like; the fields depend on the task. */
export interface Reveal {
  reference?: string;
  sentence?: string;
  answer?: string;
  explanation?: string;
  original?: string;
  correction?: string;
  question?: string;
  acceptedAnswers?: string[];
  script?: { speaker: 'A' | 'B'; text: string }[];
  phrases?: string[];
  passage?: string;
  keyPoints?: string[];
  hints?: string[];
  sampleAnswer?: string;
}

export interface AnswerResult {
  questionId: string;
  task: VoiceTask;
  score: number;
  correct: boolean;
  skills: Partial<Record<Skill, number>>;
  transcript: string;
  alignment?: AlignOp[];
  metrics: AnswerMetrics;
  feedback: string[];
  reveal: Reveal;
  keyPoints?: { label: string; covered: boolean }[];
  audioId: string | null;
  sttSource: 'whisper' | 'browser' | 'none' | null;
}

export interface AnswerResponse {
  result: AnswerResult | null;
  received: true;
  progress: { answered: number; total: number };
}

export interface SessionView {
  session: {
    id: string;
    mode: 'practice' | 'review' | 'test';
    task: VoiceTask | null;
    status: 'active' | 'finished';
    total: number;
    answered: number;
  };
  sections?: { title: string; task: VoiceTask; count: number }[];
  prompts: VoicePrompt[];
  answers: AnswerResult[];
  answeredIds: string[];
}

export interface StartSessionRequest {
  mode?: 'practice' | 'review' | 'test';
  task?: VoiceTask;
  count?: 5 | 10;
  difficulty?: 1 | 2 | 3;
}

export interface Band {
  label: string;
  cefr: string;
}

export interface SessionSummary {
  sessionId: string;
  mode: 'practice' | 'review' | 'test';
  task: VoiceTask | null;
  total: number;
  answered: number;
  correct: number;
  overall: number;
  band: Band;
  skills: Partial<Record<Skill, number>>;
  sections?: { title: string; task: VoiceTask; score: number; answered: number; total: number }[];
  items: (AnswerResult & { prompt: VoicePrompt; answered: boolean })[];
  finishedAt: string | null;
}

export interface VoiceCatalog {
  tasks: {
    task: VoiceTask;
    available: number;
    done: number;
    average: number | null;
    best: number | null;
  }[];
  mistakes: number;
  stt: 'whisper' | 'browser';
}

export interface TestHistoryItem {
  id: string;
  status: 'active' | 'finished';
  startedAt: string;
  finishedAt: string | null;
  overall: number | null;
  band: Band | null;
  answered: number;
  total: number;
}

/** Timing measured in the browser while recording. */
export interface ClientMetrics {
  firstSoundMs?: number;
  speechMs?: number;
  pauses?: number;
  longPauses?: number;
}
