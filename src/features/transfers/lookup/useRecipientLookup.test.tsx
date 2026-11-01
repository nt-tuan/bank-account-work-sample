import { ApiFailureKind, UnknownFailureCause, ApiError } from '@/shared/api/http.ts';
import { ErrorCode } from '@domain/errors.ts';
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { qk } from '@/shared/api/keys.ts';
import { useRecipientLookup } from './useRecipientLookup.ts';

const lookup = vi.fn();
vi.mock('@/shared/api/endpoints.ts', () => ({
  api: { lookup: (...args: unknown[]) => lookup(...args) },
}));

function renderLookup() {
  // Deliberately hostile global defaults: lookup overrides automatic retries/refetches.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 3, staleTime: 0, refetchOnMount: 'always' } },
  });
  const hook = renderHook(({ bankId, number }) => useRecipientLookup(bankId, number), {
    initialProps: { bankId: 'bank_a', number: '1234567' },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client };
}

describe('recipient lookup cache', () => {
  beforeEach(() => {
    lookup.mockReset();
  });

  it('only fetches on an explicit trigger, reuses cached results, and forces manual retries', async () => {
    lookup.mockResolvedValue({ outcome: 'unavailable' });
    const { result, client } = renderLookup();
    expect(lookup).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.run();
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.run();
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.recipientLookup('bank_a', '1234567') });
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.run(true);
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      failure: { kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Timeout },
      status: 'unavailable',
    },
    {
      failure: { kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Network },
      status: 'unavailable',
    },
    {
      failure: {
        kind: ApiFailureKind.Rejected,
        status: 429,
        code: ErrorCode.LOOKUP_RATE_LIMITED,
        message: 'Limited',
      },
      status: 'rate_limited',
    },
  ] as const)('maps $failure to $status without automatic retry', async ({ failure, status }) => {
    lookup.mockRejectedValue(new ApiError(failure));
    const { result } = renderLookup();
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.state).toMatchObject({ status });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('cancels an old input and ignores its late result after the new input resolves', async () => {
    let complete!: (value: unknown) => void;
    lookup
      .mockReturnValueOnce(
        new Promise((resolve) => {
          complete = resolve;
        }),
      )
      .mockResolvedValueOnce({ outcome: 'found', holderName: 'CURRENT NAME' });
    const { result, rerender } = renderLookup();
    let oldRun!: ReturnType<typeof result.current.run>;
    act(() => {
      oldRun = result.current.run();
    });
    const signal = lookup.mock.calls[0]![1] as AbortSignal;
    rerender({ bankId: 'bank_b', number: '7654321' });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.state).toMatchObject({
      status: 'found',
      holderName: 'CURRENT NAME',
      key: 'bank_b:7654321',
    });
    await act(async () => {
      complete({ outcome: 'found', holderName: 'STALE NAME' });
      await oldRun;
    });
    expect(result.current.state).toMatchObject({ status: 'found', holderName: 'CURRENT NAME' });
  });

  it('cancels on unmount and resolves an abandoned run as idle', async () => {
    let complete!: (value: unknown) => void;
    lookup.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const { result, unmount } = renderLookup();
    let pending!: ReturnType<typeof result.current.run>;
    act(() => {
      pending = result.current.run();
    });
    const signal = lookup.mock.calls[0]![1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    complete({ outcome: 'found', holderName: 'STALE NAME' });
    expect(await pending).toEqual({ status: 'idle' });
  });
});
