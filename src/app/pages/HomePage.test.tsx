import {
  AccountType,
  AccountUsabilityStatus,
  ActivityKind,
  ActivityStatus,
  Category,
  Direction,
  TransferStatus,
} from '@domain/domain/enums.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import type { AccountSummary, ActivityList } from '@domain/schemas/api.ts';
import { HomePage } from './HomePage.tsx';
import { transferEntry } from '@/test/banking-fixtures.ts';

vi.mock('@/shared/api/endpoints.ts', () => ({ api: { accounts: vi.fn(), activity: vi.fn() } }));

const account: AccountSummary = {
  id: 'everyday',
  name: 'Everyday',
  type: AccountType.Checking,
  maskedNumber: '•••2481',
  bank: { id: 'host', code: '0999', name: 'Demo Banking' },
  status: AccountUsabilityStatus.Active,
  restrictionReason: null,
  canSend: true,
  canReceive: true,
  currentMinor: 5_000,
  heldMinor: 1_000,
  availableMinor: 4_000,
  openedAt: '2020-01-01T00:00:00Z',
};
const recent: ActivityList = {
  items: [
    {
      id: 'coffee',
      sequence: 1,
      account: { id: account.id, name: account.name, maskedNumber: account.maskedNumber },
      kind: ActivityKind.Purchase,
      direction: Direction.Debit,
      amountMinor: 500,
      status: ActivityStatus.Posted,
      description: 'Coffee shop',
      counterparty: 'Coffee shop',
      category: Category.Dining,
      occurredAt: '2026-11-01T00:00:00Z',
      postedAt: '2026-11-01T00:00:00Z',
      effectiveAt: '2026-11-01T00:00:00Z',
      cancelledAt: null,
      runningBalanceMinor: null,
      transferReference: null,
      transferId: null,
      transferStatus: null,
      transferDelayedSince: null,
    },
  ],
  page: 1,
  pageSize: 5,
  total: 1,
  runningBalance: false,
};

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...rendered };
}

