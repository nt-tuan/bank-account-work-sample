import { ErrorCode, ExecutionFailureCode } from '@domain/errors.ts';

/** Customer copy for execution failures, written once and reused by Transfer Details, Activity Details and announcements. */
export const FAILURE_COPY: Record<
  ExecutionFailureCode,
  { reason: string; action: string; short: string }
> = {
  [ExecutionFailureCode.DESTINATION_UNAVAILABLE]: {
    reason: "The destination account can't receive transfers.",
    action: 'Make a new transfer',
    short: "Account can't receive",
  },
  [ExecutionFailureCode.SOURCE_UNAVAILABLE]: {
    reason: "Your account can't send transfers right now.",
    action: 'Make a new transfer',
    short: "Source can't send",
  },
  [ExecutionFailureCode.RECIPIENT_NAME_MISMATCH]: {
    reason: "The name you entered doesn't match the name registered at the bank.",
    action: 'Make a corrected transfer',
    short: 'Name doesn’t match',
  },
  [ExecutionFailureCode.RECIPIENT_NOT_FOUND]: {
    reason: "The recipient's bank couldn't find this account.",
    action: 'Make a corrected transfer',
    short: 'Account not found',
  },
  [ExecutionFailureCode.DESTINATION_REJECTED]: {
    reason: "The recipient's bank didn't accept this transfer.",
    action: 'Make a new transfer',
    short: 'Recipient bank rejected',
  },
  [ExecutionFailureCode.PROCESSING_FAILED]: {
    reason: "We couldn't complete this transfer.",
    action: 'Try a new transfer',
    short: 'Processing failed',
  },
};

export const REJECTION_COPY: Partial<Record<ErrorCode, string>> = {
  [ErrorCode.INSUFFICIENT_FUNDS]: 'The amount is more than the available balance of this account.',
  [ErrorCode.DESTINATION_UNAVAILABLE]: "The destination account can't receive transfers.",
  [ErrorCode.SAME_ACCOUNT]: 'Choose a different account to send to.',
  [ErrorCode.RECIPIENT_NOT_FOUND]: 'Recipient not found. Check the bank and account number.',
  [ErrorCode.NOT_FOUND]: "We couldn't find that account. Choose another one.",
  [ErrorCode.SERVICE_UNAVAILABLE]: 'The service is busy. Nothing was sent.',
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 'Please review the details and confirm again.',
};
