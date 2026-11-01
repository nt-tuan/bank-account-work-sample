import { ActionStatus } from '@/shared/ui/action-status.ts';
import { HoldKind } from '@domain/domain/enums.ts';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useAccount } from './queries.ts';

export function useAccountDetailController() {
  const { accountId = '' } = useParams();
  const account = useAccount(accountId);
  const [copied, setCopied] = useState<ActionStatus>(ActionStatus.Idle);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(ActionStatus.Ok);
    } catch {
      setCopied(ActionStatus.Failed);
    }
  };
  const a = account.data;
  const merchantHolds = a?.holds.filter((h) => h.kind === HoldKind.MerchantAuthorization) ?? [];
  const transferHolds = a?.holds.filter((h) => h.kind === HoldKind.Transfer) ?? [];
  const sum = (xs: { amountMinor: number }[]) => xs.reduce((s, h) => s + h.amountMinor, 0);
  return { account, copied, copy, a, merchantHolds, transferHolds, sum };
}
