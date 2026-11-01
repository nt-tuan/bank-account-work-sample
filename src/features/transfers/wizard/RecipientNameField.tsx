import { LookupStatus } from '../lookup/types.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { IconAlertCircle, IconCheckCircle, IconSpinner, IconWarning } from '@/shared/ui/icons.tsx';
import { FieldError, Required } from '@/shared/ui/primitives.tsx';
import type { UseFormRegister } from 'react-hook-form';
import type { LookupState } from '../lookup/useRecipientLookup.ts';
import type { TransferValues } from './types.ts';

export function RecipientNameField({
  state,
  register,
  nameRef,
  error,
  onRetry,
}: {
  state: LookupState;
  register: UseFormRegister<TransferValues>;
  nameRef: React.RefObject<HTMLInputElement | null>;
  error: string | undefined;
  onRetry: () => void;
}) {
  const manual =
    state.status === LookupStatus.Unavailable || state.status === LookupStatus.RateLimited;
  const { ref, ...rest } = register('recipientName');
  const describedBy = ['name-status', error ? 'name-err' : ''].filter(Boolean).join(' ');
  return (
    <div className={twMerge(ui.field, 'max-w-105')}>
      <label className={ui.label} htmlFor="recipientName">
        {manual && <Required />}
        Recipient name
      </label>
      {manual && (
        <span className={ui.hint}>
          Enter the name exactly as registered (A–Z, 0–9, space and ( ) . - /, up to 30 characters)
        </span>
      )}
      <div className="relative">
        <input
          id="recipientName"
          className={ui.input}
          autoComplete="off"
          readOnly={state.status === LookupStatus.Found}
          disabled={!manual && state.status !== LookupStatus.Found}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
          ref={(el) => {
            ref(el);
            nameRef.current = el;
          }}
        />
      </div>
      <FieldError id="name-err" message={error} />
      <span id="name-status" className="text-sm">
        {state.status === LookupStatus.Idle && (
          <span className="text-muted">
            Filled in from the bank after you enter the account number.
          </span>
        )}
        {state.status === LookupStatus.Loading && (
          <span className={twMerge(ui.statusSm, 'text-action')}>
            <IconSpinner size={15} />
            Looking up the registered name…
          </span>
        )}
        {state.status === LookupStatus.Found && (
          <span className={twMerge(ui.statusSm, 'text-ok')}>
            <IconCheckCircle size={15} />
            Name registered at the bank
          </span>
        )}
        {state.status === LookupStatus.NotFound && (
          <span className="inline-flex items-center gap-1.5 text-sm text-bad [&>svg]:shrink-0">
            <IconAlertCircle size={15} />
            Recipient not found. Check the bank and account number.
          </span>
        )}
        {state.status === LookupStatus.CannotReceive && (
          <span className="inline-flex items-center gap-1.5 text-sm text-bad [&>svg]:shrink-0">
            <IconAlertCircle size={15} />
            This account can't receive transfers.
          </span>
        )}
        {state.status === LookupStatus.Unavailable && (
          <span className="flex items-start gap-1.5 text-warn">
            <IconWarning size={15} className="mt-[3px] flex-none" />
            <span>
              The recipient's bank can't display the name right now. If the name doesn't match, the
              transfer will fail.{' '}
              <button type="button" className={ui.linkBtnInline} onClick={onRetry}>
                Try lookup again
              </button>
            </span>
          </span>
        )}
        {state.status === LookupStatus.RateLimited && (
          <span className="flex items-start gap-1.5 text-warn">
            <IconWarning size={15} className="mt-[3px] flex-none" />
            <span>
              The name can't be displayed because you've looked up many accounts without making a
              transfer. If the name doesn't match, the transfer will fail.
            </span>
          </span>
        )}
      </span>
    </div>
  );
}
