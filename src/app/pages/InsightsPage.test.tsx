import { Category } from '@domain/domain/enums.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints.ts';
import { currentJstMonth, formatMonth } from '@/shared/format/format.ts';
import { account } from '@/test/banking-fixtures.ts';
import type { AccountSummary, Insights } from '@domain/schemas/api.ts';
import { monthsEndingAt } from '@domain/time.ts';
import { InsightsPage } from './InsightsPage.tsx';

vi.mock('@/shared/api/endpoints.ts', () => ({ api: { accounts: vi.fn(), insights: vi.fn() } }));

const month = currentJstMonth();
const previousMonth = monthsEndingAt(month, 2)[0]!;
const insights: Insights = {
  month,
  accountId: null,
  incomeMinor: 10_000,
  spendingMinor: 500,
  categories: [{ category: Category.Dining, amountMinor: 500 }],
  trend: monthsEndingAt(month, 6).map((month) => ({
    month,
    incomeMinor: 10_000,
    spendingMinor: 500,
  })),
};

const clients: QueryClient[] = [];
function renderInsights(path = '/insights') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  const router = createMemoryRouter([{ path: '/insights', Component: InsightsPage }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(screen.getByRole('option', { name: option }));
}

beforeEach(() => {
  vi.mocked(api.accounts).mockReset().mockResolvedValue([account]);
  vi.mocked(api.insights).mockReset().mockResolvedValue(insights);
});

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe('Insights functional blocks', () => {
  it('renders all insights while accounts are pending, toggles category views, and scopes activity links', async () => {
    vi.mocked(api.accounts).mockReturnValueOnce(new Promise<AccountSummary[]>(() => {}));
    renderInsights(`/insights?month=${month}&account=everyday`);
    const category = within(await screen.findByRole('region', { name: 'Spending by category' }));
    expect(screen.getByText(`Income · ${formatMonth(month)}`)).toBeInTheDocument();
    expect(screen.getByText(`Spending · ${formatMonth(month)}`)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Six-month trend' })).toBeInTheDocument();
    const categoryHref = `/activity?status=posted&month=${month}&cat=dining&account=everyday`;
    expect(category.getByRole('link', { name: /Dining/ })).toHaveAttribute('href', categoryHref);
    expect(
      screen.getByRole('link', { name: `View posted activity for ${formatMonth(previousMonth)}` }),
    ).toHaveAttribute('href', `/activity?status=posted&month=${previousMonth}&account=everyday`);
    await userEvent.click(category.getByRole('button', { name: 'Show as table' }));
    expect(category.getByRole('table')).toHaveTextContent('100.0%');
    expect(category.getByRole('link', { name: 'Dining' })).toHaveAttribute('href', categoryHref);
    await userEvent.click(category.getByRole('button', { name: 'Show as bars' }));
    expect(category.queryByRole('table')).not.toBeInTheDocument();
    expect(api.insights).toHaveBeenCalledTimes(1);
  });

  it('hides old amounts and drill-downs while new filters load, and restores browser history', async () => {
    const { router } = renderInsights(`/insights?month=${month}&source=test`);
    await screen.findByRole('region', { name: 'Spending by category' });
    let resolve!: (data: Insights) => void;
    vi.mocked(api.insights).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await choose('Month', formatMonth(previousMonth));
    expect(api.insights).toHaveBeenLastCalledWith(
      previousMonth,
      undefined,
      expect.any(AbortSignal),
    );
    expect(router.state.location.search).toBe(`?month=${previousMonth}&source=test`);
    expect(screen.queryByText('¥10,000')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Spending by category' })).not.toBeInTheDocument();
    expect(screen.queryByText(`Income · ${formatMonth(previousMonth)}`)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View activity/ })).not.toBeInTheDocument();
    await act(async () => resolve({ ...insights, month: previousMonth, incomeMinor: 20_000 }));
    expect(await screen.findByText('¥20,000')).toBeInTheDocument();
    await choose('Account', `${account.name} ${account.maskedNumber}`);
    await waitFor(() =>
      expect(api.insights).toHaveBeenLastCalledWith(
        previousMonth,
        account.id,
        expect.any(AbortSignal),
      ),
    );
    expect(router.state.location.search).toContain(`account=${account.id}`);
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe(`?month=${previousMonth}&source=test`);
    expect(screen.getByRole('combobox', { name: 'Account' })).toHaveTextContent('All accounts');
    expect(await screen.findByText('¥20,000')).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
  });

  it('falls back from invalid months and removes default month and account filters', async () => {
    const { router } = renderInsights(`/insights?month=invalid&account=${account.id}&source=test`);
    await screen.findByRole('region', { name: 'Spending by category' });
    expect(api.insights).toHaveBeenLastCalledWith(month, account.id, expect.any(AbortSignal));
    await choose('Month', formatMonth(previousMonth));
    await choose('Month', formatMonth(month));
    expect(new URLSearchParams(router.state.location.search).has('month')).toBe(false);
    await choose('Account', 'All accounts');
    expect(router.state.location.search).toBe('?source=test');
    await waitFor(() =>
      expect(api.insights).toHaveBeenLastCalledWith(month, undefined, expect.any(AbortSignal)),
    );
  });

  it('retries insights independently and renders the empty state after loading', async () => {
    vi.mocked(api.insights)
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ ...insights, incomeMinor: 0, spendingMinor: 0, categories: [] });
    renderInsights();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load insights.");
    expect(screen.getByRole('combobox', { name: 'Month' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      `No posted income or spending in ${formatMonth(month)}.`,
    );
    expect(screen.getByText('No spending this month.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Six-month trend' })).toBeInTheDocument();
    expect(api.accounts).toHaveBeenCalledTimes(1);
    expect(api.insights).toHaveBeenCalledTimes(2);
  });
});
