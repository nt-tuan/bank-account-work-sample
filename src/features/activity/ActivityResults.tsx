import { currentJstMonth, formatMonth, formatShortDateTime } from '@/shared/format/format.ts';
import { Pagination } from '@/shared/ui/Pagination.tsx';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import {
  ActivityStatusText,
  Empty,
  ErrorState,
  Money,
  TransferStatusText,
} from '@/shared/ui/primitives.tsx';
import table from '@/shared/ui/table.module.css';
import { CATEGORY_LABELS } from '@domain/domain/constants.ts';
import type { ActivityEntry } from '@domain/schemas/api.ts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { useEffect } from 'react';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { hasActiveFilters, type ActivityFilters, type SetActivityFilters } from './filters.ts';
import { activityListOptions } from './queries.ts';
import { ActivityResultsSkeleton } from '@/shared/ui/page-skeletons.tsx';

function EntryStatus({ entry }: { entry: ActivityEntry }) {
  return (
    <span className="inline-flex flex-col items-start gap-1" aria-live="polite">
      <ActivityStatusText status={entry.status} />
      {entry.transferStatus && (
        <span className="inline-flex items-center gap-1">
          <span className="sr-only">Transfer status: </span>
          <TransferStatusText
            status={entry.transferStatus}
            delayed={entry.transferDelayedSince !== null}
          />
        </span>
      )}
    </span>
  );
}

function resultSummary(total: number, page: number, pageSize: number) {
  if (total === 0) return 'No entries';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `${from}–${to} of ${total} ${total === 1 ? 'entry' : 'entries'}`;
}

export function ActivityResults({
  filters,
  setFilters,
  rangeOpen,
  clearAll,
}: {
  filters: ActivityFilters;
  setFilters: SetActivityFilters;
  rangeOpen: boolean;
  clearAll: () => void;
}) {
  const location = useLocation();
  const linkState = { backTo: location.pathname + location.search };
  const month = filters.month ?? currentJstMonth();
  const list = useQuery({
    ...activityListOptions(filters),
    placeholderData: keepPreviousData,
  });
  const lastPage = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const correctingPage = !!list.data && !list.isPlaceholderData && filters.page > lastPage;
  useEffect(() => {
    if (correctingPage) setFilters({ page: lastPage }, { replace: true });
  }, [correctingPage, lastPage, setFilters]);
  const active = hasActiveFilters(filters);
  const single = list.data?.runningBalance ?? false;
  if (correctingPage || (list.data && list.data.page > lastPage))
    return (
      <section className={ui.card} aria-label="Loading activity" aria-busy="true">
        <ActivityResultsSkeleton />
      </section>
    );
  return (
    <section className={twMerge(ui.card, rangeOpen ? '' : ui.tabbed)} aria-labelledby="results-h">
      <div className={ui.resultsHead}>
        <h2 id="results-h" className="text-sm font-normal" aria-live="polite">
          {list.data
            ? resultSummary(list.data.total, list.data.page, list.data.pageSize)
            : 'Loading activity…'}
          {list.isFetching && list.data ? ' · Updating…' : ''}
        </h2>
        <span className="text-xs text-muted">
          {single ? 'Times in JST · Balance after each posted entry' : 'Times in JST'}
        </span>
      </div>
      {list.isPending && <ActivityResultsSkeleton />}
      {list.isError && !list.data && (
        <ErrorState message="We couldn't load your activity." onRetry={() => void list.refetch()} />
      )}
      {list.isError && list.data && (
        <p className="px-5 pb-3 text-sm text-bad" role="alert">
          Couldn't update. Showing previous results.{' '}
          <button type="button" className={ui.linkBtn} onClick={() => void list.refetch()}>
            Try again
          </button>
        </p>
      )}
      {list.data && list.data.total === 0 && (
        <Empty title={active ? 'No matching results' : `No activity in ${formatMonth(month)}`}>
          {active ? (
            <>
              Try a different search or{' '}
              <button type="button" className={ui.linkBtnInline} onClick={clearAll}>
                clear filters
              </button>
              .
            </>
          ) : (
            'Choose another month to see earlier activity.'
          )}
        </Empty>
      )}
      {list.data && list.data.total > 0 && (
        <>
          <div className={twMerge(ui.tableWrap, ui.desktopOnly)}>
            <table className={table.table}>
              <caption className="sr-only">Account activity</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  {!single && <th scope="col">Account</th>}
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col" className={table.r}>
                    Amount
                  </th>
                  {single && (
                    <th scope="col" className={table.r}>
                      Balance
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-muted tabular-nums">
                      {formatShortDateTime(e.effectiveAt)}
                    </td>
                    <td>
                      <Link className={ui.rowLink} to={`/activity/${e.id}`} state={linkState}>
                        {e.description}
                      </Link>
                      {e.transferReference && (
                        <div className="text-xs text-muted">{e.transferReference}</div>
                      )}
                    </td>
                    {!single && <td className="text-muted">{e.account.name}</td>}
                    <td className="text-muted">{CATEGORY_LABELS[e.category]}</td>
                    <td>
                      <EntryStatus entry={e} />
                    </td>
                    <td className={twMerge(table.r, 'whitespace-nowrap')}>
                      <Money minor={e.amountMinor} sign={e.direction} />
                    </td>
                    {single && (
                      <td className={twMerge(table.r, 'whitespace-nowrap text-muted')}>
                        {e.runningBalanceMinor === null ? (
                          '—'
                        ) : (
                          <Money minor={e.runningBalanceMinor} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={ui.mobileOnly} aria-label="Account activity">
            {list.data.items.map((e) => (
              <li key={e.id}>
                <Link to={`/activity/${e.id}`} state={linkState} className={ui.mobileRow}>
                  <span className="truncate">{e.description}</span>
                  <Money minor={e.amountMinor} sign={e.direction} className="text-right" />
                  <span className="text-xs text-muted">
                    {formatShortDateTime(e.effectiveAt)} · {CATEGORY_LABELS[e.category]}
                    {!single ? ` · ${e.account.name}` : ''}
                  </span>
                  <span className="text-right text-xs">
                    <EntryStatus entry={e} />
                    {single && e.runningBalanceMinor !== null && (
                      <span className="text-muted">
                        <br />
                        Bal. <Money minor={e.runningBalanceMinor} />
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={filters.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={(page) => setFilters({ page })}
          />
        </>
      )}
    </section>
  );
}
