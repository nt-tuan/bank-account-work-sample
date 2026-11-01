import { ErrorCode } from '../../shared/errors.ts';
import { type Category, ActivityKind } from '../../shared/domain/enums.ts';
import type { Database } from '../persistence/sqlite.ts';
import type { Insights } from '../../shared/schemas/api.ts';
import { JST_OFFSET_MS, jstMonthRange, monthsEndingAt } from '../../shared/time.ts';
import { findOwnedOpenAccount } from './accounts.ts';
import { reject } from './errors.ts';

/** Posted income and purchase entries only; transfers and pending/cancelled entries are excluded (spec §4, Insights). */
export function createInsightsService(db: Database) {
  return {
    get(customerId: string, month: string, accountId?: string): Insights {
      return db.read((q) => {
        if (accountId && !findOwnedOpenAccount(q, customerId, accountId))
          throw reject(ErrorCode.NOT_FOUND);
        const months = monthsEndingAt(month, 6);
        const { fromMs: trendFrom } = jstMonthRange(months[0]!);
        const { fromMs, toMs } = jstMonthRange(month);
        const scope = `FROM activity e JOIN accounts acc ON acc.id = e.account_id
          WHERE acc.customer_id = :customerId AND acc.lifecycle = 'open' AND e.status = 'posted'
            AND e.kind IN ('income', 'purchase') ${accountId ? 'AND e.account_id = :accountId' : ''}`;
        const base = accountId ? { customerId, accountId } : { customerId };

        const trendRows = q.all<{
          month: string;
          kind: ActivityKind.Income | ActivityKind.Purchase;
          total: number;
        }>(
          `SELECT strftime('%Y-%m', (e.posted_at + :offset) / 1000, 'unixepoch') AS month, e.kind, SUM(e.amount_minor) AS total
           ${scope} AND e.posted_at >= :from AND e.posted_at < :to GROUP BY month, e.kind`,
          { ...base, offset: JST_OFFSET_MS, from: trendFrom, to: toMs },
        );
        const trend = months.map((m) => ({
          month: m,
          incomeMinor:
            trendRows.find((r) => r.month === m && r.kind === ActivityKind.Income)?.total ?? 0,
          spendingMinor:
            trendRows.find((r) => r.month === m && r.kind === ActivityKind.Purchase)?.total ?? 0,
        }));
        const categories = q.all<{ category: Category; total: number }>(
          `SELECT e.category, SUM(e.amount_minor) AS total ${scope} AND e.kind = 'purchase' AND e.posted_at >= :from AND e.posted_at < :to
           GROUP BY e.category ORDER BY total DESC, e.category`,
          { ...base, from: fromMs, to: toMs },
        );
        const current = trend[trend.length - 1]!;
        return {
          month,
          accountId: accountId ?? null,
          incomeMinor: current.incomeMinor,
          spendingMinor: current.spendingMinor,
          categories: categories.map((c) => ({ category: c.category, amountMinor: c.total })),
          trend,
        };
      });
    },
  };
}
