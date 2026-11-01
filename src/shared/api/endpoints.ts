import { HttpMethod, request } from './http.ts';
import type { DemoScenarioId } from '@domain/domain/enums.ts';
import { z } from 'zod';
import {
  accountDetailSchema,
  accountSummarySchema,
  activityDetailSchema,
  activityListSchema,
  bankSchema,
  demoCatalogSchema,
  insightsSchema,
  lookupResultSchema,
  sessionSchema,
  transferSchema,
  type TransferCommand,
} from '@domain/schemas/api.ts';

/** Typed API functions: components use feature hooks, hooks use these. */
const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  session: (signal?: AbortSignal) =>
    request('/api/session', {
      schema: sessionSchema,
      skipAuthRedirect: true,
      ...(signal ? { signal } : {}),
    }),
  login: (body: { username: string; password: string }) =>
    request('/api/session/login', {
      method: HttpMethod.Post,
      body,
      schema: sessionSchema,
      skipAuthRedirect: true,
    }),
  logout: () => request('/api/session/logout', { method: HttpMethod.Post, skipAuthRedirect: true }),

  accounts: (signal?: AbortSignal) =>
    request('/api/accounts', {
      schema: z.object({ items: z.array(accountSummarySchema) }),
      ...(signal ? { signal } : {}),
    }).then((r) => r.items),
  account: (id: string, signal?: AbortSignal) =>
    request(`/api/accounts/${encodeURIComponent(id)}`, {
      schema: accountDetailSchema,
      ...(signal ? { signal } : {}),
    }),
  banks: (signal?: AbortSignal) =>
    request('/api/banks', {
      schema: z.object({ items: z.array(bankSchema) }),
      ...(signal ? { signal } : {}),
    }).then((r) => r.items),

  activity: (params: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    request(`/api/activity${qs(params)}`, {
      schema: activityListSchema,
      ...(signal ? { signal } : {}),
    }),
  activityEntry: (id: string, signal?: AbortSignal) =>
    request(`/api/activity/${encodeURIComponent(id)}`, {
      schema: activityDetailSchema,
      ...(signal ? { signal } : {}),
    }),

  transfers: (params: Record<string, string | number | undefined>, signal?: AbortSignal) =>
    request(`/api/transfers${qs(params)}`, {
      schema: z.object({
        items: z.array(transferSchema),
        page: z.number().int(),
        pageSize: z.number().int(),
        total: z.number().int(),
      }),
      ...(signal ? { signal } : {}),
    }),
  transfer: (id: string, signal?: AbortSignal) =>
    request(`/api/transfers/${encodeURIComponent(id)}`, {
      schema: transferSchema,
      ...(signal ? { signal } : {}),
    }),
  createTransfer: (command: TransferCommand, idempotencyKey: string, signal?: AbortSignal) =>
    request('/api/transfers', {
      method: HttpMethod.Post,
      body: command,
      schema: transferSchema,
      headers: { 'Idempotency-Key': idempotencyKey },
      timeoutMs: 10_000,
      ...(signal ? { signal } : {}),
    }),
  lookup: (body: { bankId: string; accountNumber: string }, signal?: AbortSignal) =>
    request('/api/recipients/lookup', {
      method: HttpMethod.Post,
      body,
      schema: lookupResultSchema,
      timeoutMs: 5_000,
      ...(signal ? { signal } : {}),
    }),

  insights: (month: string, accountId?: string, signal?: AbortSignal) =>
    request(`/api/insights${qs({ month, accountId })}`, {
      schema: insightsSchema,
      ...(signal ? { signal } : {}),
    }),

  demoCatalog: () => request('/api/demo/catalog', { schema: demoCatalogSchema }),
  demoScenario: (scenario: DemoScenarioId | null) =>
    request('/api/demo/scenario', {
      method: HttpMethod.Post,
      body: { scenario },
      schema: demoCatalogSchema,
    }),
  demoExpireSession: () => request('/api/demo/expire-session', { method: HttpMethod.Post }),
  demoReset: () =>
    request('/api/demo/reset', {
      method: HttpMethod.Post,
      body: { confirm: true },
      timeoutMs: 30_000,
    }),
};
