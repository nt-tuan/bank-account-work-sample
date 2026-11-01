import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { qk } from '@/shared/api/keys.ts';
import { PageLink, PageNavLink, PagePrefetchContext } from '@/shared/navigation/PageLink.tsx';
import { PageLayout } from './PageLayout.tsx';
import { InitialPageLoading } from './InitialPageLoading.tsx';
import { definePage, prefetchPageData, preloadPage, withPageLoaders } from './define-page.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const client = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 15_000, gcTime: Infinity } },
  });
const Loading = () => <div role="status">Target skeleton</div>;
const Content = () => <p>Target content</p>;

function renderRouter(
  pages: ReturnType<typeof definePage>[],
  queryClient = client(),
  initial = '/',
) {
  const router = createMemoryRouter(
    [
      {
        element: <PageLayout pages={pages} />,
        hydrateFallbackElement: <InitialPageLoading pages={pages} />,
        children: withPageLoaders(pages, queryClient),
      },
    ],
    { initialEntries: [initial] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('page loading and intent prefetch', () => {
  it('shows the destination skeleton during a slow chunk, preserves the old form, then focuses the committed heading', async () => {
    const chunk = deferred<{ Component: typeof Content }>();
    const start = definePage({
      id: 'start',
      index: true,
      page: { documentTitle: 'Start', header: 'Start' },
      Loading,
      load: async () => ({ Component: () => <input aria-label="Draft" defaultValue="keep me" /> }),
    });
    const target = definePage({
      id: 'target',
      path: 'target',
      page: { documentTitle: 'Target', header: 'Target' },
      Loading,
      load: () => chunk.promise,
    });
    const router = renderRouter([start, target]);
    const draft = await screen.findByRole('textbox', { name: 'Draft' });
    draft.focus();
    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate('/target');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Target skeleton');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(draft).toBeInTheDocument();
    expect(document.title).toBe('Target · Demo Banking');
    await act(async () => {
      chunk.resolve({ Component: Content });
      await navigation;
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Target content')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Target' })).toHaveFocus();
    router.dispose();
  });

  it('shows a skeleton on direct entry before the lazy module exists', async () => {
    const chunk = deferred<{ Component: typeof Content }>();
    const page = definePage({
      id: 'target',
      path: '/target',
      page: { documentTitle: 'Target', header: 'Target' },
      Loading,
      load: () => chunk.promise,
    });
    const router = renderRouter([page], client(), '/target');
    expect(screen.getByRole('status')).toHaveTextContent('Target skeleton');
    expect(screen.getByRole('heading', { name: 'Target' })).toBeVisible();
    await act(async () => {
      chunk.resolve({ Component: Content });
    });
    expect(await screen.findByText('Target content')).toBeVisible();
    router.dispose();
  });

  it('starts data before the chunk resolves and reuses the request and fresh cache', async () => {
    const chunk = deferred<{ Component: typeof Content }>();
    const response = deferred<string>();
    const fetchData = vi.fn(() => response.promise);
    const options = { queryKey: ['target'], queryFn: fetchData };
    const queryClient = client();
    queryClient.setQueryData(qk.session, { authenticated: true });
    const page = definePage({
      id: 'target',
      path: '/target',
      page: { documentTitle: 'Target', header: 'Target' },
      Loading,
      load: vi.fn(() => chunk.promise),
      prefetch: ({ queryClient: cache }) => cache.query(options),
    });
    const first = preloadPage([page], queryClient, '/target');
    const second = preloadPage([page], queryClient, '/target');
    expect(fetchData).toHaveBeenCalledTimes(1);
    const router = renderRouter([page], queryClient, '/target');
    await waitFor(() => expect(fetchData).toHaveBeenCalledTimes(1));
    await act(async () => {
      response.resolve('cached');
      chunk.resolve({ Component: Content });
      await Promise.all([first, second]);
    });
    await preloadPage([page], queryClient, '/target');
    expect(queryClient.getQueryData(['target'])).toBe('cached');
    expect(fetchData).toHaveBeenCalledTimes(1);
    router.dispose();
  });

  it('does not fetch protected data on intent without an authenticated session', async () => {
    const prefetch = vi.fn(async () => {});
    const load = vi.fn(async () => ({ Component: Content }));
    const page = definePage({
      id: 'target',
      path: '/target',
      page: { documentTitle: 'Target', header: 'Target' },
      Loading,
      load,
      prefetch,
    });
    const queryClient = client();
    await preloadPage([page], queryClient, '/target');
    queryClient.setQueryData(qk.session, { authenticated: false });
    await preloadPage([page], queryClient, '/target');
    expect(prefetch).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
    expect(queryClient.isFetching()).toBe(0);
  });

  it('silences speculative errors and retries a rejected code import on navigation', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('Chunk unavailable'))
      .mockResolvedValue({ Component: Content });
    const page = definePage({
      id: 'target',
      path: '/target',
      page: { documentTitle: 'Target', header: 'Target' },
      Loading,
      load,
      prefetch: async () => {
        throw new Error('API unavailable');
      },
    });
    const queryClient = client();
    queryClient.setQueryData(qk.session, { authenticated: true });
    await expect(preloadPage([page], queryClient, '/target')).resolves.toBeUndefined();
    const router = renderRouter([page], queryClient, '/target');
    expect(await screen.findByText('Target content')).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
    router.dispose();
  });

  it('does not start data after the session is cleared, and aborts existing prefetches on logout', async () => {
    const queryClient = client();
    queryClient.setQueryData(qk.session, { authenticated: true });
    const response = deferred<string>();
    let signal!: AbortSignal;
    const fetchData = vi.fn(({ signal: requestSignal }: { signal: AbortSignal }) => {
      signal = requestSignal;
      return response.promise;
    });
    const prefetch = vi.fn(({ queryClient: cache }: { queryClient: QueryClient }) =>
      cache.query({ queryKey: ['private'], queryFn: fetchData }),
    );
    const page = definePage({
      id: 'target',
      path: '/target',
      page: { documentTitle: 'Target', header: 'Target' },
      Loading,
      load: async () => ({ Component: Content }),
      prefetch,
    });
    const discovery = prefetchPageData(page.handle, {
      queryClient,
      params: {},
      url: new URL('http://localhost/target'),
    });
    queryClient.clear();
    await discovery;
    expect(prefetch).not.toHaveBeenCalled();

    queryClient.setQueryData(qk.session, { authenticated: true });
    const warm = preloadPage([page], queryClient, '/target');
    expect(signal.aborted).toBe(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    expect(signal.aborted).toBe(true);
    response.resolve('old customer data');
    await warm;
    expect(queryClient.getQueryData(['private'])).toBeUndefined();
  });

  it('never commits an earlier slow navigation after a newer navigation finishes', async () => {
    const slow = deferred<{ Component: typeof Content }>();
    const pages = [
      definePage({
        id: 'start',
        index: true,
        page: { documentTitle: 'Start', header: 'Start' },
        Loading,
        load: async () => ({ Component: Content }),
      }),
      definePage({
        id: 'slow',
        path: 'slow',
        page: { documentTitle: 'Slow', header: 'Slow' },
        Loading,
        load: () => slow.promise,
      }),
      definePage({
        id: 'fast',
        path: 'fast',
        page: { documentTitle: 'Fast', header: 'Fast' },
        Loading,
        load: async () => ({ Component: Content }),
      }),
    ];
    const router = renderRouter(pages);
    await screen.findByText('Target content');
    let earlier!: Promise<void>;
    await act(async () => {
      earlier = router.navigate('/slow');
    });
    await act(() => router.navigate('/fast'));
    await act(async () => {
      slow.resolve({ Component: Content });
      await earlier;
    });
    expect(router.state.location.pathname).toBe('/fast');
    expect(screen.getByRole('heading', { name: 'Fast' })).toHaveFocus();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    router.dispose();
  });

  it('prefetches on hover, focus and touch, preserves user handlers and skips external or document links', () => {
    const prefetch = vi.fn();
    const hover = vi.fn();
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <>
            <PageLink to="/target?month=2026-01" onMouseEnter={hover}>
              Target
            </PageLink>
            <PageNavLink to="/accounts">Accounts</PageNavLink>
            <PageLink to="/document" reloadDocument>
              Document
            </PageLink>
            <PageLink to="https://example.com">External</PageLink>
            <PageLink to="/cancelled" onFocus={(event) => event.preventDefault()}>
              Cancelled
            </PageLink>
          </>
        ),
      },
    ]);
    render(
      <PagePrefetchContext value={prefetch}>
        <RouterProvider router={router} />
      </PagePrefetchContext>,
    );
    const link = screen.getByRole('link', { name: 'Target' });
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    fireEvent.touchStart(link);
    fireEvent.focus(screen.getByRole('link', { name: 'Accounts' }));
    expect(hover).toHaveBeenCalledTimes(1);
    expect(prefetch.mock.calls).toEqual([
      ['/target?month=2026-01'],
      ['/target?month=2026-01'],
      ['/target?month=2026-01'],
      ['/accounts'],
    ]);
    fireEvent.focus(screen.getByRole('link', { name: 'Document' }));
    fireEvent.focus(screen.getByRole('link', { name: 'External' }));
    fireEvent.focus(screen.getByRole('link', { name: 'Cancelled' }));
    expect(prefetch).toHaveBeenCalledTimes(4);
    router.dispose();
  });
});
