import { TransferStep, type TransferValues } from './types.ts';
import { TransferDestinationKind } from '@domain/domain/enums.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { FieldError, Money, Required } from '@/shared/ui/primitives.tsx';
import { formatYen, maskAccountNumber } from '@domain/money.ts';
import { FIELD_ERROR_MESSAGES, parseAmount, parseReference } from '@domain/rules/input.ts';
import { transferLimitMessage } from '@domain/rules/policy.ts';
import { useFormState, useFormContext, useWatch } from 'react-hook-form';
import { StepError } from './StepError.tsx';
import { useStepHeadingFocus } from './useStepHeadingFocus.ts';
import type { AccountSummary, Bank } from '@domain/schemas/api.ts';

type AmountStepProps = {
  accounts: AccountSummary[];
  banks: Bank[];
  limitMax: number;
  onNext: () => void;
  onAttempt: () => void;
  onEdit: (step: TransferStep) => void;
  error: string | null;
};

export function validateAmount(
  values: TransferValues,
  source: AccountSummary | undefined,
  limitMax: number,
) {
  const errors: Partial<Record<'amount' | 'reference', string>> = {};
  const amount = parseAmount(values.amount);
  if (!amount.ok) errors.amount = FIELD_ERROR_MESSAGES[amount.error];
  else if (amount.value > limitMax) errors.amount = transferLimitMessage(limitMax);
  else if (source && amount.value > source.availableMinor)
    errors.amount = 'The amount is more than the available balance of this account.';
  const reference = parseReference(values.reference);
  if (!reference.ok) errors.reference = FIELD_ERROR_MESSAGES[reference.error];
  return errors;
}

export function AmountStep({
  accounts,
  banks,
  limitMax,
  onNext,
  onAttempt,
  onEdit,
  error,
}: AmountStepProps) {
  const headingRef = useStepHeadingFocus();
  const { register, control, getValues, clearErrors, setError, setFocus } =
    useFormContext<TransferValues>();
  const { errors } = useFormState({ control, name: ['amount', 'reference'], exact: true });
  const sourceId = useWatch({ control, name: 'sourceAccountId' });
  const source = accounts.find((account) => account.id === sourceId);
  const next = () => {
    onAttempt();
    clearErrors(['amount', 'reference']);
    const validation = validateAmount(getValues(), source, limitMax);
    const firstError = Object.keys(validation)[0];
    for (const field of ['amount', 'reference'] as const) {
      if (validation[field]) setError(field, { message: validation[field] });
    }
    if (firstError) setFocus(firstError as 'amount' | 'reference');
    if (!Object.keys(validation).length) onNext();
  };
  const [amount, kind, destAccountId, bankId, recipientName, accountNumber] = useWatch({
    control,
    name: ['amount', 'kind', 'destAccountId', 'bankId', 'recipientName', 'accountNumber'],
  });
  const destAccount = accounts.find((account) => account.id === destAccountId);
  const bank = banks.find((bank) => bank.id === bankId);
  const amountParsed = parseAmount(amount);
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1} className="pt-2">
        How much?
      </h2>
      <form
        className={twMerge(ui.card, 'flex flex-col gap-5.5 p-6 max-md:p-4')}
        onSubmit={(e) => (e.preventDefault(), next())}
        noValidate
      >
        <StepError error={error} />
        <div className={twMerge(ui.field, 'max-w-80')}>
          <label className={ui.label} htmlFor="amount">
            <Required />
            Amount (¥)
          </label>
          <span className={twMerge(ui.hint, 'tabular-nums')} id="amount-hint">
            {source && (
              <>
                Available <Money minor={source.availableMinor} /> ·{' '}
              </>
            )}
            up to {formatYen(limitMax)} per transfer
          </span>
          <input
            id="amount"
            className={twMerge(ui.inputLg, 'tabular-nums')}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={`amount-hint amount-echo${errors.amount ? ' amount-err' : ''}`}
            {...register('amount')}
          />
          <FieldError id="amount-err" message={errors.amount?.message} />
          <span className={twMerge(ui.hint, 'tabular-nums')} id="amount-echo" aria-live="polite">
            {amountParsed.ok ? `= ${formatYen(amountParsed.value)} · Fee ¥0` : 'Fee ¥0'}
          </span>
        </div>
        <div className={twMerge(ui.field, 'max-w-130')}>
          <label className={ui.label} htmlFor="reference">
            Reference <span className={twMerge(ui.hint, 'font-normal')}>(optional)</span>
          </label>
          <span className={ui.hint} id="ref-hint">
            Up to 140 characters: A–Z, a–z, 0–9, space and ( ) . - /
          </span>
          <input
            id="reference"
            className={ui.input}
            autoComplete="off"
            aria-invalid={Boolean(errors.reference)}
            aria-describedby={`ref-hint${errors.reference ? ' ref-err' : ''}`}
            {...register('reference')}
          />
          <FieldError id="ref-err" message={errors.reference?.message} />
        </div>
        <p className="text-sm text-muted">
          To{' '}
          {kind === TransferDestinationKind.Own
            ? `${destAccount?.name ?? ''} ${destAccount?.maskedNumber ?? ''}`
            : `${recipientName || '—'} · ${bank?.name ?? ''} ${accountNumber ? maskAccountNumber(accountNumber) : ''}`}{' '}
          ·{' '}
          <button
            type="button"
            className={ui.linkBtnInline}
            onClick={() => onEdit(TransferStep.Destination)}
          >
            Change
          </button>
        </p>
        <button type="submit" hidden />
      </form>
      <div className={ui.actions}>
        <button type="button" className={ui.btnPrimary} onClick={next}>
          Next
        </button>
      </div>
    </>
  );
}
