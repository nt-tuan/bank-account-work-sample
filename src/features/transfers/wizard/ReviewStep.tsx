import { SubmissionPhase, TransferStep, type Review, type Submission } from './types.ts';
import { AccountType, RecipientNameSource, TransferDestinationKind } from '@domain/domain/enums.ts';
import { SubmissionAttempt } from '../submission/submit.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { IconSpinner, IconWarning } from '@/shared/ui/icons.tsx';
import { Money } from '@/shared/ui/primitives.tsx';
import { maskAccountNumber } from '@domain/money.ts';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { useStepHeadingFocus } from './useStepHeadingFocus.ts';
import type { AccountSummary, Bank } from '@domain/schemas/api.ts';
import styles from './wizard.module.css';

type ReviewStepProps = {
  accounts: AccountSummary[];
  banks: Bank[];
  review: Review | null;
  source: AccountSummary | undefined;
  submission: Submission;
  onEdit: (step: TransferStep) => void;
  onConfirm: () => Promise<void>;
  error: string | null;
};

export function ReviewStep({
  accounts,
  banks,
  review,
  source,
  submission,
  onEdit,
  onConfirm,
  error,
}: ReviewStepProps) {
  const headingRef = useStepHeadingFocus(submission.phase === SubmissionPhase.Unknown);
  if (!review || !source) return null;
  const destination = review.command.destination;
  const destAccount =
    destination.kind === TransferDestinationKind.Own
      ? accounts.find((account) => account.id === destination.accountId)
      : undefined;
  const bank =
    destination.kind === TransferDestinationKind.Recipient
      ? banks.find((bank) => bank.id === destination.bankId)
      : undefined;
  const submitting = submission.phase === SubmissionPhase.Submitting;
  return (
    <>
      {submission.phase === SubmissionPhase.Unknown ? (
        <>
          <section
            className={twMerge(ui.card, 'flex flex-col items-center gap-3 p-8 text-center')}
            aria-labelledby="unknown-h"
          >
            <IconWarning size={32} className="text-warn" />
            <h2 id="unknown-h" ref={headingRef} tabIndex={-1}>
              We couldn't confirm your transfer
            </h2>
            <p className="max-w-130 text-sm">
              It may or may not have been sent. Trying again here is safe and won't send it twice.
              If you leave this page, check Account activity before sending again.
            </p>
          </section>
          <div className={ui.actionsCenter}>
            <Link className={ui.btnOutline} to="/activity?cat=transfer">
              View account activity
            </Link>
            <button type="button" className={ui.btnPrimary} onClick={() => void onConfirm()}>
              Try again
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 ref={headingRef} tabIndex={-1} className="pt-2">
            Review your transfer
          </h2>
          <ul className={styles.review}>
            <ReviewRow
              label="Amount"
              onChange={() => onEdit(TransferStep.Amount)}
              changeLabel="Change amount"
              disabled={submitting}
            >
              <Money minor={Number(review.command.amount)} className={ui.amountLg} />
            </ReviewRow>
            <ReviewRow label="Fee">
              <span className="tabular-nums">¥0</span>
            </ReviewRow>
            <ReviewRow
              label="From"
              onChange={() => onEdit(TransferStep.Source)}
              changeLabel="Change source account"
              disabled={submitting}
            >
              {source.name} · {source.type === AccountType.Checking ? 'Checking' : 'Savings'} ·{' '}
              <span className="tabular-nums">{source.maskedNumber}</span>
            </ReviewRow>
            {review.command.destination.kind === TransferDestinationKind.Own ? (
              <ReviewRow
                label="To"
                onChange={() => onEdit(TransferStep.Destination)}
                changeLabel="Change destination"
                disabled={submitting}
              >
                {destAccount?.name} ·{' '}
                <span className="tabular-nums">{destAccount?.maskedNumber}</span>{' '}
                <span className="text-sm text-muted">· your account</span>
              </ReviewRow>
            ) : (
              <>
                <ReviewRow
                  label="Bank"
                  onChange={() => onEdit(TransferStep.Destination)}
                  changeLabel="Change recipient"
                  disabled={submitting}
                >
                  {bank?.name} <span className="text-muted tabular-nums">({bank?.code})</span>
                </ReviewRow>
                <ReviewRow label="Account number">
                  <span className="tabular-nums">
                    {maskAccountNumber(review.command.destination.accountNumber)}
                  </span>
                </ReviewRow>
                <ReviewRow label="Recipient name">
                  {review.command.destination.recipientName}{' '}
                  <span className="text-sm text-muted">
                    ·{' '}
                    {review.command.destination.recipientNameSource === RecipientNameSource.Lookup
                      ? 'Registered at the bank'
                      : 'Entered by you'}
                  </span>
                </ReviewRow>
              </>
            )}
            <ReviewRow
              label="Reference"
              onChange={() => onEdit(TransferStep.Amount)}
              changeLabel="Change reference"
              disabled={submitting}
            >
              {review.command.reference ?? <span className="text-muted">None</span>}
            </ReviewRow>
            <ReviewRow label="Available after">
              <Money minor={source.availableMinor - Number(review.command.amount)} />{' '}
              <span className="text-sm text-muted">in {source.name}</span>
            </ReviewRow>
          </ul>
          {review.command.destination.kind === TransferDestinationKind.Recipient &&
            review.command.destination.recipientNameSource === RecipientNameSource.Manual && (
              <p className="flex gap-1.5 text-sm text-warn">
                <IconWarning size={16} className="mt-0.5 flex-none" />
                You entered the recipient's name. If it doesn't match the name registered at the
                bank, the transfer will fail and your money will not move.
              </p>
            )}
          <p className="text-sm text-muted">
            The amount is reserved as soon as you confirm and sent right away. There is no
            scheduling.
          </p>
          <div className={ui.actions}>
            {error && (
              <span className="text-sm text-bad" role="alert">
                {error}
              </span>
            )}
            {submitting && (
              <span className="inline-flex items-center gap-1.5 text-sm text-action">
                <IconSpinner size={15} />
                {submission.attempt === SubmissionAttempt.Initial
                  ? 'Submitting…'
                  : 'Still trying to reach the bank. Please keep this page open.'}
              </span>
            )}
            <button
              type="button"
              className={ui.btnConfirm}
              disabled={submitting}
              onClick={() => void onConfirm()}
            >
              {submitting ? 'Submitting…' : 'Confirm transfer'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

function ReviewRow({
  label,
  children,
  onChange,
  changeLabel,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onChange?: () => void;
  changeLabel?: string;
  disabled?: boolean;
}) {
  return (
    <li>
      <span className={styles.reviewKey}>{label}</span>
      <span>{children}</span>
      <span className={styles.reviewChange}>
        {onChange && (
          <button
            type="button"
            className={ui.linkBtn}
            onClick={onChange}
            aria-label={changeLabel}
            disabled={disabled}
          >
            Change
          </button>
        )}
      </span>
    </li>
  );
}
