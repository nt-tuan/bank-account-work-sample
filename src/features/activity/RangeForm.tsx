import { formatDate } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { useState } from 'react';

export function RangeForm({
  initialFrom,
  initialTo,
  onApply,
  onCancel,
}: {
  initialFrom: string;
  initialTo: string;
  onApply: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  const apply = () => {
    const e: { from?: string; to?: string } = {};
    if (!from) e.from = 'Enter a start date.';
    if (!to) e.to = 'Enter an end date.';
    if (from && to && to < from) e.to = '“To” must be on or after “From”.';
    setErrors(e);
    // An invalid range never issues a query (spec §4).
    if (!e.from && !e.to) onApply(from, to);
  };
  return (
    <div
      className={twMerge(ui.card, 'flex flex-wrap items-start gap-4 px-6 py-5')}
      role="group"
      aria-labelledby="range-h"
    >
      <h2 id="range-h" className="w-full text-sm font-medium">
        Custom date range (JST, inclusive)
      </h2>
      <div className={twMerge(ui.field, 'w-50')}>
        <label className={ui.label} htmlFor="r-from">
          From
        </label>
        <input
          id="r-from"
          className={twMerge(ui.input, 'tabular-nums')}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-invalid={Boolean(errors.from)}
          aria-describedby={errors.from ? 'r-from-e' : undefined}
        />
        {errors.from && (
          <span id="r-from-e" className="text-sm text-bad">
            {errors.from}
          </span>
        )}
      </div>
      <div className={twMerge(ui.field, 'w-50')}>
        <label className={ui.label} htmlFor="r-to">
          To
        </label>
        <input
          id="r-to"
          className={twMerge(ui.input, 'tabular-nums')}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-invalid={Boolean(errors.to)}
          aria-describedby={errors.to ? 'r-to-e' : undefined}
        />
        {errors.to && (
          <span id="r-to-e" className="text-sm text-bad">
            {errors.to}
          </span>
        )}
      </div>
      <p className="flex min-h-touch items-center gap-4 self-end text-sm">
        <button type="button" className={ui.linkBtn} onClick={apply}>
          Apply range
        </button>
        <button type="button" className={ui.linkBtn} onClick={onCancel}>
          Back to months
        </button>
      </p>
      {initialFrom && (
        <p className="w-full text-xs text-muted">
          Showing {formatDate(`${initialFrom}T00:00:00+09:00`)} –{' '}
          {formatDate(`${initialTo}T00:00:00+09:00`)}
        </p>
      )}
    </div>
  );
}
