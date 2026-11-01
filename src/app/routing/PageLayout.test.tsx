import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider, useOutletContext } from 'react-router';
import { describe, expect, it } from 'vitest';
import { qk } from '@/shared/api/keys.ts';
import { PageLayout } from './PageLayout.tsx';
import { RouteError } from './RouteError.tsx';
import { protectedPages } from './routes.tsx';

function ParentContext() {
  return <Outlet context={{ marker: 'shell context' }} />;
}
function Content() {
  const context = useOutletContext<{ marker: string }>();
  return <button type="button">{context.marker}</button>;
}

function renderPages(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <ParentContext />,
        children: [
          {
            element: <PageLayout />,
            children: protectedPages.map(({ lazy: _lazy, ...route }) => ({
              ...route,
              element: <Content />,
            })),
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { client, router };
}

describe('route-owned page chrome', () => {
  it('updates dynamic metadata from cache, preserves focus and forwards shell context without fetching', async () => {
    const { client } = renderPages('/accounts/acc_everyday');
    const heading = screen.getByRole('heading', { level: 1, name: 'Account' });
    expect(heading).toHaveFocus();
    expect(document.title).toBe('Account · Demo Banking');
    const content = screen.getByRole('button', { name: 'shell context' });
    content.focus();
    act(() => {
      client.setQueryData(qk.accounts.detail('acc_everyday'), { name: 'Everyday' });
    });
    await waitFor(() => expect(document.title).toBe('Everyday · Demo Banking'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(heading).toHaveTextContent('Everyday');
    expect(content).toHaveFocus();
    expect(client.isFetching()).toBe(0);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/accounts');
  });

  it('resets dynamic metadata across detail params and focuses the next page heading', async () => {
    const { client, router } = renderPages('/accounts/acc_everyday');
    act(() => {
      client.setQueryData(qk.accounts.detail('acc_everyday'), { name: 'Everyday' });
    });
    await act(() => router.navigate('/accounts/acc_savings'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account');
    expect(document.title).toBe('Account · Demo Banking');
    await act(() => router.navigate('/transfers/new'));
    expect(screen.getByRole('heading', { name: 'New transfer' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('New transfer · Demo Banking');
  });

  it('keeps detail headers distinct from their document titles and restores not-found metadata', async () => {
    const { client, router } = renderPages('/activity/entry');
    act(() => {
      client.setQueryData(qk.activity.detail('entry'), { description: 'Coffee' });
    });
    await waitFor(() => expect(document.title).toBe('Coffee · Demo Banking'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Activity details');
    await act(() => router.navigate('/missing'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found');
    expect(document.title).toBe('Not found · Demo Banking');
  });

  it('preserves the Activity list filters and page in the detail Back link', async () => {
    const { router } = renderPages('/activity');
    const backTo = '/activity?account=everyday&cat=transfer&page=3';
    await act(() => router.navigate('/activity/ACT-1', { state: { backTo } }));
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', backTo);
  });

  it('renders error chrome with one heading and a fresh document title', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        loader: () => {
          throw new Error('Broken page');
        },
        element: <Content />,
        errorElement: <RouteError />,
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toHaveFocus();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(document.title).toBe('Something went wrong · Demo Banking');
  });
});
