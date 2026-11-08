import { HttpErrorResponse } from '@angular/common/http';

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } };
}

function body(err: unknown): ApiErrorBody['error'] | undefined {
  return err instanceof HttpErrorResponse ? (err.error as ApiErrorBody | null)?.error : undefined;
}

/** A message that is safe and useful to show to the user. */
export function apiErrorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (err instanceof HttpErrorResponse && err.status === 0) {
    return 'Cannot reach the server. Check your internet connection and try again.';
  }
  return body(err)?.message ?? fallback;
}

export function apiErrorCode(err: unknown): string | undefined {
  return body(err)?.code;
}

/** Per-field messages from a 400/409 response, keyed by field path. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  return body(err)?.details?.fields ?? {};
}
