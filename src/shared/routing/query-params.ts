import type { z } from 'zod';

/** Whether serializing a query model keeps or drops parameters outside its schema. */
export enum UnknownParamsPolicy {
  Preserve = 'preserve',
  Drop = 'drop',
}

type QueryValue = string | number | boolean;
export type QueryShape = Record<string, z.ZodType<QueryValue | undefined>>;
type ModelValues<S extends QueryShape> = z.output<z.ZodObject<S>>;
type ModelDefaults<T> = Partial<T> & {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
};

/** Missing keys keep their value; explicit undefined removes/resets a key. */
export type QueryPatch<T> = { [K in keyof T]?: T[K] | undefined };
export type SetQueryParams<T> = (patch: QueryPatch<T>, options?: { replace?: boolean }) => void;

export type QueryModel<S extends QueryShape> = {
  schema: z.ZodObject<S>;
  /** Shared fallback and URL omission rules. Required fields must have defaults. */
  defaults: () => ModelDefaults<ModelValues<S>>;
  unknownParams?: UnknownParamsPolicy;
  normalize?: (values: ModelValues<S>) => ModelValues<S>;
  beforeWrite?: (
    next: QueryPatch<ModelValues<S>>,
    context: { patch: QueryPatch<ModelValues<S>> },
  ) => QueryPatch<ModelValues<S>>;
};

export function defineQueryModel<S extends QueryShape>(model: QueryModel<S>): QueryModel<S> {
  return model;
}

function readValues<S extends QueryShape>(
  model: QueryModel<S>,
  raw: Record<string, unknown>,
  defaults: ModelDefaults<ModelValues<S>>,
): ModelValues<S> {
  const values: Record<string, QueryValue> = {};
  for (const [key, field] of Object.entries(model.schema.shape)) {
    const fallback = defaults[key as keyof typeof defaults];
    const result = field.safeParse(raw[key] === undefined ? fallback : raw[key]);
    // Invalid fields fall back independently; invalid model defaults are programmer errors.
    const value = result.success ? result.data : field.parse(fallback);
    if (value !== undefined) values[key] = value;
  }
  const parsed = values as ModelValues<S>;
  return model.normalize ? model.normalize(parsed) : parsed;
}

function rawValues<S extends QueryShape>(
  model: QueryModel<S>,
  params: URLSearchParams,
): Record<string, unknown> {
  // Match URLSearchParams.get(): the first duplicate wins.
  return Object.fromEntries(
    Object.keys(model.schema.shape).map((key) => [key, params.get(key) ?? undefined]),
  );
}

export function parseQueryParams<S extends QueryShape>(
  model: QueryModel<S>,
  params: URLSearchParams,
): ModelValues<S> {
  return readValues(model, rawValues(model, params), model.defaults());
}

function writeValues<S extends QueryShape>(
  model: QueryModel<S>,
  values: ModelValues<S>,
  current: URLSearchParams,
  defaults: ModelDefaults<ModelValues<S>>,
): URLSearchParams {
  const next =
    model.unknownParams === UnknownParamsPolicy.Drop
      ? new URLSearchParams()
      : new URLSearchParams(current);
  for (const key of Object.keys(model.schema.shape)) {
    const value = values[key as keyof typeof values];
    if (value === undefined || value === defaults[key as keyof typeof defaults]) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}

/** Serializes values without applying update-only rules such as resetting pagination. */
export function serializeQueryParams<S extends QueryShape>(
  model: QueryModel<S>,
  values: ModelValues<S>,
  current = new URLSearchParams(),
): URLSearchParams {
  const defaults = model.defaults();
  return writeValues(model, readValues(model, values, defaults), current, defaults);
}

export function updateQueryParams<S extends QueryShape>(
  model: QueryModel<S>,
  current: URLSearchParams,
  patch: QueryPatch<ModelValues<S>>,
): URLSearchParams {
  // Resolve dynamic defaults once for the entire update.
  const defaults = model.defaults();
  const values = readValues(model, rawValues(model, current), defaults);
  const merged = { ...values, ...patch };
  const next = model.beforeWrite ? model.beforeWrite(merged, { patch }) : merged;
  return writeValues(model, readValues(model, next, defaults), current, defaults);
}
