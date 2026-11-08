import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { QuestionType, Tag } from '../models/practice';

export type QuestionStatus = 'draft' | 'published' | 'flagged' | 'retired';

export interface AdminQuestion {
  id: string;
  type: QuestionType;
  tags: Tag[];
  difficulty: 1 | 2 | 3;
  prompt: string;
  segments?: string[];
  options?: string[];
  /** Written types only. */
  answer: number | null;
  correction: string | null;
  explanation: string | null;
  acceptedAnswers?: string[];
  phrases?: string[];
  script?: { speaker: 'A' | 'B'; text: string }[];
  passage?: string;
  keyPoints?: { label: string; keywords: string[] }[];
  hints?: string[];
  sampleAnswer?: string;
  prepSeconds?: number;
  answerSeconds?: number;
  status: QuestionStatus;
  source: 'seed' | 'ai' | 'manual';
  aiModel: string | null;
  stats: { attempts: number; correct: number };
  reports: { reason: string; note: string | null; createdAt: string }[];
  createdAt: string | null;
  reviewedAt: string | null;
}

export interface AdminQuestionPage {
  items: AdminQuestion[];
  total: number;
  page: number;
  limit: number;
  counts: Record<QuestionStatus, number>;
}

export interface AiStatus {
  enabled: boolean;
  model: string | null;
  provider: string | null;
  grammarCheck: boolean;
}

export interface GenerateReport {
  model: string;
  requested: number;
  created: string[];
  rejected: { prompt: string | null; reason: string }[];
  grammarChecked: boolean;
}

/** Question types answered by speaking that have no tap-to-answer equivalent. */
export const VOICE_ONLY_TYPES = [
  'read_aloud',
  'repeat',
  'short_answer',
  'sentence_build',
  'conversation',
  'story_retell',
  'topic_talk',
] as const satisfies readonly QuestionType[];
export type VoiceOnlyType = (typeof VOICE_ONLY_TYPES)[number];

/** Types the AI writer can draft (the server's list). */
export const GENERATABLE_TYPES = [
  'fill_blank',
  'spot_error',
  'read_aloud',
  'repeat',
  'short_answer',
  'sentence_build',
  'topic_talk',
  'sentence_completion',
  'synonym',
  'antonym',
] as const satisfies readonly QuestionType[];

export const isVoiceOnly = (type: QuestionType): type is VoiceOnlyType =>
  (VOICE_ONLY_TYPES as readonly QuestionType[]).includes(type);

/** The authoring shape the API validates (same rules as the seed bank). */
export type QuestionContent =
  | {
      type: Exclude<QuestionType, 'spot_error' | VoiceOnlyType>;
      difficulty: number;
      tags: Tag[];
      prompt: string;
      options: string[];
      answer: number;
      explanation: string;
    }
  | {
      type: 'spot_error';
      difficulty: number;
      tags: Tag[];
      segments: string[];
      answer: number;
      correction?: string;
      explanation: string;
    }
  | ({ type: VoiceOnlyType; difficulty: number; tags: Tag[]; prompt: string } & Record<
      string,
      unknown
    >);

export interface QuestionQuery {
  status: QuestionStatus;
  type?: QuestionType | '';
  tag?: Tag | '';
  q?: string;
  page: number;
}

const BASE = '/api/admin/questions';

@Injectable({ providedIn: 'root' })
export class AdminQuestionsService {
  private readonly http = inject(HttpClient);

  list(query: QuestionQuery): Observable<AdminQuestionPage> {
    let params = new HttpParams()
      .set('status', query.status)
      .set('page', query.page)
      .set('limit', 20);
    if (query.type) params = params.set('type', query.type);
    if (query.tag) params = params.set('tag', query.tag);
    if (query.q) params = params.set('q', query.q);
    return this.http.get<AdminQuestionPage>(BASE, { params });
  }

  aiStatus(): Observable<AiStatus> {
    return this.http.get<AiStatus>(`${BASE}/ai-status`);
  }

  generate(body: {
    type: QuestionType;
    tag: Tag;
    difficulty: 1 | 2 | 3;
    count: number;
  }): Observable<GenerateReport> {
    return this.http.post<GenerateReport>(`${BASE}/generate`, body);
  }

  update(id: string, content: QuestionContent): Observable<AdminQuestion> {
    return this.http.put<AdminQuestion>(`${BASE}/${id}`, content);
  }

  setStatus(id: string, status: Exclude<QuestionStatus, 'flagged'>): Observable<AdminQuestion> {
    return this.http.post<AdminQuestion>(`${BASE}/${id}/status`, { status });
  }

  bulkStatus(
    ids: string[],
    status: Exclude<QuestionStatus, 'flagged'>,
  ): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(`${BASE}/bulk-status`, { ids, status });
  }
}
