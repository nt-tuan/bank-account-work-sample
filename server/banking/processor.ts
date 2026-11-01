import { DestinationKind, type Lifecycle, type Restriction } from '../../shared/domain/enums.ts';
import { ExecutionFailureCode } from '../../shared/errors.ts';
import {
  PartnerResultKind,
  UnknownOutcomeError,
  type PartnerBankGateway,
  type PartnerResult,
} from '../partner-gateway/gateway.ts';
import type { Database, Tx } from '../persistence/sqlite.ts';
import { type Clock, randomId } from '../clock.ts';
import type { TransferRow } from '../serializers.ts';
import { normalizeHolderName } from '../../shared/rules/input.ts';
import { accountUsability } from '../../shared/rules/policy.ts';
import { nextActivitySequence } from './activity.ts';

export type ProcessorTiming = {
  /** Wait after external attempt n (1-based) before the next inquiry: 2, 4, 8, 16 s by default. */
  backoffMs: number[];
  /** Wait between inquiries after the backoff list is exhausted (30 s). */
  steadyMs: number;
  /** Unresolved for this long → delayed_since is set (2 min). */
  delayedAfterMs: number;
  /** Inquiry interval once delayed (60 s). */
  delayedIntervalMs: number;
  /** Upper bound on the idle timer so a missed wake-up cannot stall processing. */
  pollFallbackMs: number;
};

export const DEFAULT_TIMING: ProcessorTiming = {
  backoffMs: [2_000, 4_000, 8_000, 16_000],
  steadyMs: 30_000,
  delayedAfterMs: 120_000,
  delayedIntervalMs: 60_000,
  pollFallbackMs: 5_000,
};

/** Seams for demo faults; the default is a no-op so core rules never branch on scenario names (docs/technical-design/features/transfers.md). */
export interface ExecutionHooks {
  beforeExecute(transfer: TransferRow): Promise<void> | void;
  injectFailure(transfer: TransferRow): boolean;
}
export const noExecutionHooks: ExecutionHooks = {
  beforeExecute: () => undefined,
  injectFailure: () => false,
};

type AccountState = {
  id: string;
  lifecycle: Lifecycle;
  restriction: Restriction;
  holder_name: string;
  name: string;
};

