import { AccountUsabilityStatus } from '@domain/domain/enums.ts';
import { AccountStatus, Money } from '@/shared/ui/primitives.tsx';
import { formatShortDateTime } from '@/shared/format/format.ts';
import { ui } from '@/shared/ui/classes.ts';
import { IconWarning } from '@/shared/ui/icons.tsx';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import styles from './accounts.module.css';
import type { useAccountDetailController } from './useAccountDetailController.ts';

export function AccountBalance({
  a,
  merchantHolds,
  transferHolds,
  sum,
}: Pick<
  ReturnType<typeof useAccountDetailController>,
  'a' | 'merchantHolds' | 'transferHolds' | 'sum'
>) {
  if (!a) return null;
  return (
    <section className={ui.card} aria-labelledby="balance-h">
      <div className={ui.cardHead}>
        <h2 id="balance-h">Balance</h2>
        <AccountStatus status={a.status} />
      </div>
      <div className={ui.cardBody}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="font-medium">Available</span>
          <Money minor={a.availableMinor} className={ui.amountHero} />
        </div>
        <div className={styles.totals}>
          <span className="text-muted">Current balance</span>
          <Money minor={a.currentMinor} />
          <span className="text-muted">On hold</span>
          <Money minor={a.heldMinor} />
        </div>
        {a.status === AccountUsabilityStatus.Restricted && (
          <div className="flex flex-col gap-1 border-t border-row-divider pt-3.5" id="restriction">
            <p className="flex items-center gap-1.5 text-md text-warn [&>svg]:shrink-0">
              <IconWarning size={16} />
              This account can't send or receive transfers.
            </p>
            <p className="text-sm">
              {a.restrictionReason} Your balance and activity are unchanged.
            </p>
          </div>
        )}
        {merchantHolds.length > 0 && (
          <div>
            <h3 className="pt-2 text-sm font-medium text-muted">
              Card authorizations · <Money minor={sum(merchantHolds)} />
            </h3>
            {merchantHolds.map((h) => (
              <div
                className="flex justify-between gap-3 border-b border-row-divider py-2.5 text-md last:border-b-0"
                key={h.id}
              >
                <Link to={`/activity/${h.activityId}`}>
                  {h.description} · {formatShortDateTime(h.createdAt)}
                </Link>
                <Money minor={h.amountMinor} />
              </div>
            ))}
          </div>
        )}
        {transferHolds.length > 0 && (
          <div>
            <h3 className="pt-2 text-sm font-medium text-muted">
              Processing transfers · <Money minor={sum(transferHolds)} />
            </h3>
            {transferHolds.map((h) => (
              <div
                className="flex justify-between gap-3 border-b border-row-divider py-2.5 text-md last:border-b-0"
                key={h.id}
              >
                <Link to={`/activity/${h.activityId}`}>{h.description}</Link>
                <Money minor={h.amountMinor} />
              </div>
            ))}
          </div>
        )}
        <p className="text-sm text-muted">
          Held money is part of the current balance but can't be spent or transferred until it posts
          or is released.
        </p>
      </div>
    </section>
  );
}
