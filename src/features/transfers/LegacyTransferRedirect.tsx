import { ErrorCode } from '@domain/errors.ts';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { api } from '@/shared/api/endpoints.ts';
import { isRejected } from '@/shared/api/http.ts';
import { qk } from '@/shared/api/keys.ts';
import { ErrorState, NotFoundView, Skeleton } from '@/shared/ui/primitives.tsx';

/** Compatibility for bookmarked transfer URLs; all details live under Activity. */
export function LegacyTransferRedirect() {
  const { transferId = '' } = useParams();
  const transfer = useQuery({
    queryKey: qk.transfers.detail(transferId),
    queryFn: () => api.transfer(transferId),
    staleTime: 0,
  });
  if (isRejected(transfer.error, ErrorCode.NOT_FOUND)) return <NotFoundView />;
  if (transfer.isError) return <ErrorState onRetry={() => void transfer.refetch()} />;
  if (!transfer.data) return <Skeleton lines={3} />;
  return (
    <Navigate
      to={
        transfer.data.sourceActivityId
          ? `/activity/${transfer.data.sourceActivityId}`
          : '/activity?cat=transfer'
      }
      replace
      state={{ backTo: '/activity?cat=transfer' }}
    />
  );
}
