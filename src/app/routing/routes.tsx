import { ContentWidth, PageVariant, cachedPageData, type PageHandle } from './page-metadata.ts';
import { Navigate, type RouteObject } from 'react-router';
import { qk } from '@/shared/api/keys.ts';
import { activityBackTo } from '@/features/activity/navigation.ts';
import type { AccountDetail, ActivityDetail } from '@domain/schemas/api.ts';
import type { QueryClient } from '@tanstack/react-query';
import {
  accountsOptions,
  accountDetailOptions,
  banksOptions,
} from '@/features/accounts/queries.ts';
import {
  activityListOptions,
  activityDetailOptions,
  recentActivityOptions,
} from '@/features/activity/queries.ts';
import { parseActivityFilters } from '@/features/activity/filters.ts';
import { insightsOptions } from '@/features/insights/queries.ts';
import { parseInsightsFilters } from '@/features/insights/filters.ts';
import {
  HomeSkeleton,
  AccountsSkeleton,
  AccountDetailSkeleton,
  ActivitySkeleton,
  ActivityDetailSkeleton,
  TransferSkeleton,
  InsightsSkeleton,
  MenuSkeleton,
  NotFoundSkeleton,
  LoginSkeleton,
} from '@/shared/ui/page-skeletons.tsx';
import { definePage, withPageLoaders } from './define-page.ts';
import { InitialPageLoading } from './InitialPageLoading.tsx';
import { ProtectedLayout } from '../ProtectedLayout.tsx';
import { PageLayout } from './PageLayout.tsx';
import { RouteError } from './RouteError.tsx';

type PageRoute = RouteObject & { handle: PageHandle };

