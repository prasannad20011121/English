import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  throwError,
} from 'rxjs';
import type { AuthResponse, RegisterRequest, User } from '../models/user';

/**
 * Not a secret: only remembers that this browser had a session, so first-time visitors
 * do not trigger a pointless refresh call. The real session is the httpOnly refresh cookie.
 */
const SESSION_HINT_KEY = 'shl.hasSession';

const AUTH = '/api/auth';
const withCredentials = { withCredentials: true } as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly currentUser = signal<User | null>(null);
  /** Kept in memory only (never in localStorage) to limit damage from XSS. */
  private accessToken: string | null = null;
  private refreshInFlight: Observable<string> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');

  get token(): string | null {
    return this.accessToken;
  }

  register(body: RegisterRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${AUTH}/register`, body, withCredentials)
      .pipe(map((res) => this.startSession(res)));
  }

  login(email: string, password: string): Observable<User> {
    return this.http
      .post<AuthResponse>(`${AUTH}/login`, { email, password }, withCredentials)
      .pipe(map((res) => this.startSession(res)));
  }

  forgotPassword(email: string): Observable<string> {
    return this.http
      .post<{ message: string }>(`${AUTH}/forgot-password`, { email })
      .pipe(map((res) => res.message));
  }

  resetPassword(token: string, password: string): Observable<User> {
    return this.http
      .post<AuthResponse>(`${AUTH}/reset-password`, { token, password }, withCredentials)
      .pipe(map((res) => this.startSession(res)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<User> {
    return this.http
      .post<AuthResponse>(
        `${AUTH}/change-password`,
        { currentPassword, newPassword },
        withCredentials,
      )
      .pipe(map((res) => this.startSession(res)));
  }

  /**
   * Gets a new access token from the refresh cookie. Concurrent callers share one request,
   * because the server rotates the refresh token on every call.
   */
  refresh(): Observable<string> {
    this.refreshInFlight ??= this.http
      .post<AuthResponse>(`${AUTH}/refresh`, {}, withCredentials)
      .pipe(
        map((res) => {
          this.startSession(res);
          return res.accessToken;
        }),
        catchError((err: unknown) => {
          this.endSession();
          return throwError(() => err);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshInFlight;
  }

  /** Runs once at app start-up: restores the session from the refresh cookie if there is one. */
  restoreSession(): Promise<void> {
    if (!readHint()) return Promise.resolve();
    return firstValueFrom(
      this.refresh().pipe(
        map(() => undefined),
        catchError(() => of(undefined)),
      ),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${AUTH}/logout`, {}, withCredentials).pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      finalize(() => {
        this.endSession();
        void this.router.navigate(['/login']);
      }),
    );
  }

  /** Called when the session cannot be refreshed any more. */
  sessionExpired(returnUrl?: string): void {
    this.endSession();
    void this.router.navigate(['/login'], {
      queryParams: { expired: 1, ...(returnUrl ? { returnUrl } : {}) },
    });
  }

  /** Keeps the cached user in sync after a profile update. */
  setUser(user: User): void {
    this.currentUser.set(user);
  }

  private startSession(res: AuthResponse): User {
    this.accessToken = res.accessToken;
    this.currentUser.set(res.user);
    writeHint(true);
    return res.user;
  }

  private endSession(): void {
    this.accessToken = null;
    this.currentUser.set(null);
    writeHint(false);
  }
}

function readHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return true; // Storage blocked: just try the refresh.
  }
}

function writeHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* storage unavailable */
  }
}
