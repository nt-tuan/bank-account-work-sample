import { SortOrder } from '@domain/domain/enums.ts';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { useActivityFilters } from './filters.ts';

/** Shared URL filters and range visibility; resource data belongs to each functional block. */
export function useActivityController() {
  const [filters, setFilters] = useActivityFilters();
  const { key } = useLocation();
  const [rangeDraft, setRangeDraft] = useState<string | null>(null);
  const rangeOpen = Boolean(filters.from) || rangeDraft === key;
  const clearAll = () => {
    setRangeDraft(null);
    setFilters({
      account: undefined,
      month: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      dir: undefined,
      status: undefined,
      transferStatus: undefined,
      cat: undefined,
      sort: SortOrder.Desc,
    });
  };
  const closeRange = () => {
    setRangeDraft(null);
    setFilters({ from: undefined, to: undefined });
  };
  const openRange = () => setRangeDraft(key);
  return { filters, setFilters, rangeOpen, clearAll, closeRange, openRange };
}