describe('Home functional blocks', () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.mocked(api.accounts).mockReset().mockResolvedValue([account]);
    vi.mocked(api.activity).mockReset().mockResolvedValue(recent);
  });

  it('starts both resources immediately and shows activity while accounts are pending', async () => {
    let completeAccounts!: (accounts: AccountSummary[]) => void;
    vi.mocked(api.accounts).mockReturnValueOnce(
      new Promise((resolve) => {
        completeAccounts = resolve;
      }),
    );
    renderHome();
    expect(await screen.findByRole('link', { name: /Coffee shop/ })).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
    expect(api.activity).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Total available' })).not.toBeInTheDocument();
    completeAccounts([account]);
    expect(await screen.findByRole('region', { name: 'Total available' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your accounts' })).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
  });

  it('shows one accounts error and retries that resource without blocking or refetching activity', async () => {
    vi.mocked(api.accounts).mockRejectedValueOnce(new Error('Accounts unavailable'));
    const user = userEvent.setup();
    renderHome();
    expect(await screen.findByText("We couldn't load your accounts.")).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(await screen.findByRole('link', { name: /Coffee shop/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Your accounts' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Total available' })).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(2);
    expect(api.activity).toHaveBeenCalledTimes(1);
  });

  it('keeps accounts available when activity fails and retries only activity', async () => {
    vi.mocked(api.activity).mockRejectedValueOnce(new Error('Activity unavailable'));
    const user = userEvent.setup();
    renderHome();
    expect(await screen.findByText("We couldn't load recent activity.")).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Your accounts' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /Coffee shop/ })).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
    expect(api.activity).toHaveBeenCalledTimes(2);
  });

  it('preserves account data and its timestamp after a failed refresh, then updates both account views', async () => {
    const user = userEvent.setup();
    const { client } = renderHome();
    const balance = within(await screen.findByRole('region', { name: 'Total available' }));
    const accounts = within(screen.getByRole('region', { name: 'Your accounts' }));
    const updatedAt = client.getQueryState(qk.accounts.all)!.dataUpdatedAt;
    vi.mocked(api.accounts).mockRejectedValueOnce(new Error('Refresh unavailable'));
    await user.click(balance.getByRole('button', { name: 'Refresh' }));
    expect(
      await balance.findByText(/Couldn't refresh\. Showing the last update/),
    ).toBeInTheDocument();
    expect(balance.getByText('¥4,000')).toBeInTheDocument();
    expect(accounts.getByText('¥4,000')).toBeInTheDocument();
    expect(client.getQueryState(qk.accounts.all)!.dataUpdatedAt).toBe(updatedAt);
    await waitFor(() => expect(balance.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    vi.mocked(api.accounts).mockResolvedValueOnce([
      { ...account, availableMinor: 9_000, currentMinor: 10_000 },
    ]);
    await user.click(balance.getByRole('button', { name: 'Refresh' }));
    expect(await balance.findByText('¥9,000')).toBeInTheDocument();
    expect(accounts.getByText('¥9,000')).toBeInTheDocument();
    expect(client.getQueryState(qk.accounts.all)!.dataUpdatedAt).toBeGreaterThan(updatedAt);
    expect(api.activity).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(balance.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  });

  it('reflects shared cache refreshes without polling processing transfers itself', async () => {
    vi.useFakeTimers();
    vi.mocked(api.activity)
      .mockResolvedValueOnce({ ...recent, items: [transferEntry] })
      .mockResolvedValue({
        ...recent,
        items: [
          {
            ...transferEntry,
            status: ActivityStatus.Posted,
            transferStatus: TransferStatus.Completed,
          },
        ],
      });
    vi.mocked(api.accounts)
      .mockResolvedValueOnce([account])
      .mockResolvedValue([
        { ...account, currentMinor: 4_000, heldMinor: 0, availableMinor: 4_000 },
      ]);
    const { client, unmount } = renderHome();
    await act(() => vi.advanceTimersByTimeAsync(10));
    const activity = within(screen.getByRole('region', { name: 'Recent activity' }));
    expect(activity.getByText('Pending')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(api.activity).toHaveBeenCalledTimes(1);
    await act(async () => {
      await client.invalidateQueries({ queryKey: qk.activity.all });
      await client.invalidateQueries({ queryKey: qk.accounts.all });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(activity.getByText('Posted')).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(2);
    const balance = within(screen.getByRole('region', { name: 'Total available' }));
    expect(balance.getByText('¥0')).toBeInTheDocument();
    const calls = vi.mocked(api.activity).mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(api.activity).toHaveBeenCalledTimes(calls);
    unmount();
    client.clear();
  });

  it('refreshes recent activity together with balances on explicit Refresh', async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByRole('link', { name: /Coffee shop/ });
    const balance = within(await screen.findByRole('region', { name: 'Total available' }));
    vi.mocked(api.activity).mockResolvedValue({ ...recent, items: [], total: 0 });
    await user.click(balance.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('No activity this month yet.')).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(2);
    expect(api.activity).toHaveBeenCalledTimes(2);
  });

  it('shares amount visibility across both independent blocks', async () => {
    const user = userEvent.setup();
    const { container } = renderHome();
    const balance = within(await screen.findByRole('region', { name: 'Total available' }));
    const accounts = within(screen.getByRole('region', { name: 'Your accounts' }));
    const activity = within(await screen.findByRole('region', { name: 'Recent activity' }));
    await activity.findByRole('link', { name: /Coffee shop/ });
    await user.click(balance.getByRole('button', { name: 'Hide amounts' }));
    expect(balance.getAllByText('Amount hidden')).not.toHaveLength(0);
    expect(accounts.getByText('Amount hidden')).toBeInTheDocument();
    expect(activity.getByText('Amount hidden')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/¥\s?\d/);
    await user.click(balance.getByRole('button', { name: 'Show amounts' }));
    expect(balance.getByText('¥4,000')).toBeInTheDocument();
    expect(accounts.getByText('¥4,000')).toBeInTheDocument();
    expect(activity.queryByText('Amount hidden')).not.toBeInTheDocument();
  });
});
