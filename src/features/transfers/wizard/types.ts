import type { RecipientNameSource, TransferDestinationKind } from '@domain/domain/enums.ts';
import type { SubmissionAttempt } from '../submission/submit.ts';
import type { AccountSummary, Bank, TransferCommand } from '@domain/schemas/api.ts';

/** Rejection recovery: invalidate discards the review; renew changes its key; keep preserves both. */
export enum ReviewPolicy {
  Invalidate = 'invalidate',
  Renew = 'renew',
  Keep = 'keep',
}

/** Client submission state; unknown retains the review and key for a safe retry. */
export enum SubmissionPhase {
  Idle = 'idle',
  Submitting = 'submitting',
  Unknown = 'unknown',
}

/** Wizard navigation stages; values also identify steps in accessibility and recovery maps. */
export enum TransferStep {
  /** Choose the account that funds the transfer. */
  Source = 'source',
  /** Choose an own account or identify and verify a recipient. */
  Destination = 'destination',
  /** Enter the amount and optional reference. */
  Amount = 'amount',
  /** Confirm the immutable command snapshot and submit it. */
  Review = 'review',
}
export const STEPS: { id: TransferStep; label: string }[] = [
  { id: TransferStep.Source, label: 'From' },
  { id: TransferStep.Destination, label: 'To' },
  { id: TransferStep.Amount, label: 'Amount' },
  { id: TransferStep.Review, label: 'Review' },
];

export type TransferValues = {
  sourceAccountId: string;
  kind: TransferDestinationKind;
  destAccountId: string;
  bankId: string;
  accountNumber: string;
  recipientName: string;
  recipientNameSource: RecipientNameSource | null;
  amount: string;
  reference: string;
};
export type TransferPrefill = Partial<TransferValues>;
export type Review = { command: TransferCommand; hash: string; key: string };
export type Submission =
  | { phase: SubmissionPhase.Idle }
  | { phase: SubmissionPhase.Submitting; attempt: SubmissionAttempt }
  | { phase: SubmissionPhase.Unknown };
export type WizardInput = { accounts: AccountSummary[]; banks: Bank[]; limitMax: number };
