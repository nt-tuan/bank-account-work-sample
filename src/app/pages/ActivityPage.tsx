import { ActivityFilters } from '@/features/activity/ActivityFilters.tsx';
import { ActivityResults } from '@/features/activity/ActivityResults.tsx';
import { RangeFilters } from '@/features/activity/RangeFilters.tsx';
import { useActivityController } from '@/features/activity/useActivityController.ts';

export function ActivityPage() {
  const { filters, setFilters, search, changeSearch, rangeOpen, clearAll, closeRange, openRange } =
    useActivityController();
  return (
    <>
      <ActivityFilters
        filters={filters}
        setFilters={setFilters}
        search={search}
        changeSearch={changeSearch}
        clearAll={clearAll}
      />
      <RangeFilters
        filters={filters}
        setFilters={setFilters}
        rangeOpen={rangeOpen}
        closeRange={closeRange}
        openRange={openRange}
      />
      <ActivityResults
        filters={filters}
        setFilters={setFilters}
        rangeOpen={rangeOpen}
        clearAll={clearAll}
      />
    </>
  );
}
