import { ErrorCode } from '@domain/errors.ts';
import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '@/shared/api/endpoints.ts';
import { csrfStore, isRejected } from '@/shared/api/http.ts';
import { qk } from '@/shared/api/keys.ts';
import { navigationBypass } from '@/shared/navigation/bypass.ts';
import { getTransferMonitor } from '@/features/transfers/index.ts';

async function fetchSession(signal?: AbortSignal) {
  const session = await api.session(signal);
  csrfStore.set(session.csrfToken);
  return session;
}

export function useSession() {
  return useQuery(sessionOptions());
}

export const sessionOptions = () =>
  queryOptions({
    queryKey: qk.session,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: Infinity,
    retry: 1,
  });

/** Login route that returns to `returnTo` (a same-app path) after sign-in. */
export const loginPath = (returnTo: string) => `/login?returnTo=${encodeURIComponent(returnTo)}`;

/**
 * Cancels reads, clears cached customer data and the CSRF token. The following navigation
 * unmounts the wizard, discarding its React-local draft and idempotency key (spec §9).
 */
export function clearCustomerData(queryClient: QueryClient) {
  getTransferMonitor(queryClient).stop();
  void queryClient.cancelQueries();
  queryClient.clear();
  csrfStore.set('');
}

/** Logout (spec §9): always clear local data; report when the server could not confirm. */
export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    navigationBypass.active = true;
    getTransferMonitor(queryClient).stop();
    await queryClient.cancelQueries();
    let confirmed = true;
    try {
      await api.logout();
    } catch (err) {
      // A session that has already ended is a confirmed sign-out.
      confirmed = isRejected(err, ErrorCode.SESSION_EXPIRED);
    }
    clearCustomerData(queryClient);
    await navigate('/login', {
      replace: true,
      state: confirmed ? null : { logoutUnconfirmed: true },
    });
    navigationBypass.active = false;
  };
}

/** Accepts only same-app paths (a single leading slash) to prevent open redirects. */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return '/';
  return value;
}
