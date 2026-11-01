import { SortOrder } from '@domain/domain/enums.ts';
import {
  UnknownParamsPolicy,
  defineQueryModel,
  parseQueryParams,
  serializeQueryParams,
  type QueryPatch,
  type SetQueryParams,
} from '@/shared/routing/query-params.ts';
import { z } from 'zod';
import {
  CATEGORIES,
  ACTIVITY_STATUSES,
  DIRECTIONS,
  TRANSFER_STATUSES,
} from '@domain/domain/constants.ts';
import { isIsoDate, isMonth } from '@domain/time.ts';
import { useQueryParams } from '@/shared/routing/useQueryParams.ts';

const activitySchema = z.object({
  account: z
    .string()
    .regex(/^[\w-]{1,64}$/)
    .optional(),
  month: z.string().refine(isMonth).optional(),
  from: z.string().refine(isIsoDate).optional(),
  to: z.string().refine(isIsoDate).optional(),
  q: z
    .string()
    .transform((value) => value.trim().slice(0, 200) || undefined)
    .optional(),
  dir: z.enum(DIRECTIONS).optional(),
  status: z.enum(ACTIVITY_STATUSES).optional(),
  transferStatus: z.enum(TRANSFER_STATUSES).optional(),
  cat: z.enum(CATEGORIES).optional(),
  sort: z.enum(SortOrder),
  page: z.coerce.number().int().min(1).max(10_000),
});

export type ActivityFilters = z.infer<typeof activitySchema>;
export type FilterPatch = QueryPatch<ActivityFilters>;
export type SetActivityFilters = SetQueryParams<ActivityFilters>;

export const activityModel = defineQueryModel({
  schema: activitySchema,
  defaults: () => ({ sort: SortOrder.Desc as const, page: 1 }),
  unknownParams: UnknownParamsPolicy.Drop,
  normalize(filters) {
    if (filters.from && filters.to && filters.from <= filters.to) delete filters.month;
    else {
      delete filters.from;
      delete filters.to;
    }
    return filters;
  },
  beforeWrite(next, { patch }) {
    // An explicit page wins; other updates return to page 1.
    return 'page' in patch ? next : { ...next, page: 1 };
  },
});

export function parseActivityFilters(params: URLSearchParams): ActivityFilters {
  return parseQueryParams(activityModel, params);
}

export function serializeActivityFilters(filters: ActivityFilters): URLSearchParams {
  return serializeQueryParams(activityModel, filters);
}

export function useActivityFilters() {
  return useQueryParams(activityModel);
}

/** True when anything narrows the result beyond the default month view. */
export function hasActiveFilters(f: ActivityFilters): boolean {
  return Boolean(
    f.account || f.q || f.dir || f.status || f.transferStatus || f.cat || f.from || f.month,
  );
}
