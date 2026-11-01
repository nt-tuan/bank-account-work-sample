import { LookupOutcome } from '@domain/domain/enums.ts';
import { LookupStatus, type LookupResult, type LookupState } from './types.ts';
import { ApiFailureKind, ApiError } from '@/shared/api/http.ts';
import { ErrorCode } from '@domain/errors.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';

export type { LookupResult, LookupState } from './types.ts';

const LOOKUP_STATUS: Record<
  LookupOutcome,
  LookupStatus.NotFound | LookupStatus.CannotReceive | LookupStatus.Unavailable
> = {
  [LookupOutcome.Found]: LookupStatus.Unavailable, // A found response without a holder name is unusable.
  [LookupOutcome.NotFound]: LookupStatus.NotFound,
  [LookupOutcome.CannotReceive]: LookupStatus.CannotReceive,
  [LookupOutcome.Unavailable]: LookupStatus.Unavailable,
};

function lookupOptions(bankId: string, accountNumber: string) {
  return {
    queryKey: qk.recipientLookup(bankId, accountNumber),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false as const,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<LookupResult> => {
      const key = `${bankId}:${accountNumber}`;
      try {
        const result = await api.lookup({ bankId, accountNumber }, signal);
        return result.outcome === LookupOutcome.Found && result.holderName
          ? { status: LookupStatus.Found, holderName: result.holderName, key }
          : { status: LOOKUP_STATUS[result.outcome], key };
      } catch (error) {
        if (signal.aborted) throw error;
        if (
          error instanceof ApiError &&
          error.failure.kind === ApiFailureKind.Rejected &&
          error.failure.code === ErrorCode.LOOKUP_RATE_LIMITED
        ) {
          return { status: LookupStatus.RateLimited, key };
        }
        return { status: LookupStatus.Unavailable, key };
      }
    },
  };
}

/** Cache observations never trigger a request or write form values. Only run resolves an explicit lookup. */
export function useRecipientLookup(bankId: string, accountNumber: string) {
  const client = useQueryClient();
  const key = `${bankId}:${accountNumber}`;
  const query = useQuery({
    ...lookupOptions(bankId, accountNumber),
    enabled: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const [local, setLocal] = useState<{ key: string; value: LookupState } | null>(null);
  const requestId = useRef(0);

  const reset = useCallback(() => {
    requestId.current += 1;
    void client.cancelQueries({ queryKey: qk.recipientLookup(bankId, accountNumber), exact: true });
    setLocal({ key: `${bankId}:${accountNumber}`, value: { status: LookupStatus.Idle } });
  }, [client, bankId, accountNumber]);

  const run = useCallback(
    async (force = false): Promise<LookupState> => {
      const id = ++requestId.current;
      const currentKey = `${bankId}:${accountNumber}`;
      setLocal({ key: currentKey, value: { status: LookupStatus.Loading } });
      let result: LookupResult;
      try {
        result = await client.fetchQuery({
          ...lookupOptions(bankId, accountNumber),
          ...(force ? { staleTime: 0 } : {}),
        });
      } catch {
        return { status: LookupStatus.Idle }; // cancellation, including unmount
      }
      if (id !== requestId.current) return { status: LookupStatus.Idle };
      setLocal({ key: currentKey, value: result });
      return result;
    },
    [client, bankId, accountNumber],
  );

  useEffect(
    () => () => {
      requestId.current += 1;
      void client.cancelQueries({
        queryKey: qk.recipientLookup(bankId, accountNumber),
        exact: true,
      });
    },
    [client, bankId, accountNumber],
  );

  const state: LookupState =
    local?.key === key ? local.value : (query.data ?? { status: LookupStatus.Idle });
  return { state, run, reset };
}
