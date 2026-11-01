import {
  UnknownParamsPolicy,
  defineQueryModel,
  parseQueryParams,
  serializeQueryParams,
  updateQueryParams,
} from './query-params.ts';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';

const model = defineQueryModel({
  schema: z.object({
    page: z.coerce.number().int().min(1),
    count: z.coerce.number().int().min(0),
    enabled: z.preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean(),
    ),
    term: z
      .string()
      .transform((value) => value.trim() || undefined)
      .optional(),
  }),
  defaults: () => ({ page: 1, count: 1, enabled: true }),
});

describe('query params model', () => {
  it('infers output types and falls back per field without losing valid values', () => {
    const values = parseQueryParams(
      model,
      new URLSearchParams('page=nope&count=0&enabled=false&term=%20coffee%20&extra=test'),
    );
    expectTypeOf(values).toEqualTypeOf<{
      page: number;
      count: number;
      enabled: boolean;
      term?: string | undefined;
    }>();
    expect(values).toEqual({ page: 1, count: 0, enabled: false, term: 'coffee' });
    expect(parseQueryParams(model, new URLSearchParams())).toEqual({
      page: 1,
      count: 1,
      enabled: true,
    });
  });

  it('reads the first duplicate and preserves unrelated duplicate parameters on write', () => {
    const current = new URLSearchParams('page=2&page=3&source=a&source=b');
    expect(parseQueryParams(model, current).page).toBe(2);
    const next = updateQueryParams(model, current, { page: 4 });
    expect(next.getAll('page')).toEqual(['4']);
    expect(next.getAll('source')).toEqual(['a', 'b']);
    expect(current.toString()).toBe('page=2&page=3&source=a&source=b');
  });

  it('merges patches, removes explicit undefined, and resets required fields to defaults', () => {
    const current = new URLSearchParams('page=3&term=coffee&count=2&source=test');
    const next = updateQueryParams(model, current, { term: undefined, page: undefined });
    expect(next.toString()).toBe('count=2&source=test');
    expect(parseQueryParams(model, next)).toEqual({ page: 1, count: 2, enabled: true });
  });

  it('writes false and zero, omits defaults, and round-trips values', () => {
    const values = { page: 1, count: 0, enabled: false, term: 'coffee' };
    const params = serializeQueryParams(model, values);
    expect(params.toString()).toBe('count=0&enabled=false&term=coffee');
    expect(parseQueryParams(model, params)).toEqual(values);
  });

  it('validates writes per field while retaining the other filters', () => {
    const next = updateQueryParams(model, new URLSearchParams('page=3&term=coffee'), {
      page: -2,
      count: 0,
    });
    expect(parseQueryParams(model, next)).toEqual({
      page: 1,
      count: 0,
      enabled: true,
      term: 'coffee',
    });
  });

  it('supports dropping unknown params', () => {
    const next = updateQueryParams(
      { ...model, unknownParams: UnknownParamsPolicy.Drop },
      new URLSearchParams('page=2&source=test'),
      { count: 0 },
    );
    expect(next.toString()).toBe('page=2&count=0');
  });

  it('refreshes dynamic defaults and resolves them once per update', () => {
    let month = '2026-10';
    const defaults = vi.fn(() => ({ month }));
    const dynamicModel = defineQueryModel({ schema: z.object({ month: z.string() }), defaults });
    expect(parseQueryParams(dynamicModel, new URLSearchParams()).month).toBe('2026-10');
    month = '2026-11';
    expect(parseQueryParams(dynamicModel, new URLSearchParams()).month).toBe('2026-11');
    defaults.mockClear();
    expect(
      updateQueryParams(dynamicModel, new URLSearchParams(), { month: '2026-10' }).toString(),
    ).toBe('month=2026-10');
    expect(defaults).toHaveBeenCalledTimes(1);
    expect(
      updateQueryParams(dynamicModel, new URLSearchParams('month=2026-10'), { month }).toString(),
    ).toBe('');
  });
});
