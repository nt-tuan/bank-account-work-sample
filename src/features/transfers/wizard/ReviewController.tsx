import { ReviewStep } from './ReviewStep.tsx';
import { useTransferSubmission } from './useTransferSubmission.ts';
import type { SubmitResult } from '../submission/submit.ts';
import type { Review, TransferStep, WizardInput } from './types.ts';

type ReviewControllerProps = Pick<WizardInput, 'accounts' | 'banks'> & {
  review: Review | null;
  error: string | null;
  onAttempt: () => void;
  onResult: (result: SubmitResult | undefined) => void;
  onEdit: (step: TransferStep) => void;
  onCreated: () => void;
};

/** Submission updates stay inside Review; definitive results return to the flow. */
export function ReviewController({
  accounts,
  banks,
  review,
  error,
  onAttempt,
  onResult,
  onEdit,
  onCreated,
}: ReviewControllerProps) {
  const { submission, confirm: submit } = useTransferSubmission(onCreated);
  const confirm = async () => {
    if (!review) return;
    onAttempt();
    onResult(await submit(review));
  };
  const source = accounts.find((account) => account.id === review?.command.sourceAccountId);
  return (
    <ReviewStep
      accounts={accounts}
      banks={banks}
      source={source}
      review={review}
      submission={submission}
      error={error}
      onConfirm={confirm}
      onEdit={onEdit}
    />
  );
}
