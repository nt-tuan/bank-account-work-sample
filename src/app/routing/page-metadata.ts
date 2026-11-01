import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import type { Params } from 'react-router';

/** Content width selected by route metadata. */
export enum ContentWidth {
  Standard = 'standard',
  Narrow = 'narrow',
}

/** Shell presentation: standard pages, focused flows or authentication screens. */
export enum PageVariant {
  Standard = 'standard',
  Flow = 'flow',
  Auth = 'auth',
}

export type PageMetadata = {
  documentTitle: string;
  header: string;
  leftAction?: { type: 'back'; to: string; label?: string; resolveTo?: (state: unknown) => string };
  variant?: PageVariant;
  contentWidth?: ContentWidth;
  data?: {
    queryKey: (params: Params) => QueryKey;
    resolve: (data: unknown) => Partial<Pick<PageMetadata, 'documentTitle' | 'header'>>;
  };
};

export type PagePrefetchArgs = { queryClient: QueryClient; params: Params; url: URL };
export type PageHandle = {
  page: PageMetadata;
  Loading?: ComponentType;
  preload?: () => Promise<unknown>;
  prefetch?: (args: PagePrefetchArgs) => Promise<unknown>;
};

export const errorPages = {
  notFound: {
    documentTitle: 'Not found',
    header: 'Not found',
    leftAction: { type: 'back', to: '/' },
  },
  unexpected: {
    documentTitle: 'Something went wrong',
    header: 'Something went wrong',
    leftAction: { type: 'back', to: '/' },
  },
} satisfies Record<string, PageMetadata>;

/** Route metadata observes the feature's cache entry; it never starts a request. */
export function cachedPageData<T>(
  queryKey: (params: Params) => QueryKey,
  resolve: (data: T | undefined) => Partial<Pick<PageMetadata, 'documentTitle' | 'header'>>,
): NonNullable<PageMetadata['data']> {
  return { queryKey, resolve: (data) => resolve(data as T | undefined) };
}
