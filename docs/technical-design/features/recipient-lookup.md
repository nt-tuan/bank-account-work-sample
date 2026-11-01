# Recipient lookup — technical design

Part of the [technical design](../README.md).

## 1. Scope

Filling in the registered holder name for a bank and account number so the customer can confirm the recipient before ordering a transfer; manual name entry when the name cannot be displayed; and a per-customer limit on lookups that do not lead to a transfer (spec §4 _Recipient lookup_; AC-11). The name is verified only at execution ([Transfers](transfers.md)).

## 2. Code map

| Side   | Module                                                    | Responsibility                                                                                             |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Server | `server/http/routes/recipients.ts`                        | `POST /api/recipients/lookup`; consumes the `lookup_unavailable` demo scenario.                            |
| Server | `server/banking/lookup.ts`                                | Validation, the limit, host-bank resolution or partner inquiry, counting.                                  |
| Server | `server/partner-gateway/network-gateway.ts`               | `inquire`: partner result → `found`/`not_found`/`cannot_receive`/`unavailable`.                            |
| Client | `src/features/transfers/lookup/useRecipientLookup.ts`     | Explicitly triggered lookup over a disabled React Query cache entry; stale-result protection.              |
| Client | `src/features/transfers/wizard/useRecipientController.ts` | Destination-local interaction: triggers, writing accepted name/source into the form, focus, announcements. |
| Client | `DestinationStep.tsx`, `RecipientNameField.tsx`           | Bank → Account number → Recipient name; loading, read-only and manual modes; outcome messages.             |

## 3. API

`POST /api/recipients/lookup` with `{ bankId, accountNumber }` → `{ outcome, holderName, bank: { id, code, name }, maskedNumber }`, where `outcome` is `found | not_found | cannot_receive | unavailable` and `holderName` is set only for `found`. No balance, account type, restriction reason or customer ID is ever returned. `429 LOOKUP_RATE_LIMITED` with `Retry-After` when limited; `400 VALIDATION_ERROR` for a malformed number or unknown bank. Authenticated and CSRF-protected like every mutation; request bodies are not logged; account numbers in logged paths are redacted.

## 4. Design

### Server

1. Validate the account number with `parseAccountNumber` and the bank with `findBank`.
2. **Reserve quota atomically**: in one `BEGIN IMMEDIATE` transaction, read the customer's `lookup_events` within the last 60 minutes. With 10 or more, reject with `429` and `Retry-After = ceil((oldest counted + 60 min − now) / 1000)`; otherwise insert one event before awaiting the partner. In-flight requests therefore consume quota too.
3. Resolve:
   - `lookup_unavailable` scenario → `unavailable`;
   - host bank → look up the account by number: none → `not_found`; `!accountUsability(account).canReceive` (closed or restricted, indistinguishable) → `cannot_receive`; otherwise `found` with the holder name. The customer's own accounts are found like any other;
   - partner bank → `gateway.inquire` (5 s timeout; failure or an `inquiry_available = 0` bank → `unavailable`).
4. Return the result; no further quota write is needed.

Every valid lookup attempt counts from its reservation time, including in-flight requests and unavailable outcomes; a `429` or validation failure does not. Order creation deletes the customer's events in its transaction, which resets the count. Events live in SQLite keyed by customer, so neither re-login nor a restart resets the limit. Server-side resolution during order creation and execution does not count.

### Client lookup lifecycle

```text
idle ──(account number blur with bank + 7 digits | bank change with a valid number | Next | Retry)──▶ loading
loading ──▶ found | not_found | cannot_receive | unavailable | rate_limited
any ──(bank or account number edited)──▶ idle   (clears the form's name and source)
```

- `useRecipientLookup` observes a **disabled** query keyed `['recipient-lookup', bankId, accountNumber]` (`staleTime: Infinity`, 5-minute `gcTime`, no retry, no mount/focus/reconnect refetch). Only `run()` fetches; `run(true)` (Retry) bypasses a cached result. Timeout or network failure maps to `unavailable`; `LOOKUP_RATE_LIMITED` maps to `rate_limited`.
- Stale results are rejected twice over: a request ID inside the hook, and in the controller a generation counter plus checks that the step is still mounted, the kind is still "Someone else" and the bank and number are unchanged. Only then does it write the form, announce, or run a deferred focus. Unmount cancels the query and clears the focus timer.
- While loading, the recipient fieldset and Next are disabled and the form has `aria-busy="true"`; a spinner sits next to the name field.
- **found**: write `recipientName` and `recipientNameSource = 'lookup'` (only when they differ, so an unchanged review snapshot and key survive), clear the name error, render the name read-only with "Name registered at the bank", announce, focus Next. A found name replaces anything typed.
- **unavailable / rate_limited**: enable manual entry with the warning that a name that doesn't match will make the transfer fail, focus the name. Next validates it with `parseRecipientName` and records `'manual'`. Unavailable also offers Retry.
- **not_found / cannot_receive**: clear any accepted name and source and block Next.
- **Remount** (returning from Amount or Review): the accepted name and source in the form restore read-only or manual mode even after the cache entry is gone. A cached result can restore the status, but cannot replace an accepted manual name, and the source is never inferred from a non-empty name.

## 5. Errors and edge cases

| Situation                                         | Result                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| Typing in the account number                      | No request per keystroke; a lookup runs on blur.                    |
| Bank changed after a lookup                       | Name and source cleared; a new lookup runs if the number is valid.  |
| 11th lookup without an order within an hour       | `rate_limited`: manual entry; own-account transfers are unaffected. |
| Lookup unavailable, then a correct manual name    | Order created; the partner verifies the name; Completed.            |
| Lookup unavailable, then a wrong manual name      | Order created; Failed `RECIPIENT_NAME_MISMATCH`; hold released.     |
| Late response after the customer edited the input | Discarded; nothing is written or announced.                         |

## 6. Design choices

- **Existence is disclosed by design.** Like Japanese banks, the lookup confirms that an account exists; the protections are authentication, minimal disclosure and the limit on lookups without a transfer.
- **Count every valid lookup attempt**, regardless of outcome, so probing with invalid numbers is limited as well; a rejected (`429`) call does not count.
- **Own accounts follow the normal `found` flow**; order creation classifies the destination as `own`. A separate outcome would add a state without helping the customer.
- **Accepted data lives in the form, not the cache**, so it survives step unmounts and cache eviction, and background cache activity can never overwrite a manual name or change the idempotency key.
- **Session-memory cache only**: inactive lookup entries can survive wizard navigation for up to the 5-minute garbage-collection period; logout/reset clears them. Results are never persisted or authoritative; order creation re-resolves on the server.

## 7. Tests

- `server/banking/transfers.test.ts` (_recipient lookup limit_): limit without an order, reset on order creation, only the outcome disclosed for unusable accounts.
- `tests/integration/http.test.ts`: `429` with `Retry-After` once the limit is reached; concurrent partner requests respect the same quota; an order resets the quota; partner names through the gateway; unavailable inquiry banks.
- `src/features/transfers/lookup/useRecipientLookup.test.tsx`: explicit triggers only, cache keyed by bank and number, forced retry, stale results ignored.
- `src/features/transfers/wizard/NewTransferPage.test.tsx`: lookup on blur not per keystroke, found name replaces a typed name, manual entry across remounts, edits invalidate the result.
- `tests/e2e/journeys.spec.ts`: external transfer with a looked-up name; wrong manual name fails at execution.
