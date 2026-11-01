# Demo controls — technical design

Part of the [technical design](../README.md).

## 1. Scope

Deterministic, presenter-selected scenarios that reproduce order rejections, transport failures, execution failures and account changes during processing; example recipients; demo session expiry; and full data reset, in the app and from the command line (spec §12; AC-10, AC-15). Demo controls are enabled in `npm run dev`, `npm start` and tests, and disabled with `DEMO_CONTROLS=false` or `NODE_ENV=production`.

## 2. Code map

| Side   | Module                                                             | Responsibility                                                                                       |
| ------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Shared | `shared/domain/constants.ts` (`DEMO_SCENARIOS`)                    | Scenario IDs, labels and descriptions shown in the panel.                                            |
| Server | `server/demo/catalog.ts`                                           | Credentials, scenarios, example recipients (mirroring the fixtures), the pending scenario.           |
| Server | `server/demo/scenarios.ts`                                         | `consumesOnOrder`, `ScenarioEffects` (execution hooks, delays, lookup counter), `PartnerFaultAdmin`. |
| Server | `server/http/routes/demo.ts`, `context.ts`                         | Demo endpoints; `takeScenario`/`restoreScenario` used by the transfer, lookup and read routes.       |
| Server | `server/app.ts` (`reset`, `partnerFaultAdmin`)                     | In-app reset; translation of demo faults into partner codes.                                         |
| Server | `scripts/demo-reset.ts`, `server/lock.ts`                          | CLI reset guarded by the server's PID lock file.                                                     |
| Client | `src/features/demo/` (`DemoControls`, `useDemoControlsController`) | The Demo dialog: recipients, scenario select, expire session, reset with confirmation.               |

The panel opens from the sidebar's Demo entry, or from Menu on mobile, and is labeled Demo throughout. It is outside the normal transfer decision path.

## 3. API

All endpoints answer `403 DEMO_DISABLED` when demo controls are off, and require a session, Origin and CSRF like every other mutation.

| Endpoint                        | Contract                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/demo/catalog`         | `{ credentials, scenarios, recipients, pendingScenario }`.                                                                                         |
| `POST /api/demo/scenario`       | `{ scenario: id \| null }` → sets (or clears) this session's pending scenario; returns the catalog. `lookup_limit` is applied immediately instead. |
| `POST /api/demo/expire-session` | Destroys the current session and expires the cookie (`204`).                                                                                       |
| `POST /api/demo/reset`          | Body `{ confirm: true }`; restores all data, revokes every session, expires the cookie (`204`).                                                    |

## 4. Design

### Scenario lifecycle

- A scenario is stored on the **session** as `pendingScenario`; it is not a global toggle.
- It is consumed by the first applicable request:
  - **order scenarios** by `POST /api/transfers`, and only when the created order's destination kind matches (`consumesOnOrder`): recipient closure applies to internal and external transfers, own-destination restriction to own-account transfers, partner scenarios to external transfers;
  - `lookup_unavailable` by the next lookup;
  - `read_failure` by the next data read (accounts, activity, transfers list, insights), which returns `503 SERVICE_UNAVAILABLE`.
- A request rejected before anything was created, a replay of an existing order, or an order of another destination kind leaves the scenario pending (`restoreScenario`), so the presenter can fix the input and retry.
- The consumed order scenario is recorded on the transfer (`demo_scenario`), so asynchronous execution stays deterministic across restarts.

### Effects

| Scenario                                   | Mechanism                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_response_lost`                     | The route commits the order, then destroys the socket; the client sees a network error, retries with the same key and gets a replay.                                                                    |
| `create_response_slow`                     | The committed response is delayed 12 s, beyond the 10 s client timeout; the retry replays.                                                                                                              |
| `execution_slow`                           | First execution attempt scheduled after 8 s instead of 1.5 s.                                                                                                                                           |
| `execution_failure`                        | `injectFailure` → Failed `PROCESSING_FAILED`.                                                                                                                                                           |
| `destination_closed_during_processing`     | Internal: `beforeExecute` closes the destination account (a real, persistent change) → `DESTINATION_UNAVAILABLE`. External: a partner "account closed" fault for that payment → `DESTINATION_REJECTED`. |
| `destination_restricted_during_processing` | `beforeExecute` restricts the own destination → `DESTINATION_UNAVAILABLE`.                                                                                                                              |
| `source_restricted_during_processing`      | `beforeExecute` restricts the source → `SOURCE_UNAVAILABLE`.                                                                                                                                            |
| `partner_reject`                           | Partner "account closed" fault → `DESTINATION_REJECTED`.                                                                                                                                                |
| `partner_timeout_settled`                  | The partner records the payment, then answers after the gateway timeout; the next inquiry finds it settled.                                                                                             |
| `partner_not_received`                     | The partner loses the first submission; the inquiry returns `not_received` and the processor resubmits.                                                                                                 |
| `partner_outage`                           | The partner refuses calls for that payment for 3 minutes from order creation; the transfer becomes Delayed, then completes.                                                                             |
| `lookup_unavailable`                       | The next lookup returns `unavailable`; the order is created normally and the partner verifies the manual name at execution.                                                                             |
| `lookup_limit`                             | Fills the customer's lookup counter to the limit at once.                                                                                                                                               |
| `read_failure`                             | The next data read returns `503`.                                                                                                                                                                       |

