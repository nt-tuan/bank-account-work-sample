import { ReviewPolicy, TransferStep, type TransferValues } from './types.ts';
import { ErrorCode } from '@domain/errors.ts';
import type { RejectedFailure } from '@/shared/api/http.ts';
import { REJECTION_COPY } from '../messages.ts';
import { FIELD_ERROR_FIELD, FIELD_ERROR_STEP, REJECTION_STEP } from './transfer-rejection-maps.ts';

type RejectionAction = {
  step: TransferStep;
  errors: Partial<Record<keyof TransferValues, string>>;
  message: string;
  reviewPolicy: ReviewPolicy;
  announcement?: string;
};

/** Rejections whose server message carries specifics: the restriction reason, or the customer's limit. */
const SERVER_WORDED = new Set([ErrorCode.SOURCE_UNAVAILABLE, ErrorCode.TRANSFER_LIMIT_EXCEEDED]);

/**
 * Maps a server rejection to wizard recovery instructions without changing UI state.
 * The caller applies navigation, form errors, review policy and announcements.
 */
export function mapTransferRejection(failure: RejectedFailure): RejectionAction | null {
  // Authentication failures belong to the global auth handler.
  if (failure.status === 401) return null;
  if (failure.status === 400 && failure.fieldErrors) {
    const errors: RejectionAction['errors'] = {};
    let step: TransferStep | undefined;
    for (const [path, message] of Object.entries(failure.fieldErrors)) {
      const field = FIELD_ERROR_FIELD[path];
      if (field) errors[field] = message;
      // The first server path chooses the step, even without a matching form field.
      // Nested paths such as destination.bankId belong to their root's step.
      const [root] = path.split('.');
      step ??= FIELD_ERROR_STEP[root ?? ''] ?? TransferStep.Amount;
    }
    return {
      step: step ?? TransferStep.Amount,
      errors,
      message: failure.message,
      reviewPolicy: ReviewPolicy.Invalidate,
    };
  }
  const owner = REJECTION_STEP[failure.code];
  const message = SERVER_WORDED.has(failure.code)
    ? failure.message
    : (REJECTION_COPY[failure.code] ?? failure.message);
  // Rejections owned by review, or unmapped codes, keep the review and renew its idempotency key.
  if (owner === TransferStep.Review || !owner)
    return {
      step: TransferStep.Review,
      errors: {},
      message,
      reviewPolicy: ReviewPolicy.Renew,
      announcement: message,
    };
  // Returning to an input step discards the review so corrected values must be reviewed again.
  return {
    step: owner,
    errors: owner === TransferStep.Amount ? { amount: message } : {},
    message,
    reviewPolicy: ReviewPolicy.Invalidate,
    announcement: `Your transfer wasn't sent. ${message}`,
  };
}
