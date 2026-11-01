import { ActivityKind, ActivityStatus, Direction, HoldKind } from '@domain/domain/enums.ts';
import type { ActivityDetail } from '@domain/schemas/api.ts';
import { CATEGORY_LABELS } from '@domain/domain/constants.ts';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { formatDateTime } from '@/shared/format/format.ts';
import { ui } from '@/shared/ui/classes.ts';
import dl from '@/shared/ui/dl.module.css';
import { ActivityStatusText, Money } from '@/shared/ui/primitives.tsx';

const KIND_LABELS: Record<ActivityKind, string> = {
  [ActivityKind.Purchase]: 'Card purchase',
  [ActivityKind.Income]: 'Income',
  [ActivityKind.TransferIn]: 'Incoming transfer',
  [ActivityKind.TransferOut]: 'Outgoing transfer',
} as const;

export function ActivitySummarySection({ entry: e }: { entry: ActivityDetail }) {
  return (
    <section className={ui.card} aria-labelledby="activity-summary-h">
      <div className={ui.cardHead}>
        <h2 id="activity-summary-h">Activity Summary</h2>
        <Money minor={e.amountMinor} sign={e.direction} className={ui.amountLg} />
      </div>
      <dl className={dl.dl}>
        <dt>Description</dt>
        <dd>{e.description}</dd>
        <dt>Activity status</dt>
        <dd>
          <ActivityStatusText status={e.status} />
          {e.hold?.kind === HoldKind.MerchantAuthorization &&
            e.status === ActivityStatus.Pending && (
              <div className="text-sm text-muted">
                Card authorization on hold — reduces available balance until it posts.
              </div>
            )}
          {e.status === ActivityStatus.Cancelled && (
            <div className="text-sm text-muted">
              The hold was released. This entry did not change your balance.
            </div>
          )}
        </dd>
        <dt>Type</dt>
        <dd>
          {KIND_LABELS[e.kind]} · {e.direction === Direction.Credit ? 'Money in' : 'Money out'}
        </dd>
        <dt>Account</dt>
        <dd>
          <Link to={`/accounts/${e.account.id}`}>{e.account.name}</Link>{' '}
          <span className="text-muted tabular-nums">{e.account.maskedNumber}</span>
        </dd>
        <dt>Category</dt>
        <dd>{CATEGORY_LABELS[e.category]}</dd>
        <dt>Counterparty</dt>
        <dd>{e.counterparty}</dd>
        <dt>Occurred</dt>
        <dd className="tabular-nums">{formatDateTime(e.occurredAt)}</dd>
        {e.postedAt && (
          <>
            <dt>Posted</dt>
            <dd className="tabular-nums">{formatDateTime(e.postedAt)}</dd>
          </>
        )}
        {e.cancelledAt && (
          <>
            <dt>Cancelled</dt>
            <dd className="tabular-nums">{formatDateTime(e.cancelledAt)}</dd>
          </>
        )}
        <dt>Activity ID</dt>
        <dd className="text-muted tabular-nums">{e.id}</dd>
      </dl>
    </section>
  );
}
