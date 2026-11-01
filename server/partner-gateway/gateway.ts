import type { LookupOutcome } from '../../shared/domain/enums.ts';
import type { ExecutionFailureCode } from '../../shared/errors.ts';

/** Partner payment result; not received permits resending the same transfer identity. */
export enum PartnerResultKind {
  Settled = 'settled',
  Rejected = 'rejected',
  NotReceived = 'not_received',
}

/** The only partner-facing type core code sees (spec §8). */
export type InquiryOutcome =
  | { outcome: LookupOutcome.Found; holderName: string }
  | { outcome: LookupOutcome.NotFound }
  | { outcome: LookupOutcome.CannotReceive }
  | { outcome: LookupOutcome.Unavailable };

export type CreditTransferRequest = {
  transferId: string;
  bankCode: string;
  accountNumber: string;
  beneficiaryName: string;
  amountMinor: number;
};

export type PartnerResult =
  | { kind: PartnerResultKind.Settled; paymentId: string }
  | { kind: PartnerResultKind.Rejected; failureCode: ExecutionFailureCode };

/** Timeout, transport error or malformed answer: the partner may or may not have the payment. Never a failure. */
export class UnknownOutcomeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnknownOutcomeError';
  }
}

export interface PartnerBankGateway {
  inquire(bankCode: string, accountNumber: string): Promise<InquiryOutcome>;
  /** Throws UnknownOutcomeError when the outcome is not known. */
  submit(req: CreditTransferRequest): Promise<PartnerResult>;
  /** Throws UnknownOutcomeError when the inquiry itself fails. */
  inquireTransfer(
    transferId: string,
  ): Promise<PartnerResult | { kind: PartnerResultKind.NotReceived }>;
}
