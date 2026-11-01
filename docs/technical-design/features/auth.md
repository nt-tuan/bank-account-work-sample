# Authentication — technical design

Part of the [technical design](../README.md). Decision record: [ADR 0003](../../adr/0003-server-sessions.md).

## 1. Scope

Login, protected routes, server sessions with an absolute expiry, CSRF protection, logout with revocation, and returning to login whenever a session ends (spec §9, AC-14). Protected React routes are a UX layer; authorization is enforced by the server on every request.

## 2. Code map

| Side   | Module                                                               | Responsibility                                                                                                       |
| ------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Server | `server/auth/sessions.ts`                                            | `SessionStore` (in-memory `Map`), rotation at login, absolute expiry, `csrfMatches`.                                 |
| Server | `server/auth/password.ts`, `service.ts`                              | scrypt hashing (`scrypt$N$r$p$salt$hash`), credential verification with a dummy hash.                                |
| Server | `server/http/middleware.ts` (`sessionGuard`)                         | Origin → authentication → CSRF token, for every `/api/*` request.                                                    |
| Server | `server/http/routes/session.ts`, `context.ts`                        | Session discovery, login, logout; cookie name and options.                                                           |
| Client | `src/features/auth/session.ts`                                       | `useSession`, `fetchSession` (stores the CSRF token), `useLogout`, `clearCustomerData`, `loginPath`, `safeReturnTo`. |
| Client | `src/features/auth/useLoginController.ts`, `app/pages/LoginPage.tsx` | Login form, sign-in errors, logout-unconfirmed banner with retry, demo credentials note.                             |
| Client | `src/app/ProtectedLayout.tsx`, `src/app/providers.tsx`               | Route guard; the global 401 handler.                                                                                 |

## 3. API

