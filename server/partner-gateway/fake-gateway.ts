import { LookupOutcome } from '../../shared/domain/enums.ts';
import {
  PartnerResultKind,
  UnknownOutcomeError,
  type CreditTransferRequest,
  type InquiryOutcome,
  type PartnerBankGateway,
  type PartnerResult,
} from './gateway.ts';
import { ExecutionFailureCode } from '../../shared/errors.ts';

/** Fake gateway behaviors used to reproduce partner rejections and uncertain submissions in tests. */
export enum Script {
  Settle = 'settle',
  RejectName = 'reject_name',
  RejectClosed = 'reject_closed',
  UnknownThenSettled = 'unknown_then_settled',
  LostThenSettle = 'lost_then_settle',
}

/** In-memory, scriptable gateway for service tests (docs/technical-design/features/transfers.md). */
export class FakeGateway implements PartnerBankGateway {
  readonly accounts = new Map<string, { holderName: string; canReceive: boolean }>();
  readonly payments = new Map<string, PartnerResult>();
  readonly submits: CreditTransferRequest[] = [];
  readonly scripts = new Map<string, Script>();
  inquiryUnavailable = false;

  addAccount(bankCode: string, accountNumber: string, holderName: string, canReceive = true): this {
    this.accounts.set(`${bankCode}:${accountNumber}`, { holderName, canReceive });
    return this;
  }

  async inquire(bankCode: string, accountNumber: string): Promise<InquiryOutcome> {
    if (this.inquiryUnavailable) return { outcome: LookupOutcome.Unavailable };
    const a = this.accounts.get(`${bankCode}:${accountNumber}`);
    if (!a) return { outcome: LookupOutcome.NotFound };
    if (!a.canReceive) return { outcome: LookupOutcome.CannotReceive };
    return { outcome: LookupOutcome.Found, holderName: a.holderName };
  }

  async submit(req: CreditTransferRequest): Promise<PartnerResult> {
    this.submits.push(req);
    const existing = this.payments.get(req.transferId);
    if (existing) return existing;
    const script = this.scripts.get(req.transferId) ?? Script.Settle;
    if (script === Script.LostThenSettle) {
      this.scripts.set(req.transferId, Script.Settle);
      throw new UnknownOutcomeError('lost');
    }
    const a = this.accounts.get(`${req.bankCode}:${req.accountNumber}`);
    let result: PartnerResult;
    if (script === Script.RejectClosed)
      result = {
        kind: PartnerResultKind.Rejected,
        failureCode: ExecutionFailureCode.DESTINATION_REJECTED,
      };
    else if (!a)
      result = {
        kind: PartnerResultKind.Rejected,
        failureCode: ExecutionFailureCode.RECIPIENT_NOT_FOUND,
      };
    else if (script === Script.RejectName || a.holderName !== req.beneficiaryName)
      result = {
        kind: PartnerResultKind.Rejected,
        failureCode: ExecutionFailureCode.RECIPIENT_NAME_MISMATCH,
      };
    else result = { kind: PartnerResultKind.Settled, paymentId: `FAKE-${this.payments.size + 1}` };
    this.payments.set(req.transferId, result);
    if (script === Script.UnknownThenSettled) throw new UnknownOutcomeError('timeout after commit');
    return result;
  }

  async inquireTransfer(
    transferId: string,
  ): Promise<PartnerResult | { kind: PartnerResultKind.NotReceived }> {
    return this.payments.get(transferId) ?? { kind: PartnerResultKind.NotReceived };
  }
}
