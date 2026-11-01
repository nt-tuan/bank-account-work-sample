import {
  DestinationKind,
  RecipientNameSource,
  TransferDestinationKind,
  TransferStatus,
} from '@domain/domain/enums.ts';
import { formatDateTimeSeconds } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import dl from '@/shared/ui/dl.module.css';
import { Money, TransferStatusText } from '@/shared/ui/primitives.tsx';
import { formatYen } from '@domain/money.ts';
import type { ActivityDetail, Transfer } from '@domain/schemas/api.ts';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import type { RefObject } from 'react';
import { FAILURE_COPY } from './messages.ts';
import { FAST_PHASE_MS } from './polling.ts';
import type { TransferPrefill } from './wizard/types.ts';

const KIND_LABEL: Record<DestinationKind, string> = {
  [DestinationKind.Own]: 'Between your accounts',
  [DestinationKind.Internal]: 'To another Demo Banking customer',
  [DestinationKind.External]: 'To another bank',
} as const;

function correctionPrefill(t: Transfer): TransferPrefill {
  const p: TransferPrefill = { amount: String(t.amountMinor), reference: t.reference ?? '' };
  if (t.source.accountId) p.sourceAccountId = t.source.accountId;
  if (t.destinationKind === DestinationKind.Own && t.destination.accountId) {
    p.kind = TransferDestinationKind.Own;
    p.destAccountId = t.destination.accountId;
  } else {
    p.kind = TransferDestinationKind.Recipient;
    p.bankId = t.destination.bank.id;
  }
  return p;
}

function StatusBody({
  t,
  elapsedMs,
  slowTracking,
  onCheckAgain,
}: {
  t: Transfer;
  elapsedMs: number;
  slowTracking: boolean;
  onCheckAgain: () => void;
}) {
  const delayed = t.status === TransferStatus.Processing && t.delayedSince !== null;
  return (
    <>
      <TransferStatusText status={t.status} delayed={delayed} size={18} />
      {t.status === TransferStatus.Completed && (
        <p className="text-sm">
          {formatYen(t.amountMinor)} was transferred from {t.source.name} to {t.destination.name} on{' '}
          {formatDateTimeSeconds(t.completedAt!)}.
        </p>
      )}
      {t.status === TransferStatus.Failed && t.failureCode && (
        <p className="text-sm">
          {FAILURE_COPY[t.failureCode].reason} Your money was not moved — the{' '}
          {formatYen(t.amountMinor)} hold has been released from {t.source.name}.
        </p>
      )}
      {t.status === TransferStatus.Processing && (
        <p className="text-sm">
          {delayed
            ? "This transfer is delayed. The recipient's bank hasn't confirmed it yet. It has not failed, and it won't be sent twice."
            : elapsedMs >= FAST_PHASE_MS
              ? 'Taking longer than usual. Your money is reserved and the transfer is still being processed.'
              : `Your order was received. ${formatYen(t.amountMinor)} is reserved in ${t.source.name} while it's processed. This page updates automatically.`}
          {slowTracking && (
            <>
              {' '}
              We're checking less frequently. Updates continue when you leave this page.{' '}
              <button type="button" className={ui.linkBtnInline} onClick={onCheckAgain}>
                Check again
              </button>
            </>
          )}
        </p>
      )}
    </>
  );
}

export function TransferDetailsSection({
  transfer,
  elapsed,
  slowTracking,
  statusRef,
  checkAgain,
  backTo,
}: {
  transfer: NonNullable<ActivityDetail['transfer']>;
  elapsed: number;
  slowTracking: boolean;
  statusRef: RefObject<HTMLHeadingElement | null>;
  checkAgain: () => void;
  backTo: string;
}) {
  const t = transfer.details;
  return (
    <section className={ui.card} aria-labelledby="transfer-details-h">
      <div className={ui.cardHead}>
        <h2 id="transfer-details-h">Transfer Details</h2>
      </div>
      {t ? (
        <>
          <div role="region" aria-labelledby="status-h" className={ui.cardBody}>
            <h3 id="status-h" ref={statusRef} tabIndex={-1} className="text-sm text-muted">
              Transfer status
            </h3>
            <StatusBody
              t={t}
              elapsedMs={elapsed}
              slowTracking={slowTracking}
              onCheckAgain={checkAgain}
            />
          </div>
          <dl className={dl.dl}>
            <dt>Transfer ID</dt>
            <dd className="tabular-nums">{t.id}</dd>
            <dt>From</dt>
            <dd>
              {t.source.accountId ? (
                <Link to={`/accounts/${t.source.accountId}`}>{t.source.name}</Link>
              ) : (
                t.source.name
              )}{' '}
              <span className="text-muted tabular-nums">{t.source.maskedNumber}</span>
            </dd>
            <dt>{t.destinationKind === DestinationKind.Own ? 'To account' : 'Recipient'}</dt>
            <dd>
              {t.destination.accountId ? (
                <Link to={`/accounts/${t.destination.accountId}`}>{t.destination.name}</Link>
              ) : (
                t.destination.name
              )}
              {t.destinationKind !== DestinationKind.Own && (
                <span className="text-sm text-muted">
                  {' '}
                  ·{' '}
                  {t.destination.nameSource === RecipientNameSource.Lookup
                    ? 'Registered at the bank'
                    : 'Entered by you'}
                </span>
              )}
            </dd>
            <dt>Bank</dt>
            <dd>
              {t.destination.bank.name}{' '}
              <span className="text-muted tabular-nums">({t.destination.bank.code})</span> ·{' '}
              <span className="tabular-nums">{t.destination.maskedNumber}</span>
            </dd>
            <dt>Transfer type</dt>
            <dd>{KIND_LABEL[t.destinationKind]}</dd>
            <dt>Amount</dt>
            <dd>
              <Money minor={t.amountMinor} />
            </dd>
            <dt>Fee</dt>
            <dd className="tabular-nums">¥0</dd>
            <dt>Reference</dt>
            <dd>{t.reference ?? <span className="text-muted">None</span>}</dd>
            <dt>Created</dt>
            <dd className="tabular-nums">{formatDateTimeSeconds(t.createdAt)}</dd>
            {t.completedAt && (
              <>
                <dt>Completed</dt>
                <dd className="tabular-nums">{formatDateTimeSeconds(t.completedAt)}</dd>
              </>
            )}
            {t.failedAt && (
              <>
                <dt>Failed</dt>
                <dd className="tabular-nums">{formatDateTimeSeconds(t.failedAt)}</dd>
              </>
            )}
          </dl>

          <div className={twMerge(ui.actionsCenter, ui.cardPad)}>
            <Link className={ui.btnOutline} to={backTo}>
              Account activity
            </Link>
            {t.status === TransferStatus.Completed && (
              <Link className={ui.btnPrimary} to="/transfers/new">
                Make another transfer
              </Link>
            )}
            {t.status === TransferStatus.Failed && t.failureCode && (
              <Link
                className={ui.btnPrimary}
                to="/transfers/new"
                state={{ prefill: correctionPrefill(t) }}
              >
                {FAILURE_COPY[t.failureCode].action}
              </Link>
            )}
            {t.status === TransferStatus.Processing && (
              <Link className={ui.btnPrimary} to="/">
                Back to Home
              </Link>
            )}
          </div>
        </>
      ) : (
        <dl className={dl.dl}>
          <dt>From</dt>
          <dd>{transfer.counterparty.name}</dd>
          <dt>Reference</dt>
          <dd>{transfer.reference ?? '—'}</dd>
        </dl>
      )}
    </section>
  );
}
