import {
  type DemoScenarioId,
  DestinationKind,
  LookupOutcome,
  RecipientNameSource,
  TransferDestinationKind,
} from '../../shared/domain/enums.ts';
import { ErrorCode } from '../../shared/errors.ts';
import { createHash } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import type { Database, Tx } from '../persistence/sqlite.ts';
import { type Clock, randomId } from '../clock.ts';
import {
  serializeTransfer,
  TRANSFER_VIEW_SQL,
  type AccountRow,
  type TransferViewRow,
} from '../serializers.ts';
import type { PartnerBankGateway } from '../partner-gateway/gateway.ts';
import type { List, Transfer, TransferQuery } from '../../shared/schemas/api.ts';
import { canonicalCommand, type NormalizedCommand } from '../../shared/rules/command.ts';
import {
  accountUsability,
  transferLimit,
  transferLimitMessage,
} from '../../shared/rules/policy.ts';
import { ACCOUNT_SQL, findBank, findOwnedOpenAccount } from './accounts.ts';
import { nextActivitySequence, resolveDateRange } from './activity.ts';
import { reject } from './errors.ts';

/** Whether order creation committed a new order or replayed an existing response. */
export enum OrderResultKind {
  Created = 'created',
  Replayed = 'replayed',
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type OrderResult = { kind: OrderResultKind; status: number; body: Transfer };

export type OrderOptions = {
  /** Demo scenario recorded on the order so asynchronous execution is deterministic. Core rules never branch on it. */
  demoScenarioFor?: (kind: DestinationKind) => DemoScenarioId | null;
  /** Overrides the delay before the first execution step. */
  executionDelayMs?: number;
};

/** Pre-order recipient resolution; unresolved allows execution to verify the recipient later. */
enum ExternalResolution {
  Found = 'found',
  NotFound = 'not_found',
  CannotReceive = 'cannot_receive',
  Unresolved = 'unresolved',
}

const EXTERNAL_RESOLUTION: Record<LookupOutcome, ExternalResolution> = {
  [LookupOutcome.Found]: ExternalResolution.Found,
  [LookupOutcome.NotFound]: ExternalResolution.NotFound,
  [LookupOutcome.CannotReceive]: ExternalResolution.CannotReceive,
  [LookupOutcome.Unavailable]: ExternalResolution.Unresolved,
};

export function hashCommand(cmd: NormalizedCommand): string {
  return createHash('sha256').update(canonicalCommand(cmd)).digest('hex');
}

export function createTransferService(deps: {
  db: Database;
  clock: Clock;
  gateway: PartnerBankGateway;
  internalExecutionDelayMs: number;
  onOrderCreated?: () => void;
}) {
  const { db, clock, gateway } = deps;

  /** Resolution and business rules in one fixed order, so the client can rely on it (docs/technical-design/features/transfers.md). */
  function resolveDestination(
    tx: Tx,
    customerId: string,
    cmd: NormalizedCommand,
    source: AccountRow,
    external: ExternalResolution,
  ) {
    const d = cmd.destination;
    if (d.kind === TransferDestinationKind.Own) {
      const dest = findOwnedOpenAccount(tx, customerId, d.accountId);
      if (dest && dest.id === source.id) throw reject(ErrorCode.SAME_ACCOUNT);
      if (!dest) throw reject(ErrorCode.RECIPIENT_NOT_FOUND);
      if (!accountUsability(dest).canReceive) throw reject(ErrorCode.DESTINATION_UNAVAILABLE);
      return {
        kind: DestinationKind.Own,
        account: dest,
        bank: { id: dest.bank_id },
        accountNumber: dest.account_number,
        name: dest.holder_name,
        nameSource: RecipientNameSource.Lookup,
      };
    }
    const bank = findBank(tx, d.bankId);
    if (!bank) throw reject(ErrorCode.VALIDATION_ERROR, { 'destination.bankId': 'Choose a bank.' });
    if (bank.is_host_bank === 1) {
      const dest = tx.get<AccountRow>(`${ACCOUNT_SQL} WHERE a.account_number = ?`, [
        d.accountNumber,
      ]);
      if (dest && dest.id === source.id) throw reject(ErrorCode.SAME_ACCOUNT);
      if (!dest) throw reject(ErrorCode.RECIPIENT_NOT_FOUND);
      if (!accountUsability(dest).canReceive) throw reject(ErrorCode.DESTINATION_UNAVAILABLE);
      // A recipient that resolves to one of the customer's own accounts is classified `own` (spec §10).
      const kind = dest.customer_id === customerId ? DestinationKind.Own : DestinationKind.Internal;
      return {
        kind,
        account: dest,
        bank: { id: bank.id },
        accountNumber: dest.account_number,
        name: d.recipientName,
        nameSource: d.recipientNameSource,
      };
    }
    if (external === ExternalResolution.NotFound) throw reject(ErrorCode.RECIPIENT_NOT_FOUND);
    if (external === ExternalResolution.CannotReceive)
      throw reject(ErrorCode.DESTINATION_UNAVAILABLE);
    return {
      kind: DestinationKind.External,
      account: null,
      bank: { id: bank.id },
      accountNumber: d.accountNumber,
      name: d.recipientName,
      nameSource: d.recipientNameSource,
    };
  }

  async function createOrder(
    customerId: string,
    key: string,
    cmd: NormalizedCommand,
    opts: OrderOptions = {},
  ): Promise<OrderResult> {
    // Outside the transaction: the optional partner inquiry (spec §7 step 2). Not counted toward the lookup limit.
    let external: ExternalResolution = ExternalResolution.Unresolved;
    const d = cmd.destination;
    if (d.kind === TransferDestinationKind.Recipient) {
      const bank = db.read((q) => findBank(q, d.bankId));
      if (bank && bank.is_host_bank === 0) {
        const r = await gateway.inquire(bank.code, d.accountNumber);
        external = EXTERNAL_RESOLUTION[r.outcome];
      }
    }
    const requestHash = hashCommand(cmd);
    const result = db.immediate((tx): OrderResult => {
      const now = clock.now();
      tx.run(
        'DELETE FROM idempotency_records WHERE customer_id = ? AND key = ? AND expires_at <= ?',
        [customerId, key, now],
      );
      // Replay lookup precedes business checks, so a replay returns the original result even if state has changed.
      const existing = tx.get<{
        request_hash: string;
        response_status: number;
        response_body: string;
      }>(
        'SELECT request_hash, response_status, response_body FROM idempotency_records WHERE customer_id = ? AND key = ?',
        [customerId, key],
      );
      if (existing) {
        if (existing.request_hash !== requestHash) throw reject(ErrorCode.IDEMPOTENCY_KEY_REUSED);
        const body = JSON.parse(existing.response_body) as Transfer;
        // Older stored responses predate Activity Details navigation.
        if (body.sourceActivityId === undefined) {
          const row = tx.get<TransferViewRow>(
            `${TRANSFER_VIEW_SQL} WHERE t.id = ? AND t.customer_id = ?`,
            [body.id, customerId],
          );
          body.sourceActivityId = row ? serializeTransfer(row, customerId).sourceActivityId : null;
        }
        return { kind: OrderResultKind.Replayed, status: existing.response_status, body };
      }

      const source = findOwnedOpenAccount(tx, customerId, cmd.sourceAccountId);
      if (!source) throw reject(ErrorCode.NOT_FOUND);
      if (!accountUsability(source).canSend)
        throw reject(
          ErrorCode.SOURCE_UNAVAILABLE,
          undefined,
          `This account can't send transfers right now. ${source.restriction_reason ?? ''}`.trim(),
        );
      const dest = resolveDestination(tx, customerId, cmd, source, external);
      const { maxMinor } = transferLimit({ customerId });
      if (cmd.amountMinor > maxMinor)
        throw reject(ErrorCode.TRANSFER_LIMIT_EXCEEDED, undefined, transferLimitMessage(maxMinor));
      if (cmd.amountMinor > source.current_balance_minor - source.held_minor)
        throw reject(ErrorCode.INSUFFICIENT_FUNDS);

      const id = randomId('TRF');
      const firstAttemptAt =
        now +
        (opts.executionDelayMs ??
          (dest.kind === DestinationKind.External ? 0 : deps.internalExecutionDelayMs));
      tx.run(
        `INSERT INTO transfers (id, customer_id, source_account_id, source_name_snapshot, destination_kind, destination_account_id,
           destination_bank_id, destination_account_number, recipient_name_snapshot, recipient_name_source, amount_minor, reference,
           status, created_at, next_attempt_at, demo_scenario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?, ?)`,
        [
          id,
          customerId,
          source.id,
          source.name,
          dest.kind,
          dest.account?.id ?? null,
          dest.bank.id,
          dest.accountNumber,
          dest.name,
          dest.nameSource,
          cmd.amountMinor,
          cmd.reference ?? null,
          now,
          firstAttemptAt,
          opts.demoScenarioFor?.(dest.kind) ?? null,
        ],
      );
      const label = dest.kind === DestinationKind.Own ? dest.account!.name : dest.name;
      const sequence = nextActivitySequence(tx);
      const activityId = randomId('ACT');
      tx.run(
        `INSERT INTO activity (id, sequence, account_id, kind, direction, amount_minor, status, description, counterparty, category, occurred_at, transfer_id)
         VALUES (?, ?, ?, 'transfer_out', 'debit', ?, 'pending', ?, ?, 'transfer', ?, ?)`,
        [activityId, sequence, source.id, cmd.amountMinor, `To ${label}`, label, now, id],
      );
      tx.run(
        `INSERT INTO holds (id, account_id, activity_id, kind, transfer_id, amount_minor, state, created_at)
         VALUES (?, ?, ?, 'transfer', ?, ?, 'active', ?)`,
        [randomId('HLD'), source.id, activityId, id, cmd.amountMinor, now],
      );
      // held_minor is CHECKed against current_balance_minor by SQLite, so overspending cannot commit.
      tx.run('UPDATE accounts SET held_minor = held_minor + ? WHERE id = ?', [
        cmd.amountMinor,
        source.id,
      ]);

      const view = tx.get<TransferViewRow>(`${TRANSFER_VIEW_SQL} WHERE t.id = ?`, [id])!;
      const body = serializeTransfer(view, customerId);
      tx.run(
        `INSERT INTO idempotency_records (customer_id, key, request_hash, transfer_id, response_status, response_body, created_at, expires_at)
         VALUES (?, ?, ?, ?, 202, ?, ?, ?)`,
        [customerId, key, requestHash, id, JSON.stringify(body), now, now + IDEMPOTENCY_TTL_MS],
      );
      tx.run('DELETE FROM lookup_events WHERE customer_id = ?', [customerId]);
      return { kind: OrderResultKind.Created, status: 202, body };
    });
    if (result.kind === OrderResultKind.Created) deps.onOrderCreated?.();
    return result;
  }

  return {
    createOrder,

    get(customerId: string, transferId: string): Transfer {
      const row = db.read((q) =>
        q.get<TransferViewRow>(`${TRANSFER_VIEW_SQL} WHERE t.id = ? AND t.customer_id = ?`, [
          transferId,
          customerId,
        ]),
      );
      if (!row) throw reject(ErrorCode.NOT_FOUND);
      return serializeTransfer(row, customerId);
    },

    list(customerId: string, query: TransferQuery): List<Transfer> {
      return db.read((q) => {
        const params: Record<string, SQLInputValue> = { customerId };
        const where = ['t.customer_id = :customerId'];
        if (query.accountId) {
          if (!findOwnedOpenAccount(q, customerId, query.accountId))
            throw reject(ErrorCode.NOT_FOUND);
          where.push('t.source_account_id = :accountId');
          params.accountId = query.accountId;
        }
        if (query.status) {
          where.push('t.status = :status');
          params.status = query.status;
        }
        const search = query.q?.trim().toLowerCase();
        if (search) {
          where.push(
            "(instr(lower(t.recipient_name_snapshot), :q) > 0 OR instr(lower(coalesce(t.reference, '')), :q) > 0 OR instr(lower(t.id), :q) > 0 OR instr(lower(coalesce(d.name, '')), :q) > 0)",
          );
          params.q = search;
        }
        const range = resolveDateRange(query);
        if (range) {
          where.push('t.created_at >= :fromMs AND t.created_at < :toMs');
          params.fromMs = range.fromMs;
          params.toMs = range.toMs;
        }
        const base = `${TRANSFER_VIEW_SQL} WHERE ${where.join(' AND ')}`;
        const total = q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${base})`, params)?.n ?? 0;
        const rows = q.all<TransferViewRow>(
          `${base} ORDER BY t.created_at DESC, t.id DESC LIMIT :limit OFFSET :offset`,
          {
            ...params,
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize,
          },
        );
        return {
          items: rows.map((r) => serializeTransfer(r, customerId)),
          page: query.page,
          pageSize: query.pageSize,
          total,
        };
      });
    },
  };
}
