import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TransferStatus } from '@domain/domain/enums.ts';
import type { AccountSummary, List, Transfer } from '@domain/schemas/api.ts';
import { qk } from '@/shared/api/keys.ts';
import { account, transfer } from '@/test/banking-fixtures.ts';
import { createTransferMonitor } from './monitor.ts';

const completed: Transfer = { ...transfer, status: TransferStatus.Completed };
const cleanups: (() => void)[] = [];
const list = (items: Transfer[] = [], page = 1, total = items.length): List<Transfer> => ({
  items,
  page,
  pageSize: 100,
  total,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function fixture(available = () => true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const listProcessing = vi.fn(async (_page: number, _signal: AbortSignal) => list());
  const readTransfer = vi.fn(async (_id: string, _signal: AbortSignal) => transfer);
  const monitor = createTransferMonitor({
    queryClient: client,
    listProcessing,
    readTransfer,
    available,
  });
  cleanups.push(() => {
    monitor.stop();
    client.clear();
  });
  return { client, listProcessing, readTransfer, monitor };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('updates an active balance-only query without any activity or transfer screen', async () => {
  const { client, monitor, readTransfer } = fixture();
  let settled = false;
  const accounts = vi.fn(async () => [
    { ...account, currentMinor: settled ? 4_000 : 5_000, heldMinor: settled ? 0 : 1_000 },
  ]);
  const balance = new QueryObserver(client, { queryKey: qk.accounts.all, queryFn: accounts });
  cleanups.push(balance.subscribe(() => {}));
  client.setQueryData(qk.accounts.detail(account.id), account);
  readTransfer.mockImplementation(async () => {
    settled = true;
    return completed;
  });
  monitor.start('customer');
  monitor.recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(1);
  expect(balance.getCurrentResult().data?.[0]?.currentMinor).toBe(4_000);
  expect(balance.getCurrentResult().data?.[0]?.heldMinor).toBe(0);
  expect(client.getQueryState(qk.accounts.detail(account.id))?.isInvalidated).toBe(true);
  expect(accounts.mock.calls.length).toBeGreaterThan(1);
});

it.each([TransferStatus.Completed, TransferStatus.Failed])(
  'handles a first poll that is already %s and stops tracking that ID',
  async (status) => {
    const { client, monitor, readTransfer } = fixture();
    readTransfer.mockResolvedValue({ ...transfer, status });
    monitor.start('customer');
    monitor.recordOrder(transfer);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.getQueryData<Transfer>(qk.transfers.detail(transfer.id))?.status).toBe(status);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    monitor.watch(transfer.id);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(readTransfer).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  },
);

it('discovers all pages after a new session and monitors multiple transfers', async () => {
  const { monitor, listProcessing, readTransfer } = fixture();
  listProcessing.mockImplementation(async (page) => ({
    ...list([{ ...transfer, id: `TRF-${page}` }], page, 2),
    pageSize: 1,
  }));
  readTransfer.mockImplementation(async (id) => ({ ...completed, id }));
  monitor.start('customer');
  await vi.advanceTimersByTimeAsync(1);
  expect(listProcessing.mock.calls.map(([page]) => page)).toEqual([1, 2]);
  expect(readTransfer.mock.calls.map(([id]) => id)).toEqual(['TRF-1', 'TRF-2']);
});

it('keeps one request per transfer in flight despite duplicate registration and Check again', async () => {
  const { monitor, readTransfer } = fixture();
  const result = deferred<Transfer>();
  readTransfer.mockReturnValue(result.promise);
  monitor.start('customer');
  monitor.recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(1);
  monitor.recordOrder(transfer);
  monitor.check(transfer);
  monitor.watch(transfer.id);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(readTransfer).toHaveBeenCalledTimes(1);
  result.resolve(completed);
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(readTransfer).toHaveBeenCalledTimes(1);
});

it('retries unknown read outcomes and continues at a slower cadence beyond two minutes', async () => {
  const { client, monitor, readTransfer } = fixture();
  const started = Date.now();
  readTransfer
    .mockRejectedValueOnce(new Error('network unavailable'))
    .mockImplementation(async () => (Date.now() - started >= 145_000 ? completed : transfer));
  monitor.start('customer');
  monitor.recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(130_000);
  expect(client.getQueryData<Transfer>(qk.transfers.detail(transfer.id))?.status).toBe(
    TransferStatus.Processing,
  );
  const calls = readTransfer.mock.calls.length;
  await vi.advanceTimersByTimeAsync(35_000);
  expect(readTransfer.mock.calls.length).toBeGreaterThan(calls);
  expect(client.getQueryData<Transfer>(qk.transfers.detail(transfer.id))?.status).toBe(
    TransferStatus.Completed,
  );
});

it('aborts a stopped session and ignores its late response after another customer signs in', async () => {
  const { client, monitor, readTransfer } = fixture();
  const result = deferred<Transfer>();
  readTransfer.mockReturnValue(result.promise);
  monitor.start('customer-a');
  monitor.recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(1);
  const signal = readTransfer.mock.calls[0]![1];
  monitor.stop();
  client.clear();
  monitor.start('customer-b');
  result.resolve(completed);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  expect(client.getQueryData(qk.transfers.detail(transfer.id))).toBeUndefined();
});

it('pauses while unavailable and immediately reconciles on resume', async () => {
  let available = false;
  const { monitor, readTransfer, listProcessing } = fixture(() => available);
  monitor.start('customer');
  monitor.recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(listProcessing).not.toHaveBeenCalled();
  expect(readTransfer).not.toHaveBeenCalled();
  available = true;
  monitor.wake();
  await vi.advanceTimersByTimeAsync(1);
  expect(readTransfer).toHaveBeenCalledTimes(1);
  available = false;
  monitor.pause();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(readTransfer).toHaveBeenCalledTimes(1);
  available = true;
  readTransfer.mockResolvedValue(completed);
  monitor.wake();
  await vi.advanceTimersByTimeAsync(1);
  expect(readTransfer).toHaveBeenCalledTimes(2);
});

it('does not resurrect a completed transfer from a stale discovery response', async () => {
  const { client, monitor, listProcessing, readTransfer } = fixture();
  const discovery = deferred<List<Transfer>>();
  listProcessing.mockReturnValue(discovery.promise);
  readTransfer.mockResolvedValue(completed);
  monitor.start('customer');
  monitor.recordOrder(transfer);
  await vi.advanceTimersByTimeAsync(1);
  discovery.resolve(list([transfer]));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(readTransfer).toHaveBeenCalledTimes(1);
  expect(client.getQueryData<Transfer>(qk.transfers.detail(transfer.id))?.status).toBe(
    TransferStatus.Completed,
  );
});

it('replaces an in-flight initial balance read that captured state before settlement', async () => {
  const { client, monitor, readTransfer } = fixture();
  const stale = deferred<AccountSummary[]>();
  const accounts = vi.fn(async (): Promise<AccountSummary[]> => [
    { ...account, currentMinor: 4_000, heldMinor: 0 },
  ]);
  accounts.mockReturnValueOnce(stale.promise);
  const balance = new QueryObserver(client, { queryKey: qk.accounts.all, queryFn: accounts });
  cleanups.push(balance.subscribe(() => {}));
  readTransfer.mockResolvedValue(completed);
  monitor.start('customer');
  monitor.watch(transfer.id);
  await vi.advanceTimersByTimeAsync(1);
  expect(balance.getCurrentResult().data?.[0]?.currentMinor).toBe(4_000);
  stale.resolve([account]);
  await vi.advanceTimersByTimeAsync(1);
  expect(balance.getCurrentResult().data?.[0]?.currentMinor).toBe(4_000);
  expect(accounts).toHaveBeenCalledTimes(2);
});
