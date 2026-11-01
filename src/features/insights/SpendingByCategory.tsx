import { formatMonth } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import table from '@/shared/ui/table.module.css';
import { CATEGORY_LABELS } from '@domain/domain/constants.ts';
import { formatYen } from '@domain/money.ts';
import type { Insights } from '@domain/schemas/api.ts';
import { useState } from 'react';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import styles from './insights.module.css';
import { insightsActivityHref } from './navigation.ts';
import type { InsightsFilters } from './filters.ts';

export function SpendingByCategory({
  filters,
  categories,
  spendingMinor,
}: { filters: InsightsFilters } & Pick<Insights, 'categories' | 'spendingMinor'>) {
  const [showTable, setShowTable] = useState(false);
  const { month } = filters;
  const maxCategory = Math.max(1, ...categories.map((category) => category.amountMinor));
  return (
    <section className={ui.card} aria-labelledby="cat-h">
      <div className={ui.cardHead}>
        <h2 id="cat-h">Spending by category</h2>
        <button
          type="button"
          className={ui.linkBtn}
          aria-pressed={showTable}
          onClick={() => setShowTable((current) => !current)}
        >
          {showTable ? 'Show as bars' : 'Show as table'}
        </button>
      </div>
      <div className={twMerge(ui.cardPad, 'flex flex-col gap-0.5')}>
        {categories.length === 0 && <p className="text-sm text-muted">No spending this month.</p>}
        {!showTable &&
          categories.map((c) => (
            <Link
              key={c.category}
              className={styles.catRow}
              to={insightsActivityHref({ ...filters, cat: c.category })}
              aria-label={`${CATEGORY_LABELS[c.category]}, ${formatYen(c.amountMinor)}, ${((c.amountMinor / Math.max(1, spendingMinor)) * 100).toFixed(1)}% of spending. View activity`}
              title={`${((c.amountMinor / Math.max(1, spendingMinor)) * 100).toFixed(1)}% of spending`}
            >
              <span className="text-sm">{CATEGORY_LABELS[c.category]}</span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={twMerge(styles.bar, 'bg-chart-spending')}
                  style={{ width: `${Math.max(2, (c.amountMinor / maxCategory) * 100)}%` }}
                />
              </span>
              <span className="text-right text-sm tabular-nums">{formatYen(c.amountMinor)}</span>
            </Link>
          ))}
        {showTable && categories.length > 0 && (
          <div className={ui.tableWrap}>
            <table className={table.table}>
              <caption className="sr-only">Spending by category, {formatMonth(month)}</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" className={table.r}>
                    Amount
                  </th>
                  <th scope="col" className={table.r}>
                    Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category}>
                    <td>
                      <Link to={insightsActivityHref({ ...filters, cat: c.category })}>
                        {CATEGORY_LABELS[c.category]}
                      </Link>
                    </td>
                    <td className={twMerge(table.r, 'tabular-nums')}>{formatYen(c.amountMinor)}</td>
                    <td className={twMerge(table.r, 'tabular-nums')}>
                      {((c.amountMinor / Math.max(1, spendingMinor)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
