import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/api/endpoints.ts';
import { csrfStore } from '@/shared/api/http.ts';
import { qk } from '@/shared/api/keys.ts';
import type { Session } from '@domain/schemas/api.ts';
import { refreshSessionForCustomer } from './session.ts';

vi.mock('@/shared/api/endpoints.ts', () => ({ api: { session: vi.fn() } }));
const original: Session = {
  authenticated: true,
  customer: { id: 'kenji', displayName: 'Kenji' },
  csrfToken: 'old',
  expiresAt: null,
  transferLimit: { minMinor: 1, maxMinor: 1_000_000 },
  demoControls: true,
};
const clients: QueryClient[] = [];
function clientWithSession() {
  const client = new QueryClient();
  client.setQueryData(qk.session, original);
  clients.push(client);
  csrfStore.set('old');
  return client;
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  csrfStore.set('');
  vi.clearAllMocks();
});

describe('refreshSessionForCustomer', () => {
  it('updates credentials for the same customer without clearing their cached data', async () => {
    const client = clientWithSession();
    client.setQueryData(qk.accounts.all, ['cached-account']);
    vi.mocked(api.session).mockResolvedValue({ ...original, csrfToken: 'new' });
    expect(await refreshSessionForCustomer(client)).toBe(true);
    expect(csrfStore.get()).toBe('new');
    expect(client.getQueryData(qk.session)).toMatchObject({ csrfToken: 'new' });
    expect(client.getQueryData(qk.accounts.all)).toEqual(['cached-account']);
  });

  it.each([
    { ...original, authenticated: false, customer: null },
    { ...original, customer: { id: 'different-customer', displayName: 'Other' } },
  ])(
    'refuses to attach an existing draft to an ended or different session: $authenticated',
    async (next) => {
      const client = clientWithSession();
      vi.mocked(api.session).mockResolvedValue({ ...next, csrfToken: 'new' });
      expect(await refreshSessionForCustomer(client)).toBe(false);
      expect(csrfStore.get()).toBe('old');
      expect(client.getQueryData(qk.session)).toEqual(original);
    },
  );

  it('ignores a late refresh after logout or a newer login', async () => {
    const client = clientWithSession();
    let finish!: (value: Session) => void;
    vi.mocked(api.session).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const recovery = refreshSessionForCustomer(client);
    client.clear();
    const newer = { ...original, csrfToken: 'newer-login' };
    client.setQueryData(qk.session, newer);
    csrfStore.set(newer.csrfToken);
    finish({ ...original, csrfToken: 'late' });
    expect(await recovery).toBeUndefined();
    expect(client.getQueryData(qk.session)).toEqual(newer);
    expect(csrfStore.get()).toBe('newer-login');
  });
});
