import { ErrorCode } from '@domain/errors.ts';
import { ActivityKind } from '@domain/domain/enums.ts';
import { ActivityDetailSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { isRejected } from '@/shared/api/http.ts';
import { ErrorState, NotFoundView } from '@/shared/ui/primitives.tsx';
import { useActivityDetailController } from '@/features/activity/useActivityDetailController.ts';
import { ActivitySummarySection } from '@/features/activity/ActivitySummarySection.tsx';
import { TransferDetailsSection } from '@/features/transfers/TransferDetailsSection.tsx';

export function ActivityDetailPage() {
  const { entry, e, slowTracking, elapsed, statusRef, checkAgain, backTo } =
    useActivityDetailController();
  return (
    <>
      {entry.isPending && <ActivityDetailSkeleton />}
      {isRejected(entry.error, ErrorCode.NOT_FOUND) && <NotFoundView />}
      {entry.isError && !e && !isRejected(entry.error, ErrorCode.NOT_FOUND) && (
        <ErrorState onRetry={() => void entry.refetch()} />
      )}
      {e && !isRejected(entry.error, ErrorCode.NOT_FOUND) && (
        <>
          {entry.isError && (
            <ErrorState
              message="Couldn't update. Showing previous details."
              onRetry={() => void entry.refetch()}
            />
          )}
          <ActivitySummarySection entry={e} />
          {e.transfer &&
            (e.kind === ActivityKind.TransferIn || e.kind === ActivityKind.TransferOut) && (
              <TransferDetailsSection
                transfer={e.transfer}
                elapsed={elapsed}
                slowTracking={slowTracking}
                statusRef={statusRef}
                checkAgain={checkAgain}
                backTo={backTo}
              />
            )}
        </>
      )}
    </>
  );
}
