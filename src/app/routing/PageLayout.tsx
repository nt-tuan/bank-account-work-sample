import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import {
  Outlet,
  useLocation,
  useMatches,
  useNavigation,
  useOutletContext,
  type RouteObject,
} from 'react-router';
import type { PageHandle } from './page-metadata.ts';
import { PageFrame } from './PageFrame.tsx';
import { matchPage } from './define-page.ts';

export function PageLayout({ pages = [] }: { pages?: RouteObject[] }) {
  const navigation = useNavigation();
  const { pathname, state } = useLocation();
  const target =
    navigation.location && navigation.location.pathname !== pathname
      ? matchPage(pages, navigation.location)
      : undefined;
  const pending = navigation.state === 'loading' && !!target;
  const matches = useMatches();
  const match = [...matches]
    .reverse()
    .find((item) => (item.handle as PageHandle | undefined)?.page);
  const handle = (pending ? target?.route.handle : match?.handle) as PageHandle | undefined;
  const page = handle?.page;
  const params = pending ? target?.params : match?.params;
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  const subscribe = useCallback((notify: () => void) => cache.subscribe(notify), [cache]);
  const snapshot = () =>
    page?.data ? queryClient.getQueryData(page.data.queryKey(params ?? {})) : undefined;
  const data = useSyncExternalStore(subscribe, snapshot, snapshot);
  const resolved = {
    documentTitle: 'Demo Banking',
    header: 'Demo Banking',
    ...page,
    ...page?.data?.resolve(data),
  };
  const context = useOutletContext();
  if (resolved.leftAction?.resolveTo)
    resolved.leftAction = {
      ...resolved.leftAction,
      to: resolved.leftAction.resolveTo(pending ? navigation.location?.state : state),
    };
  const Loading = handle?.Loading;

  return (
    <PageFrame page={resolved} pending={pending}>
      {pending && Loading && <Loading />}
      <div hidden={pending} className="contents">
        <Outlet key={pathname} context={context} />
      </div>
    </PageFrame>
  );
}
