# Demo Banking

A personal banking web app with JPY accounts, searchable activity, own-account / same-bank / other-bank transfers, spending insights, and server-side sessions.

> **Demo Banking is an independent personal banking worksample.**

## Quick start

Prerequisites: **Node.js 24.22.1 or later 24.x** (`.nvmrc`) and npm.

```bash
nvm use            # optional
npm ci
npm run dev        # API on 127.0.0.1:8787 + Vite on http://127.0.0.1:5173
```

Open <http://127.0.0.1:5173> and sign in with **`kenji` / `demo-pass-2026`**.

The first start seeds `data/core.sqlite` and `data/partner-network.sqlite`. Banking data survives restarts; sessions do not, so sign in again after an API restart (including `tsx watch` restarts). Reset is explicit.

## What was built

- **Accounts:** balance summaries, restrictions, account details, and hidden amounts on Home.
- **Activity:** searchable history with URL filters, running balances, entry details, and transfer tracking.
- **Transfers:** a four-step wizard, recipient lookup, safe retries, and session-owned status tracking that updates balances across routes and resumes after reload.
- **Insights:** monthly income/spending, category breakdowns, and a six-month trend.
- **Demo:** seeded data, server-side authentication, failure scenarios, and reset controls.

**Deliberately left out:** multiple currencies, FX, fees, overdrafts, interest; scheduled transfers and saved recipients; refunds and reversals; registration, MFA and idle timeout; CSV export; card/ATM features; production deployment. See [scope](docs/spec.md#1-outcome-and-scope).

## Data model

Customers own accounts and transfer orders. Accounts record activity and holds; available balance is current balance minus active holds. Transfer orders reserve funds, then post activity on completion or release the hold on failure. Money is stored as integer yen. A separate partner store models external banks, recipients, and payments.

Fields, relationships, and the ER diagram live in the [domain model](docs/spec.md#6-domain-model); SQLite constraints and reconciliation are covered in [persistence](docs/technical-design/architecture.md#53-persistence).

## Commands

| Command                                   | Purpose                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                             | Start the API and Vite with demo controls.                                                                                         |
| `npm run typecheck`                       | Typecheck app, server, and tests.                                                                                                  |
| `npm run lint`                            | ESLint and Prettier checks.                                                                                                        |
| `npm run lint:fix`                        | Fix lint issues and format.                                                                                                        |
| `npm run format` / `npm run format:check` | Write / check formatting.                                                                                                          |
| `npm test`                                | Unit, service, HTTP integration, and component tests on temporary databases.                                                       |
| `npx playwright install chromium`         | Install the E2E browser once.                                                                                                      |
| `npm run test:e2e`                        | Build and run browser journeys on port 8788 with isolated `.e2e-data/` databases.                                                  |
| `npm run build` / `npm start`             | Build the SPA, then serve it with the API at <http://127.0.0.1:8787>. Demo controls remain enabled.                                |
| `npm run demo:reset`                      | Restore both stores to fresh fixtures; stop the server first, or use **Demo controls → Reset all data**. Reset signs everyone out. |

Tests leave `data/` untouched. E2E uses one worker and resets its databases before each test. See [testing strategy](docs/technical-design/architecture.md#9-testing-strategy) for coverage and [configuration](docs/technical-design/architecture.md#51-composition-root) for environment variables.

GitHub Actions runs typecheck, lint, unit/integration tests, and the Chromium E2E suite on pushes and pull requests. Failed browser runs upload their traces under `playwright-results`.

## Trying the demo

Kenji has six open accounts (including two restricted accounts) and over 300 activity entries across six months. **Demo controls** (sidebar → Demo, or Menu on mobile) lists example recipients and scenarios for failures, unknown outcomes, recovery, and session expiry.

| Try                                     | Recipient                                |
| --------------------------------------- | ---------------------------------------- |
| Another customer                        | Demo Banking · `5815810` · TANAKA MISAKI |
| Another bank                            | Minato Bank · `4012733` · SUZUKI HARUTO  |
| Manual name after lookup is unavailable | Kita Trust Bank · `2700418` · YAMADA AOI |

### Verifying concurrent tabs (no overspending)

1. Sign in and open **two tabs** at _New transfer_.
2. In both, choose **From: Travel fund**, **To: Own accounts → Everyday**, and note Travel fund's _Available_ amount A.
3. Enter A in each tab and stop on **Review**.
4. Confirm in tab 1, then immediately in tab 2.
5. Expect exactly one order; the second is rejected with _“The amount is more than the available balance”_. Check _Account activity_ filtered to Transfers and Travel fund's balance breakdown.

## Documentation

| Document                                                                                                                                                     | Source of truth for                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| [Specification](docs/spec.md)                                                                                                                                | Product behavior, domain model, API contract, acceptance criteria, and glossary.                    |
| [System architecture](docs/technical-design/system-architecture.md)                                                                                          | Client, banking API, authentication service, core/partner schema diagrams, and communication flows. |
| [Technical design](docs/technical-design/README.md)                                                                                                          | Architecture, module boundaries, and implementation by feature.                                     |
| [Transfer design](docs/technical-design/features/transfers.md)                                                                                               | Order lifecycle, idempotency, processing, retries, and restart recovery.                            |
| [Authentication design](docs/technical-design/features/auth.md)                                                                                              | Sessions, CSRF, ownership checks, and security assumptions.                                         |
| [ADR 0001](docs/adr/0001-server-owned-banking-state.md) · [0002](docs/adr/0002-money-and-transfer-consistency.md) · [0003](docs/adr/0003-server-sessions.md) | Decisions on server-owned state, money consistency, and sessions.                                   |
| [UI design boards](docs/ui-design/canvas/)                                                                                                                   | Visual designs.                                                                                     |

## Known limitations

- Local worksample; production banking security and deployment are outside scope. See [security boundary](docs/spec.md#9-authentication-and-security-boundary).
- Seed dates move with each reset. Early in a month, use the month tabs to see more activity.
- Google Fonts require network access; a system font is used offline.
