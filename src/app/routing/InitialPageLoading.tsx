import { PageVariant, type PageHandle } from './page-metadata.ts';
import { useLocation, type RouteObject } from 'react-router';
import { NotFoundSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { PageFrame } from './PageFrame.tsx';
import { matchPage } from './define-page.ts';

export function InitialPageLoading({ pages }: { pages: RouteObject[] }) {
  const location = useLocation();
  const handle = matchPage(pages, location)?.route.handle as PageHandle | undefined;
  const Loading = handle?.Loading ?? NotFoundSkeleton;
  if (handle?.page.variant === PageVariant.Auth) return <Loading />;
  return (
    <>
      <div className="h-topbar bg-chrome max-md:h-13" aria-hidden="true" />
      <div className="flex min-h-[calc(100vh-var(--spacing-topbar))]">
        <div className="w-sidebar flex-none bg-chrome max-md:hidden" aria-hidden="true" />
        <main className="flex min-w-0 flex-auto flex-col" id="main">
          <PageFrame page={handle?.page ?? { documentTitle: 'Loading', header: 'Loading' }} pending>
            <Loading />
          </PageFrame>
        </main>
      </div>
      <div
        className="fixed inset-x-0 bottom-0 hidden h-14 border-t border-divider bg-surface max-md:block"
        aria-hidden="true"
      />
    </>
  );
}
