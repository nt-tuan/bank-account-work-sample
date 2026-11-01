import { InsightsFilters } from '@/features/insights/InsightsFilters.tsx';
import { InsightsResults } from '@/features/insights/InsightsResults.tsx';
import { useInsightsFilters } from '@/features/insights/filters.ts';

export function InsightsPage() {
  const [filters, setFilters] = useInsightsFilters();

  return (
    <>
      <InsightsFilters filters={filters} setFilters={setFilters} />
      <InsightsResults filters={filters} />
    </>
  );
}
