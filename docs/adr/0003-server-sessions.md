# Server sessions for the first-party demo application

Status: accepted for implementation, 2026-10-31; revised 2026-11-01 after specification review.

## Context

The worksample includes login, protected routes, logout, session expiry, and a money-moving API. React route guards and client-stored tokens cannot establish the required server authorization boundary. JWT describes a token format; it does not determine safe transport or storage.

## Alternatives

- Browser-only simulated login: adequate for a UI-only prototype, but cannot demonstrate server-side ownership checks or HttpOnly session issuance.
- JWT bearer tokens persisted in localStorage: JavaScript-readable credentials and unnecessary token/revocation complexity for a same-origin demo.
- Direct OAuth with Authorization Code/PKCE or a full BFF/identity-provider deployment: appropriate for other integration contexts, unnecessary external infrastructure here.

## Decision

Issue an opaque random session ID in a host-only HttpOnly cookie. Keep sessions and session-bound CSRF tokens in server memory. Validate session, ownership, Origin, and mutation CSRF on the server. Rotate at login; logout destroys the server session. Enforce an 8-hour absolute timeout on the server. An idle (inactivity) timeout is out of scope because the brief asks for login, protected routes, and token handling; a production banking session would add one.

The HTTPS contract uses Secure, SameSite=Lax, Path=/, and the `__Host-` prefix. Loopback HTTP development uses a documented unprefixed cookie with Secure disabled; production configuration must reject that mode. Do not store credentials/tokens in browser storage. Restart clears sessions while retaining the banking database.

## Consequences

- Logout can immediately revoke access; refresh restores an unexpired session without exposing its ID to JavaScript.
- The API needs pre-login CSRF bootstrap, session rotation, expiry, ownership checks, and clear 401 behavior. Client redirects alone are insufficient.
- SameSite supplements CSRF protection. HttpOnly limits credential reading but does not prevent XSS from performing authenticated actions.
- The demo does not implement production MFA, fraud controls, identity federation, or banking compliance. These limits are explicit.

Sources: [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [IETF browser application guidance](https://www.rfc-editor.org/rfc/rfc10017.html).

Detailed contract: [spec.md](../spec.md).
