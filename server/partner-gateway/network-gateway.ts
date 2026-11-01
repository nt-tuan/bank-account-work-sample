import { PartnerInquiryResult, ResultCode, type PartnerNetwork } from '../partner-network/index.ts';
import { ExecutionFailureCode } from '../../shared/errors.ts';
import {
  PartnerResultKind,
  UnknownOutcomeError,
  type CreditTransferRequest,
  type InquiryOutcome,
  type PartnerBankGateway,
  type PartnerResult,
} from './gateway.ts';
import { LookupOutcome } from '../../shared/domain/enums.ts';

/** The only code that knows partner field names and codes (spec §8, Adapter). */
const RESULT_TO_FAILURE: Record<Exclude<ResultCode, ResultCode.Success>, ExecutionFailureCode> = {
  [ResultCode.AccountClosed]: ExecutionFailureCode.DESTINATION_REJECTED,
  [ResultCode.AccountFrozen]: ExecutionFailureCode.DESTINATION_REJECTED,
  [ResultCode.NameMismatch]: ExecutionFailureCode.RECIPIENT_NAME_MISMATCH,
  [ResultCode.RecipientNotFound]: ExecutionFailureCode.RECIPIENT_NOT_FOUND,
  [ResultCode.Rejected]: ExecutionFailureCode.DESTINATION_REJECTED,
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new UnknownOutcomeError(`Partner did not answer within ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function toResult(record: { payment_id: string; result_cd: ResultCode }): PartnerResult {
  if (record.result_cd === ResultCode.Success)
    return { kind: PartnerResultKind.Settled, paymentId: record.payment_id };
  return { kind: PartnerResultKind.Rejected, failureCode: RESULT_TO_FAILURE[record.result_cd] };
}

export class NetworkGateway implements PartnerBankGateway {
  constructor(
    private readonly network: PartnerNetwork,
    private readonly opts: { timeoutMs: number },
  ) {}

  async inquire(bankCode: string, accountNumber: string): Promise<InquiryOutcome> {
    try {
      const r = await withTimeout(
        this.network.inquireAccount(bankCode, accountNumber),
        this.opts.timeoutMs,
      );
      if (r.result === PartnerInquiryResult.Found)
        return { outcome: LookupOutcome.Found, holderName: r.holder_name };
      if (r.result === PartnerInquiryResult.NotFound) return { outcome: LookupOutcome.NotFound };
      return { outcome: LookupOutcome.CannotReceive }; // status_cd 2 (closed) or 9 (frozen): reason not disclosed
    } catch {
      return { outcome: LookupOutcome.Unavailable };
    }
  }

  async submit(req: CreditTransferRequest): Promise<PartnerResult> {
    try {
      const record = await withTimeout(
        this.network.submitCreditTransfer({
          client_ref: req.transferId,
          bank_code: req.bankCode,
          account_no: req.accountNumber,
          beneficiary_name: req.beneficiaryName,
          amount: String(req.amountMinor),
        }),
        this.opts.timeoutMs,
      );
      return toResult(record);
    } catch (error) {
      if (error instanceof UnknownOutcomeError) throw error;
      throw new UnknownOutcomeError('Partner submission failed', { cause: error });
    }
  }

  async inquireTransfer(
    transferId: string,
  ): Promise<PartnerResult | { kind: PartnerResultKind.NotReceived }> {
    try {
      const r = await withTimeout(this.network.getCreditTransfer(transferId), this.opts.timeoutMs);
      if ('status' in r) return { kind: PartnerResultKind.NotReceived };
      return toResult(r);
    } catch (error) {
      if (error instanceof UnknownOutcomeError) throw error;
      throw new UnknownOutcomeError('Partner inquiry failed', { cause: error });
    }
  }
}