| Endpoint                   | Contract                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/session`         | Open. Returns `{ authenticated, customer, csrfToken, expiresAt, transferLimit, demoControls }`; creates a pre-login session when there is no valid cookie.       |
| `POST /api/session/login`  | Open, but requires Origin and the pre-login CSRF token. Generic `401 INVALID_CREDENTIALS` on failure; on success rotates the session and returns the same shape. |
| `POST /api/session/logout` | `204`; destroys the server session and expires the cookie.                                                                                                       |

## 4. Design

### Sessions and cookies

- Session IDs and CSRF tokens are 32 random bytes (base64url). A session holds `customerId` (null before login), `csrfToken`, `createdAt`, `expiresAt` and `pendingScenario` (demo controls). No last-activity time is kept, because there is no idle timeout.
- A pre-login session lives one hour. Login deletes it and issues a new ID and CSRF token (session-fixation defense) with `expiresAt = now + 8 h`. `get()` deletes and ignores an expired session; reads never extend it.
- Cookie: `__Host-session` with `Secure` when `COOKIE_MODE=secure` (the default in production), otherwise `demo-session` without `Secure`. Both are `HttpOnly; SameSite=Lax; Path=/`, host-only. Production configuration refuses the insecure mode.
- Credentials are verified against the scrypt hash with a constant-time compare; an unknown username is checked against a dummy hash so response time does not reveal whether it exists.
- Sessions live in server memory: a restart or `tsx watch` reload signs everyone out while banking data persists.

### Guard order

`sessionGuard` checks, for every `/api/*` request:

1. **Origin** (mutations only): must be one of `APP_ORIGIN` → else `403 CSRF_INVALID`. It needs no session, so a cross-site request learns nothing.
2. **Authentication** (everything except `GET /api/session` and `POST /api/session/login`): an authenticated session → else `401 SESSION_EXPIRED`.
3. **CSRF token** (mutations only): `X-CSRF-Token` equals the session's token, constant-time → else `403 CSRF_INVALID`. Login uses the pre-login session's token.

Authentication runs before the token check so that a request whose session has ended is reported as `401` and the client returns to login. If the token were checked first, the same request would fail as `403` with nothing to compare against, the review step would show a generic "could not be verified" error, and a logout after expiry would look unconfirmed. The statuses therefore have one meaning each: `401` = no live session → login; `403` = a live session's request failed verification → reload and retry. Turning `CSRF_INVALID` into a `401` was rejected because it would sign out a customer whose session is still valid. The order is safe because a request without a live session cannot change anything, and Origin still runs first.

### Client session

- `useSession()` is the `['session']` query (`staleTime: Infinity`, one retry). `fetchSession` stores the CSRF token in `csrfStore` for the HTTP client.
- `ProtectedLayout` shows the shell skeleton while the session is pending, an error with Try again when discovery fails, and redirects anonymous visitors to `loginPath(path + search)`.
- `LoginPage` accepts only a same-app `returnTo` (`safeReturnTo`). After login it navigates there with `replace`; it never resumes a money operation. A `403 CSRF_INVALID` at login (an expired pre-login session) refetches the session and asks the customer to try again.

The application composition root installs the transfer monitor once. Its session subscription starts pending-order discovery after authenticated session confirmation; login/reload restores tracking independently of the active route. See [Transfers](transfers.md#session-owned-transfer-tracking).

### Ending a session

- **Global 401** (`providers.tsx`): the HTTP client calls the registered handler on any `401` except login and discovery. The handler runs once at a time: `clearCustomerData`, invalidate the session, and navigate to `/login?returnTo=…` with `replace`, bypassing the wizard's leave prompt.
- **Logout** (`useLogout`): set the navigation bypass, stop the transfer monitor, cancel queries, `POST /api/session/logout`, then always `clearCustomerData`. A `401 SESSION_EXPIRED` answer counts as confirmed, because the session is already gone. Navigate to `/login` with no state on confirmation or, if the server could not confirm, `{ logoutUnconfirmed: true }`; the login page then shows "We couldn't confirm sign-out with the server" with **Retry sign-out**, which first fetches a fresh session and CSRF token. While `logoutUnconfirmed` is present in the login history state, an authenticated discovery response does not redirect back into the app; the customer can retry sign-out or explicitly sign in.
- `clearCustomerData` first stops the session transfer monitor (aborting its requests and clearing timers/IDs), then cancels in-flight queries, clears the query cache and blanks the CSRF token. Navigation then unmounts the protected tree, discarding the wizard's React-local draft, review snapshot and idempotency key. There is no draft persistence or callback registry.

## 5. Errors and edge cases

| Situation                                   | Result                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Wrong username or password                  | `401 INVALID_CREDENTIALS`, one generic message; the login form stays.       |
| Mutation from another origin                | `403 CSRF_INVALID`, before the session is consulted.                        |
| Any request after expiry, logout or restart | `401 SESSION_EXPIRED` → global handler → login with `returnTo`.             |
| Live session, stale or missing CSRF token   | `403 CSRF_INVALID`; the client keeps the session and asks to reload.        |
| Logout cannot reach the server              | Local data cleared; login page reports the unconfirmed sign-out with retry. |

## 6. Design choices

- **Opaque server sessions instead of browser-stored tokens** (ADR 0003): immediate revocation, nothing credential-like readable by JavaScript.
- **Absolute expiry only.** The brief asks for login, protected routes and token handling; an idle timeout, expiry warnings and keep-alive are out of scope (spec §1).
- **Demo credentials on the login page.** When demo controls are enabled, the page shows the fixture username and the shared password `demo-pass-2026`, so the demo is usable without reading the source.
- **`APP_ORIGIN` is a list** and defaults to both `127.0.0.1` and `localhost`, so opening the app through either host does not fail the Origin check.

## 7. Tests

- `tests/integration/http.test.ts` (_sessions and authorization_): HttpOnly/SameSite cookie, rotation at login and rejection of the pre-login cookie; generic credential error; missing CSRF tokens and foreign origins on every mutation including login; an ended session reported as `401` while foreign origins are still rejected first; cross-customer and closed resources as `404`; revocation at logout and at absolute expiry (fake clock); production refuses the insecure cookie mode.
- `tests/e2e/journeys.spec.ts`: protected routes redirect to login and return after sign-in; logout revokes the session; a dropped logout request stays on login (including after reload), shows the unconfirmed warning and can be retried against the still-live server session.