export class TransferProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private stopped = true;

  constructor(
    private readonly deps: {
      db: Database;
      clock: Clock;
      gateway: PartnerBankGateway;
      hooks?: ExecutionHooks;
      timing?: ProcessorTiming;
      onTerminal?: (transferId: string) => void;
      log?: (msg: string, extra?: Record<string, unknown>) => void;
    },
  ) {}

  private get timing() {
    return this.deps.timing ?? DEFAULT_TIMING;
  }
  private get hooks() {
    return this.deps.hooks ?? noExecutionHooks;
  }

  /** Resumes all processing transfers (spec §7: on startup the processor resumes). */
  start(): void {
    this.stopped = false;
    this.schedule(0);
  }

  wake(): void {
    if (!this.stopped) this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running;
  }

  /** Runs every due step now; used by tests with a fake clock. */
  async drain(maxSteps = 100): Promise<void> {
    for (let i = 0; i < maxSteps; i++) {
      const due = this.nextDue();
      if (!due) return;
      await this.step(due);
    }
  }

  private schedule(delayMs: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), Math.max(0, delayMs));
  }

  private async tick() {
    this.timer = null;
    if (this.stopped) return;
    if (this.running) {
      await this.running;
      return this.schedule(0);
    }
    this.running = (async () => {
      try {
        this.purgeIdempotency();
        const due = this.nextDue();
        if (due) await this.step(due);
      } catch (error) {
        this.deps.log?.('processor step failed', { error: String(error) });
      }
    })();
    await this.running;
    this.running = null;
    const next = this.deps.db.read((q) =>
      q.get<{ at: number | null }>(
        "SELECT MIN(next_attempt_at) AS at FROM transfers WHERE status = 'processing'",
      ),
    )?.at;
    const now = this.deps.clock.now();
    this.schedule(
      next === null || next === undefined
        ? this.timing.pollFallbackMs
        : Math.min(this.timing.pollFallbackMs, next - now),
    );
  }

  private nextDue(): TransferRow | undefined {
    return this.deps.db.read((q) =>
      q.get<TransferRow>(
        "SELECT * FROM transfers WHERE status = 'processing' AND next_attempt_at <= ? ORDER BY next_attempt_at, created_at LIMIT 1",
        [this.deps.clock.now()],
      ),
    );
  }

  private purgeIdempotency() {
    this.deps.db.immediate(
      (tx) =>
        tx.run('DELETE FROM idempotency_records WHERE expires_at <= ?', [this.deps.clock.now()])
          .changes,
    );
  }

  async step(transfer: TransferRow): Promise<void> {
    await this.hooks.beforeExecute(transfer);
    if (transfer.destination_kind === DestinationKind.External) return this.externalStep(transfer);
    return this.internalStep(transfer);
  }

  private readAccount(tx: Tx, id: string | null): AccountState | undefined {
    if (!id) return undefined;
    return tx.get<AccountState>(
      'SELECT id, lifecycle, restriction, holder_name, name FROM accounts WHERE id = ?',
      [id],
    );
  }

  private canSend(a: AccountState | undefined): a is AccountState {
    return !!a && accountUsability(a).canSend;
  }

  private canReceive(a: AccountState | undefined): a is AccountState {
    return !!a && accountUsability(a).canReceive;
  }

  /** Own and internal: one transaction re-reads both accounts, checks the name and completes or fails. */
  private internalStep(t: TransferRow) {
    let terminal = false;
    this.deps.db.immediate((tx) => {
      const current = tx.get<TransferRow>(
        "SELECT * FROM transfers WHERE id = ? AND status = 'processing'",
        [t.id],
      );
      if (!current) return null;
      const source = this.readAccount(tx, current.source_account_id);
      const dest = this.readAccount(tx, current.destination_account_id);
      let failure: ExecutionFailureCode | null = null;
      if (this.hooks.injectFailure(current)) failure = ExecutionFailureCode.PROCESSING_FAILED;
      else if (!this.canSend(source)) failure = ExecutionFailureCode.SOURCE_UNAVAILABLE;
      else if (!this.canReceive(dest)) failure = ExecutionFailureCode.DESTINATION_UNAVAILABLE;
      else if (
        current.destination_kind === DestinationKind.Internal &&
        normalizeHolderName(dest.holder_name) !==
          normalizeHolderName(current.recipient_name_snapshot)
      ) {
        failure = ExecutionFailureCode.RECIPIENT_NAME_MISMATCH;
      }
      terminal = failure
        ? this.fail(tx, current, failure)
        : this.completeInternal(tx, current, source!, dest!);
      return null;
    });
    if (terminal) this.deps.onTerminal?.(t.id);
  }

  /** External: record the attempt, then call out with no transaction open; commit only on a definitive answer. */
  private async externalStep(t: TransferRow) {
    const now = this.deps.clock.now();
    const attempt = t.execution_attempts + 1;
    const delayed = t.delayed_since !== null || now - t.created_at >= this.timing.delayedAfterMs;
    const wait = delayed
      ? this.timing.delayedIntervalMs
      : (this.timing.backoffMs[attempt - 1] ?? this.timing.steadyMs);

    let preFailure: ExecutionFailureCode | null = null;
    const recorded = this.deps.db.immediate((tx) => {
      const current = tx.get<TransferRow>(
        "SELECT * FROM transfers WHERE id = ? AND status = 'processing'",
        [t.id],
      );
      if (!current || current.execution_attempts !== t.execution_attempts) return false;
      if (current.execution_attempts === 0) {
        // Nothing has been sent yet: the source must still be eligible.
        if (this.hooks.injectFailure(current)) preFailure = ExecutionFailureCode.PROCESSING_FAILED;
        else if (!this.canSend(this.readAccount(tx, current.source_account_id)))
          preFailure = ExecutionFailureCode.SOURCE_UNAVAILABLE;
        if (preFailure) {
          this.fail(tx, current, preFailure);
          return false;
        }
      }
      const r = tx.run(
        `UPDATE transfers SET execution_attempts = ?, next_attempt_at = ?, delayed_since = COALESCE(delayed_since, ?)
         WHERE id = ? AND status = 'processing' AND execution_attempts = ?`,
        [attempt, now + wait, delayed ? now : null, t.id, t.execution_attempts],
      );
      return r.changes === 1;
    });
    if (preFailure) {
      this.deps.onTerminal?.(t.id);
      return;
    }
    if (!recorded) return;

    const bank = this.deps.db.read((q) =>
      q.get<{ code: string }>('SELECT code FROM banks WHERE id = ?', [t.destination_bank_id]),
    )!;
    const request = {
      transferId: t.id,
      bankCode: bank.code,
      accountNumber: t.destination_account_number,
      beneficiaryName: t.recipient_name_snapshot,
      amountMinor: t.amount_minor,
    };
    let result: PartnerResult;
    try {
      if (t.execution_attempts === 0) {
        result = await this.deps.gateway.submit(request);
      } else {
        // Every later step starts with an inquiry, never a blind resend (spec §7).
        const inquiry = await this.deps.gateway.inquireTransfer(t.id);
        result =
          inquiry.kind === PartnerResultKind.NotReceived
            ? await this.deps.gateway.submit(request)
            : inquiry;
      }
    } catch (error) {
      if (error instanceof UnknownOutcomeError) {
        this.deps.log?.('partner outcome unknown; will inquire', { transferId: t.id, attempt });
        return; // Stays Processing; never marked Failed on an unknown outcome.
      }
      throw error;
    }

    let terminal = false;
    this.deps.db.immediate((tx) => {
      const current = tx.get<TransferRow>(
        "SELECT * FROM transfers WHERE id = ? AND status = 'processing'",
        [t.id],
      );
      if (!current) return null;
      terminal =
        result.kind === PartnerResultKind.Settled
          ? this.completeExternal(tx, current, result.paymentId)
          : this.fail(tx, current, result.failureCode);
      return null;
    });
    if (terminal) this.deps.onTerminal?.(t.id);
  }

  private captureSourceDebit(tx: Tx, t: TransferRow, now: number) {
    const hold = tx.run(
      "UPDATE holds SET state = 'captured', resolved_at = ? WHERE transfer_id = ? AND state = 'active'",
      [now, t.id],
    );
    const entry = tx.run(
      "UPDATE activity SET status = 'posted', posted_at = ? WHERE transfer_id = ? AND account_id = ? AND status = 'pending'",
      [now, t.id, t.source_account_id],
    );
    if (hold.changes !== 1 || entry.changes !== 1)
      throw new Error(`Transfer ${t.id} has no active hold/pending entry`);
    tx.run(
      'UPDATE accounts SET current_balance_minor = current_balance_minor - ?, held_minor = held_minor - ? WHERE id = ?',
      [t.amount_minor, t.amount_minor, t.source_account_id],
    );
  }

  private completeInternal(
    tx: Tx,
    t: TransferRow,
    source: AccountState,
    dest: AccountState,
  ): boolean {
    const now = this.deps.clock.now();
    const updated = tx.run(
      "UPDATE transfers SET status = 'completed', completed_at = ?, next_attempt_at = NULL WHERE id = ? AND status = 'processing'",
      [now, t.id],
    );
    if (updated.changes !== 1) return false;
    this.captureSourceDebit(tx, t, now);
    const sequence = nextActivitySequence(tx);
    const fromName = t.destination_kind === DestinationKind.Own ? source.name : source.holder_name;
    tx.run(
      `INSERT INTO activity (id, sequence, account_id, kind, direction, amount_minor, status, description, counterparty, category, occurred_at, posted_at, transfer_id)
       VALUES (?, ?, ?, 'transfer_in', 'credit', ?, 'posted', ?, ?, 'transfer', ?, ?, ?)`,
      [
        randomId('ACT'),
        sequence,
        dest.id,
        t.amount_minor,
        `From ${fromName}`,
        fromName,
        now,
        now,
        t.id,
      ],
    );
    tx.run('UPDATE accounts SET current_balance_minor = current_balance_minor + ? WHERE id = ?', [
      t.amount_minor,
      dest.id,
    ]);
    return true;
  }

  private completeExternal(tx: Tx, t: TransferRow, paymentId: string): boolean {
    const now = this.deps.clock.now();
    const updated = tx.run(
      "UPDATE transfers SET status = 'completed', completed_at = ?, partner_payment_id = ?, next_attempt_at = NULL WHERE id = ? AND status = 'processing'",
      [now, paymentId, t.id],
    );
    if (updated.changes !== 1) return false;
    this.captureSourceDebit(tx, t, now);
    return true;
  }

  /** Release the hold, cancel the pending entry, post nothing. */
  private fail(tx: Tx, t: TransferRow, code: ExecutionFailureCode): boolean {
    const now = this.deps.clock.now();
    const updated = tx.run(
      "UPDATE transfers SET status = 'failed', failure_code = ?, failed_at = ?, next_attempt_at = NULL WHERE id = ? AND status = 'processing'",
      [code, now, t.id],
    );
    if (updated.changes !== 1) return false;
    tx.run(
      "UPDATE holds SET state = 'released', resolved_at = ? WHERE transfer_id = ? AND state = 'active'",
      [now, t.id],
    );
    tx.run(
      "UPDATE activity SET status = 'cancelled', cancelled_at = ? WHERE transfer_id = ? AND status = 'pending'",
      [now, t.id],
    );
    tx.run('UPDATE accounts SET held_minor = held_minor - ? WHERE id = ?', [
      t.amount_minor,
      t.source_account_id,
    ]);
    return true;
  }
}
