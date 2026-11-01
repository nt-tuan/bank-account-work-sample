import { ErrorCode } from '@domain/errors.ts';
import { TransferStep, type TransferValues } from './types.ts';

/** Which wizard step owns each order rejection (docs/technical-design/features/transfers.md). */
export const REJECTION_STEP: Partial<Record<ErrorCode, TransferStep>> = {
  [ErrorCode.INSUFFICIENT_FUNDS]: TransferStep.Amount,
  [ErrorCode.TRANSFER_LIMIT_EXCEEDED]: TransferStep.Amount,
  [ErrorCode.SOURCE_UNAVAILABLE]: TransferStep.Source,
  [ErrorCode.NOT_FOUND]: TransferStep.Source,
  [ErrorCode.DESTINATION_UNAVAILABLE]: TransferStep.Destination,
  [ErrorCode.SAME_ACCOUNT]: TransferStep.Destination,
  [ErrorCode.RECIPIENT_NOT_FOUND]: TransferStep.Destination,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: TransferStep.Review,
  [ErrorCode.SERVICE_UNAVAILABLE]: TransferStep.Review,
};

export const FIELD_ERROR_STEP: Partial<Record<string, TransferStep>> = {
  sourceAccountId: TransferStep.Source,
  destination: TransferStep.Destination,
  amount: TransferStep.Amount,
  reference: TransferStep.Amount,
};

export const FIELD_ERROR_FIELD: Partial<Record<string, keyof TransferValues>> = {
  amount: 'amount',
  reference: 'reference',
  'destination.accountNumber': 'accountNumber',
  'destination.recipientName': 'recipientName',
  sourceAccountId: 'sourceAccountId',
};
