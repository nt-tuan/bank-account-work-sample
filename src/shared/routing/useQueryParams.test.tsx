import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineQueryModel, type SetQueryParams } from './query-params.ts';
import { useQueryParams } from './useQueryParams.ts';

const model = defineQueryModel({
  schema: z.object({ page: z.coerce.number().int().min(1), term: z.string().optional() }),
  defaults: () => ({ page: 1 }),
});

describe('useQueryParams', () => {
  it('reads the current URL, supports push/replace, and follows back/forward', async () => {
    let setValues!: SetQueryParams<{ page: number; term?: string | undefined }>;
    function Probe() {
      const [values, setter] = useQueryParams(model);
      setValues = setter;
      return <output>{JSON.stringify(values)}</output>;
    }
    const router = createMemoryRouter([{ path: '/test', Component: Probe }], {
      initialEntries: ['/test?term=first&source=test'],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('status')).toHaveTextContent('"term":"first"');
    const initialSetter = setValues;

    await act(async () => setValues({ page: 2 }));
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.search).toBe('?term=first&source=test&page=2');

    await act(async () => setValues({ term: 'second' }, { replace: true }));
    expect(router.state.historyAction).toBe('REPLACE');
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe('?term=first&source=test');
    expect(screen.getByRole('status')).toHaveTextContent('"page":1');

    await act(async () => {
      await router.navigate(1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('"term":"second"');
    // Even a retained setter merges against the current URL, not its original render.
    await act(async () => initialSetter({ page: 3 }));
    expect(router.state.location.search).toBe('?term=second&source=test&page=3');
  });
});
