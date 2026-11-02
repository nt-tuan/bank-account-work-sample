import { ReviewPolicy, TransferStep, type TransferValues } from './types.ts';
import { SubmitResultKind, type SubmitResult } from '../submission/submit.ts';
import { useAnnounce } from '@/shared/ui/live-region.tsx';
import { useState } from 'react';
import { mapTransferRejection } from './transfer-rejection.ts';
import { useTransferDraft } from './useTransferDraft.ts';
import { useFormContext } from 'react-hook-form';

/** Owns navigation and applies definitive results without subscribing to submission or guard state. */
export function useTransferWizard() {
  const form = useFormContext<TransferValues>();
  const { review, prepareReview, invalidateReview, renewReviewKey } = useTransferDraft();
  const [initialStep] = useState(() =>
    form.getValues('sourceAccountId') ? TransferStep.Destination : TransferStep.Source,
  );
  const [step, setStep] = useState<TransferStep>(initialStep);
  const [stepError, setStepError] = useState<string | null>(null);
  const announce = useAnnounce();

  const clearStepError = () => setStepError(null);
  const goTo = (target: TransferStep) => {
    clearStepError();
    setStep(target);
  };
  const openReview = () => {
    prepareReview();
    goTo(TransferStep.Review);
  };
  const handleSubmissionResult = (result: SubmitResult | undefined) => {
    if (result?.kind === SubmitResultKind.Created) {
      invalidateReview();
      return;
    }
    if (result?.kind !== SubmitResultKind.Rejected) return;
    const action = mapTransferRejection(result.failure);
    if (!action) return;
    if (action.reviewPolicy === ReviewPolicy.Invalidate) invalidateReview();
    else if (action.reviewPolicy === ReviewPolicy.Renew) renewReviewKey();
    for (const [field, message] of Object.entries(action.errors))
      form.setError(field as keyof TransferValues, { message });
    // Apply navigation and server errors together; goTo would clear these errors.
    setStep(action.step);
    setStepError(action.message);
    if (action.announcement) announce(action.announcement);
  };

  return {
    step,
    stepError,
    review,
    hasNavigated: step !== initialStep,
    goTo,
    openReview,
    handleSubmissionResult,
    clearStepError,
  };
}
