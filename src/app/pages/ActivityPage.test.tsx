import { TransferStatus } from '@domain/domain/enums.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { currentJstMonth, formatMonth } from '@/shared/format/format.ts';
import { account, activityList, entry } from '@/test/banking-fixtures.ts';
import type { AccountSummary, ActivityList } from '@domain/schemas/api.ts';
import { monthsEndingAt } from '@domain/time.ts';
import { ActivityPage } from './ActivityPage.tsx';

vi.mock('@/shared/api/endpoints.ts', () => ({ api: { accounts: vi.fn(), activity: vi.fn() } }));

const clients: QueryClient[] = [];
function renderActivity(path = '/activity') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const router = createMemoryRouter([{ path: '/activity', Component: ActivityPage }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(api.accounts).mockReset().mockResolvedValue([account]);
  vi.mocked(api.activity).mockReset().mockResolvedValue(activityList);
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
});

describe('Activity functional blocks', () => {
  it('cancels an uncommitted search when clearing filters', async () => {
    const { router } = renderActivity('/activity?status=posted');
    await screen.findByRole('table');
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sakura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(vi.mocked(api.activity).mock.calls.every(([params]) => !params.q)).toBe(true);
  });

  it('cancels pending search on Back and Forward even when the applied query is unchanged', async () => {
    const { router } = renderActivity('/activity?status=posted');
    await screen.findByRole('table');
    await act(() => router.navigate('/activity?status=pending'));
    vi.useFakeTimers();
    for (const delta of [-1, 1]) {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'uncommitted' } });
      await act(() => router.navigate(delta));
      await act(() => vi.advanceTimersByTimeAsync(1_000));
      expect(screen.getByRole('searchbox')).toHaveValue('');
      expect(router.state.location.search).not.toContain('q=');
    }
    expect(router.state.location.search).toBe('?status=pending');
  });

  it('includes every filter in pagination and month link destinations', async () => {
    vi.mocked(api.activity).mockResolvedValue({ ...activityList, total: 41 });
    renderActivity('/activity?account=everyday&month=2026-10&q=coffee&status=posted&page=2');
    await screen.findByRole('table');
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '/activity?account=everyday&month=2026-10&q=coffee&status=posted&page=3',
    );
    const month = monthsEndingAt(currentJstMonth(), 6)[4]!;
    expect(screen.getByRole('link', { name: formatMonth(month) })).toHaveAttribute(
      'href',
      `/activity?account=everyday&month=${month}&q=coffee&status=posted`,
    );
  });

  it('loads results while accounts are pending and resolves account chips independently', async () => {
    const accounts = deferred<AccountSummary[]>();
    vi.mocked(api.accounts).mockReturnValueOnce(accounts.promise);
    renderActivity('/activity?account=everyday');
    expect(await screen.findByRole('table', { name: 'Account activity' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Remove filter Account: Selected account' }),
    ).toBeInTheDocument();
    await act(async () => accounts.resolve([account]));
    expect(
      await screen.findByRole('button', { name: 'Remove filter Account: Everyday' }),
    ).toBeInTheDocument();
    expect(api.activity).toHaveBeenCalledTimes(1);
  });

  it('maps URL filters to the query and resets pagination when a filter changes', async () => {
    vi.mocked(api.activity).mockResolvedValue({ ...activityList, total: 21 });
    const { router } = renderActivity(
      '/activity?account=everyday&month=2026-10&q=coffee&dir=debit&status=posted&transferStatus=completed&cat=dining&sort=asc&page=2',
    );
    await screen.findByRole('table');
    expect(api.activity).toHaveBeenLastCalledWith(
      {
        accountId: 'everyday',
        month: '2026-10',
        q: 'coffee',
        direction: 'debit',
        status: 'posted',
        transferStatus: 'completed',
        category: 'dining',
        sort: 'asc',
        page: 2,
        pageSize: 20,
      },
      expect.any(AbortSignal),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter Category: Dining' }));
    await waitFor(() =>
      expect(api.activity).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: undefined, page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    expect(router.state.location.search).not.toMatch(/cat=|page=/);
    expect(router.state.location.search).toContain('account=everyday');
  });

  it('retains previous results during pagination and failed refresh, then retries', async () => {
    vi.mocked(api.activity).mockResolvedValueOnce({ ...activityList, total: 21 });
    const { client, router } = renderActivity('/activity?account=everyday');
    await screen.findByRole('table');
    const next = deferred<ActivityList>();
    vi.mocked(api.activity).mockReturnValueOnce(next.promise);
    await userEvent.click(screen.getByRole('link', { name: 'Next page' }));
    expect(router.state.location.search).toBe('?account=everyday&page=2');
    expect(screen.getByRole('table')).toHaveTextContent('Coffee shop');
    expect(screen.getByRole('heading', { name: /Updating/ })).toBeInTheDocument();
    const pageTwo = {
      ...activityList,
      items: [{ ...entry, id: 'tea', description: 'Tea shop', runningBalanceMinor: 4500 }],
      page: 2,
      total: 21,
      runningBalance: true,
    };
    await act(async () => next.resolve(pageTwo));
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('Tea shop'));
    vi.mocked(api.activity).mockRejectedValueOnce(new Error('Unavailable'));
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.activity.all });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't update. Showing previous results.",
    );
    expect(screen.getByRole('table')).toHaveTextContent('Tea shop');
    vi.mocked(api.activity).mockResolvedValueOnce(pageTwo);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    const table = within(screen.getByRole('table'));
    expect(table.getByRole('columnheader', { name: 'Balance' })).toBeInTheDocument();
    expect(table.queryByRole('columnheader', { name: 'Account' })).not.toBeInTheDocument();
    expect(table.getByText('¥4,500')).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
  });

  it('validates range drafts locally, applies dates, and returns to months', async () => {
    vi.mocked(api.activity).mockResolvedValue({ ...activityList, total: 21 });
    const user = userEvent.setup();
    const { router } = renderActivity('/activity?month=2026-10&page=2');
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Custom range…' }));
    await user.type(screen.getByLabelText('From'), '2026-10-15');
    await user.type(screen.getByLabelText('To'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(screen.getByText('“To” must be on or after “From”.')).toBeInTheDocument();
    expect(api.activity).toHaveBeenCalledTimes(1);
    expect(router.state.location.search).toBe('?month=2026-10&page=2');
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('To'), '2026-10-31');
    await user.click(screen.getByRole('button', { name: 'Apply range' }));
    await waitFor(() =>
      expect(api.activity).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-10-15', to: '2026-10-31', page: 1 }),
        expect.any(AbortSignal),
      ),
    );
    expect(router.state.location.search).toBe('?from=2026-10-15&to=2026-10-31');
    expect(vi.mocked(api.activity).mock.lastCall![0]).not.toHaveProperty('month');
    await user.click(screen.getByRole('button', { name: 'Back to months' }));
    expect(screen.getByRole('navigation', { name: 'Month' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    await waitFor(() =>
      expect(api.activity).toHaveBeenLastCalledWith(
        expect.objectContaining({ month: currentJstMonth() }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('clears filters and closes the range form from an empty result', async () => {
    vi.mocked(api.activity).mockResolvedValue({ ...activityList, items: [], total: 0 });
    const { router } = renderActivity(
      '/activity?account=everyday&from=2026-10-01&to=2026-10-31&q=missing&sort=asc&page=2',
    );
    await screen.findByText('No matching results');
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'clear filters' }));
    expect(router.state.location.search).toBe('');
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Month' })).toBeInTheDocument();
    expect(
      await screen.findByText(`No activity in ${formatMonth(currentJstMonth())}`),
    ).toBeInTheDocument();
  });

  it('preserves other filters when choosing a month and restores them with browser back', async () => {
    vi.mocked(api.activity).mockResolvedValue({ ...activityList, total: 21 });
    const { router } = renderActivity('/activity?account=everyday&cat=dining&page=2');
    await screen.findByRole('table');
    const previousMonth = monthsEndingAt(currentJstMonth(), 6)[4]!;
    await userEvent.click(screen.getByRole('link', { name: formatMonth(previousMonth) }));
    expect(router.state.location.search).toBe(
      `?account=everyday&month=${previousMonth}&cat=dining`,
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe('?account=everyday&cat=dining&page=2');
    expect(
      screen.getByRole('button', { name: 'Remove filter Category: Dining' }),
    ).toBeInTheDocument();
  });

  it('retries an initial results error independently from accounts', async () => {
    vi.mocked(api.activity).mockRejectedValueOnce(new Error('Unavailable'));
    renderActivity();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your activity.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
    expect(api.activity).toHaveBeenCalledTimes(2);
  });

  it('restores applied date inputs and panel visibility with Back and Forward', async () => {
    const { router } = renderActivity('/activity?from=2026-08-01&to=2026-08-31');
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('From'));
    await user.type(screen.getByLabelText('From'), '2026-09-01');
    await user.clear(screen.getByLabelText('To'));
    await user.type(screen.getByLabelText('To'), '2026-09-30');
    await user.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(router.state.location.search).toContain('from=2026-09-01');
    await act(() => router.navigate(-1));
    expect(screen.getByLabelText('From')).toHaveValue('2026-08-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-08-31');
    await act(() => router.navigate(1));
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
    await user.click(screen.getByRole('button', { name: 'Back to months' }));
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    await act(() => router.navigate(-1));
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-09-30');
  });

  it('replaces an out-of-range URL page with the last page while preserving filters', async () => {
    vi.mocked(api.activity).mockImplementation(async (params) => ({
      ...activityList,
      page: Number(params.page),
      total: 53,
      items: Number(params.page) > 3 ? [] : activityList.items,
    }));
    const { router } = renderActivity('/activity?account=everyday&month=2026-08&page=100');
    expect(await screen.findByText('41–53 of 53 entries')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?account=everyday&month=2026-08&page=3');
    expect(screen.getByRole('table')).toHaveTextContent('Coffee shop');
    expect(screen.queryByText(/1981/)).not.toBeInTheDocument();
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('recovers pagination when a shared refresh removes the last processing row', async () => {
    vi.useFakeTimers();
    vi.mocked(api.activity)
      .mockResolvedValueOnce({
        ...activityList,
        page: 2,
        total: 21,
        items: [{ ...entry, transferId: 'TRF-1', transferStatus: TransferStatus.Processing }],
      })
      .mockImplementation(async (params) => ({
        ...activityList,
        page: Number(params.page),
        total: 20,
        items: Number(params.page) === 1 ? activityList.items : [],
      }));
    const { router, client } = renderActivity('/activity?transferStatus=processing&page=2');
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.activity.all });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(router.state.location.search).toBe('?transferStatus=processing');
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByRole('table')).toHaveTextContent('Coffee shop');
    expect(screen.queryByText(/21–20/)).not.toBeInTheDocument();
  });

  it('reflects shared cache refreshes without polling processing transfers itself', async () => {
    vi.useFakeTimers();
    vi.mocked(api.activity)
      .mockResolvedValueOnce({
        ...activityList,
        items: [{ ...entry, transferId: 'TRF-1', transferStatus: TransferStatus.Processing }],
      })
      .mockResolvedValue({
        ...activityList,
        items: [{ ...entry, transferId: 'TRF-1', transferStatus: TransferStatus.Completed }],
      });
    const { client } = renderActivity();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole('table')).toHaveTextContent('Processing');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      expect(api.activity).toHaveBeenCalledTimes(1);
      await client.invalidateQueries({ queryKey: qk.activity.all });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole('table')).toHaveTextContent('Completed');
    const calls = vi.mocked(api.activity).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(api.activity).toHaveBeenCalledTimes(calls);
  });
});
