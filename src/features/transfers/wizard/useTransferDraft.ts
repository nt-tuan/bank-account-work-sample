import type { Review, TransferValues } from './types.ts';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { buildTransferCommand } from './transfer-draft.ts';

/** Review snapshots survive step unmounts; field subscriptions live in the steps. */
export function useTransferDraft() {
  const form = useFormContext<TransferValues>();
  const [review, setReview] = useState<Review | null>(null);
  const { watch, getValues } = form;

  useEffect(() => {
    let previous = JSON.stringify(getValues());
    const subscription = watch((values) => {
      const current = JSON.stringify(values);
      if (current !== previous && review) setReview(null);
      previous = current;
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues, review]);

  const prepareReview = () => {
    const command = buildTransferCommand(getValues());
    const hash = JSON.stringify(command);
    // UUID generation must stay outside React's state updater.
    const snapshot = review?.hash === hash ? review : { command, hash, key: crypto.randomUUID() };
    setReview(snapshot);
  };
  const renewReviewKey = () => {
    if (review) setReview({ ...review, key: crypto.randomUUID() });
  };

  return { review, prepareReview, invalidateReview: () => setReview(null), renewReviewKey };
}
