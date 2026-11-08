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
  answer: number;
  correction: string | null;
  explanation: string;
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

/** The authoring shape the API validates (same rules as the seed bank). */
export type QuestionContent =
  | {
      type: Exclude<QuestionType, 'spot_error'>;
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
    };

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
