import { queryOptions } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import type { InsightsFilters } from './filters.ts';

export const insightsOptions = ({ month, account: accountId }: InsightsFilters) =>
  queryOptions({
    queryKey: qk.insights({ month, accountId }),
    queryFn: ({ signal }) => api.insights(month, accountId, signal),
  });
