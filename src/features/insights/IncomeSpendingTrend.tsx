import { formatMonth, formatMonthShort } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import table from '@/shared/ui/table.module.css';
import { formatYen } from '@domain/money.ts';
import type { Insights } from '@domain/schemas/api.ts';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import styles from './insights.module.css';
import { insightsActivityHref } from './navigation.ts';
import type { InsightsFilters } from './filters.ts';

export function IncomeSpendingTrend({
  filters,
  trend,
}: { filters: InsightsFilters } & Pick<Insights, 'trend'>) {
  const { month } = filters;
  const maxTrend = Math.max(
    1,
    ...trend.flatMap((entry) => [entry.incomeMinor, entry.spendingMinor]),
  );
  return (
    <section className={ui.card} aria-labelledby="trend-h">
      <div className={ui.cardHead}>
        <h2 id="trend-h">Six-month trend</h2>
        <span className="flex gap-4 text-sm">
          <span className="inline-flex items-center gap-2">
            <span className={twMerge(styles.swatch, 'bg-chart-income')} aria-hidden="true" />
            Income
          </span>
          <span className="inline-flex items-center gap-2">
            <span className={twMerge(styles.swatch, 'bg-chart-spending')} aria-hidden="true" />
            Spending
          </span>
        </span>
      </div>
      <div className={ui.cardBody}>
        <div className={styles.chart} aria-hidden="true">
          {trend.map((t) => (
            <div
              key={t.month}
              className={twMerge(styles.month, t.month === month ? styles.selected : '')}
              title={`${formatMonth(t.month)} — Income ${formatYen(t.incomeMinor)}, Spending ${formatYen(t.spendingMinor)}`}
            >
              <span
                className={twMerge(styles.vbar, 'bg-chart-income')}
                style={{ height: `${(t.incomeMinor / maxTrend) * 100}%` }}
              />
              <span
                className={twMerge(styles.vbar, 'bg-chart-spending')}
                style={{ height: `${(t.spendingMinor / maxTrend) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className={styles.monthLabels}>
          {trend.map((t) => (
            <Link
              key={t.month}
              to={insightsActivityHref({ ...filters, month: t.month })}
              className={twMerge(
                'text-sm tabular-nums',
                t.month === month ? 'font-semibold' : 'font-normal',
              )}
              aria-label={`View posted activity for ${formatMonth(t.month)}`}
            >
              {formatMonthShort(t.month)}
            </Link>
          ))}
        </div>
        <div className={ui.tableWrap}>
          <table className={table.table}>
            <caption className="pb-1.5 text-left text-xs text-muted">
              Income and spending by month
            </caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className={table.r}>
                  Income
                </th>
                <th scope="col" className={table.r}>
                  Spending
                </th>
              </tr>
            </thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.month}>
                  <td>{formatMonth(t.month)}</td>
                  <td className={twMerge(table.r, 'tabular-nums')}>{formatYen(t.incomeMinor)}</td>
                  <td className={twMerge(table.r, 'tabular-nums')}>{formatYen(t.spendingMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
