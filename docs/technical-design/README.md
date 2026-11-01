# Demo Banking — Technical Design

This folder explains **how** the [specification](../spec.md) is implemented. The specification is the source of truth for behavior (the "what"); these documents describe the code as it is: module boundaries, interfaces, data layout, algorithms and the reasons behind them. References such as _spec §7_ point to the specification.

| Document                                         | Covers                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Architecture](architecture.md)                  | Goals, technology, repository layout and import boundaries, server composition, HTTP pipeline, persistence, frontend shell, styling, testing. |
| [System architecture](system-architecture.md)    | Runtime/component diagram, authentication and transfer sequences, core/partner database schemas, transaction and trust boundaries.            |
| [Authentication](features/auth.md)               | Sessions, CSRF, login, logout, protected routes, expiry, global 401 handling.                                                                 |
| [Accounts](features/accounts.md)                 | Home, account information, account detail, holds, hidden amounts.                                                                             |
| [Account activity](features/activity.md)         | Activity list, URL filters, search, running balance, Activity Details, transfer tracking in the list.                                         |
| [Transfers](features/transfers.md)               | Order creation, idempotency, transfer processor, partner gateway and network, transfer wizard, submission, status tracking.                   |
| [Recipient lookup](features/recipient-lookup.md) | Lookup endpoint, lookup limit, the Destination step's lookup lifecycle.                                                                       |
| [Insights](features/insights.md)                 | Monthly income/spending, categories, six-month trend, drill-down.                                                                             |
| [Demo controls](features/demo-controls.md)       | Seeded scenarios, scenario effects, session expiry, in-app and CLI reset.                                                                     |

Recorded architecture decisions (brief deliverable): [ADR 0001](../adr/0001-server-owned-banking-state.md) · [ADR 0002](../adr/0002-money-and-transfer-consistency.md) · [ADR 0003](../adr/0003-server-sessions.md).

## How the feature documents are organized

Every feature document uses the same sections, so the same question is answered in the same place:

1. **Scope** — what the feature does and the spec sections it implements.
2. **Code map** — the server and client modules that own it.
3. **API** — the endpoints it uses and their notable contracts.
4. **Design** — data, state ownership and algorithms.
5. **Errors and edge cases** — definitive rejections, unknown outcomes, empty states.
6. **Design choices** — the non-obvious choices and why they were made.
7. **Tests** — where the behavior is verified.
