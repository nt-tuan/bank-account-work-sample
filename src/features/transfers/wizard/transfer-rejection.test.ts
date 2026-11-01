import { ApiFailureKind, type RejectedFailure } from '@/shared/api/http.ts';
import { ErrorCode } from '@domain/errors.ts';
import { describe, expect, it } from 'vitest';
import { mapTransferRejection } from './transfer-rejection.ts';

const failure: RejectedFailure = {
  kind: ApiFailureKind.Rejected,
  status: 400,
  code: ErrorCode.VALIDATION_ERROR,
  message: 'Check your details.',
};

describe('mapTransferRejection', () => {
  it('leaves 401 to the global auth handler', () => {
    expect(mapTransferRejection({ ...failure, status: 401 })).toBeNull();
  });

  it('maps fields and chooses the first server path even when that path has no form mapping', () => {
    expect(
      mapTransferRejection({
        ...failure,
        fieldErrors: {
          'destination.bankId': 'Bank rejected.',
          amount: 'Amount rejected.',
          'destination.recipientName': 'Name rejected.',
          sourceAccountId: 'Source rejected.',
        },
      }),
    ).toEqual({
      step: 'destination',
      message: failure.message,
      reviewPolicy: 'invalidate',
      errors: {
        amount: 'Amount rejected.',
        recipientName: 'Name rejected.',
        sourceAccountId: 'Source rejected.',
      },
    });
  });

  it('preserves field-error ordering and the empty field-error fallback', () => {
    expect(
      mapTransferRejection({
        ...failure,
        fieldErrors: { reference: 'Reference rejected.', sourceAccountId: 'Source rejected.' },
      })?.step,
    ).toBe('amount');
    expect(mapTransferRejection({ ...failure, fieldErrors: {} })?.step).toBe('amount');
    expect(
      mapTransferRejection({ ...failure, fieldErrors: { sourceAccountId: 'Source rejected.' } })
        ?.step,
    ).toBe('source');
  });

  it('uses the source server message and amount field error for their owning steps', () => {
    expect(
      mapTransferRejection({ ...failure, status: 422, code: ErrorCode.SOURCE_UNAVAILABLE }),
    ).toMatchObject({
      step: 'source',
      message: failure.message,
      reviewPolicy: 'invalidate',
      announcement: `Your transfer wasn't sent. ${failure.message}`,
    });
    expect(
      mapTransferRejection({ ...failure, status: 422, code: ErrorCode.INSUFFICIENT_FUNDS }),
    ).toMatchObject({
      step: 'amount',
      reviewPolicy: 'invalidate',
      errors: { amount: 'The amount is more than the available balance of this account.' },
    });
  });

  it.each([
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.IDEMPOTENCY_KEY_REUSED,
    ErrorCode.INTERNAL_ERROR,
  ] as const)('renews on review for %s', (code) => {
    const result = mapTransferRejection({ ...failure, status: 503, code });
    expect(result).toMatchObject({ step: 'review', reviewPolicy: 'renew', errors: {} });
    expect(result?.announcement).toBe(result?.message);
  });
});
