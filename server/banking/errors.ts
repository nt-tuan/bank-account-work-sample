import { ErrorCode, ERROR_STATUS, type FieldErrors } from '../../shared/errors.ts';

/** Default customer message per code, so every route reports the same code with the same words. */
const MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.VALIDATION_ERROR]: 'Some details need correcting.',
  [ErrorCode.IDEMPOTENCY_KEY_MISSING]: 'The Idempotency-Key header is required.',
  [ErrorCode.IDEMPOTENCY_KEY_INVALID]: 'The Idempotency-Key must be a UUID.',
  [ErrorCode.INVALID_CREDENTIALS]: 'The username or password is incorrect.',
  [ErrorCode.SESSION_EXPIRED]: 'Your session has ended. Please sign in again.',
  [ErrorCode.CSRF_INVALID]: 'This request could not be verified. Reload the page and try again.',
  [ErrorCode.DEMO_DISABLED]: 'Demo controls are disabled.',
  [ErrorCode.NOT_FOUND]: "We couldn't find that.",
  [ErrorCode.INSUFFICIENT_FUNDS]: 'The amount is more than the available balance of this account.',
  [ErrorCode.TRANSFER_LIMIT_EXCEEDED]: 'The amount is above the maximum for one transfer.',
  [ErrorCode.SOURCE_UNAVAILABLE]: "This account can't send transfers right now.",
  [ErrorCode.DESTINATION_UNAVAILABLE]: "The destination account can't receive transfers.",
  [ErrorCode.SAME_ACCOUNT]: 'Choose a different account to send to.',
  [ErrorCode.RECIPIENT_NOT_FOUND]: 'Recipient not found. Check the bank and account number.',
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 'This request was already used for a different transfer.',
  [ErrorCode.LOOKUP_RATE_LIMITED]:
    "The name can't be displayed because you've looked up many accounts without making a transfer.",
  [ErrorCode.INTERNAL_ERROR]: 'Something went wrong.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'The service is busy. Nothing was sent.',
};

/** A definitive "no": nothing was recorded. Mapped to the JSON error envelope by the HTTP layer. */
export class DomainRejection extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    readonly fieldErrors?: FieldErrors,
    message?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = 'DomainRejection';
    this.status = ERROR_STATUS[code];
  }
}

export const reject = (code: ErrorCode, fieldErrors?: FieldErrors, message?: string) =>
  new DomainRejection(code, fieldErrors, message);
