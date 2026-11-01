import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  parseQueryParams,
  updateQueryParams,
  type QueryModel,
  type QueryShape,
  type SetQueryParams,
} from './query-params.ts';

export function useQueryParams<S extends QueryShape>(model: QueryModel<S>) {
  const [params, setParams] = useSearchParams();
  const values = parseQueryParams(model, params);
  const latest = useRef({ model, setParams });
  useLayoutEffect(() => {
    latest.current = { model, setParams };
  }, [model, setParams]);
  const setValues = useCallback<SetQueryParams<typeof values>>((patch, options) => {
    // Router's setter captures its render's params; retained callbacks need the latest one.
    const { model, setParams } = latest.current;
    setParams((current) => updateQueryParams(model, current, patch), options);
  }, []);
  return [values, setValues] as const;
}
