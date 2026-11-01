import { ui, twMerge } from '@/shared/ui/classes.ts';
import { Money } from '@/shared/ui/primitives.tsx';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AccountSummary } from '@domain/schemas/api.ts';
import type { TransferValues } from './types.ts';

export function SourceSummary({
  accounts,
  onChange,
}: {
  accounts: AccountSummary[];
  onChange: () => void;
}) {
  const { control } = useFormContext<TransferValues>();
  const sourceId = useWatch({ control, name: 'sourceAccountId' });
  const source = accounts.find((account) => account.id === sourceId);
  if (!source) return null;
  return (
    <div
      className={twMerge(ui.card, 'flex flex-wrap items-center justify-between gap-3 px-5 py-3')}
    >
      <span className="text-sm">
        <span className="text-muted">From</span>&nbsp;&nbsp;{source.name} ·{' '}
        <span className="tabular-nums">{source.maskedNumber}</span>&nbsp;&nbsp;
        <span className="text-muted">
          Available <Money minor={source.availableMinor} />
        </span>
      </span>
      <button type="button" className={ui.linkBtn} onClick={onChange}>
        Change
      </button>
    </div>
  );
}
