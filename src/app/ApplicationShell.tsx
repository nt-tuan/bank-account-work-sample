import { twMerge } from '@/shared/ui/classes.ts';
import { DemoControls } from '@/features/demo/index.ts';
import {
  IconArrowRight,
  IconChart,
  IconDemo,
  IconDoc,
  IconGrid,
  IconHome,
  IconInfo,
  IconMenu,
} from '@/shared/ui/icons.tsx';
import { Logo } from '@/shared/ui/primitives.tsx';
import { Outlet } from 'react-router';
import { PageLink as Link, PageNavLink as NavLink } from '@/shared/navigation/PageLink.tsx';
import { useState } from 'react';
import { useLogout } from '@/features/auth/index.ts';

export const topbar =
  'sticky top-0 z-20 flex h-topbar items-center justify-between gap-4 bg-chrome pr-4 pl-2 text-on-chrome max-md:h-13 max-md:pr-2 max-md:pl-4';

const topbarBtn =
  'inline-flex h-touch min-w-touch cursor-pointer items-center justify-center rounded-md px-3 text-md text-on-chrome hover:bg-chrome-hover';

const navGroup = 'm-0 px-5 pt-5 pb-1 text-sm font-normal text-on-chrome-muted';

const navItem =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 pr-5 text-left text-base text-on-chrome hover:bg-chrome-hover hover:text-on-chrome hover:no-underline aria-[current=page]:bg-surface aria-[current=page]:text-ink';

const navLink = twMerge(navItem, 'pl-8');

const bottomLink =
  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-2xs text-muted hover:no-underline aria-[current=page]:text-action';

export function ApplicationShell({
  displayName,
  demoControls,
}: {
  displayName: string;
  demoControls: boolean;
}) {
  const logout = useLogout();
  const [navOpen, setNavOpen] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <>
      <a
        className="absolute -top-15 left-2 z-100 rounded-md bg-surface px-4 py-2.5 focus:top-2"
        href="#main"
      >
        Skip to content
      </a>
      <header className={topbar}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={twMerge(topbarBtn, 'max-md:hidden')}
            aria-label="Toggle navigation"
            aria-expanded={navOpen}
            aria-controls="sidebar"
            onClick={() => setNavOpen((v) => !v)}
          >
            <IconMenu />
          </button>
          <Link
            to="/"
            aria-label="Demo Banking, Home"
            className="text-on-chrome hover:text-on-chrome hover:no-underline"
          >
            <Logo />
          </Link>
        </div>
        <div className="flex items-center gap-2 max-md:hidden">
          <span className="text-sm text-on-chrome-soft">{displayName}</span>
          <button type="button" className={topbarBtn} onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <div className="flex min-h-[calc(100vh-var(--spacing-topbar))] max-md:min-h-[calc(100vh-52px)]">
        <nav
          className="w-sidebar flex-none bg-chrome pb-6 text-on-chrome max-md:hidden"
          id="sidebar"
          aria-label="Main"
          hidden={!navOpen}
        >
          <ul>
            <li>
              <NavLink
                to="/"
                end
                className={twMerge(
                  navItem,
                  'h-pagebar border-b border-transparent pl-5 aria-[current=page]:border-divider',
                )}
              >
                <IconHome />
                Home
              </NavLink>
            </li>
          </ul>
          <h2 className={navGroup}>Accounts</h2>
          <ul>
            <li>
              <NavLink to="/accounts" className={navLink}>
                <IconInfo />
                Account information
              </NavLink>
            </li>
            <li>
              <NavLink to="/activity" className={navLink}>
                <IconDoc />
                Account activity
              </NavLink>
            </li>
            <li>
              <NavLink to="/insights" className={navLink}>
                <IconChart />
                Insights
              </NavLink>
            </li>
          </ul>
          <h2 className={navGroup}>Transfers</h2>
          <ul>
            <li>
              <NavLink to="/transfers/new" className={navLink}>
                <IconArrowRight />
                New transfer
              </NavLink>
            </li>
          </ul>
          {demoControls && (
            <>
              <h2 className={navGroup}>Demo</h2>
              <ul>
                <li>
                  <button type="button" className={navLink} onClick={() => setDemoOpen(true)}>
                    <IconDemo />
                    Demo controls
                  </button>
                </li>
              </ul>
            </>
          )}
        </nav>
        <main className="flex min-w-0 flex-auto flex-col" id="main">
          <Outlet context={{ openDemo: () => setDemoOpen(true), demoControls, logout }} />
        </main>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 hidden grid-cols-4 border-t border-divider bg-surface pb-[env(safe-area-inset-bottom)] max-md:grid"
        aria-label="Main"
      >
        <NavLink to="/" end className={bottomLink}>
          <IconHome size={22} />
          Home
        </NavLink>
        <NavLink to="/activity" className={bottomLink}>
          <IconDoc size={22} />
          Activity
        </NavLink>
        <NavLink to="/transfers/new" className={bottomLink}>
          <IconArrowRight size={22} />
          Transfer
        </NavLink>
        <NavLink to="/menu" className={bottomLink}>
          <IconGrid size={22} />
          Menu
        </NavLink>
      </nav>
      {demoControls && <DemoControls open={demoOpen} onOpenChange={setDemoOpen} />}
    </>
  );
}
