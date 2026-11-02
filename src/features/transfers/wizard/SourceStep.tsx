import { AccountType } from '@domain/domain/enums.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { FieldError, Money, Required } from '@/shared/ui/primitives.tsx';
import { useFormState, useFormContext } from 'react-hook-form';
import { StepError } from './StepError.tsx';
import { useStepHeadingFocus } from './useStepHeadingFocus.ts';
import type { AccountSummary } from '@domain/schemas/api.ts';
import type { TransferValues } from './types.ts';
import styles from './wizard.module.css';

type SourceStepProps = {
  accounts: AccountSummary[];
  onNext: () => void;
  onAttempt: () => void;
  error: string | null;
};

export function validateSource(values: TransferValues, accounts: AccountSummary[]) {
  return accounts.some((a) => a.id === values.sourceAccountId && a.canSend)
    ? null
    : 'Choose an account to send from.';
}

export function SourceStep({ accounts, onNext, onAttempt, error }: SourceStepProps) {
  const headingRef = useStepHeadingFocus();
  const { register, control, getValues, clearErrors, setError, setFocus, setValue } =
    useFormContext<TransferValues>();
  const { errors } = useFormState({ control, name: 'sourceAccountId', exact: true });
  const next = () => {
    onAttempt();
    clearErrors('sourceAccountId');
    const message = validateSource(getValues(), accounts);
    if (message) {
      setError('sourceAccountId', { message });
      setFocus('sourceAccountId');
    } else {
      if (getValues('destAccountId') === getValues('sourceAccountId'))
        setValue('destAccountId', '', { shouldDirty: true });
      onNext();
    }
  };
  return (
    <>
      <h2 ref={headingRef} tabIndex={-1} className="pt-2">
        Which account are you sending from?
      </h2>
      <form
        className={twMerge(ui.card, 'flex flex-col gap-5.5 p-6 max-md:p-4')}
        onSubmit={(e) => (e.preventDefault(), next())}
        noValidate
      >
        <StepError error={error} />
        <fieldset aria-describedby={errors.sourceAccountId ? 'src-err' : undefined}>
          <legend className={twMerge(ui.label, 'pb-2')}>
            <Required />
            From account
          </legend>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <label className={styles.option} key={a.id}>
                <input
                  type="radio"
                  value={a.id}
                  disabled={!a.canSend}
                  {...register('sourceAccountId')}
                />
                <span className="min-w-0 flex-auto">
                  {a.name}{' '}
                  <span className="text-sm text-muted tabular-nums">
                    · {a.type === AccountType.Checking ? 'Checking' : 'Savings'} · {a.maskedNumber}
                  </span>
                  {!a.canSend && (
                    <span className="block text-sm text-warn">
                      Restricted — can't send. {a.restrictionReason}
                    </span>
                  )}
                </span>
                <span className="text-right text-sm tabular-nums">
                  <span className="block text-xs text-muted">Available</span>
                  <Money minor={a.availableMinor} />
                </span>
              </label>
            ))}
          </div>
          <FieldError id="src-err" message={errors.sourceAccountId?.message} />
        </fieldset>
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
