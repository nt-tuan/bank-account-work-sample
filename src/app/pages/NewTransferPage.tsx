import { TransferSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { ErrorState } from '@/shared/ui/primitives.tsx';
import { TransferWizard } from '@/features/transfers/wizard/TransferWizard.tsx';
import { useTransferEntryController } from '@/features/transfers/wizard/useTransferEntryController.ts';

export function NewTransferPage() {
  const { pending, input, retry } = useTransferEntryController();
  if (pending) return <TransferSkeleton />;
  if (!input) return <ErrorState message="We couldn't load your accounts." onRetry={retry} />;
  return <TransferWizard {...input} />;
}
