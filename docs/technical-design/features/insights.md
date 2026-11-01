# Insights — technical design

Part of the [technical design](../README.md).

## 1. Scope

Monthly income and spending, spending by category, and a six-month income/spending trend for all open accounts or one account, with accessible table equivalents and drill-down into Account activity (spec §4 _Insights_; AC-13).

## 2. Code map

| Side   | Module                                                            | Responsibility                                                                      |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Server | `server/banking/insights.ts`                                      | Aggregates posted `income` and `purchase` entries by JST month and category.        |
| Client | `src/features/insights/filters.ts`                                | URL query model (`month`, `account`), `parseInsightsFilters`, `useInsightsFilters`. |
| Client | `queries.ts`                                                      | `insightsOptions` keyed by `{ month, accountId }`.                                  |
| Client | `InsightsFilters`                                                 | Month select (last 12 months) and account select; owns the accounts query.          |
| Client | `InsightsResults`                                                 | The insights query, loading/error/empty states for the selected filters.            |
| Client | `InsightsStatistics`, `SpendingByCategory`, `IncomeSpendingTrend` | Totals, category bars or table, trend bars plus table.                              |
| Client | `navigation.ts` (`insightsActivityHref`)                          | Drill-down links into Account activity.                                             |
| Page   | `InsightsPage`                                                    | Reads the URL filters and composes filters and results.                             |

## 3. API

`GET /api/insights?month=YYYY-MM&accountId?` → `{ month, accountId, incomeMinor, spendingMinor, categories: [{ category, amountMinor }], trend: [{ month, incomeMinor, spendingMinor }] }`. Categories are ordered by amount, then name; the trend has six months ending at `month`, zero-filled. An inaccessible `accountId` is `404`.

## 4. Design

### Aggregation

- Scope: the customer's open accounts (or the one owned open account), `status = 'posted'`, `kind IN ('income', 'purchase')`. Transfers, including transfers to other people, and pending or cancelled entries are excluded.
- Months are bucketed by `posted_at` shifted by the fixed JST offset: `strftime('%Y-%m', (posted_at + 9h) / 1000, 'unixepoch')`. The trend query covers the six-month window in one `GROUP BY month, kind`; the categories query covers the selected month's purchases.
- The selected month's income and spending come from the last trend bucket, so the headline figures and the trend always agree; category totals sum to spending.

### Client

- `insightsModel`: `month` (default: the current JST month, evaluated at use time so it rolls over), optional `account`; unknown URL parameters are preserved.
- The month select lists the last 12 months; the trend always shows the six months ending at the selection.
- Charts are HTML/CSS bars whose lengths are inline percentages of the largest value; the bar elements are decorative (`aria-hidden`). Spending by category toggles between bars and a captioned table (**Show as table** / **Show as bars**, `aria-pressed`); the trend renders its bars and an adjacent captioned table.
- Income is blue and spending orange (`chart-income`/`chart-spending` tokens), a pair chosen to stay distinguishable with color-vision deficiencies; labels and the legend carry the meaning, not color.
- Every category bar and trend month links to `/activity` with `status=posted`, the `month`, `cat` for a category, and `account` when insights are filtered to one account. Account activity shows these as removable chips.
- `InsightsResults` shows a skeleton while an uncached month/account selection loads; previous amounts and drill-downs are not relabeled with the new filters. Data cached for the same selection may remain visible during a background refresh. Errors offer Retry, including a warning when a refresh fails with cached data. Empty months are announced ("No posted income or spending in …") in a `role="status"` region.

## 5. Errors and edge cases

| Situation                    | Result                                                      |
| ---------------------------- | ----------------------------------------------------------- |
| Month with no posted entries | Zero totals, an announced empty message, zero-filled trend. |
| Invalid `month` in the URL   | Falls back to the current JST month.                        |
| Account no longer accessible | `404`; error state with Retry.                              |
| Pending card authorization   | Not counted until it posts.                                 |

## 6. Design choices

- **Posted entries only, by posting date.** Insights reconcile with the ledger; Account activity's effective date matches for posted entries, so drill-down shows exactly the counted entries.
- **No chart library.** Two simple bar charts do not justify a dependency; HTML/CSS keeps them themable with the same tokens and accessible with real tables.
- **A bounded month choice** (last 12 months) keeps the select short; the seed covers six months.

## 7. Tests

- `server/banking/transfers.test.ts` (_read models_): insights use posted income and purchases only and reconcile to activity (AC-13).
- `src/features/insights/filters.test.ts`: default month at use time, URL parsing and updates.
- `src/app/pages/InsightsPage.test.tsx`: loading, error, empty month, no previous amounts or drill-downs while switching to an uncached month, drill-down links including the account.
- `tests/e2e/journeys.spec.ts`: axe on Insights; no horizontal overflow at each width.
