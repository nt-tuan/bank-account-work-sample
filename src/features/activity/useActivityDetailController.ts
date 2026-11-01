import { TransferStatus } from '@domain/domain/enums.ts';
import { activityDetailOptions } from './queries.ts';
import { useAnnounce } from '@/shared/ui/live-region.tsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { FAILURE_COPY, SLOW_PHASE_MS, getTransferMonitor } from '@/features/transfers/index.ts';
import { activityBackTo } from './navigation.ts';

export function useActivityDetailController() {
  const { activityId = '' } = useParams();
  const { state } = useLocation();
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const justCreated = !!(
    state &&
    typeof state === 'object' &&
    'justCreated' in state &&
    state.justCreated
  );
  const trackingStartedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const entry = useQuery(activityDetailOptions(activityId));
  const e = entry.data;
  const t = e?.transfer?.details;
  useEffect(() => {
    if (t?.status !== TransferStatus.Processing) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [t?.status]);
  const elapsed = now - trackingStartedAt.current;
  const slowTracking = t?.status === TransferStatus.Processing && elapsed >= SLOW_PHASE_MS;
  const lastStatus = useRef<TransferStatus | undefined>(undefined);
  const statusRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!t) return;
    const prev = lastStatus.current;
    lastStatus.current = t.status;
    if (prev === t.status || (prev === undefined && !justCreated)) return;
    if (prev === undefined && justCreated) statusRef.current?.focus();
    if (t.status === TransferStatus.Completed) announce('Transfer completed.');
    if (t.status === TransferStatus.Failed && t.failureCode)
      announce(`Transfer failed: ${FAILURE_COPY[t.failureCode].reason}`);
    if (t.status !== TransferStatus.Processing) {
      statusRef.current?.focus();
    }
  }, [t, announce, justCreated]);
  const checkAgain = () => {
    if (t) getTransferMonitor(queryClient).check(t);
  };
  return { slowTracking, entry, e, elapsed, statusRef, checkAgain, backTo: activityBackTo(state) };
}
