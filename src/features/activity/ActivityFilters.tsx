import { ActivityStatus, Direction, SortOrder, TransferStatus } from '@domain/domain/enums.ts';
import { useAccounts } from '@/features/accounts/index.ts';
import { currentJstMonth, formatMonth } from '@/shared/format/format.ts';
import { SearchBox } from '@/shared/ui/SearchBox.tsx';
import { Select, SelectOption } from '@/shared/ui/Select.tsx';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { IconClose } from '@/shared/ui/icons.tsx';
import { CATEGORIES, CATEGORY_LABELS } from '@domain/domain/constants.ts';
import type { ActivityFilters, FilterPatch, SetActivityFilters } from './filters.ts';

export function ActivityFilters({
  filters,
  setFilters,
  clearAll,
}: {
  filters: ActivityFilters;
  setFilters: SetActivityFilters;
  clearAll: () => void;
}) {
  const accounts = useAccounts();
  const thisMonth = currentJstMonth();
  const accountName =
    accounts.data?.find((a) => a.id === filters.account)?.name ?? 'Selected account';
  const chips: { label: string; remove: FilterPatch }[] = [];
  if (filters.account)
    chips.push({ label: `Account: ${accountName}`, remove: { account: undefined } });
  if (filters.from)
    chips.push({
      label: `Dates: ${filters.from} – ${filters.to}`,
      remove: { from: undefined, to: undefined },
    });
  if (filters.month && filters.month !== thisMonth)
    chips.push({ label: `Month: ${formatMonth(filters.month)}`, remove: { month: undefined } });
  if (filters.q) chips.push({ label: `Search: “${filters.q}”`, remove: { q: undefined } });
  if (filters.dir)
    chips.push({
      label: `Direction: ${filters.dir === Direction.Credit ? 'Money in' : 'Money out'}`,
      remove: { dir: undefined },
    });
  if (filters.status)
    chips.push({
      label: `Status: ${filters.status[0]!.toUpperCase()}${filters.status.slice(1)}`,
      remove: { status: undefined },
    });
  if (filters.transferStatus)
    chips.push({
      label: `Transfer status: ${filters.transferStatus[0]!.toUpperCase()}${filters.transferStatus.slice(1)}`,
      remove: { transferStatus: undefined },
    });
  if (filters.cat)
    chips.push({ label: `Category: ${CATEGORY_LABELS[filters.cat]}`, remove: { cat: undefined } });
  return (
    <form
      className={twMerge(ui.card, ui.filters)}
      role="search"
      aria-label="Filter activity"
      onSubmit={(e) => e.preventDefault()}
    >
      <SearchBox
        value={filters.q ?? ''}
        onCommit={(q) => setFilters({ q: q || undefined }, { replace: true })}
      />
      <div className={ui.filterGrid}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="f-account">
            Account
          </label>
          <Select
            id="f-account"
            value={filters.account ?? ''}
            onValueChange={(value) => setFilters({ account: value || undefined })}
          >
            <SelectOption value="">All accounts</SelectOption>
            {accounts.data?.map((a) => (
              <SelectOption key={a.id} value={a.id}>
                {a.name} {a.maskedNumber}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="f-dir">
            Direction
          </label>
          <Select
            id="f-dir"
            value={filters.dir ?? ''}
            onValueChange={(value) =>
              setFilters({ dir: (value || undefined) as ActivityFilters['dir'] })
            }
          >
            <SelectOption value="">All</SelectOption>
            <SelectOption value={Direction.Credit}>Money in</SelectOption>
            <SelectOption value={Direction.Debit}>Money out</SelectOption>
          </Select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="f-status">
            Status
          </label>
          <Select
            id="f-status"
            value={filters.status ?? ''}
            onValueChange={(value) =>
              setFilters({ status: (value || undefined) as ActivityFilters['status'] })
            }
          >
            <SelectOption value="">All</SelectOption>
            <SelectOption value={ActivityStatus.Posted}>Posted</SelectOption>
            <SelectOption value={ActivityStatus.Pending}>Pending</SelectOption>
            <SelectOption value={ActivityStatus.Cancelled}>Cancelled</SelectOption>
          </Select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="f-transfer-status">
            Transfer status
          </label>
          <Select
            id="f-transfer-status"
            value={filters.transferStatus ?? ''}
            onValueChange={(value) =>
              setFilters({
                transferStatus: (value || undefined) as ActivityFilters['transferStatus'],
              })
            }
          >
            <SelectOption value="">All</SelectOption>
            <SelectOption value={TransferStatus.Processing}>Processing</SelectOption>
            <SelectOption value={TransferStatus.Completed}>Completed</SelectOption>
            <SelectOption value={TransferStatus.Failed}>Failed</SelectOption>
          </Select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="f-cat">
            Category
          </label>
          <Select
            id="f-cat"
            value={filters.cat ?? ''}
            onValueChange={(value) =>
              setFilters({ cat: (value || undefined) as ActivityFilters['cat'] })
            }
          >
            <SelectOption value="">All</SelectOption>
            {CATEGORIES.map((c) => (
              <SelectOption key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="f-sort">
            Sort
          </label>
          <Select
            id="f-sort"
            value={filters.sort}
            onValueChange={(value) => setFilters({ sort: value as SortOrder })}
          >
            <SelectOption value={SortOrder.Desc}>Newest first</SelectOption>
            <SelectOption value={SortOrder.Asc}>Oldest first</SelectOption>
          </Select>
        </div>
      </div>
      {chips.length > 0 && (
        <div className={ui.chips}>
          <span className="text-sm text-muted">Filtered by</span>
          {chips.map((c) => (
            <span className={ui.chip} key={c.label}>
              {c.label}
              <button
                type="button"
                className={ui.chipRemove}
                aria-label={`Remove filter ${c.label}`}
                onClick={() => setFilters(c.remove)}
              >
                <IconClose size={14} />
              </button>
            </span>
          ))}
          <button type="button" className={ui.linkBtn} onClick={clearAll}>
            Clear filters
          </button>
        </div>
      )}
    </form>
  );
}
