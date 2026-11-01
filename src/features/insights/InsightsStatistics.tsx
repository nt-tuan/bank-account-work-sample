import { formatMonth } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { Money } from '@/shared/ui/primitives.tsx';
import type { Insights } from '@domain/schemas/api.ts';
import styles from './insights.module.css';

export function InsightsStatistics({
  month,
  incomeMinor,
  spendingMinor,
}: Pick<Insights, 'month' | 'incomeMinor' | 'spendingMinor'>) {
  return (
    <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
      <div
        className={twMerge(
          ui.card,
          'flex flex-wrap items-baseline justify-between gap-4 px-6 py-5',
        )}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <span className={twMerge(styles.swatch, 'bg-chart-income')} aria-hidden="true" />
          Income · {formatMonth(month)}
        </span>
        <Money minor={incomeMinor} className={ui.amountHero} />
      </div>
      <div
        className={twMerge(
          ui.card,
          'flex flex-wrap items-baseline justify-between gap-4 px-6 py-5',
        )}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <span className={twMerge(styles.swatch, 'bg-chart-spending')} aria-hidden="true" />
          Spending · {formatMonth(month)}
        </span>
        <Money minor={spendingMinor} className={ui.amountHero} />
      </div>
    </div>
  );
}
