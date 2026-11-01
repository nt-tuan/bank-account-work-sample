import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Session } from '@domain/schemas/api.ts';
import { TransferDestinationKind, TransferStatus } from '@domain/domain/enums.ts';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { transfer, transferEntry } from '@/test/banking-fixtures.ts';
import { getTransferMonitor, installTransferMonitoring } from './monitor-runtime.ts';
import { submitTransferOrder } from './commands.ts';

vi.mock('@/shared/api/endpoints.ts', () => ({
  api: { transfer: vi.fn(), transfers: vi.fn(), createTransfer: vi.fn() },
}));
const session: Session = {
  authenticated: true,
  customer: { id: 'customer', displayName: 'Customer' },
  csrfToken: 'csrf',
  expiresAt: null,
  transferLimit: { minMinor: 1, maxMinor: 1_000_000 },
  demoControls: false,
};
const cleanups: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.transfers).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
  vi.mocked(api.transfer).mockResolvedValue(transfer);
  vi.mocked(api.createTransfer).mockResolvedValue(transfer);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
function fixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const dispose = installTransferMonitoring(client);
  cleanups.push(() => {
    dispose();
    client.clear();
  });
  return client;
}

it('discovers on authentication, keeps one monitor per QueryClient, and stops on cache clear', async () => {
  const client = fixture();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.transfers).not.toHaveBeenCalled();
  client.setQueryData(qk.session, session);
  await vi.advanceTimersByTimeAsync(1);
  expect(api.transfers).toHaveBeenCalledWith(
    { status: TransferStatus.Processing, page: 1, pageSize: 100 },
    expect.any(AbortSignal),
  );
  expect(getTransferMonitor(client)).toBe(getTransferMonitor(client));
  client.setQueryData(qk.activity.detail(transferEntry.id), transferEntry);
  await vi.advanceTimersByTimeAsync(1);
  expect(api.transfer).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(api.transfer).mock.calls[0]![1]!;
  client.clear();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(signal.aborted).toBe(true);
  expect(api.transfer).toHaveBeenCalledTimes(1);
});

it('registers a committed order before its command returns, without any mounted screen', async () => {
  const client = fixture();
  client.setQueryData(qk.session, session);
  const record = vi.spyOn(getTransferMonitor(client), 'recordOrder');
  const signal = new AbortController().signal;
  const result = await submitTransferOrder(
    client,
    {
      sourceAccountId: 'everyday',
      destination: { kind: TransferDestinationKind.Own, accountId: 'savings' },
      amount: '1000',
    },
    'key',
    { signal },
  );
  expect(result.kind).toBe('created');
  expect(record).toHaveBeenCalledWith(transfer);
  expect(client.getQueryData(qk.transfers.detail(transfer.id))).toEqual(transfer);
  vi.mocked(api.transfer).mockResolvedValue({ ...transfer, status: TransferStatus.Completed });
  await vi.advanceTimersByTimeAsync(1);
  expect(client.getQueryData(qk.transfers.detail(transfer.id))).toMatchObject({
    status: TransferStatus.Completed,
  });
});

it('reconciles known transfers and rediscovers pending orders on reconnect', async () => {
  const client = fixture();
  client.setQueryData(qk.session, session);
  getTransferMonitor(client).recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(1);
  const reads = vi.mocked(api.transfer).mock.calls.length;
  vi.mocked(api.transfer).mockResolvedValue({ ...transfer, status: TransferStatus.Completed });
  window.dispatchEvent(new Event('online'));
  await vi.advanceTimersByTimeAsync(1);
  expect(api.transfer).toHaveBeenCalledTimes(reads + 1);
  expect(api.transfers).toHaveBeenCalledTimes(2);
});

it('does not register a late creation response in a replacement session', async () => {
  const client = fixture();
  client.setQueryData(qk.session, session);
  let resolve!: (value: typeof transfer) => void;
  vi.mocked(api.createTransfer).mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  const record = vi.spyOn(getTransferMonitor(client), 'recordOrder');
  const submission = submitTransferOrder(
    client,
    {
      sourceAccountId: 'everyday',
      destination: { kind: TransferDestinationKind.Own, accountId: 'savings' },
      amount: '1000',
    },
    'key',
    { signal: new AbortController().signal },
  );
  client.clear();
  client.setQueryData(qk.session, { ...session, csrfToken: 'new-session-token' });
  resolve(transfer);
  await submission;
  expect(record).not.toHaveBeenCalled();
  expect(client.getQueryData(qk.transfers.detail(transfer.id))).toBeUndefined();
});
