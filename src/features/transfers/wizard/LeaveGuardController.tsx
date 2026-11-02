import { useFormContext, useFormState } from 'react-hook-form';
import { LeaveTransferDialog } from './LeaveTransferDialog.tsx';
import { useTransferLeaveGuard } from './useTransferLeaveGuard.ts';
import type { RefObject } from 'react';
import { SubmissionPhase, type Submission, type TransferValues } from './types.ts';

export function LeaveGuardController({
  hasNavigated,
  orderCreated,
  submission,
}: {
  hasNavigated: boolean;
  orderCreated: RefObject<boolean>;
  submission: Submission;
}) {
  const { control } = useFormContext<TransferValues>();
  const { isDirty } = useFormState({ control });
  const guard = useTransferLeaveGuard(isDirty || hasNavigated, orderCreated);
  return <LeaveTransferDialog {...guard} uncertain={submission.phase !== SubmissionPhase.Idle} />;
}
