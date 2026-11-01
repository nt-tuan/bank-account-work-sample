import { TransferDestinationKind } from '@domain/domain/enums.ts';
import { useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useLocation, useSearchParams } from 'react-router';
import type { TransferPrefill, TransferValues, WizardInput } from './types.ts';

/** Keeps the form provider outside flow, submission and leave-guard updates. */
export function TransferFormRoot({
  accounts,
  children,
}: Pick<WizardInput, 'accounts'> & { children: ReactNode }) {
  const location = useLocation();
  const [params] = useSearchParams();
  const [defaults] = useState<TransferValues>(() => {
    const prefill = ((location.state ?? {}) as { prefill?: TransferPrefill }).prefill ?? {};
    const from = params.get('from');
    return {
      sourceAccountId:
        prefill.sourceAccountId ??
        (from && accounts.some((a) => a.id === from && a.canSend) ? from : ''),
      kind: prefill.kind ?? TransferDestinationKind.Recipient,
      destAccountId: prefill.destAccountId ?? '',
      bankId: prefill.bankId ?? '',
      accountNumber: '',
      recipientName: '',
      recipientNameSource: null,
      amount: prefill.amount ?? '',
      reference: prefill.reference ?? '',
    };
  });
  const form = useForm<TransferValues>({ defaultValues: defaults });
  return <FormProvider {...form}>{children}</FormProvider>;
}
