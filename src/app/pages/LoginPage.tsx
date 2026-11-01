import { ActionStatus } from '@/shared/ui/action-status.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { IconAlertCircle, IconInfo } from '@/shared/ui/icons.tsx';
import { Logo } from '@/shared/ui/primitives.tsx';
import { Navigate } from 'react-router';
import { useLoginController } from '@/features/auth/useLoginController.ts';

const code = 'rounded-[3px] bg-white px-1.5 py-px font-mono text-xs';

export function LoginPage() {
  const {
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
  } = useLoginController();
  if (session.data?.authenticated && !state.logoutUnconfirmed)
    return <Navigate to={returnTo} replace />;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-topbar items-center bg-chrome px-6 text-on-chrome">
        <span role="img" aria-label="Demo Banking">
          <Logo />
        </span>
      </header>
      <main className="flex flex-auto justify-center px-4 py-16 max-md:px-3 max-md:py-8">
        <div className="flex w-full max-w-110 flex-col gap-5">
          <h1 ref={headingRef} tabIndex={-1} className="text-center text-2xl">
            Sign in
          </h1>
          {state.logoutUnconfirmed && logoutRetry !== ActionStatus.Ok && (
            <p className="text-center text-sm text-warn" role="alert">
              We couldn't confirm sign-out with the server. Your data was cleared from this screen.{' '}
              <button type="button" className={ui.linkBtnInline} onClick={retryLogout}>
                Retry sign-out
              </button>
              {logoutRetry === ActionStatus.Failed && ' Still not confirmed.'}
            </p>
          )}
          {logoutRetry === ActionStatus.Ok && (
            <p className="text-center text-sm text-ok" role="status">
              Signed out.
            </p>
          )}
          <form
            className={twMerge(ui.card, 'flex flex-col gap-5 p-8 max-md:px-4 max-md:py-5')}
            onSubmit={submit}
            noValidate
            aria-describedby={error ? 'login-error' : undefined}
          >
            {error && (
              <p id="login-error" className={ui.formError} role="alert">
                <IconAlertCircle size={16} />
                {error}
              </p>
            )}
            <div className={ui.field}>
              <label className={ui.label} htmlFor="username">
                Username
              </label>
              <input
                className={ui.input}
                id="username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.label} htmlFor="password">
                Password
              </label>
              <input
                className={ui.input}
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className={twMerge(ui.btnPrimary, 'w-full')} type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {session.data?.demoControls && (
            <div className={ui.note}>
              <IconInfo size={18} />
              <p>
                Demo credentials — username <code className={code}>kenji</code>, password{' '}
                <code className={code}>demo-pass-2026</code>.
              </p>
            </div>
          )}
          <p className="text-center text-xs text-muted">
            Demo Banking is an independent personal banking worksample.
          </p>
        </div>
      </main>
    </div>
  );
}
