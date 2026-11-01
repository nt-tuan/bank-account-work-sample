import type { QueryClient } from '@tanstack/react-query';
import { TransferStatus } from '@domain/domain/enums.ts';
import type { List, Transfer } from '@domain/schemas/api.ts';
import { qk } from '@/shared/api/keys.ts';
import { FAST_PHASE_MS, nextPollInterval } from './polling.ts';

type Pending = {
  transfer: Transfer | undefined;
  startedAt: number;
  pollsAfterFast: number;
  dueAt: number;
  inFlight: boolean;
};

/** Session-owned tracking. No React, router, or screen lifetime participates in polling. */
export function createTransferMonitor(deps: {
  queryClient: QueryClient;
  listProcessing: (page: number, signal: AbortSignal) => Promise<List<Transfer>>;
  readTransfer: (id: string, signal: AbortSignal) => Promise<Transfer>;
  available?: () => boolean;
}) {
  const { queryClient } = deps;
  const available = deps.available ?? (() => true);
  const pending = new Map<string, Pending>();
  const terminal = new Set<string>();
  let customerId: string | null = null;
  let session: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let discoveryDue = Infinity;
  let discovering = false;

  function invalidate(queryKeys: readonly (readonly unknown[])[]) {
    const current = session;
    for (const queryKey of queryKeys) {
      // An initial read may have captured Processing before settlement. Cancel it too:
      // ordinary invalidation can reuse that in-flight response when no data is cached yet.
      void queryClient.cancelQueries({ queryKey }).then(() => {
        if (session === current && current) return queryClient.invalidateQueries({ queryKey });
      });
    }
  }

  function invalidateBalances() {
    invalidate([qk.accounts.all, qk.activity.all, qk.transfers.all, ['insights']]);
  }

  function observe(transfer: Transfer) {
    if (!session || terminal.has(transfer.id)) return;
    const previous = pending.get(transfer.id);
    queryClient.setQueryData(qk.transfers.detail(transfer.id), transfer);
    if (transfer.status !== TransferStatus.Processing) {
      terminal.add(transfer.id);
      pending.delete(transfer.id);
      invalidateBalances();
    } else if (!previous) {
      pending.set(transfer.id, {
        transfer,
        startedAt: Date.now(),
        pollsAfterFast: 0,
        dueAt: Date.now(),
        inFlight: false,
      });
    } else {
      if (previous.transfer && previous.transfer.delayedSince !== transfer.delayedSince)
        invalidate([qk.activity.all]);
      previous.transfer = transfer;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = undefined;
    if (!session || !available()) return;
    const due = Math.min(
      discovering ? Infinity : discoveryDue,
      ...[...pending.values()].filter((p) => !p.inFlight).map((p) => p.dueAt),
    );
    if (Number.isFinite(due)) timer = setTimeout(tick, Math.max(0, due - Date.now()));
  }

  async function discover(current: AbortController) {
    discovering = true;
    discoveryDue = Infinity;
    try {
      // Pending orders are not restricted to the visible month, account, filters, or page.
      for (let page = 1; ; page++) {
        const result = await deps.listProcessing(page, current.signal);
        if (session !== current) return;
        for (const transfer of result.items) observe(transfer);
        if (page * result.pageSize >= result.total || result.items.length === 0) break;
      }
    } catch {
      if (session === current) discoveryDue = Date.now() + 15_000;
    } finally {
      if (session === current) {
        discovering = false;
        schedule();
      }
    }
  }

  async function poll(id: string, item: Pending, current: AbortController) {
    item.inFlight = true;
    try {
      const transfer = await deps.readTransfer(id, current.signal);
      if (session !== current || pending.get(id) !== item) return;
      observe(transfer);
    } catch {
      // A failed read never changes the transfer's business status. Retry with backoff.
    } finally {
      if (session === current && pending.get(id) === item) {
        item.inFlight = false;
        const elapsed = Date.now() - item.startedAt;
        const interval = nextPollInterval({
          status: TransferStatus.Processing,
          elapsedMs: elapsed,
          pollsAfterFastPhase: item.pollsAfterFast,
        });
        if (elapsed >= FAST_PHASE_MS) item.pollsAfterFast += 1;
        item.dueAt = Date.now() + (interval || 30_000);
      }
      if (session === current) schedule();
    }
  }

  function tick() {
    if (!session || !available()) return;
    const current = session;
    if (!discovering && discoveryDue <= Date.now()) void discover(current);
    for (const [id, item] of pending)
      if (!item.inFlight && item.dueAt <= Date.now()) void poll(id, item, current);
    schedule();
  }

  function stop() {
    session?.abort();
    session = null;
    customerId = null;
    clearTimeout(timer);
    timer = undefined;
    pending.clear();
    terminal.clear();
    discoveryDue = Infinity;
    discovering = false;
  }

  return {
    start(nextCustomerId: string) {
      if (customerId === nextCustomerId) return;
      stop();
      customerId = nextCustomerId;
      session = new AbortController();
      discoveryDue = Date.now();
      schedule();
    },
    stop,
    watch(id: string) {
      if (!session || pending.has(id) || terminal.has(id)) return;
      pending.set(id, {
        transfer: undefined,
        startedAt: Date.now(),
        pollsAfterFast: 0,
        dueAt: Date.now(),
        inFlight: false,
      });
      schedule();
    },
    recordOrder(transfer: Transfer) {
      if (!session) return;
      observe(transfer);
      // Reserving funds changes available balance even before execution completes.
      if (transfer.status === TransferStatus.Processing) invalidateBalances();
      schedule();
    },
    check(transfer: Transfer) {
      if (!session) return;
      observe(transfer);
      const item = pending.get(transfer.id);
      if (item) item.dueAt = Date.now();
      schedule();
    },
    wake() {
      if (!session) return;
      discoveryDue = Date.now();
      for (const item of pending.values()) item.dueAt = Date.now();
      schedule();
    },
    pause() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
