import { loginPath, useSession } from '@/features/auth/index.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { Navigate, useLocation } from 'react-router';
import { ApplicationShell, topbar } from './ApplicationShell.tsx';
import type { ReactNode } from 'react';

function ShellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className={topbar} />
    </div>
  );
}

/** Requires a server session; renders the shell (topbar, sidebar | bottom nav). Authorization itself is on the server. */
export function ProtectedLayout({ loading }: { loading?: ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return loading ?? <ShellSkeleton />;
  if (session.isError) {
    return (
      <div className={ui.content}>
        <div className={twMerge(ui.card, ui.empty)} role="alert">
          <p>We couldn't reach Demo Banking.</p>
          <p className="text-sm">
            <button className={ui.linkBtn} type="button" onClick={() => void session.refetch()}>
              Try again
            </button>
          </p>
        </div>
      </div>
    );
  }
  if (!session.data.authenticated) {
    return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  }
  return (
    <ApplicationShell
      displayName={session.data.customer?.displayName ?? ''}
      demoControls={session.data.demoControls}
    />
  );
}

/** Outlet context the shell provides to pages (Menu uses it on mobile). */
export type ShellContext = {
  openDemo: () => void;
  demoControls: boolean;
  logout: () => Promise<void>;
};
