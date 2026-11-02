import { TransferStep, type WizardInput } from './types.ts';
import { useRef } from 'react';
import { AmountStep } from './AmountStep.tsx';
import { DestinationStep } from './DestinationStep.tsx';
import { LeaveGuardController } from './LeaveGuardController.tsx';
import { ReviewStep } from './ReviewStep.tsx';
import { SourceStep } from './SourceStep.tsx';
import { SourceSummary } from './SourceSummary.tsx';
import { TransferFormRoot } from './TransferFormRoot.tsx';
import { TransferProgress } from './TransferProgress.tsx';
import { useTransferWizard } from './useTransferWizard.ts';
import { useTransferSubmission } from './useTransferSubmission.ts';

export function TransferWizard(input: WizardInput) {
  return (
    <TransferFormRoot accounts={input.accounts}>
      <TransferFlow {...input} />
    </TransferFormRoot>
  );
}

const useOrderTracker = () => {
  const orderCreated = useRef(false);
  const onCreated = () => {
    orderCreated.current = true;
  };
  return { orderCreated, onCreated };
};

function TransferFlow({ accounts, banks, limitMax }: WizardInput) {
  const {
    step,
    stepError,
    review,
    hasNavigated,
    goTo,
    openReview,
    handleSubmissionResult,
    clearStepError,
  } = useTransferWizard();
  const { orderCreated, onCreated } = useOrderTracker();
  const { submission, confirm } = useTransferSubmission(onCreated);
  const confirmReview = async () => {
    if (!review) return;
    clearStepError();
    handleSubmissionResult(await confirm(review));
  };

  return (
    <>
      <TransferProgress step={step} />
      {step !== TransferStep.Source && step !== TransferStep.Review && (
        <SourceSummary accounts={accounts} onChange={() => goTo(TransferStep.Source)} />
      )}
      {step === TransferStep.Source && (
        <SourceStep
          accounts={accounts}
          error={stepError}
          onAttempt={clearStepError}
          onNext={() => goTo(TransferStep.Destination)}
        />
      )}
      {step === TransferStep.Destination && (
        <DestinationStep
          accounts={accounts}
          banks={banks}
          error={stepError}
          onAttempt={clearStepError}
          onNext={() => goTo(TransferStep.Amount)}
        />
      )}
      {step === TransferStep.Amount && (
        <AmountStep
          accounts={accounts}
          banks={banks}
          limitMax={limitMax}
          error={stepError}
          onAttempt={clearStepError}
          onNext={openReview}
          onEdit={goTo}
        />
      )}
      {step === TransferStep.Review && (
        <ReviewStep
          accounts={accounts}
          banks={banks}
          review={review}
          error={stepError}
          source={accounts.find((account) => account.id === review?.command.sourceAccountId)}
          submission={submission}
          onConfirm={confirmReview}
          onEdit={goTo}
        />
      )}
      <LeaveGuardController
        hasNavigated={hasNavigated}
        orderCreated={orderCreated}
        submission={submission}
      />
    </>
  );
}
