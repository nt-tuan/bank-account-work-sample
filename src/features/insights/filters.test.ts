import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateQueryParams } from '@/shared/routing/query-params.ts';
import { insightsModel, parseInsightsFilters } from './filters.ts';

afterEach(() => vi.useRealTimers());

describe('insights URL filters', () => {
  it('uses the current JST month for missing/invalid values and updates it across month changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T14:59:59Z'));
    expect(parseInsightsFilters(new URLSearchParams('month=bad&account=everyday'))).toEqual({
      month: '2026-10',
      account: 'everyday',
    });
    vi.setSystemTime(new Date('2026-10-31T15:00:00Z'));
    expect(parseInsightsFilters(new URLSearchParams()).month).toBe('2026-11');
    const next = updateQueryParams(
      insightsModel,
      new URLSearchParams('month=2026-10&source=test'),
      { month: '2026-11' },
    );
    expect(next.toString()).toBe('source=test');
  });

  it('removes optional filters and preserves unrelated parameters', () => {
    const current = new URLSearchParams('month=2026-09&account=everyday&source=test');
    expect(updateQueryParams(insightsModel, current, { account: undefined }).toString()).toBe(
      'month=2026-09&source=test',
    );
    expect(parseInsightsFilters(new URLSearchParams('month=2026-09&account='))).toEqual({
      month: '2026-09',
    });
  });
});
