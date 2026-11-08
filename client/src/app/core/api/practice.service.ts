import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, shareReplay } from 'rxjs';
import type { PracticeStats, ReportReason } from '../models/practice';
import type {
  AnswerResponse,
  ClientMetrics,
  SessionSummary,
  SessionView,
  StartSessionRequest,
  TestHistoryItem,
  VoiceCatalog,
} from '../models/voice';

export interface VoiceConfig {
  stt: 'whisper' | 'browser';
  maxAudioBytes: number;
}

export interface SpokenAnswer {
  audio: Blob;
  durationMs: number;
  timeMs: number;
  clientTranscript?: string;
  clientMetrics?: ClientMetrics;
}

@Injectable({ providedIn: 'root' })
export class PracticeService {
  private readonly http = inject(HttpClient);
  private config$?: Observable<VoiceConfig>;

  /** Whether the server transcribes answers (Whisper) or needs the browser's transcript. */
  config(): Observable<VoiceConfig> {
    this.config$ ??= this.http
      .get<VoiceConfig>('/api/practice/voice/config')
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.config$;
  }

  catalog(): Observable<VoiceCatalog> {
    return this.http.get<VoiceCatalog>('/api/practice/voice/catalog');
  }

  start(request: StartSessionRequest): Observable<SessionView> {
    return this.http.post<SessionView>('/api/practice/sessions', request);
  }

  session(id: string): Observable<SessionView> {
    return this.http.get<SessionView>(`/api/practice/sessions/${encodeURIComponent(id)}`);
  }

  answer(sessionId: string, questionId: string, answer: SpokenAnswer): Observable<AnswerResponse> {
    const form = new FormData();
    form.append('questionId', questionId);
    form.append('durationMs', String(Math.round(answer.durationMs)));
    form.append('timeMs', String(Math.round(answer.timeMs)));
    if (answer.clientTranscript) form.append('clientTranscript', answer.clientTranscript);
    if (answer.clientMetrics) form.append('clientMetrics', JSON.stringify(answer.clientMetrics));
    const extension = answer.audio.type.includes('mp4')
      ? 'm4a'
      : answer.audio.type.includes('ogg')
        ? 'ogg'
        : 'webm';
    form.append('audio', answer.audio, `answer.${extension}`);
    return this.http.post<AnswerResponse>(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/answers`,
      form,
    );
  }

  finish(sessionId: string): Observable<SessionSummary> {
    return this.http.post<SessionSummary>(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}/finish`,
      {},
    );
  }

  tests(): Observable<{ items: TestHistoryItem[] }> {
    return this.http.get<{ items: TestHistoryItem[] }>('/api/practice/tests');
  }

  /** A stored recording, fetched with the access token (audio elements cannot send it). */
  recording(audioId: string): Observable<Blob> {
    return this.http.get(`/api/recordings/${encodeURIComponent(audioId)}`, {
      responseType: 'blob',
    });
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
      /* the server falls back to UTC */
    }
    return this.http.get<PracticeStats>('/api/users/me/stats', { params });
  }
}
