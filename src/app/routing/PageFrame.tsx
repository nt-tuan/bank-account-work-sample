import { ContentWidth, PageVariant, type PageMetadata } from './page-metadata.ts';
import { ui } from '@/shared/ui/classes.ts';
import { PageBar } from '@/shared/ui/primitives.tsx';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/** Shared chrome for normal, loading, missing and error pages. */
export function PageFrame({
  page,
  children,
  pending = false,
}: {
  page: PageMetadata;
  children: ReactNode;
  pending?: boolean;
}) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${page.documentTitle} · Demo Banking`;
  }, [page.documentTitle]);
  useEffect(() => {
    if (!pending) document.getElementById('page-title')?.focus();
  }, [pathname, pending]);
  if (page.variant === PageVariant.Auth) return children;
  return (
    <>
      <PageBar
        title={page.header}
        {...(page.leftAction ? { back: page.leftAction } : {})}
        flow={page.variant === PageVariant.Flow}
      />
      <div className={page.contentWidth === ContentWidth.Narrow ? ui.contentNarrow : ui.content}>
        {children}
      </div>
    </>
  );
}
