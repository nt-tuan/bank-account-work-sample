import { queryOptions } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { currentJstMonth } from '@/shared/format/format.ts';
import type { ActivityFilters } from './filters.ts';

export function activityListOptions(filters: ActivityFilters) {
  const params = {
    accountId: filters.account,
    ...(filters.from
      ? { from: filters.from, to: filters.to }
      : { month: filters.month ?? currentJstMonth() }),
    q: filters.q,
    direction: filters.dir,
    status: filters.status,
    transferStatus: filters.transferStatus,
    category: filters.cat,
    sort: filters.sort,
    page: filters.page,
    pageSize: 20,
  };
  return queryOptions({
    queryKey: qk.activity.list(params),
    queryFn: ({ signal }) => api.activity(params, signal),
  });
}

export function recentActivityOptions() {
  const params = { month: currentJstMonth(), pageSize: 5 };
  return queryOptions({
    queryKey: qk.activity.list(params),
    queryFn: ({ signal }) => api.activity(params, signal),
  });
}

export const activityDetailOptions = (id: string) =>
  queryOptions({
    queryKey: qk.activity.detail(id),
    queryFn: ({ signal }) => api.activityEntry(id, signal),
    staleTime: 0,
  });
