# Integer money, transfer orders, and asynchronous execution

Status: accepted for implementation, 2026-10-31; revised 2026-11-01 after specification review.

## Context

All accounts hold JPY. Own-account, other-customer, and other-bank transfers must not create or duplicate money across double clicks, client retries, concurrent tabs, lost HTTP responses, slow or unavailable partner banks, and server restarts. External transfers depend on a third-party network whose answer may be late or lost. Customers need to know whether their instruction was accepted separately from whether the money moved.

## Alternatives

- Floating-point balances and independent client updates: concise but vulnerable to rounding and partial-state errors.
- Synchronous transfer in one request (validate, debit, credit, respond): simple for internal transfers, but an external network call inside the request either holds a database transaction open across I/O or loses atomicity, and a timeout leaves the outcome unknown to the client.
- Recording business rejections as Failed transfers: makes history noisy with requests that never became instructions, and blurs "order not accepted" with "transfer did not complete".
- A full double-entry ledger, settlement engine, and reversals: greater fidelity, outside the agreed scope.

## Decision

Store integer yen; amounts accept ASCII digits only. Reject commas, fractions, and other characters rather than round or strip them. Available equals current minus active holds; restrictions are separate.

Separate the **transfer order** from **transfer execution**:

- `POST /api/transfers` validates authoritative state in one SQLite transaction and either rejects (nothing recorded) or creates a Processing order, a transfer hold reserving the amount, a pending source entry, and a customer-scoped idempotency record. It responds `202`.
- An in-process transfer processor executes orders. Internal execution is one transaction that captures the hold and posts linked debit/credit entries. External execution calls the partner network outside any transaction, keyed by the transfer ID, and commits only on a definitive settled/rejected answer. Unknown outcomes are resolved by inquiry, never assumed failed.
- A Failed transfer is an order whose execution failed: its hold is released, its pending entry cancelled, and balances are unchanged.
- The same idempotency key and payload return the original order response; a different payload is rejected. Keys live only in client memory for one review page; cross-refresh recovery is out of scope. A single per-transfer limit is implemented as a policy function, standing in for the customer-dependent limits of a real product.

## Consequences

- Insufficient funds cannot occur during execution because order creation reserves funds; concurrent orders are serialized by SQLite write transactions and verified manually with multiple tabs.
- The client needs a status-tracking endpoint and polling; the UI must present Processing and Delayed states and never show an unknown outcome as Failed.
- The server must resume processing on restart and use conditional state transitions so repeated steps cannot double-post.
- Pending entries transition once to posted or cancelled; posted entries are immutable.
- This is a limited banking model, not a complete double-entry or external-settlement implementation; completed transfers cannot be reversed.

Detailed contract: [spec.md](../spec.md).
