import { AccountType, RecipientNameSource, TransferDestinationKind } from '@domain/domain/enums.ts';
import { LookupStatus } from '../lookup/types.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { FieldError, Required } from '@/shared/ui/primitives.tsx';
import { Select, SelectOption } from '@/shared/ui/Select.tsx';
import { Controller, useFormState, useFormContext, useWatch } from 'react-hook-form';
import { RecipientNameField } from './RecipientNameField.tsx';
import { StepError } from './StepError.tsx';
import { useRef, useState } from 'react';
import {
  FIELD_ERROR_MESSAGES,
  parseAccountNumber,
  parseRecipientName,
} from '@domain/rules/input.ts';
import type { AccountSummary, Bank } from '@domain/schemas/api.ts';
import type { LookupState } from '../lookup/useRecipientLookup.ts';
import type { TransferValues } from './types.ts';
import { useRecipientController } from './useRecipientController.ts';
import { useStepHeadingFocus } from './useStepHeadingFocus.ts';
import styles from './wizard.module.css';

type DestinationStepProps = {
  accounts: AccountSummary[];
  banks: Bank[];
  onNext: () => void;
  onAttempt: () => void;
  error: string | null;
};

type DestinationValidation = {
  errors: Partial<Record<'destAccountId' | 'bankId' | 'accountNumber' | 'recipientName', string>>;
  stepError?: string;
  lookupRequired?: boolean;
};

/** Validates destination fields and signals when recipient lookup is needed; performs no lookup itself. */
export function validateDestination(
  values: TransferValues,
  lookup: LookupState,
): DestinationValidation {
  const errors: DestinationValidation['errors'] = {};
  if (values.kind === TransferDestinationKind.Own) {
    if (!values.destAccountId) errors.destAccountId = 'Choose an account to send to.';
    return { errors };
  }
  if (!values.bankId) errors.bankId = 'Choose a bank.';
  const number = parseAccountNumber(values.accountNumber);
  if (!number.ok) errors.accountNumber = FIELD_ERROR_MESSAGES[number.error];
  if (Object.keys(errors).length) return { errors };
  // The caller blocks Next while lookup is in progress; no new error is needed yet.
  if (lookup.status === LookupStatus.Loading) return { errors };
  // Definitive lookup failures block the transfer, even when a recipient name is present.
  if (lookup.status === LookupStatus.NotFound || lookup.status === LookupStatus.CannotReceive) {
    return {
      errors,
      stepError:
        lookup.status === LookupStatus.NotFound
          ? 'Recipient not found. Check the bank and account number.'
          : "This account can't receive transfers.",
    };
  }
  if (values.recipientNameSource === RecipientNameSource.Lookup && values.recipientName)
    return { errors };
  // Temporary lookup failures allow a manually entered name; validate it before proceeding.
  if (
    lookup.status === LookupStatus.Unavailable ||
    lookup.status === LookupStatus.RateLimited ||
    values.recipientNameSource === RecipientNameSource.Manual
  ) {
    const name = parseRecipientName(values.recipientName);
    if (!name.ok) errors.recipientName = FIELD_ERROR_MESSAGES[name.error];
    return { errors };
  }
  // No accepted name is available yet; ask the caller to start lookup.
  return { errors, lookupRequired: true };
}

