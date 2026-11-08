import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  AnswerResult,
  PracticeStats,
  ReportReason,
  SessionSummary,
  SessionView,
  StartSessionRequest,
  WrittenCatalog,
} from '../models/practice';

@Injectable({ providedIn: 'root' })
export class PracticeService {
  private readonly http = inject(HttpClient);

  catalog(): Observable<WrittenCatalog> {
    return this.http.get<WrittenCatalog>('/api/practice/written/catalog');
  }

  start(request: StartSessionRequest): Observable<SessionView> {
    return this.http.post<SessionView>('/api/practice/sessions', request);
  }

  session(id: string): Observable<SessionView> {
    return this.http.get<SessionView>(`/api/practice/sessions/${encodeURIComponent(id)}`);
  }

  answer(
    sessionId: string,
    questionId: string,
    chosen: number,
    timeMs: number,
  ): Observable<AnswerResult> {
    return this.http.post<AnswerResult>(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/answers`,
      { questionId, chosen, timeMs: Math.round(timeMs) },
    );
  }

  finish(sessionId: string): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/finish`,
      {},
    );
  }

  report(questionId: string, reason: ReportReason, note?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `/api/questions/${encodeURIComponent(questionId)}/report`,
      { reason, ...(note ? { note } : {}) },
    );
  }

  /** Streak and daily goal, counted in the student's own time zone. */
  stats(): Observable<PracticeStats> {
    let params = new HttpParams();
    try {
      params = params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* fall back to UTC on the server */
    }
    return this.http.get<PracticeStats>('/api/users/me/stats', { params });
  }
}
