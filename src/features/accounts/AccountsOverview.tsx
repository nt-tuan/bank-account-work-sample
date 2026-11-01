import { AccountsOverviewSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { ui } from '@/shared/ui/classes.ts';
import { IconArrowRight, IconChevronRight } from '@/shared/ui/icons.tsx';
import { ErrorState } from '@/shared/ui/primitives.tsx';
import { AccountsSection } from './AccountsSection.tsx';
import { BalancePanel } from './BalancePanel.tsx';
import { useAccounts } from './queries.ts';
import { useQueryClient } from '@tanstack/react-query';
import { recentActivityOptions } from '@/features/activity/index.ts';

/** One accounts resource and one loading/error/refresh policy for its summary and list. */
export function AccountsOverview({
  hidden,
  onToggleAmounts,
}: {
  hidden: boolean;
  onToggleAmounts: () => void;
}) {
  const accounts = useAccounts();
  const queryClient = useQueryClient();
  if (accounts.isPending) return <AccountsOverviewSkeleton />;
  if (!accounts.data)
    return (
      <ErrorState
        message="We couldn't load your accounts."
        onRetry={() => void accounts.refetch()}
      />
    );

  return (
    <>
      <BalancePanel
        accounts={accounts.data}
        hidden={hidden}
        onToggle={onToggleAmounts}
        updatedAt={accounts.dataUpdatedAt}
        refreshing={accounts.isFetching}
        onRefresh={() =>
          Promise.all([
            accounts.refetch(),
            queryClient.refetchQueries({ queryKey: recentActivityOptions().queryKey, exact: true }),
          ])
        }
        refreshFailed={accounts.isError}
      />
      <Link className={ui.rowNav} to="/transfers/new">
        <IconArrowRight className="text-action" />
        <span className="flex-auto font-medium">Make a transfer</span>
        <IconChevronRight className="text-input-border" />
      </Link>
      <AccountsSection accounts={accounts.data} hidden={hidden} />
    </>
  );
}
