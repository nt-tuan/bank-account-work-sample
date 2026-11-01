import { DemoScenarioId, DestinationKind } from '../../shared/domain/enums.ts';
import type { Database } from '../persistence/sqlite.ts';
import type { Clock } from '../clock.ts';
import type { ExecutionHooks } from '../banking/processor.ts';
import type { TransferRow } from '../serializers.ts';
import { LOOKUP_LIMIT } from '../banking/lookup.ts';

/** A fault for one partner payment, in demo vocabulary; the composition root translates it into partner codes. */
export type PartnerFault = {
  /** Record the payment, then answer only after this delay (beyond the gateway timeout = response lost). */
  delayAfterCommitMs?: number;
  /** Lose the first submission before it is recorded. */
  dropFirstSubmit?: boolean;
  /** Refuse every call for this payment until the given time. */
  outageUntil?: number;
  /** Reject as "account closed" regardless of the partner account's state. */
  rejectAccountClosed?: boolean;
};

/** The partner module's fault controls, as seen from the demo module (wired in server/app.ts, spec §8). */
export type PartnerFaultAdmin = {
  setFault(clientRef: string, fault: PartnerFault): void;
  clearFaults(): void;
};

export type ScenarioTiming = {
  slowExecutionMs: number;
  partnerTimeoutMs: number;
  outageMs: number;
  slowResponseMs: number;
};
export const DEFAULT_SCENARIO_TIMING: ScenarioTiming = {
  slowExecutionMs: 8_000,
  partnerTimeoutMs: 5_000,
  outageMs: 180_000,
  slowResponseMs: 12_000,
};

/** Scenarios consumed by the next transfer order. */
const ORDER_SCENARIOS = new Set<DemoScenarioId>([
  DemoScenarioId.CreateResponseLost,
  DemoScenarioId.CreateResponseSlow,
  DemoScenarioId.ExecutionSlow,
  DemoScenarioId.ExecutionFailure,
  DemoScenarioId.DestinationClosedDuringProcessing,
  DemoScenarioId.DestinationRestrictedDuringProcessing,
  DemoScenarioId.SourceRestrictedDuringProcessing,
  DemoScenarioId.PartnerReject,
  DemoScenarioId.PartnerTimeoutSettled,
  DemoScenarioId.PartnerNotReceived,
  DemoScenarioId.PartnerOutage,
]);

export function consumesOnOrder(s: DemoScenarioId | null, kind?: DestinationKind): boolean {
  if (s === null || !ORDER_SCENARIOS.has(s)) return false;
  if (kind === undefined) return true;
  switch (s) {
    case DemoScenarioId.DestinationClosedDuringProcessing:
      return kind !== DestinationKind.Own;
    case DemoScenarioId.DestinationRestrictedDuringProcessing:
      return kind === DestinationKind.Own;
    case DemoScenarioId.PartnerReject:
    case DemoScenarioId.PartnerTimeoutSettled:
    case DemoScenarioId.PartnerNotReceived:
    case DemoScenarioId.PartnerOutage:
      return kind === DestinationKind.External;
    default:
      return true;
  }
}

/**
 * Implements the processor's execution hooks from the scenario recorded on each transfer, so asynchronous execution
 * stays deterministic across restarts. Account changes are real, persistent operator-style updates (spec §12).
 */
export class ScenarioEffects implements ExecutionHooks {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly partner: PartnerFaultAdmin,
    private readonly timing: ScenarioTiming = DEFAULT_SCENARIO_TIMING,
  ) {}

  beforeExecute(t: TransferRow): void {
    const scenario = t.demo_scenario as DemoScenarioId | null;
    if (!scenario) return;
    const now = this.clock.now();
    const restrict = (accountId: string | null) =>
      accountId &&
      this.db.immediate((tx) =>
        tx.run(
          "UPDATE accounts SET restriction = 'blocked', restriction_reason = 'Restricted by the bank while a transfer was processing (demo).' WHERE id = ? AND restriction = 'none'",
          [accountId],
        ),
      );
    switch (scenario) {
      case DemoScenarioId.DestinationClosedDuringProcessing:
        if (t.destination_kind === DestinationKind.External) {
          if (t.execution_attempts === 0)
            this.partner.setFault(t.id, { rejectAccountClosed: true });
        } else if (t.destination_kind === DestinationKind.Internal && t.destination_account_id) {
          this.db.immediate((tx) =>
            tx.run(
              "UPDATE accounts SET lifecycle = 'closed', closed_at = ? WHERE id = ? AND lifecycle = 'open'",
              [now, t.destination_account_id],
            ),
          );
        }
        break;
      case DemoScenarioId.DestinationRestrictedDuringProcessing:
        if (t.destination_kind !== DestinationKind.External) restrict(t.destination_account_id);
        break;
      case DemoScenarioId.SourceRestrictedDuringProcessing:
        restrict(t.source_account_id);
        break;
      case DemoScenarioId.PartnerReject:
        if (t.execution_attempts === 0) this.partner.setFault(t.id, { rejectAccountClosed: true });
        break;
      case DemoScenarioId.PartnerTimeoutSettled:
        if (t.execution_attempts === 0)
          this.partner.setFault(t.id, { delayAfterCommitMs: this.timing.partnerTimeoutMs + 1_000 });
        break;
      case DemoScenarioId.PartnerNotReceived:
        if (t.execution_attempts === 0) this.partner.setFault(t.id, { dropFirstSubmit: true });
        break;
      case DemoScenarioId.PartnerOutage:
        this.partner.setFault(t.id, { outageUntil: t.created_at + this.timing.outageMs });
        break;
      default:
        break;
    }
  }

  injectFailure(t: TransferRow): boolean {
    return t.demo_scenario === DemoScenarioId.ExecutionFailure;
  }

  executionDelayFor(s: DemoScenarioId | null): number | undefined {
    return s === DemoScenarioId.ExecutionSlow ? this.timing.slowExecutionMs : undefined;
  }

  get slowResponseMs(): number {
    return this.timing.slowResponseMs;
  }

  /** `lookup_limit`: sets the customer's lookup counter to the limit immediately. */
  fillLookupCounter(customerId: string): void {
    const now = this.clock.now();
    this.db.immediate((tx) => {
      tx.run('DELETE FROM lookup_events WHERE customer_id = ?', [customerId]);
      for (let i = 0; i < LOOKUP_LIMIT; i++)
        tx.run('INSERT INTO lookup_events (customer_id, at) VALUES (?, ?)', [
          customerId,
          now - (LOOKUP_LIMIT - i) * 1000,
        ]);
      return null;
    });
  }
}