`ScenarioEffects` implements the processor's `ExecutionHooks`; core banking code never branches on scenario names. Partner faults are per payment (keyed by the transfer ID), so other demo transfers keep working during an outage. The demo module describes faults in its own vocabulary (`delayAfterCommitMs`, `dropFirstSubmit`, `outageUntil`, `rejectAccountClosed`); `server/app.ts` translates them into the partner module's fault policy.

### Reset and expiry

- **In-app reset** (`reset()` in `server/app.ts`): `processor.stop()` (waits for the in-flight step) → clear partner faults → reset the partner store and reseed both stores from the fixtures with a new seed anchor → `sessions.revokeAll()` → `processor.start()`. The client then clears customer data and returns to login.
- **CLI reset** (`npm run demo:reset`): refuses while a live server holds `data/server.lock` (PID plus liveness check; a stale lock is ignored), explaining how to stop the server or use the in-app reset. Otherwise it builds the server against the data directory, resets, and fails if `reconcile()` reports a problem.
- **Expire session**: destroys the current session; the client clears customer data and shows login with the expired notice.

### Example recipients

The catalog lists recipients that exercise every lookup and execution path: another customer (Demo Banking `5815810`), restricted and closed internal accounts, one of the customer's own accounts entered as a recipient, partner accounts that are active, closed, frozen or missing (Minato Bank), a 30-character holder name (Sakura Partner Bank `3107777`), and a bank whose lookup is unavailable (Kita Trust Bank `2700418`).

## 5. Errors and edge cases

| Situation                                                               | Result                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Demo controls disabled                                                  | Every demo endpoint `403 DEMO_DISABLED`; the panel is hidden. |
| Order scenario selected, then an own transfer that it does not apply to | The scenario stays pending for the next applicable order.     |
| Reset fails                                                             | The panel says so and offers Try again; the session is kept.  |
| CLI reset while the server runs                                         | Exits with an explanation; nothing changes.                   |

## 6. Design choices

- **Consume on the first applicable request**, so a client retry of `create_response_lost`/`create_response_slow` is a plain replay and `lookup_unavailable` affects only the next lookup.
- **Real state, not mocked returns.** Account changes during processing are persistent operator-style updates, and partner faults create real states in the partner store (for example a recorded payment whose response was lost).
- **`lookup_limit` applies immediately** ("counter set to the limit") rather than waiting for a request.
- **The CLI refuses while the server runs**, because sessions and the processor live in the server process.

## 7. Tests

- `tests/integration/http.test.ts` (_demo transfer scenarios_, _persistence, restart and reset_): recipient closure kept pending for own accounts then failing an internal transfer; recipient closure failing an external transfer; scenario kept pending on replay; demo reset restores fixtures and revokes every session; read failure applied once.
- `tests/e2e/journeys.spec.ts`: recipient closure before submit; a lost order response creates exactly one order. E2E resets data through `POST /api/demo/reset` before each test.
