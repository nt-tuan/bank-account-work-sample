import { ui, twMerge } from '@/shared/ui/classes.ts';
import { IconChevronRight } from '@/shared/ui/icons.tsx';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { useOutletContext } from 'react-router';
import type { ShellContext } from '../ProtectedLayout.tsx';

const menuList = twMerge(ui.card, 'divide-y divide-row-divider overflow-hidden');

const menuItem =
  'flex min-h-13 w-full cursor-pointer items-center gap-3 px-4 text-left text-base hover:bg-row-hover hover:no-underline';

export function MenuPage() {
  const { openDemo, demoControls, logout } = useOutletContext<ShellContext>();
  const item = (to: string, label: string) => (
    <li>
      <Link to={to} className={twMerge(menuItem, 'text-ink')}>
        {label}
        <IconChevronRight size={18} className="ml-auto text-input-border" />
      </Link>
    </li>
  );
  return (
    <>
      <h2 className="text-sm font-normal text-muted">Accounts</h2>
      <ul className={menuList}>
        {item('/accounts', 'Account information')}
        {item('/activity', 'Account activity')}
        {item('/insights', 'Insights')}
      </ul>
      {demoControls && (
        <>
          <h2 className="text-sm font-normal text-muted">Demo</h2>
          <ul className={menuList}>
            <li>
              <button type="button" className={twMerge(menuItem, 'text-ink')} onClick={openDemo}>
                Demo controls <span className="text-xs text-muted">DEMO ONLY</span>
              </button>
            </li>
          </ul>
        </>
      )}
      <ul className={menuList}>
        <li>
          <button
            type="button"
            className={twMerge(menuItem, 'justify-center text-action')}
            onClick={() => void logout()}
          >
            Log out
          </button>
        </li>
      </ul>
      <p className="text-xs text-muted">
        Demo Banking is an independent personal banking worksample.
      </p>
    </>
  );
}
