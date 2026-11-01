# Account activity — technical design

Part of the [technical design](../README.md).

## 1. Scope

The monthly, searchable and filterable activity list with server-computed running balances, Activity Details, and transfer tracking inside Account activity, which replaces separate transfer history and transfer detail pages (spec §4 _Account activity_, _Categories_, _Transfer tracking in Account activity_; AC-03, AC-04). Transfer execution and the Transfer Details section are described in [Transfers](transfers.md).

## 2. Code map

| Side   | Module                                                  | Responsibility                                                                                                                           |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Server | `server/banking/activity.ts`                            | `list` (filters, running balance, paging), `get` (entry + hold + transfer), `resolvePeriod`, `resolveDateRange`, `nextActivitySequence`. |
| Server | `server/serializers.ts`                                 | `serializeActivity`, `serializeActivityDetail` (owned vs. other customers' transfers).                                                   |
| Client | `src/features/activity/filters.ts`                      | The URL query model (`activityModel`), `parseActivityFilters`, `hasActiveFilters`.                                                       |
| Client | `useActivityController`                                 | Page-wide state: URL filters, custom-range visibility, Clear filters.                                                                    |
| Client | `ActivityFilters`                                       | Search, account/direction/status/transfer status/category/sort selects, removable chips; owns the accounts query.                        |
| Client | `RangeFilters`, `RangeForm`                             | Month tabs, or the custom range form with local validation.                                                                              |
| Client | `ActivityResults`                                       | The list query, loading/error/empty states, table and mobile rows, pagination; synchronization comes from the session transfer monitor.  |
| Client | `useActivityDetailController`, `ActivitySummarySection` | Activity Details: the entry query, display clock, announcements, focus and manual monitor checks.                                        |
| Client | `navigation.ts` (`activityBackTo`)                      | Back destination that restores the list URL.                                                                                             |
| Client | `queries.ts`                                            | `activityListOptions`, `recentActivityOptions` (exported for Home), `activityDetailOptions` (`staleTime: 0`).                            |
| Pages  | `ActivityPage`, `ActivityDetailPage`                    | Compose the blocks; Activity Details adds `TransferDetailsSection` for transfer entries.                                                 |

## 3. API

`GET /api/activity` — query: `accountId?`, `month` **or** `from`+`to` (inclusive JST dates), `q?`, `direction?`, `status?`, `transferStatus?`, `category?`, `sort=asc|desc`, `page`, `pageSize` (default 20, max 100). Malformed values are `400 VALIDATION_ERROR`. Response: `{ items, page, pageSize, total, runningBalance }`; each entry has the account (name, masked number), kind, direction, amount, status, description, counterparty, category, `occurredAt`/`postedAt`/`cancelledAt`/`effectiveAt`, `runningBalanceMinor` (single account, posted entries only), `transferReference`, and `transferId`/`transferStatus`/`transferDelayedSince` for orders owned by the viewer only.

`GET /api/activity/:id` — the entry plus `hold: { kind, state } | null` and `transfer: { id, status, reference, counterparty, details } | null`. For an owned order `details` is the full `Transfer`; for an incoming transfer from another customer `id`, `status` and `details` are null and the counterparty carries only the sender's name snapshot. `404` for entries on closed or other customers' accounts.

## 4. Design

### Period and filters (server)

- `resolvePeriod` turns `month` or `from/to` into a half-open UTC interval through `shared/time.ts`; `month` defaults to the current JST month; supplying both is a validation error. `resolveDateRange` validates an inclusive range (both dates, valid ISO dates, `to ≥ from`) and is shared with `GET /api/transfers`.
- Filtering uses the stored `effective_at` (`posted_at` for posted entries, `occurred_at` otherwise). Only the customer's open accounts are visible; a single `accountId` must be an owned open account (`404` otherwise).
- Search lowercases the trimmed term and matches with `instr(lower(…))` over description, counterparty, transfer reference and transfer ID. `instr` avoids `LIKE` wildcard escaping for user input.
- `transferStatus` additionally requires `t.customer_id = :customerId`, so it selects only the viewer's own orders. Order metadata columns are projected only when the order's owner is the account's owner.
- Ordering is `effective_at` then `sequence`, both in the requested direction, so ties are stable. A separate `COUNT(*)` over the same `WHERE` returns `total`.

### Running balance

When one account is selected, a CTE computes the running balance over the complete posted ledger before any filter applies, and the list joins it:

```sql
WITH ledger AS (
  SELECT e.id, acc2.opening_balance_minor
         + SUM(CASE e.direction WHEN 'credit' THEN e.amount_minor ELSE -e.amount_minor END)
           OVER (ORDER BY e.posted_at, e.sequence ROWS UNBOUNDED PRECEDING) AS running_balance_minor
  FROM activity e JOIN accounts acc2 ON acc2.id = e.account_id
  WHERE e.account_id = :accountId AND e.status = 'posted')
SELECT …, ledger.running_balance_minor FROM activity a … LEFT JOIN ledger ON ledger.id = a.id WHERE …
```

Search, date range, other filters, sort and paging therefore never distort the balance. Pending and cancelled entries show none; the all-accounts view omits the CTE and returns `runningBalance: false`.

### URL state (client)

`activityModel` defines `account`, `month`, `from`, `to`, `q` (trimmed, max 200), `dir`, `status`, `transferStatus`, `cat`, `sort` (default `desc`), `page` (default 1). Invalid values fall back individually; a valid `from/to` pair replaces `month`; any change except paging resets `page` to 1; unknown parameters are dropped. Examples:

```text
/activity?account=acc_…&month=2026-10&q=coffee&dir=debit&status=posted&cat=dining&sort=asc&page=2
/activity?from=2026-10-01&to=2026-10-15
/activity?cat=transfer&transferStatus=processing
```

- **Search** (`shared/ui/SearchBox`) keeps local input, trims it and writes `q` after 300 ms with `replace`, and re-syncs when `q` changes through back/forward.
- **Month tabs** show the six months ending with the current one; the current month is the default and is omitted from the URL.
- **Custom range** is edited in `RangeForm`'s local state; it is written to the URL only when both dates are present and `to ≥ from`, so an invalid range never issues a query. An applied range always opens its panel; blank draft visibility is tied to the current history entry. The form is keyed by the applied dates, so Back/Forward restores the inputs as well as the query.
- **Chips** are derived from the parsed filters (which covers Insights drill-down links); each removes its parameter. **Clear filters** resets every filter and closes the range form.

### Results

- `ActivityResults` keeps the list mounted across search-parameter changes and uses `keepPreviousData`, so previous results stay visible while fetching with Updating feedback and a summary based on those displayed results. If a server response puts the requested page beyond the last page, it replaces the URL page with the last valid one while preserving filters; page 1 is used for zero results. Invalid-page rows are hidden while the correction loads.
- States are distinct: skeleton (first load), error with Retry, **No activity in <month>** (no active filters) and **No matching results** with Clear filters (active filters).
- From 810 px the list is a semantic `<table>`; below it, labeled rows. Both show date/time, description/counterparty, account (all-accounts view), signed amount, category, entry status and, for owned transfers, the transfer status (with **Delayed** when `transferDelayedSince` is set). The running-balance column appears only for a single account.
- Each row links to `/activity/:id` with `state.backTo` set to the current list URL; `activityBackTo` accepts only `/activity…` values, so Back restores filters and page.
- `ActivityResults` has no polling or outcome-refresh hook. The session transfer monitor discovers pending orders independently, also observes Processing IDs in successful cache reads, and invalidates activity queries on terminal outcomes. Filtering or leaving this page cannot stop transfer tracking; see [Transfers](transfers.md#session-owned-transfer-tracking).

### Activity Details

- `ActivityDetailPage` renders **Activity Summary** (description, signed amount, account, type/direction, category, counterparty, activity status with hold or cancellation notes, timestamps, Activity ID) and, for transfer entries, **Transfer Details** ([Transfers](transfers.md)). Activity status and Transfer status are labeled separately.
- `useActivityDetailController` reads the entry and its embedded transfer together; the session monitor refreshes this query when the transfer changes. The controller only owns presentation and delegates Check again to the monitor; see [Transfers §4](transfers.md#status-tracking-on-activity-details). It focuses the Transfer status heading after a just-created order and on any terminal change, and announces Completed/Failed through the live region.
- Both entries of an own-account transfer show the same order, each with its own signed amount.

### Legacy transfer URLs

`/transfers` redirects to `/activity?cat=transfer`. `/transfers/:id` (`LegacyTransferRedirect`) reads `GET /api/transfers/:id` and redirects with `replace` to `/activity/:sourceActivityId`, or to `/activity?cat=transfer` when `sourceActivityId` is null (the source account is no longer accessible). An unknown or other customer's order renders the not-found view.

## 5. Errors and edge cases

| Situation                                    | Result                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Hand-edited invalid URL parameter            | That parameter falls back to its default; the page renders.                       |
| Incomplete or reversed custom range          | Field errors in the form; no request.                                             |
| Unknown or inaccessible account in `account` | `404` from the API; error state with Retry.                                       |
| Background refetch fails                     | Previous results stay visible.                                                    |
| Incoming transfer from another customer      | Sender's name snapshot and reference only; no transfer ID, status or detail link. |
| Early in a month                             | The default view is short; month tabs reach earlier months.                       |

## 6. Design choices

- **One browsing destination.** Account activity owns transaction browsing and transfer tracking; a separate transfer history page would duplicate filters and blur ledger state (Pending/Posted/Cancelled) with order state (Processing/Completed/Failed), which are shown side by side instead.
- **One detail destination.** Activity Details embeds Transfer Details, and one response carries both the entry and its order, so they are always consistent.
- **Default to the current JST month, newest first.** Follows the reference's monthly view while putting recent activity first; earlier months are one tab away.
- **Search includes the transfer ID**, because customers quote the reference number (`TRF-…`).
- **Running balance on the server only**, computed over the full ledger, so the client never derives a balance from a filtered page.

## 7. Tests

- `server/banking/transfers.test.ts` (_read models_): running balances under any filter or sort (AC-04); case-insensitive search over descriptions, counterparties and references; owned transfer tracking including failed and delayed outcomes; closed and other-customer resources hidden.
- `tests/integration/http.test.ts`: malformed list queries rejected; incoming transfers redact order details; both own-account entries consistent with the embedded order.
- `src/features/activity/filters.test.ts`, `src/shared/routing/*.test.ts`: URL model parsing, normalization and page reset.
- `src/app/pages/ActivityPage.test.tsx`: loading, error, empty and no-match states, previous results during paging, chips, custom-date Back/Forward restoration, invalid-page replacement and recovery after a shared refresh shrinks the result count; the page does not own polling.
- `src/features/activity/useActivityDetailController.test.tsx`, `src/app/pages/DetailPages.test.tsx`: shared monitor updates across display-clock renders, slower background tracking and Check again, announcements, two sections, redacted incoming transfers.
- `tests/e2e/journeys.spec.ts`, `activity-details.spec.ts`: filters in the URL survive reload and lead to an addressable detail; Processing → Completed without reload; hold links and legacy redirect at each viewport.
