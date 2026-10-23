import type { ErrorCode } from '@dbfc/shared';

const STATUS: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 400,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CSRF: 403,
  GUEST_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ALREADY_IN_TEAM: 409,
  NOT_IN_TEAM: 409,
  OWNER_MUST_TRANSFER: 409,
  TEAM_FULL: 409,
  RUN_ALREADY_SUBMITTED: 409,
  RUN_LOCKED: 403,
  INSUFFICIENT_CRYSTALS: 409,
  INVITE_EXPIRED: 410,
  INVITE_INVALID: 404,
  RUN_EXPIRED: 410,
  RUN_INVALID: 422,
  RACE_NOT_FOUND: 404,
  RACE_FULL: 409,
  RACE_STARTED: 409,
  RACE_EXPIRED: 410,
  EMAIL_NOT_CONFIGURED: 503,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

/** An expected, client-facing error with a stable code. */
export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS[code] ?? 400;
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found.`);
export const forbidden = (message = 'You are not allowed to do that.') =>
  new AppError('FORBIDDEN', message);
