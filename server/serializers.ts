import {
  type AccountType,
  type Category,
  type DemoScenarioId,
  type HoldKind,
  type HoldState,
  type RecipientNameSource,
  type Restriction,
  type TransferStatus,
  AccountUsabilityStatus,
  ActivityStatus,
  DestinationKind,
  Direction,
  Lifecycle,
} from '../shared/domain/enums.ts';
import type { ExecutionFailureCode } from '../shared/errors.ts';

/**
 * The only place that turns rows into API shapes (docs/technical-design/architecture.md §5.2). It owns the snapshot rule:
 * a counterparty only carries an `accountId` when that account is the viewer's own open account.
 */
import type {
  AccountDetail,
  AccountSummary,
  ActivityDetail,
  ActivityEntry,
  Hold,
  Transfer,
} from '../shared/schemas/api.ts';
import { accountUsability } from '../shared/rules/policy.ts';
import { maskAccountNumber } from '../shared/money.ts';

export const iso = (ms: number) => new Date(ms).toISOString();
const isoOrNull = (ms: number | null) => (ms === null ? null : iso(ms));

export type AccountRow = {
  id: string;
  customer_id: string;
  account_number: string;
  name: string;
  type: AccountType;
  holder_name: string;
  lifecycle: Lifecycle;
  restriction: Restriction;
  restriction_reason: string | null;
  opening_balance_minor: number;
  current_balance_minor: number;
  held_minor: number;
  opened_at: number;
  closed_at: number | null;
  bank_id: string;
  bank_code: string;
  bank_name: string;
};

export function serializeAccountSummary(a: AccountRow): AccountSummary {
  const u = accountUsability(a);
  if (u.status === AccountUsabilityStatus.Closed)
    throw new Error('Closed accounts are never serialized');
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    maskedNumber: maskAccountNumber(a.account_number),
    bank: { id: a.bank_id, code: a.bank_code, name: a.bank_name },
    status: u.status,
    restrictionReason: a.restriction_reason,
    canSend: u.canSend,
    canReceive: u.canReceive,
    currentMinor: a.current_balance_minor,
    heldMinor: a.held_minor,
    availableMinor: a.current_balance_minor - a.held_minor,
    openedAt: iso(a.opened_at),
  };
}

export type HoldRow = {
  id: string;
  kind: HoldKind;
  amount_minor: number;
  created_at: number;
  activity_id: string;
  description: string;
  transfer_id: string | null;
};

export function serializeAccountDetail(a: AccountRow, holds: HoldRow[]): AccountDetail {
  return {
    ...serializeAccountSummary(a),
    accountNumber: a.account_number,
    holderName: a.holder_name,
    currency: 'JPY',
    holds: holds.map((h): Hold => ({
      id: h.id,
      kind: h.kind,
      amountMinor: h.amount_minor,
      createdAt: iso(h.created_at),
      activityId: h.activity_id,
      description: h.description,
      transferId: h.transfer_id,
    })),
  };
}

export type ActivityRow = {
  id: string;
  sequence: number;
  account_id: string;
  account_name: string;
  account_number: string;
  kind: ActivityEntry['kind'];
  direction: ActivityEntry['direction'];
  amount_minor: number;
  status: ActivityEntry['status'];
  description: string;
  counterparty: string;
  category: Category;
  occurred_at: number;
  posted_at: number | null;
  cancelled_at: number | null;
  effective_at: number;
  transfer_reference: string | null;
  owned_transfer_id: string | null;
  transfer_status: Transfer['status'] | null;
  transfer_delayed_since: number | null;
  running_balance_minor: number | null;
};

export function serializeActivity(r: ActivityRow, includeRunningBalance: boolean): ActivityEntry {
  return {
    id: r.id,
    sequence: r.sequence,
    account: {
      id: r.account_id,
      name: r.account_name,
      maskedNumber: maskAccountNumber(r.account_number),
    },
    kind: r.kind,
    direction: r.direction,
    amountMinor: r.amount_minor,
    status: r.status,
    description: r.description,
    counterparty: r.counterparty,
    category: r.category,
    occurredAt: iso(r.occurred_at),
    postedAt: isoOrNull(r.posted_at),
    cancelledAt: isoOrNull(r.cancelled_at),
    effectiveAt: iso(r.effective_at),
    runningBalanceMinor:
      includeRunningBalance && r.status === ActivityStatus.Posted ? r.running_balance_minor : null,
    transferReference: r.transfer_reference,
    transferId: r.owned_transfer_id,
    transferStatus: r.transfer_status,
    transferDelayedSince: isoOrNull(r.transfer_delayed_since),
  };
}

