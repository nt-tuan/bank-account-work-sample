import { matchRoutes, type RouteObject } from 'react-router';
import type { ComponentType } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { sessionOptions } from '@/features/auth/session.ts';
import type { PageHandle, PageMetadata, PagePrefetchArgs } from './page-metadata.ts';

type Definition = {
  id: string;
  page: PageMetadata;
  Loading: ComponentType;
  load: () => Promise<{ Component: ComponentType }>;
  prefetch?: (args: PagePrefetchArgs) => Promise<unknown>;
} & ({ index: true; path?: never } | { path: string; index?: never });

/** Both navigation and intent use the same import promise. Rejections can be retried. */
export function definePage({
  page,
  Loading,
  load,
  prefetch,
  ...route
}: Definition): RouteObject & { handle: PageHandle } {
  let pending: ReturnType<typeof load> | undefined;
  const preload = () =>
    (pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
  return {
    ...route,
    lazy: preload,
    handle: { page, Loading, preload, ...(prefetch ? { prefetch } : {}) },
  };
}

export function matchPage(pages: RouteObject[], location: string | { pathname: string }) {
  return matchRoutes(pages, location)?.findLast(
    (match) => (match.route.handle as PageHandle | undefined)?.page,
  );
}

/** Navigation discovers the session; speculative prefetch only uses an already confirmed session. */
export async function prefetchPageData(handle: PageHandle, args: PagePrefetchArgs, intent = false) {
  if (!handle.prefetch) return;
  const options = sessionOptions();
  const session = intent
    ? args.queryClient.getQueryData(options.queryKey)
    : await args.queryClient.query(options);
  // A logout/reset may have cleared the session while discovery was in flight.
  if (session?.authenticated && args.queryClient.getQueryData(options.queryKey) === session)
    await handle.prefetch(args);
}

export async function preloadPage(pages: RouteObject[], queryClient: QueryClient, href: string) {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  const match = matchPage(pages, url.pathname);
  const handle = match?.route.handle as PageHandle | undefined;
  if (!handle || !match) return;
  // Intent errors stay in the cache; opening the page owns visible errors and retry.
  await Promise.allSettled([
    handle.preload?.(),
    prefetchPageData(handle, { queryClient, params: match.params, url }, true),
  ]);
}

/** Static loaders start requests while route.lazy is downloading, without delaying render. */
export function withPageLoaders(pages: RouteObject[], queryClient: QueryClient): RouteObject[] {
  return pages.map((route) => {
    const handle = route.handle as PageHandle;
    if (!handle.prefetch) return route;
    return {
      ...route,
      loader: ({ params, request }) => {
        void prefetchPageData(handle, { queryClient, params, url: new URL(request.url) }).catch(
          () => {},
        );
        return null;
      },
    };
  });
}
