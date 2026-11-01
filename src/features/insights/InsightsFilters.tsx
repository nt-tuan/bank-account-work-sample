import { useAccounts } from '@/features/accounts/index.ts';
import { currentJstMonth, formatMonth } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { Select, SelectOption } from '@/shared/ui/Select.tsx';
import { monthsEndingAt } from '@domain/time.ts';
import type { InsightsFilters as Filters, SetInsightsFilters } from './filters.ts';

export function InsightsFilters({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: SetInsightsFilters;
}) {
  const thisMonth = currentJstMonth();
  const accounts = useAccounts();

  return (
    <form
      className={twMerge(ui.card, 'flex flex-wrap items-center gap-5 px-6 py-4 max-md:p-4')}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="flex min-w-60 items-center gap-2.5 max-md:w-full max-md:min-w-0">
        <label className={twMerge(ui.label, 'whitespace-nowrap')} htmlFor="i-month">
          Month
        </label>
        <Select
          id="i-month"
          value={filters.month}
          onValueChange={(value) => setFilters({ month: value })}
        >
          {monthsEndingAt(thisMonth, 12)
            .reverse()
            .map((m) => (
              <SelectOption key={m} value={m}>
                {formatMonth(m)}
              </SelectOption>
            ))}
        </Select>
      </div>
      <div className="flex min-w-60 items-center gap-2.5 max-md:w-full max-md:min-w-0">
        <label className={twMerge(ui.label, 'whitespace-nowrap')} htmlFor="i-account">
          Account
        </label>
        <Select
          id="i-account"
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
      <p className="text-sm text-muted">
        Posted activity only. Transfers, pending and cancelled entries are excluded.
      </p>
    </form>
  );
}