export function DestinationStep({
  accounts,
  banks,
  onNext,
  onAttempt,
  error,
}: DestinationStepProps) {
  const headingRef = useStepHeadingFocus();
  const form = useFormContext<TransferValues>();
  const { register, control, getValues, clearErrors, setError, setValue, setFocus } = form;
  const { errors } = useFormState({
    control,
    name: ['destAccountId', 'bankId', 'accountNumber', 'recipientName'],
    exact: true,
  });
  const nextRef = useRef<HTMLButtonElement>(null);
  const recipient = useRecipientController(form, nextRef);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const next = () => {
    onAttempt();
    setLookupError(null);
    clearErrors(['destAccountId', 'bankId', 'accountNumber', 'recipientName']);
    const values = getValues();
    const result = validateDestination(values, recipient.state);
    const firstError = Object.keys(result.errors)[0];
    for (const [field, message] of Object.entries(result.errors))
      setError(field as keyof TransferValues, { message });
    if (firstError) setFocus(firstError as keyof TransferValues);
    if (result.stepError) setLookupError(result.stepError);
    if (result.lookupRequired) void recipient.lookup();
    if (
      Object.keys(result.errors).length ||
      result.stepError ||
      result.lookupRequired ||
      (values.kind === TransferDestinationKind.Recipient && recipient.busy)
    )
      return;
    if (
      values.kind === TransferDestinationKind.Recipient &&
      values.recipientNameSource !== RecipientNameSource.Lookup &&
      values.recipientNameSource !== RecipientNameSource.Manual
    ) {
      setValue('recipientNameSource', RecipientNameSource.Manual, { shouldDirty: true });
    }
    onNext();
  };
  const [kind, sourceAccountId] = useWatch({ control, name: ['kind', 'sourceAccountId'] });
  const lookupBusy = recipient.busy;
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1} className="pt-2">
        Who are you sending to?
      </h2>
      <form
        className={twMerge(ui.card, 'flex flex-col gap-5.5 p-6 max-md:p-4')}
        onSubmit={(e) => (e.preventDefault(), next())}
        noValidate
        aria-busy={lookupBusy}
      >
        <StepError error={error ?? lookupError} />
        <fieldset>
          <legend className={twMerge(ui.label, 'pb-2')}>
            <Required />
            Transfer type
          </legend>
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <label className={styles.option}>
              <input type="radio" value={TransferDestinationKind.Own} {...register('kind')} />
              Own accounts
            </label>
            <label className={styles.option}>
              <input type="radio" value={TransferDestinationKind.Recipient} {...register('kind')} />
              Someone else
            </label>
          </div>
        </fieldset>

        {kind === TransferDestinationKind.Own ? (
          <fieldset aria-describedby={errors.destAccountId ? 'dest-err' : undefined}>
            <legend className={twMerge(ui.label, 'pb-2')}>
              <Required />
              To account
            </legend>
            <div className="flex flex-col gap-2">
              {accounts
                .filter((a) => a.id !== sourceAccountId)
                .map((a) => (
                  <label className={styles.option} key={a.id}>
                    <input
                      type="radio"
                      value={a.id}
                      disabled={!a.canReceive}
                      {...register('destAccountId')}
                    />
                    <span className="flex-auto">
                      {a.name}{' '}
                      <span className="text-sm text-muted tabular-nums">
                        · {a.type === AccountType.Checking ? 'Checking' : 'Savings'} ·{' '}
                        {a.maskedNumber}
                      </span>
                    </span>
                    {!a.canReceive && (
                      <span className="text-sm text-warn">Restricted — can't receive</span>
                    )}
                  </label>
                ))}
            </div>
            <FieldError id="dest-err" message={errors.destAccountId?.message} />
          </fieldset>
        ) : (
          <fieldset disabled={lookupBusy} className="flex flex-col gap-5.5">
            <legend className="sr-only">Recipient</legend>
            <div className={twMerge(ui.field, 'max-w-100')}>
              <label className={ui.label} htmlFor="bank">
                <Required />
                Bank
              </label>
              <Controller
                name="bankId"
                control={control}
                render={({ field }) => (
                  <Select
                    id="bank"
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    disabled={lookupBusy}
                    aria-invalid={Boolean(errors.bankId)}
                    aria-describedby={errors.bankId ? 'bank-err' : undefined}
                    onValueChange={(value) => {
                      field.onChange(value);
                      recipient.onBankChange();
                    }}
                  >
                    <SelectOption value="">Choose a bank</SelectOption>
                    {banks.map((bank) => (
                      <SelectOption key={bank.id} value={bank.id}>
                        {bank.name} ({bank.code})
                      </SelectOption>
                    ))}
                  </Select>
                )}
              />
              <FieldError id="bank-err" message={errors.bankId?.message} />
            </div>
            <div className={twMerge(ui.field, 'max-w-55')}>
              <label className={ui.label} htmlFor="accountNumber">
                <Required />
                Account number
              </label>
              <span className={ui.hint} id="acno-hint">
                7 digits
              </span>
              <input
                id="accountNumber"
                className={twMerge(ui.input, 'tracking-[0.06em] tabular-nums')}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={7}
                autoComplete="off"
                aria-invalid={Boolean(errors.accountNumber)}
                aria-describedby={`acno-hint${errors.accountNumber ? ' acno-err' : ''}`}
                {...register('accountNumber', {
                  onChange: recipient.onKeyEdit,
                  onBlur: recipient.onNumberBlur,
                })}
              />
              <FieldError id="acno-err" message={errors.accountNumber?.message} />
            </div>
            <RecipientNameField
              state={recipient.state}
              register={register}
              nameRef={recipient.nameRef}
              error={errors.recipientName?.message}
              onRetry={() => void recipient.retry()}
            />
          </fieldset>
        )}
        <button type="submit" hidden />
      </form>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.btnPrimary}
          onClick={next}
          ref={nextRef}
          disabled={lookupBusy}
        >
          Next
        </button>
      </div>
    </>
  );
}
