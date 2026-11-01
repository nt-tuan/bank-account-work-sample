# Accounts — technical design

Part of the [technical design](../README.md).

## 1. Scope

Home (balance summary, account cards, recent activity), Account information (all accessible accounts) and Account detail (identity, balance breakdown, holds, restriction explanation), plus the Home-only hidden-amounts preference (spec §4 _Home and accounts_, _Hide/show amounts_; AC-01, AC-02, AC-12).

## 2. Code map

| Side   | Module                                                               | Responsibility                                                                                     |
| ------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Server | `server/banking/accounts.ts`                                         | `list`, `get` (with active holds), `banks`; `findOwnedOpenAccount`, `findBank`, `ACCOUNT_SQL`.     |
| Server | `server/serializers.ts`                                              | `serializeAccountSummary`/`Detail`: available = current − held, derived usability, masked number.  |
| Client | `src/features/accounts/queries.ts`                                   | `accountsOptions`, `accountDetailOptions`, `banksOptions` (`staleTime: Infinity`) and their hooks. |
| Client | `AccountsOverview`, `BalancePanel`, `AccountsSection`                | Home accounts block: one query, totals, refresh, transfer shortcut, account cards.                 |
| Client | `RecentActivitySection`                                              | Home's five newest entries of the current JST month (its own query from `features/activity`).      |
| Client | `useAccountDetailController`, `AccountInformation`, `AccountBalance` | Account detail: copy number, balance breakdown, holds grouped by kind.                             |
| Client | `src/shared/amounts/visibility.ts`                                   | The hidden-amounts preference and Home's toggle.                                                   |
| Client | `src/shared/ui/primitives.tsx` (`Money`)                             | Renders every monetary value; renders the placeholder when `hidden`.                               |
| Pages  | `HomePage`, `AccountsPage`, `AccountDetailPage`                      | Compose the blocks.                                                                                |

## 3. API

