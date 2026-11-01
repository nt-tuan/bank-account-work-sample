import { formatDateTime } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import { IconEye, IconEyeOff, IconLock, IconRefresh } from '@/shared/ui/icons.tsx';
import { Money } from '@/shared/ui/primitives.tsx';
import { sumMinor } from '@domain/money.ts';
import styles from './accounts.module.css';
import { AccountUsabilityStatus } from '@domain/domain/enums.ts';
import type { AccountSummary } from '@domain/schemas/api.ts';
import { useState } from 'react';

type BalancePanelProps = {
  accounts: AccountSummary[];
  hidden: boolean;
  onToggle: () => void;
  updatedAt: number;
  refreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => Promise<unknown>;
};

export function BalancePanel(props: BalancePanelProps) {
  const { accounts, hidden } = props;
  const [manualRefresh, setManualRefresh] = useState(false);
  const refreshing = props.refreshing || manualRefresh;
  const refresh = async () => {
    if (refreshing) return;
    setManualRefresh(true);
    try {
      await Promise.allSettled([
        props.onRefresh(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 300)),
      ]);
    } finally {
      setManualRefresh(false);
    }
  };
  const restricted = accounts.filter((a) => a.status === AccountUsabilityStatus.Restricted);
  const totalAvailable = sumMinor(accounts.map((a) => a.availableMinor));
  return (
    <section className={twMerge(ui.card, ui.cardBody)} aria-labelledby="balance-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="balance-heading">Total available</h2>
        <span className="flex items-center gap-1">
          <Money minor={totalAvailable} hidden={hidden} className={ui.amountHero} />
          <button
            type="button"
            className={ui.iconBtn}
            aria-pressed={hidden}
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
            onClick={props.onToggle}
          >
            {hidden ? <IconEyeOff size={22} /> : <IconEye size={22} />}
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted" aria-live="polite">
          {props.refreshFailed ? "Couldn't refresh. Showing the last update, " : 'As of '}
          {formatDateTime(new Date(props.updatedAt).toISOString())}
        </span>
        <button
          type="button"
          className={ui.linkBtn}
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <IconRefresh size={16} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className={styles.totals}>
        <span className="text-muted">Total current</span>
        <Money minor={sumMinor(accounts.map((a) => a.currentMinor))} hidden={hidden} />
        <span className="text-muted">On hold</span>
        <Money minor={sumMinor(accounts.map((a) => a.heldMinor))} hidden={hidden} />
      </div>
      {restricted.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <IconLock size={15} className="mt-[3px] flex-none text-warn" />
          <span>
            Includes{' '}
            <Money minor={sumMinor(restricted.map((a) => a.availableMinor))} hidden={hidden} /> in{' '}
            {restricted.length} restricted{' '}
            {restricted.length === 1 ? 'account, which' : 'accounts, which'} can't be transferred
            right now.
          </span>
        </p>
      )}
    </section>
  );
}
