# Server-owned banking state with a SQLite mock API and partner network

Status: accepted for implementation, 2026-10-31; revised 2026-11-01 after specification review.

## Context

The brief permits mocks but requires consistent balances/activity and a deliberate data layer. The approved scope adds persistent transfer orders with asynchronous execution, transfers to other banks through a third-party API, concurrent-request safety, real HttpOnly sessions, and authorization beyond React. Components must not become the banking database, and the core must not reach into a third party's data.

## Alternatives

- Component fixtures or a global browser store: simple, but weak service boundaries and no independent authorization.
- MSW with browser persistence: useful HTTP simulation, but client-controlled storage and cookie behavior cannot demonstrate a real server security boundary or background processing.
- Modeling other banks' accounts as rows in the core database: fewer moving parts, but hides the third-party boundary, its different data shape, and its failure modes.
- A production backend with separate identity/payment services: realistic operationally, disproportionate to this frontend worksample.

## Decision

Use one small local Node core API backed by SQLite. The server owns banking state, policy, and a transfer processor; the React application caches typed API results through TanStack Query. Form state stays local and list filters stay in the URL.

Implement the partner network as a separate module in the same process, with its own SQLite store and a deliberately different data shape. The core reaches it only through a `PartnerBankGateway` adapter that translates partner codes into domain outcomes; a lint import rule enforces the boundary. A separate network listener was considered and rejected as extra operational weight for the demo.

Require Node 24 LTS at or above 24.22.1, the latest security release at decision time, with npm. Use built-in `node:sqlite` behind a persistence interface; its release-candidate status in this runtime is an explicit local-demo trade-off. Serve browser/API under one origin, using Vite proxying during development. No external infrastructure is required.

## Consequences

- Balances, activity, idempotency records, and processing transfers survive refresh and restart; in-memory sessions do not.
- A real API boundary supports authorization, transactional validation, and integration tests with temporary databases; the gateway interface lets tests replace the partner with a fake.
- The server must implement schema/seed/reset behavior for two stores and document development cookie configuration.
- Synchronous SQLite is sufficient for this local workload; production scaling and the driver's API stability are not claims of this worksample.
- Client caches can become stale across tabs; server validation remains authoritative and focus refetch restores freshness. Financial balances are not optimistically updated.

Detailed contract: [spec.md](../spec.md).
