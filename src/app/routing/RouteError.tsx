import { ui, twMerge } from '@/shared/ui/classes.ts';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { PageFrame } from './PageFrame.tsx';
import { errorPages } from './page-metadata.ts';

export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <PageFrame page={notFound ? errorPages.notFound : errorPages.unexpected}>
      <div className={twMerge(ui.card, ui.empty)} role="alert">
        <p>{notFound ? "We couldn't find that page." : 'Something went wrong on this page.'}</p>
        <p className="flex justify-center gap-4 text-sm">
          <button type="button" className={ui.linkBtn} onClick={() => window.location.reload()}>
            Try again
          </button>
          <Link to="/">Go to Home</Link>
        </p>
      </div>
    </PageFrame>
  );
}
