import { SubmissionPhase, type Review, type Submission } from './types.ts';
import { SubmissionAttempt, SubmitResultKind } from '../submission/submit.ts';
import { submitTransferOrder } from '../commands.ts';
import { useAnnounce } from '@/shared/ui/live-region.tsx';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

export function useTransferSubmission(onCreated: () => void) {
  const [submission, setSubmission] = useState<Submission>({ phase: SubmissionPhase.Idle });
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  useEffect(() => () => abortRef.current?.abort(), []);

  const confirm = async (review: Review) => {
    // A ref closes the gap before React has rendered the disabled button.
    if (abortRef.current && !abortRef.current.signal.aborted) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await submitTransferOrder(queryClient, review.command, review.key, {
        signal: ctrl.signal,
        onAttempt: (attempt) => {
          setSubmission({ phase: SubmissionPhase.Submitting, attempt });
          announce(
            attempt === SubmissionAttempt.Initial
              ? 'Submitting transfer…'
              : 'Still trying to reach the bank…',
          );
        },
      });
      if (ctrl.signal.aborted) return;
      if (result.kind === SubmitResultKind.Created) {
        onCreated();
        announce('Transfer order received. Processing.');
        await navigate(
          result.transfer.sourceActivityId
            ? `/activity/${result.transfer.sourceActivityId}`
            : '/activity?cat=transfer',
          {
            replace: true,
            state: { justCreated: true, backTo: '/activity?cat=transfer' },
          },
        );
      } else if (result.kind === SubmitResultKind.Unknown) {
        setSubmission({ phase: SubmissionPhase.Unknown });
        announce("We couldn't confirm your transfer.");
      } else setSubmission({ phase: SubmissionPhase.Idle });
      return result;
    } catch {
      if (!ctrl.signal.aborted) {
        setSubmission({ phase: SubmissionPhase.Unknown });
        announce("We couldn't confirm your transfer.");
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };
  return { submission, confirm };
}
