import { AccountType } from '@domain/domain/enums.ts';
import { AccountStatus, Money } from '@/shared/ui/primitives.tsx';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import type { AccountSummary } from '@domain/schemas/api.ts';
import { IconChevronRight } from '@/shared/ui/icons.tsx';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import styles from './accounts.module.css';

export function AccountsSection({
  accounts,
  hidden,
}: {
  accounts: AccountSummary[];
  hidden: boolean;
}) {
  return (
    <section className={ui.section} aria-labelledby="accounts-heading">
      <div className={ui.sectionHead}>
        <h2 id="accounts-heading">Your accounts</h2>
        <Link className="text-sm" to="/accounts">
          Account information
        </Link>
      </div>
      <ul className={twMerge(ui.card, 'divide-y divide-row-divider overflow-hidden')}>
        {accounts.map((a) => (
          <li key={a.id}>
            <Link className={styles.accountRow} to={`/accounts/${a.id}`}>
              <span className={styles.accountName}>
                <span className="font-medium">{a.name}</span>
                <span className="text-sm text-muted tabular-nums">
                  {a.type === AccountType.Checking ? 'Checking' : 'Savings'} · {a.maskedNumber}
                </span>
              </span>
              <span className={styles.accountStatus}>
                <AccountStatus status={a.status} />
                {a.restrictionReason && (
                  <span className="text-xs text-muted">{a.restrictionReason}</span>
                )}
              </span>
              <span className={styles.accountAmount}>
                <span className="text-xs text-muted">Available</span>
                <Money minor={a.availableMinor} hidden={hidden} className={ui.amountLg} />
                {a.heldMinor > 0 && !hidden && (
                  <span className="text-xs text-muted tabular-nums">
                    <Money minor={a.heldMinor} /> on hold
                  </span>
                )}
              </span>
              <IconChevronRight className="text-input-border" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
