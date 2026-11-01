import {
  UnknownParamsPolicy,
  defineQueryModel,
  parseQueryParams,
  type SetQueryParams,
} from '@/shared/routing/query-params.ts';
import { z } from 'zod';
import { currentJstMonth } from '@/shared/format/format.ts';
import { useQueryParams } from '@/shared/routing/useQueryParams.ts';
import { isMonth } from '@domain/time.ts';

const insightsSchema = z.object({
  month: z.string().refine(isMonth),
  account: z.string().min(1).optional(),
});

export type InsightsFilters = z.infer<typeof insightsSchema>;
export type SetInsightsFilters = SetQueryParams<InsightsFilters>;

export const insightsModel = defineQueryModel({
  schema: insightsSchema,
  defaults: () => ({ month: currentJstMonth() }),
  unknownParams: UnknownParamsPolicy.Preserve,
});

export function parseInsightsFilters(params: URLSearchParams): InsightsFilters {
  return parseQueryParams(insightsModel, params);
}

export function useInsightsFilters() {
  return useQueryParams(insightsModel);
}
