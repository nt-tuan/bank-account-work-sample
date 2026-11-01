import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';

export const accountsOptions = () =>
  queryOptions({ queryKey: qk.accounts.all, queryFn: ({ signal }) => api.accounts(signal) });
export const accountDetailOptions = (id: string) =>
  queryOptions({
    queryKey: qk.accounts.detail(id),
    queryFn: ({ signal }) => api.account(id, signal),
  });
export const banksOptions = () =>
  queryOptions({
    queryKey: qk.banks,
    queryFn: ({ signal }) => api.banks(signal),
    staleTime: Infinity,
  });

export const useAccounts = () => useQuery(accountsOptions());
export const useAccount = (id: string) => useQuery(accountDetailOptions(id));
export const useBanks = () => useQuery(banksOptions());
