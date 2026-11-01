import type { QueryClient } from '@tanstack/react-query';
import { TransferStatus } from '@domain/domain/enums.ts';
import type { ActivityDetail, ActivityList, Session, Transfer } from '@domain/schemas/api.ts';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { createTransferMonitor } from './monitor.ts';

const monitors = new WeakMap<QueryClient, ReturnType<typeof createTransferMonitor>>();

export function getTransferMonitor(queryClient: QueryClient) {
  let monitor = monitors.get(queryClient);
  if (!monitor) {
    monitor = createTransferMonitor({
      queryClient,
      listProcessing: (page, signal) =>
        api.transfers({ status: TransferStatus.Processing, page, pageSize: 100 }, signal),
      readTransfer: api.transfer,
      available: () => !document.hidden && navigator.onLine,
    });
    monitors.set(queryClient, monitor);
  }
  return monitor;
}

/** Installed once at the application composition root, never by route components. */
export function installTransferMonitoring(queryClient: QueryClient) {
  const monitor = getTransferMonitor(queryClient);
  const syncSession = () => {
    const session = queryClient.getQueryData<Session>(qk.session);
    if (session?.authenticated && session.customer) monitor.start(session.customer.id);
    else monitor.stop();
  };
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] === qk.session[0]) syncSession();
    if (event.type !== 'updated' || event.action.type !== 'success') return;
    // Reads can reveal an order created elsewhere. Screens still only read their resource.
    const [resource, kind] = event.query.queryKey;
    if (resource === qk.activity.all[0]) {
      const data = event.query.state.data as ActivityDetail | ActivityList | undefined;
      const entries = data && ('items' in data ? data.items : [data]);
      for (const entry of entries ?? [])
        if (entry.transferId && entry.transferStatus === TransferStatus.Processing)
          monitor.watch(entry.transferId);
    } else if (resource === qk.transfers.all[0] && kind === 'detail') {
      const transfer = event.query.state.data as Transfer | undefined;
      if (transfer?.status === TransferStatus.Processing) monitor.watch(transfer.id);
    }
  });
  const onAvailability = () => {
    if (document.hidden || !navigator.onLine) monitor.pause();
    else monitor.wake();
  };
  document.addEventListener('visibilitychange', onAvailability);
  window.addEventListener('focus', onAvailability);
  window.addEventListener('online', onAvailability);
  window.addEventListener('offline', onAvailability);
  syncSession();
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onAvailability);
    window.removeEventListener('focus', onAvailability);
    window.removeEventListener('online', onAvailability);
    window.removeEventListener('offline', onAvailability);
    monitor.stop();
  };
}
