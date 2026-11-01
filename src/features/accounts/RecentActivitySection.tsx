import { recentActivityOptions } from '@/features/activity/index.ts';
import { RecentActivitySkeleton } from '@/shared/ui/page-skeletons.tsx';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { useQuery } from '@tanstack/react-query';
import { formatShortDateTime } from '@/shared/format/format.ts';
import { ActivityStatusText, ErrorState, Money } from '@/shared/ui/primitives.tsx';
import { ui, twMerge } from '@/shared/ui/classes.ts';

export function RecentActivitySection({ hidden }: { hidden: boolean }) {
  const recent = useQuery(recentActivityOptions());
  return (
    <section className={ui.section} aria-labelledby="recent-heading">
      <div className={ui.sectionHead}>
        <h2 id="recent-heading">Recent activity</h2>
        <Link className="text-sm" to="/activity">
          View all activity
        </Link>
      </div>
      <div className={ui.card}>
        {recent.isPending && <RecentActivitySkeleton />}
        {recent.isError && (
          <ErrorState
            message="We couldn't load recent activity."
            onRetry={() => void recent.refetch()}
          />
        )}
        {recent.data && recent.data.items.length === 0 && (
          <div className={twMerge(ui.empty, 'text-sm text-muted')}>No activity this month yet.</div>
        )}
        {recent.data && recent.data.items.length > 0 && (
          <ul className="divide-y divide-row-divider">
            {recent.data.items.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/activity/${e.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3 text-md text-ink hover:bg-row-hover hover:text-ink hover:no-underline max-md:px-4"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{e.description}</span>
                    <span className="text-xs text-muted">
                      {formatShortDateTime(e.effectiveAt)} · {e.account.name}
                    </span>
                  </span>
                  <span className="text-right">
                    <Money minor={e.amountMinor} sign={e.direction} hidden={hidden} />
                    <br />
                    <ActivityStatusText status={e.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
