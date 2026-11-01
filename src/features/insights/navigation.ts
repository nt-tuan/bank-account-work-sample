import { type Category, ActivityStatus } from '@domain/domain/enums.ts';
import type { InsightsFilters } from './filters.ts';

export function insightsActivityHref({
  month,
  account,
  cat,
}: InsightsFilters & { cat?: Category }) {
  const params = new URLSearchParams({ status: ActivityStatus.Posted, month });
  if (cat) params.set('cat', cat);
  if (account) params.set('account', account);
  return `/activity?${params.toString()}`;
}