| Endpoint                | Contract                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/accounts`     | `{ items: AccountSummary[] }` — owned open accounts, Active first, then by account number. Each has `currentMinor`, `heldMinor`, `availableMinor`, `status`, `restrictionReason`, `canSend`, `canReceive`, `maskedNumber`, `bank`. |
| `GET /api/accounts/:id` | `AccountDetail` = summary + full `accountNumber`, `holderName`, `currency`, active `holds[]` (kind, amount, activity ID and description, transfer ID). `404 NOT_FOUND` for closed, other customers' and unknown IDs alike.         |
| `GET /api/banks`        | Host bank first, then partner banks by name.                                                                                                                                                                                       |

## 4. Design

### Balances and usability

Current balance is stored; held is the denormalized sum of active holds; available is computed in the serializer. Usability comes from `accountUsability()` and is never stored. A restricted account keeps its real balance and activity; it is excluded from sending and receiving, not from viewing. Closed accounts never reach a serializer (`serializeAccountSummary` throws for them).

### Home

- `HomePage` calls `useAmountsHidden` directly and composes `AccountsOverview` and `RecentActivitySection`. Both start their requests immediately; their pending, error and retry states are independent.
- `AccountsOverview` owns the accounts query: skeleton while pending, error with Retry when there is no data, otherwise `BalancePanel`, the **Make a transfer** shortcut (between the summary and the list) and `AccountsSection`.
- `BalancePanel` shows Total available across open accounts (the hero figure), Total current and On hold. When some accounts are restricted, a note states how much of the total sits in restricted accounts and can't be transferred, so restricted money is never presented as transferable. Refresh refetches both accounts and the current recent-activity query. `BalancePanel` owns a 300 ms minimum feedback timer and stays disabled until the refresh and timer settle. The timestamp is the query's `dataUpdatedAt`; a failed background refresh keeps the previous data and says "Couldn't refresh. Showing the last update, …".
- `AccountsSection` lists each account with name, type, masked number, status (text + icon), restriction reason, available balance, and the on-hold amount when there is one.
- `RecentActivitySection` requests `GET /api/activity?month=<current JST month>&pageSize=5`, links each entry to its detail and links to Account activity. It does not poll or manage transfer outcomes. The session transfer monitor refreshes accounts/activity after order creation and settlement, including when only Account information or Account detail is mounted; see [Transfers](transfers.md#session-owned-transfer-tracking).

### Account information and detail

- `AccountsPage` renders the accounts query as a table linking to each detail.
- `AccountDetailPage` shows Available prominently with Current and On hold. Holds are split into merchant authorizations and processing transfers; each links directly to its activity entry. The full account number has a **Copy** action using `navigator.clipboard.writeText`, with Copied/Retry feedback in a fixed-width slot so the row height does not change.
- A restricted account explains why transfer controls are unavailable; an Active account offers **Make a transfer**, which opens the wizard with `?from=<accountId>`.

### Hidden amounts (Home only)

- The preference is a module-level value persisted in `localStorage` under `demo-banking:hide-amounts`, read with `useSyncExternalStore` and synchronized across tabs through the `storage` event. A failed storage read defaults to shown; failed writes keep the toggle working in memory. Both are wrapped in `try/catch`. It is the only browser-storage value and survives logout as a device preference.
- The toggle is an icon button in the Home balance panel with `aria-pressed` and the accessible name "Hide amounts"/"Show amounts".
- On Home, every monetary value is masked: totals, account balances, recent activity amounts; the on-hold line is not rendered while hidden. Every other page, including the transfer wizard, ignores the preference.
- `<Money hidden>` renders `¥ ••••••` (aria-hidden) plus a visually hidden "Amount hidden" instead of the number, so the value is absent from the DOM, accessible names and the copy buffer. CSS blur is not used.

## 5. Errors and edge cases

| Situation                                      | Result                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Accounts request fails with no cached data     | Home/Accounts show an error with Retry; recent activity is unaffected. |
| Background refresh fails                       | Previous data stays; the panel reports the failed refresh.             |
| Closed, other customer's or unknown account ID | Neutral not-found view (`404`), identical for all three.               |
| Clipboard unavailable                          | Copy shows Retry with an explanatory title.                            |
| Storage unavailable (private mode, blocked)    | Amounts shown; the toggle works in memory for the session.             |

## 6. Design choices

- **Hidden amounts apply to Home only.** Opening the app lands on Home, so its balances are what a bystander sees without the customer choosing anything. Every other page is reached by deliberate navigation, where the customer expects amounts; a global-looking topbar toggle affecting one page would mislead.
- **Account order:** Active accounts first, then by account number, so usable money comes first.
- **Separate queries on Home.** The accounts block and recent activity fail and retry independently, so a slow activity query never hides balances.
- **Never optimistic.** Balances change only from server responses; the transfer flow invalidates accounts after an order and after a terminal status ([Transfers](transfers.md)).

## 7. Tests

- `src/app/pages/HomePage.test.tsx`: both resources start immediately; each block fails and retries independently; a failed refresh keeps account data and its timestamp; explicit Refresh refetches both resources; shared cache refreshes update both blocks without Home owning polling; amount visibility is shared by both blocks.
- `src/features/accounts/BalancePanel.test.tsx`: the 300 ms minimum refresh feedback, slow and rejected refreshes.
- `src/shared/ui/Money.test.tsx`: signed en-US yen; the real value is absent from the DOM when hidden.
- `src/app/pages/DetailPages.test.tsx`: account information, copy action and holds; a restricted account disables transfers; copy failure is announced.
- `server/banking/transfers.test.ts` (_read models_): closed and other-customer resources are hidden.
- `tests/e2e/journeys.spec.ts`: six accounts with status; hiding amounts removes the numbers from Home's DOM while account detail still shows them; restricted account explanation; copy keeps the row height; leaving a Processing transfer for Home still updates activity and balances.
- `tests/e2e/transfer-monitor.spec.ts`: a pending transfer updates a balance-only account page after immediate navigation or full reload.
