import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Auth calls that must never trigger a refresh-and-retry. */
const NO_RETRY = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

function withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

/**
 * Adds the access token to API calls. If the API answers 401 because the token expired,
 * refreshes once and retries; if that fails, sends the user to the login page.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const sentToken = auth.token;

  return next(withToken(req, sentToken)).pipe(
    catchError((err: unknown) => {
      const canRetry =
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        sentToken !== null &&
        !NO_RETRY.some((path) => req.url.startsWith(path));
      if (!canRetry) return throwError(() => err);

      return auth.refresh().pipe(
        catchError((refreshErr: unknown) => {
          auth.sessionExpired(router.url);
          return throwError(() => refreshErr);
        }),
        switchMap((token) => next(withToken(req, token))),
      );
    }),
  );
};
