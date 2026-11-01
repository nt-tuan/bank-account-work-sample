import { ErrorCode } from '@domain/errors.ts';
import { AccountDetailSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { isRejected } from '@/shared/api/http.ts';
import { ui } from '@/shared/ui/classes.ts';
import { ErrorState, NotFoundView } from '@/shared/ui/primitives.tsx';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { AccountBalance } from '@/features/accounts/AccountBalance.tsx';
import { AccountInformation } from '@/features/accounts/AccountInformation.tsx';
import { useAccountDetailController } from '@/features/accounts/useAccountDetailController.ts';

export function AccountDetailPage() {
  const { account, copied, copy, a, merchantHolds, transferHolds, sum } =
    useAccountDetailController();
  if (isRejected(account.error, ErrorCode.NOT_FOUND)) {
    return (
      <>
        <NotFoundView />
      </>
    );
  }
  return (
    <>
      {account.isPending && <AccountDetailSkeleton />}
      {account.isError && !a && (
        <ErrorState
          message="We couldn't load this account."
          onRetry={() => void account.refetch()}
        />
      )}
      {a && (
        <>
          <div className="grid grid-cols-2 items-start gap-5 max-lg:grid-cols-1">
            <AccountBalance
              a={a}
              merchantHolds={merchantHolds}
              transferHolds={transferHolds}
              sum={sum}
            />

            <AccountInformation copied={copied} copy={copy} a={a} />
          </div>
          <div className={ui.actions}>
            <Link className={ui.btnOutline} to={`/activity?account=${a.id}`}>
              View activity
            </Link>
            {a.canSend ? (
              <Link className={ui.btnPrimary} to={`/transfers/new?from=${a.id}`}>
                Transfer from this account
              </Link>
            ) : (
              <button
                type="button"
                className={ui.btnPrimary}
                disabled
                aria-describedby="restriction"
              >
                Transfer from this account
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
