import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@domain/errors.ts';
import { csrfStore, HttpMethod, onCsrfInvalid, request } from './http.ts';

afterEach(() => {
  onCsrfInvalid(null);
  csrfStore.set('');
  vi.unstubAllGlobals();
});

describe('CSRF recovery', () => {
  it('coalesces concurrent refreshes without replaying either mutation', async () => {
    let finish!: (value: boolean) => void;
    const refresh = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    onCsrfInvalid(refresh);
    csrfStore.set('old-token');
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: { code: ErrorCode.CSRF_INVALID, message: 'Old token' },
        },
        { status: 403 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const first = request('/api/transfers', { method: HttpMethod.Post });
    const second = request('/api/recipients/lookup', { method: HttpMethod.Post });
    // Attach rejection handlers before allowing either request to complete.
    const results = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    csrfStore.set('new-token');
    finish(true);
    for (const result of await results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({
          failure: {
            code: ErrorCode.CSRF_INVALID,
            message: 'Your session was refreshed. Please try again.',
          },
        });
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ headers: { 'X-CSRF-Token': 'old-token' } });
  });

  it('allows a new recovery after a failed refresh, still without replay', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    onCsrfInvalid(refresh);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: { code: ErrorCode.CSRF_INVALID, message: 'Old token' },
        },
        { status: 403 },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(request('/api/transfers', { method: HttpMethod.Post })).rejects.toMatchObject({
      failure: { message: "We couldn't refresh your session. Please try again." },
    });
    await expect(request('/api/transfers', { method: HttpMethod.Post })).rejects.toMatchObject({
      failure: { message: 'Your session was refreshed. Please try again.' },
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
