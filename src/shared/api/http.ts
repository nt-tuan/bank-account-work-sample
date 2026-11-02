import { ErrorCode, type FieldErrors } from '@domain/errors.ts';
import type { z } from 'zod';
import { errorEnvelopeSchema } from '@domain/schemas/api.ts';

/** HTTP methods supported by the typed API client. */
export enum HttpMethod {
  Get = 'GET',
  Post = 'POST',
}

/** Why the client cannot determine the request outcome. */
export enum UnknownFailureCause {
  Timeout = 'timeout',
  Network = 'network',
  Malformed = 'malformed',
}

/** Definitive server rejection versus an uncertain request outcome. */
export enum ApiFailureKind {
  Rejected = 'rejected',
  Unknown = 'unknown',
}

/**
 * Every response resolves to data, a definitive rejection (JSON error envelope: nothing was created),
 * or an unknown outcome. There is no "failed" variant here, so the UI cannot mistake unknown for failed.
 */
export type RejectedFailure = {
  kind: ApiFailureKind.Rejected;
  status: number;
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
  retryAfterSeconds?: number;
};
export type UnknownFailure = { kind: ApiFailureKind.Unknown; cause: UnknownFailureCause };
export type ApiFailure = RejectedFailure | UnknownFailure;

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(
      failure.kind === ApiFailureKind.Rejected
        ? failure.message
        : `Unknown outcome (${failure.cause})`,
    );
    this.name = 'ApiError';
  }
}

export const isRejected = (
  e: unknown,
  code?: ErrorCode,
): e is ApiError & { failure: RejectedFailure } =>
  e instanceof ApiError &&
  e.failure.kind === ApiFailureKind.Rejected &&
  (code === undefined || e.failure.code === code);

/** Session-bound CSRF token. A module variable, not React state, so the client does not depend on React. */
let csrfToken = '';
export const csrfStore = {
  get: () => csrfToken,
  set: (token: string) => {
    csrfToken = token;
  },
};

let unauthenticatedHandler: (() => void) | null = null;
export function onUnauthenticated(handler: () => void) {
  unauthenticatedHandler = handler;
}

let csrfInvalidHandler: (() => Promise<boolean>) | null = null;
let csrfRecovery: Promise<boolean> | undefined;
/** Refresh credentials once for concurrent rejections; never replay a mutation here. */
export function onCsrfInvalid(handler: (() => Promise<boolean>) | null) {
  csrfInvalidHandler = handler;
}

async function recoverCsrf() {
  if (!csrfInvalidHandler) return false;
  return (csrfRecovery ??= csrfInvalidHandler()
    .catch(() => false)
    .finally(() => {
      csrfRecovery = undefined;
    }));
}

type RequestOptions<T> = {
  method?: HttpMethod;
  body?: unknown;
  schema?: z.ZodType<T>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Session actions own their 401/CSRF recovery (login, logout, discovery). */
  skipAuthRedirect?: boolean;
};

export async function request<T = void>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
  const method = opts.method ?? HttpMethod.Get;
  const signals = [AbortSignal.timeout(opts.timeoutMs ?? 10_000)];
  if (opts.signal) signals.push(opts.signal);
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (method !== HttpMethod.Get) headers['X-CSRF-Token'] = csrfStore.get();
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.body === undefined ? null : JSON.stringify(opts.body),
      signal: AbortSignal.any(signals),
    });
  } catch (error) {
    if (opts.signal?.aborted) throw error; // caller cancelled: not an API outcome
    const timeout = error instanceof DOMException && error.name === 'TimeoutError';
    throw new ApiError({
      kind: ApiFailureKind.Unknown,
      cause: timeout ? UnknownFailureCause.Timeout : UnknownFailureCause.Network,
    });
  }

  if (!response.ok) {
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = undefined;
    }
    const envelope = errorEnvelopeSchema.safeParse(json);
    // Only the JSON error envelope is definitive; anything else (a proxy page, a dropped body) is unknown.
    if (!envelope.success)
      throw new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Malformed });
    const retryAfter = Number(response.headers.get('Retry-After'));
    const { fieldErrors, ...rest } = envelope.data.error;
    const failure: RejectedFailure = {
      kind: ApiFailureKind.Rejected,
      status: response.status,
      ...rest,
    };
    if (fieldErrors) failure.fieldErrors = fieldErrors;
    if (Number.isFinite(retryAfter) && retryAfter > 0) failure.retryAfterSeconds = retryAfter;
    if (response.status === 401 && !opts.skipAuthRedirect) unauthenticatedHandler?.();
    if (failure.code === ErrorCode.CSRF_INVALID && !opts.skipAuthRedirect) {
      const refreshed = await recoverCsrf();
      if (opts.signal?.aborted) throw opts.signal.reason;
      failure.message = refreshed
        ? 'Your session was refreshed. Please try again.'
        : "We couldn't refresh your session. Please try again.";
    }
    throw new ApiError(failure);
  }

  if (response.status === 204 || !opts.schema) return undefined as T;
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Malformed });
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    // Contract drift fails loudly in development.
    console.error('Response did not match schema', path, parsed.error.issues);
    throw new ApiError({ kind: ApiFailureKind.Unknown, cause: UnknownFailureCause.Malformed });
  }
  return parsed.data;
}
