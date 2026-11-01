import { ActionStatus } from '@/shared/ui/action-status.ts';
import { ErrorCode } from '@domain/errors.ts';
import { api } from '@/shared/api/endpoints.ts';
import { csrfStore, isRejected } from '@/shared/api/http.ts';
import { qk } from '@/shared/api/keys.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { sessionOptions, safeReturnTo, useSession } from './session.ts';

export function useLoginController() {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const state = (location.state ?? {}) as { logoutUnconfirmed?: boolean };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [logoutRetry, setLogoutRetry] = useState<ActionStatus>(ActionStatus.Idle);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError('Enter your username and password.');
      return;
    }
    setPending(true);
    try {
      if (!csrfStore.get()) await queryClient.query({ ...sessionOptions(), staleTime: 0 });
      const next = await api.login({ username, password });
      csrfStore.set(next.csrfToken);
      queryClient.setQueryData(qk.session, next);
      // Never resumes a money operation: only a safe local route is restored (spec §9).
      await navigate(returnTo, { replace: true });
    } catch (err) {
      if (isRejected(err, ErrorCode.INVALID_CREDENTIALS))
        setError('The username or password is incorrect.');
      else if (isRejected(err, ErrorCode.CSRF_INVALID)) {
        await queryClient.invalidateQueries({ queryKey: qk.session });
        setError('Your sign-in page expired. Please try again.');
      } else setError("We couldn't sign you in. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };
  const retryLogout = async () => {
    try {
      await queryClient.query({ ...sessionOptions(), staleTime: 0 });
      await api.logout();
      setLogoutRetry(ActionStatus.Ok);
    } catch (err) {
      setLogoutRetry(
        isRejected(err, ErrorCode.SESSION_EXPIRED) ? ActionStatus.Ok : ActionStatus.Failed,
      );
    }
    await queryClient.invalidateQueries({ queryKey: qk.session });
  };
  return {
    session,
    returnTo,
    state,
    username,
    setUsername,
    password,
    setPassword,
    error,
    pending,
    logoutRetry,
    headingRef,
    submit,
    retryLogout,
  };
}