export type TransferRow = {
  id: string;
  customer_id: string;
  source_account_id: string;
  source_name_snapshot: string;
  destination_kind: DestinationKind;
  destination_account_id: string | null;
  destination_bank_id: string;
  destination_account_number: string;
  recipient_name_snapshot: string;
  recipient_name_source: RecipientNameSource;
  amount_minor: number;
  reference: string | null;
  status: TransferStatus;
  failure_code: ExecutionFailureCode | null;
  created_at: number;
  completed_at: number | null;
  failed_at: number | null;
  delayed_since: number | null;
  partner_payment_id: string | null;
  execution_attempts: number;
  next_attempt_at: number | null;
  demo_scenario: DemoScenarioId | null;
};

/** Transfer row joined with what the viewer may know about both ends. */
export type TransferViewRow = TransferRow & {
  source_activity_id: string | null;
  source_account_number: string;
  source_lifecycle: Lifecycle;
  source_customer_id: string;
  dest_bank_code: string;
  dest_bank_name: string;
  dest_account_name: string | null;
  dest_customer_id: string | null;
  dest_lifecycle: Lifecycle | null;
};

export const TRANSFER_VIEW_SQL = `
  SELECT t.*, (SELECT a.id FROM activity a WHERE a.transfer_id = t.id AND a.account_id = t.source_account_id AND a.kind = 'transfer_out' LIMIT 1) AS source_activity_id,
         s.account_number AS source_account_number, s.lifecycle AS source_lifecycle, s.customer_id AS source_customer_id,
         b.code AS dest_bank_code, b.name AS dest_bank_name,
         d.name AS dest_account_name, d.customer_id AS dest_customer_id, d.lifecycle AS dest_lifecycle
  FROM transfers t
  JOIN accounts s ON s.id = t.source_account_id
  JOIN banks b ON b.id = t.destination_bank_id
  LEFT JOIN accounts d ON d.id = t.destination_account_id`;

export function serializeTransfer(t: TransferViewRow, viewerId: string): Transfer {
  const ownDest = t.dest_customer_id === viewerId && t.dest_lifecycle === Lifecycle.Open;
  const ownSource = t.source_customer_id === viewerId && t.source_lifecycle === Lifecycle.Open;
  return {
    id: t.id,
    sourceActivityId: ownSource && t.customer_id === viewerId ? t.source_activity_id : null,
    status: t.status,
    failureCode: t.failure_code,
    delayedSince: isoOrNull(t.delayed_since),
    createdAt: iso(t.created_at),
    completedAt: isoOrNull(t.completed_at),
    failedAt: isoOrNull(t.failed_at),
    amountMinor: t.amount_minor,
    reference: t.reference,
    destinationKind: t.destination_kind,
    source: {
      accountId: ownSource ? t.source_account_id : null,
      name: t.source_name_snapshot,
      maskedNumber: maskAccountNumber(t.source_account_number),
    },
    destination: {
      name:
        t.destination_kind === DestinationKind.Own && ownDest && t.dest_account_name
          ? t.dest_account_name
          : t.recipient_name_snapshot,
      nameSource: t.recipient_name_source,
      bank: { id: t.destination_bank_id, code: t.dest_bank_code, name: t.dest_bank_name },
      maskedNumber: maskAccountNumber(t.destination_account_number),
      accountId: ownDest ? t.destination_account_id : null,
    },
  };
}

export function serializeActivityDetail(
  r: ActivityRow,
  viewerId: string,
  hold: { kind: HoldKind; state: HoldState } | null,
  transfer: TransferViewRow | null,
): ActivityDetail {
  let transferBlock: ActivityDetail['transfer'] = null;
  if (transfer) {
    if (transfer.customer_id === viewerId) {
      const view = serializeTransfer(transfer, viewerId);
      const counterparty =
        r.direction === Direction.Debit
          ? {
              name: view.destination.name,
              bankName: view.destination.bank.name,
              maskedNumber: view.destination.maskedNumber,
              accountId: view.destination.accountId,
            }
          : {
              name: view.source.name,
              bankName: transfer.dest_bank_name,
              maskedNumber: view.source.maskedNumber,
              accountId: view.source.accountId,
            };
      transferBlock = {
        id: transfer.id,
        status: transfer.status,
        reference: transfer.reference,
        counterparty,
        details: view,
      };
    } else {
      // Incoming transfer from another customer: sender's name snapshot and the reference only, no link.
      transferBlock = {
        id: null,
        details: null,
        status: null,
        reference: transfer.reference,
        counterparty: {
          name: transfer.source_name_snapshot,
          bankName: '',
          maskedNumber: '',
          accountId: null,
        },
      };
    }
  }
  return { ...serializeActivity(r, false), hold, transfer: transferBlock };
}
