import { ActivityStatus, TransferStatus } from '@domain/domain/enums.ts';
import type { Session } from '@domain/schemas/api.ts';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { transfer, transferEntry } from '@/test/banking-fixtures.ts';
import { installTransferMonitoring } from '@/features/transfers/index.ts';
import { useActivityDetailController } from './useActivityDetailController.ts';

vi.mock('@/shared/api/endpoints.ts', () => ({
  api: { activityEntry: vi.fn(), transfer: vi.fn(), transfers: vi.fn() },
}));
const announce = vi.hoisted(() => vi.fn());
vi.mock('@/shared/ui/live-region.tsx', () => ({ useAnnounce: () => announce }));
const cleanups: (() => void)[] = [];
const completed = { ...transfer, status: TransferStatus.Completed };
const completedEntry = {
  ...transferEntry,
  status: ActivityStatus.Posted,
  transferStatus: TransferStatus.Completed,
  transfer: { ...transferEntry.transfer!, status: TransferStatus.Completed, details: completed },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.transfers).mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function renderController() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const dispose = installTransferMonitoring(client);
  client.setQueryData<Session>(qk.session, {
    authenticated: true,
    customer: { id: 'customer', displayName: 'Customer' },
    csrfToken: 'csrf',
    expiresAt: null,
    transferLimit: { minMinor: 1, maxMinor: 1_000_000 },
    demoControls: false,
  });
  client.setQueryData(qk.accounts.all, []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/activity/ACT-1']}>
        <Routes>
          <Route path="/activity/:activityId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = renderHook(useActivityDetailController, { wrapper });
  cleanups.push(() => {
    rendered.unmount();
    dispose();
    client.clear();
  });
  return { ...rendered, client };
}

it('reads shared status updates while its UI clock renders, without owning polling', async () => {
  let draws = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => 0.6 + (++draws % 100) * 0.003);
  const started = Date.now();
  vi.mocked(api.transfer).mockImplementation(async () =>
    Date.now() - started < 16_000 ? transfer : completed,
  );
  vi.mocked(api.activityEntry).mockImplementation(async () =>
    Date.now() - started < 16_000 ? transferEntry : completedEntry,
  );
  const { result } = renderController();
  for (let second = 0; second < 30; second++) await act(() => vi.advanceTimersByTimeAsync(1_000));
  expect(result.current.e?.transferStatus).toBe(TransferStatus.Completed);
  expect(api.activityEntry).toHaveBeenCalledTimes(2);
  expect(api.activityEntry).toHaveBeenCalledWith('ACT-1', expect.any(AbortSignal));
  expect(vi.mocked(api.transfer).mock.calls.length).toBeLessThan(20);
});

it('continues slow background tracking; Check again requests an immediate check and announces completion', async () => {
  vi.mocked(api.transfer).mockResolvedValue(transfer);
  vi.mocked(api.activityEntry).mockResolvedValue(transferEntry);
  const { result, client } = renderController();
  await act(() => vi.advanceTimersByTimeAsync(150_000));
  expect(result.current.slowTracking).toBe(true);
  expect(api.activityEntry).toHaveBeenCalledTimes(1);
  vi.mocked(api.transfer).mockResolvedValue(completed);
  vi.mocked(api.activityEntry).mockResolvedValue(completedEntry);
  await act(async () => {
    result.current.checkAgain();
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(result.current.slowTracking).toBe(false);
  expect(result.current.e?.status).toBe(ActivityStatus.Posted);
  expect(announce).toHaveBeenCalledWith('Transfer completed.');
  expect(client.getQueryState(qk.accounts.all)?.isInvalidated).toBe(true);
  const calls = vi.mocked(api.transfer).mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.transfer).toHaveBeenCalledTimes(calls);
});
