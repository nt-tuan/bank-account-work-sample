import { currentJstMonth, formatMonth, formatMonthTab } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { monthsEndingAt } from '@domain/time.ts';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import type { ActivityFilters, SetActivityFilters } from './filters.ts';
import { RangeForm } from './RangeForm.tsx';

type RangeFiltersProps = {
  filters: ActivityFilters;
  setFilters: SetActivityFilters;
  rangeOpen: boolean;
  closeRange: () => void;
  openRange: () => void;
};

export function RangeFilters({
  filters,
  setFilters,
  rangeOpen,
  closeRange,
  openRange,
}: RangeFiltersProps) {
  const thisMonth = currentJstMonth();
  const month = filters.month ?? thisMonth;
  const applyRange = (from: string, to: string) => setFilters({ from, to, month: undefined });
  const selectMonth = (month: string) =>
    setFilters({ month: month === thisMonth ? undefined : month });
  return rangeOpen ? (
    <RangeForm
      key={`${filters.from ?? ''}:${filters.to ?? ''}`}
      initialFrom={filters.from ?? ''}
      initialTo={filters.to ?? ''}
      onApply={applyRange}
      onCancel={closeRange}
    />
  ) : (
    <div className="-mb-5 flex items-end justify-between gap-3 max-md:flex-wrap">
      <nav className={twMerge(ui.tabs, 'min-w-0')} aria-label="Month">
        {monthsEndingAt(thisMonth, 6).map((m) => (
          <Link
            key={m}
            className={ui.tab}
            to={`?month=${m}`}
            aria-current={m === month ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              selectMonth(m);
            }}
          >
            <span className="sr-only">{formatMonth(m)}</span>
            <span aria-hidden="true">{formatMonthTab(m)}</span>
          </Link>
        ))}
      </nav>
      <button
        type="button"
        className="inline-flex min-h-touch cursor-pointer items-center gap-1 text-md text-action hover:text-action-hover hover:underline"
        onClick={openRange}
      >
        Custom range…
      </button>
    </div>
  );
}
