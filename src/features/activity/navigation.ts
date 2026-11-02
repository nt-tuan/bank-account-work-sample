import { updateQueryParams } from '@/shared/routing/query-params.ts';
import {
  activityModel,
  serializeActivityFilters,
  type ActivityFilters,
  type FilterPatch,
} from './filters.ts';

/** Ordinary navigation and opening a new tab use exactly the same filter update rules. */
export function activityListHref(filters: ActivityFilters, patch: FilterPatch): string {
  const query = updateQueryParams(
    activityModel,
    serializeActivityFilters(filters),
    patch,
  ).toString();
  return `/activity${query ? `?${query}` : ''}`;
}

/** Only return to the Activity list, preserving its filters and pagination. */
export function activityBackTo(state: unknown): string {
  if (
    state &&
    typeof state === 'object' &&
    'backTo' in state &&
    typeof state.backTo === 'string' &&
    /^\/activity(?:\?|$)/.test(state.backTo)
  ) {
    return state.backTo;
  }
  return '/activity';
}
