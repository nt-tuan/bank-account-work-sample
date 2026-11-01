import { insightsOptions } from './queries.ts';
import { InsightsResultsSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { formatMonth } from '@/shared/format/format.ts';
import { ui } from '@/shared/ui/classes.ts';
import { Empty, ErrorState } from '@/shared/ui/primitives.tsx';
import { useQuery } from '@tanstack/react-query';
import { IncomeSpendingTrend } from './IncomeSpendingTrend.tsx';
import { InsightsStatistics } from './InsightsStatistics.tsx';
import { SpendingByCategory } from './SpendingByCategory.tsx';
import type { InsightsFilters } from './filters.ts';

export function InsightsResults({ filters }: { filters: InsightsFilters }) {
  const { month } = filters;
  const insights = useQuery(insightsOptions(filters));
  const data = insights.data;

  return (
    <>
      {insights.isPending && <InsightsResultsSkeleton />}
      {insights.isError && !data && (
        <ErrorState message="We couldn't load insights." onRetry={() => void insights.refetch()} />
      )}
      {insights.isError && data && (
        <ErrorState
          message="Couldn't update insights. Showing the last update."
          onRetry={() => void insights.refetch()}
        />
      )}
      {data && (
        <>
          <InsightsStatistics
            month={month}
            incomeMinor={data.incomeMinor}
            spendingMinor={data.spendingMinor}
          />
          {data.incomeMinor === 0 && data.spendingMinor === 0 && (
            <div className={ui.card} role="status">
              <Empty title={`No posted income or spending in ${formatMonth(month)}.`}>
                Choose another month or account.
              </Empty>
            </div>
          )}
          <div className="grid grid-cols-2 items-start gap-5 max-lg:grid-cols-1">
            <SpendingByCategory
              filters={filters}
              categories={data.categories}
              spendingMinor={data.spendingMinor}
            />
            <IncomeSpendingTrend filters={filters} trend={data.trend} />
          </div>
        </>
      )}
    </>
  );
}
