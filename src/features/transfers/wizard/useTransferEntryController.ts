import { useAccounts, useBanks } from '@/features/accounts/index.ts';
import { useSession } from '@/features/auth/index.ts';

export function useTransferEntryController() {
  const accounts = useAccounts();
  const banks = useBanks();
  const session = useSession();
  return {
    pending: accounts.isPending || banks.isPending || session.isPending,
    input:
      accounts.data && banks.data && session.data
        ? {
            accounts: accounts.data,
            banks: banks.data,
            limitMax: session.data.transferLimit.maxMinor,
          }
        : null,
    retry: () => {
      void accounts.refetch();
      void banks.refetch();
      void session.refetch();
    },
  };
}
