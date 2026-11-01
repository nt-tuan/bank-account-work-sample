import { SortOrder } from '@domain/domain/enums.ts';
import { describe, expect, it } from 'vitest';
import { updateQueryParams } from '@/shared/routing/query-params.ts';
import {
  activityModel,
  hasActiveFilters,
  parseActivityFilters,
  serializeActivityFilters,
} from './filters.ts';

describe('activity URL filters', () => {
  it('falls back per parameter instead of failing the page', () => {
    const f = parseActivityFilters(
      new URLSearchParams(
        'month=2026-13&dir=sideways&status=posted&cat=nope&page=-2&sort=asc&q=%20coffee%20',
      ),
    );
    expect(f).toEqual({ status: 'posted', sort: 'asc', page: 1, q: 'coffee' });
  });
  it('lets a valid custom range replace the month', () => {
    const f = parseActivityFilters(
      new URLSearchParams('month=2026-10&from=2026-10-01&to=2026-10-15'),
    );
    expect(f.from).toBe('2026-10-01');
    expect(f.month).toBeUndefined();
  });
  it('ignores a reversed range', () => {
    expect(
      parseActivityFilters(new URLSearchParams('from=2026-10-15&to=2026-10-01')).from,
    ).toBeUndefined();
  });
  it('round-trips transfer status and ignores unsupported states', () => {
    const filters = parseActivityFilters(new URLSearchParams('transferStatus=failed'));
    expect(filters.transferStatus).toBe('failed');
    expect(hasActiveFilters(filters)).toBe(true);
    expect(serializeActivityFilters(filters).toString()).toBe('transferStatus=failed');
    expect(
      parseActivityFilters(new URLSearchParams('transferStatus=posted')).transferStatus,
    ).toBeUndefined();
  });
  it('round-trips and writes only non-defaults', () => {
    const p = new URLSearchParams(
      'account=acc_everyday&month=2026-10&q=sushi&dir=debit&status=posted&cat=dining&sort=asc&page=2',
    );
    expect(serializeActivityFilters(parseActivityFilters(p)).toString()).toBe(p.toString());
    expect(serializeActivityFilters({ sort: SortOrder.Desc, page: 1 }).toString()).toBe('');
  });
  it('resets pagination for filter changes, preserves explicit pages, and drops unknown params', () => {
    const current = new URLSearchParams('account=everyday&page=3&source=test');
    expect(updateQueryParams(activityModel, current, { q: 'coffee' }).toString()).toBe(
      'account=everyday&q=coffee',
    );
    expect(updateQueryParams(activityModel, current, { page: 4 }).toString()).toBe(
      'account=everyday&page=4',
    );
    expect(updateQueryParams(activityModel, current, { q: 'coffee', page: 2 }).toString()).toBe(
      'account=everyday&q=coffee&page=2',
    );
  });
  it('normalizes ranges on write and preserves a valid month when a range is invalid', () => {
    const current = new URLSearchParams('month=2026-10&page=3');
    expect(
      updateQueryParams(activityModel, current, {
        from: '2026-10-01',
        to: '2026-10-15',
      }).toString(),
    ).toBe('from=2026-10-01&to=2026-10-15');
    expect(
      updateQueryParams(activityModel, current, {
        from: '2026-10-15',
        to: '2026-10-01',
      }).toString(),
    ).toBe('month=2026-10');
    expect(
      parseActivityFilters(new URLSearchParams('month=2026-10&from=2026-02-30&to=2026-10-01')),
    ).toEqual({ month: '2026-10', page: 1, sort: 'desc' });
  });
});
