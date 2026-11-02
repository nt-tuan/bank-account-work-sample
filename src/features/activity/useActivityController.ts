import { SortOrder } from '@domain/domain/enums.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { useActivityFilters } from './filters.ts';

/** Shared URL filters and range visibility; resource data belongs to each functional block. */
export function useActivityController() {
  const [filters, setFilters] = useActivityFilters();
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const query = filters.q ?? '';
  const [search, setSearch] = useState(query);
  const committed = useRef(query);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  useLayoutEffect(() => {
    // POP also cancels a draft when the destination happens to have the same applied query.
    if (navigationType === 'POP' || query !== committed.current) {
      clearTimeout(searchTimer.current);
      setSearch(query);
    }
    committed.current = query;
  }, [key, navigationType, query]);
  const changeSearch = (value: string) => {
    clearTimeout(searchTimer.current);
    setSearch(value);
    const trimmed = value.trim().slice(0, 200);
    if (trimmed === query) return;
    searchTimer.current = setTimeout(() => {
      committed.current = trimmed;
      setFilters({ q: trimmed || undefined }, { replace: true });
    }, 300);
  };
  const [rangeDraft, setRangeDraft] = useState<string | null>(null);
  const rangeOpen = Boolean(filters.from) || rangeDraft === key;
  const clearAll = () => {
    clearTimeout(searchTimer.current);
    setSearch('');
    committed.current = '';
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
  return { filters, setFilters, search, changeSearch, rangeOpen, clearAll, closeRange, openRange };
}
