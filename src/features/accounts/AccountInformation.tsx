import { AccountType } from '@domain/domain/enums.ts';
import { ActionStatus } from '@/shared/ui/action-status.ts';
import { formatDate } from '@/shared/format/format.ts';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import dl from '@/shared/ui/dl.module.css';
import { IconCopy } from '@/shared/ui/icons.tsx';
import type { useAccountDetailController } from './useAccountDetailController.ts';

export function AccountInformation({
  copied,
  copy,
  a,
}: Pick<ReturnType<typeof useAccountDetailController>, 'copied' | 'copy' | 'a'>) {
  if (!a) return null;
  return (
    <section className={ui.card} aria-labelledby="details-h">
      <div className={ui.cardHead}>
        <h2 id="details-h">Account details</h2>
      </div>
      <dl className={dl.dl}>
        <dt>Account name</dt>
        <dd>{a.name}</dd>
        <dt>Type</dt>
        <dd>{a.type === AccountType.Checking ? 'Checking' : 'Savings'}</dd>
        <dt>Bank</dt>
        <dd>
          {a.bank.name} <span className="text-muted tabular-nums">({a.bank.code})</span>
        </dd>
        <dt>Account number</dt>
        <dd>
          <span className="flex items-center gap-3">
            <span className="tracking-[0.04em] tabular-nums">{a.accountNumber}</span>
            <span className="relative h-[1lh] w-18 flex-none">
              <button
                type="button"
                className={twMerge(ui.linkBtn, 'absolute top-1/2 left-0 -translate-y-1/2')}
                onClick={() => void copy(a.accountNumber)}
                aria-label="Copy account number"
                title={copied === ActionStatus.Failed ? "Couldn't copy. Try again." : undefined}
              >
                <IconCopy size={16} />
                {copied === ActionStatus.Ok
                  ? 'Copied'
                  : copied === ActionStatus.Failed
                    ? 'Retry'
                    : 'Copy'}
              </button>
            </span>
          </span>
          <span className="sr-only" role="status">
            {copied === ActionStatus.Ok
              ? 'Copied'
              : copied === ActionStatus.Failed
                ? "Couldn't copy"
                : ''}
          </span>
        </dd>
        <dt>Holder name</dt>
        <dd>{a.holderName}</dd>
        <dt>Currency</dt>
        <dd>JPY</dd>
        <dt>Opened</dt>
        <dd className="tabular-nums">{formatDate(a.openedAt)}</dd>
        <dt>Transfers</dt>
        <dd>{a.canSend ? 'Can send and receive' : "Can't send or receive"}</dd>
      </dl>
    </section>
  );
}
