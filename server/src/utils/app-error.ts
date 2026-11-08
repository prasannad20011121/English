/** An error with an HTTP status and a stable machine-readable code, safe to show to clients. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static unauthorized(message = 'Please log in to continue.', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to do this.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Not found.') {
    return new AppError(404, 'NOT_FOUND', message);
  }
}
