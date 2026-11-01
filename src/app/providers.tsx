import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { onUnauthenticated } from '@/shared/api/http.ts';
import { qk } from '@/shared/api/keys.ts';
import { LiveRegionProvider } from '@/shared/ui/live-region.tsx';
import { navigationBypass } from '@/shared/navigation/bypass.ts';
import { clearCustomerData, loginPath } from '@/features/auth/index.ts';
import { router } from './router.tsx';
import { queryClient } from './query-client.ts';
import { pages } from './routing/routes.tsx';
import { preloadPage } from './routing/define-page.ts';
import { PagePrefetchContext } from '@/shared/navigation/PageLink.tsx';

export { queryClient } from './query-client.ts';
const prefetch = (href: string) => {
  void preloadPage(pages, queryClient, href);
};

/** Global 401: clear customer data and return to login. A later login never resumes a money operation (spec §9). */
let handling = false;
onUnauthenticated(() => {
  if (handling || window.location.pathname === '/login') return;
  handling = true;
  const returnTo = window.location.pathname + window.location.search;
  clearCustomerData(queryClient);
  void queryClient.invalidateQueries({ queryKey: qk.session });
  navigationBypass.active = true;
  void router
    .navigate(loginPath(returnTo), {
      replace: true,
    })
    .finally(() => {
      navigationBypass.active = false;
      handling = false;
    });
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PagePrefetchContext value={prefetch}>
        <LiveRegionProvider>{children}</LiveRegionProvider>
      </PagePrefetchContext>
    </QueryClientProvider>
  );
}