/** Single registry for page modules and their route chrome. Feature code owns page content. */
export const protectedPages: PageRoute[] = [
  definePage({
    Loading: HomeSkeleton,
    prefetch: ({ queryClient }) =>
      Promise.all([
        queryClient.query(accountsOptions()),
        queryClient.query(recentActivityOptions()),
      ]),
    id: 'home',
    index: true,
    load: () => import('../pages/HomePage.tsx').then((m) => ({ Component: m.HomePage })),
    page: { documentTitle: 'Home', header: 'Home' },
  }),
  definePage({
    Loading: AccountsSkeleton,
    prefetch: ({ queryClient }) => queryClient.query(accountsOptions()),
    id: 'accounts',
    path: 'accounts',
    load: () => import('../pages/AccountsPage.tsx').then((m) => ({ Component: m.AccountsPage })),
    page: { documentTitle: 'Account information', header: 'Account information' },
  }),
  definePage({
    Loading: AccountDetailSkeleton,
    prefetch: ({ queryClient, params }) =>
      queryClient.query(accountDetailOptions(params.accountId ?? '')),
    id: 'account-detail',
    path: 'accounts/:accountId',
    load: () =>
      import('../pages/AccountDetailPage.tsx').then((m) => ({ Component: m.AccountDetailPage })),
    page: {
      documentTitle: 'Account',
      header: 'Account',
      leftAction: { type: 'back', to: '/accounts' },
      data: cachedPageData<AccountDetail>(
        (p) => qk.accounts.detail(p.accountId ?? ''),
        (data) => (data ? { documentTitle: data.name, header: data.name } : {}),
      ),
    },
  }),
  definePage({
    Loading: ActivitySkeleton,
    prefetch: ({ queryClient, url }) =>
      Promise.all([
        queryClient.query(accountsOptions()),
        queryClient.query(activityListOptions(parseActivityFilters(url.searchParams))),
      ]),
    id: 'activity',
    path: 'activity',
    load: () => import('../pages/ActivityPage.tsx').then((m) => ({ Component: m.ActivityPage })),
    page: { documentTitle: 'Account activity', header: 'Account activity' },
  }),
  definePage({
    Loading: ActivityDetailSkeleton,
    prefetch: ({ queryClient, params }) =>
      queryClient.query(activityDetailOptions(params.activityId ?? '')),
    id: 'activity-detail',
    path: 'activity/:activityId',
    load: () =>
      import('../pages/ActivityDetailPage.tsx').then((m) => ({ Component: m.ActivityDetailPage })),
    page: {
      documentTitle: 'Activity',
      header: 'Activity details',
      leftAction: { type: 'back', to: '/activity', resolveTo: activityBackTo },
      contentWidth: ContentWidth.Narrow,
      data: cachedPageData<ActivityDetail>(
        (p) => qk.activity.detail(p.activityId ?? ''),
        (data) => (data ? { documentTitle: data.description } : {}),
      ),
    },
  }),
  {
    id: 'legacy-transfers',
    path: 'transfers',
    element: <Navigate to="/activity?cat=transfer" replace />,
    handle: {
      Loading: ActivitySkeleton,
      page: { documentTitle: 'Account activity', header: 'Account activity' },
    },
  },
  definePage({
    Loading: TransferSkeleton,
    prefetch: ({ queryClient }) =>
      Promise.all([queryClient.query(accountsOptions()), queryClient.query(banksOptions())]),
    id: 'transfer-new',
    path: 'transfers/new',
    load: () =>
      import('../pages/NewTransferPage.tsx').then((m) => ({ Component: m.NewTransferPage })),
    page: {
      documentTitle: 'New transfer',
      header: 'New transfer',
      leftAction: { type: 'back', to: '/' },
      variant: PageVariant.Flow,
      contentWidth: ContentWidth.Narrow,
    },
  }),
  definePage({
    Loading: ActivityDetailSkeleton,
    id: 'legacy-transfer-detail',
    path: 'transfers/:transferId',
    load: () =>
      import('@/features/transfers/LegacyTransferRedirect.tsx').then((m) => ({
        Component: m.LegacyTransferRedirect,
      })),
    page: {
      documentTitle: 'Activity',
      header: 'Activity details',
      contentWidth: ContentWidth.Narrow,
    },
  }),
  definePage({
    Loading: InsightsSkeleton,
    prefetch: ({ queryClient, url }) =>
      Promise.all([
        queryClient.query(accountsOptions()),
        queryClient.query(insightsOptions(parseInsightsFilters(url.searchParams))),
      ]),
    id: 'insights',
    path: 'insights',
    load: () => import('../pages/InsightsPage.tsx').then((m) => ({ Component: m.InsightsPage })),
    page: { documentTitle: 'Insights', header: 'Insights' },
  }),
  definePage({
    Loading: MenuSkeleton,
    id: 'menu',
    path: 'menu',
    load: () => import('../pages/MenuPage.tsx').then((m) => ({ Component: m.MenuPage })),
    page: { documentTitle: 'Menu', header: 'Menu' },
  }),
  definePage({
    Loading: NotFoundSkeleton,
    id: 'not-found',
    path: '*',
    load: () => import('../pages/NotFoundPage.tsx').then((m) => ({ Component: m.NotFoundPage })),
    page: { documentTitle: 'Not found', header: 'Not found' },
  }),
];

export const loginPage = definePage({
  id: 'login',
  path: '/login',
  Loading: LoginSkeleton,
  load: () => import('../pages/LoginPage.tsx').then((m) => ({ Component: m.LoginPage })),
  page: { documentTitle: 'Sign in', header: 'Sign in', variant: PageVariant.Auth },
});

export const pages: RouteObject[] = [loginPage, ...protectedPages];

export function createRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    {
      hydrateFallbackElement: <InitialPageLoading pages={pages} />,
      errorElement: <RouteError />,
      children: [
        {
          element: <PageLayout pages={pages} />,
          errorElement: <RouteError />,
          children: [loginPage],
        },
        {
          element: <ProtectedLayout loading={<InitialPageLoading pages={pages} />} />,
          errorElement: <RouteError />,
          children: [
            {
              element: <PageLayout pages={pages} />,
              errorElement: <RouteError />,
              children: withPageLoaders(protectedPages, queryClient),
            },
          ],
        },
      ],
    },
  ];
}
