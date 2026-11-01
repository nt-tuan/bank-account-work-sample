import { ErrorCode } from '../../shared/errors.ts';
import { type HoldKind, type HoldState, SortOrder } from '../../shared/domain/enums.ts';
import type { Database, Queryable } from '../persistence/sqlite.ts';
import type { SQLInputValue } from 'node:sqlite';
import type { Clock } from '../clock.ts';
import {
  serializeActivity,
  serializeActivityDetail,
  TRANSFER_VIEW_SQL,
  type ActivityRow,
  type TransferViewRow,
} from '../serializers.ts';
import type { ActivityDetail, ActivityList, ActivityQuery } from '../../shared/schemas/api.ts';
import { isIsoDate, jstDateRange, jstMonthOf, jstMonthRange } from '../../shared/time.ts';
import { findOwnedOpenAccount } from './accounts.ts';
import { reject } from './errors.ts';

const ENTRY_COLUMNS = `
  a.id, a.sequence, a.account_id, acc.name AS account_name, acc.account_number, a.kind, a.direction, a.amount_minor, a.status,
  a.description, a.counterparty, a.category, a.occurred_at, a.posted_at, a.cancelled_at, a.effective_at, t.reference AS transfer_reference,
  CASE WHEN t.customer_id = acc.customer_id THEN t.id END AS owned_transfer_id,
  CASE WHEN t.customer_id = acc.customer_id THEN t.status END AS transfer_status,
  CASE WHEN t.customer_id = acc.customer_id THEN t.delayed_since END AS transfer_delayed_since`;

/** Next stable ordering value for a new activity entry; call inside the write transaction that inserts it. */
export function nextActivitySequence(q: Queryable): number {
  return q.get<{ s: number }>('SELECT COALESCE(MAX(sequence), 0) + 1 AS s FROM activity')!.s;
}

type DateRangeQuery = { from?: string | undefined; to?: string | undefined };

/** Validates an inclusive JST date range and returns its half-open UTC interval, or null when no range is given. */
export function resolveDateRange(query: DateRangeQuery) {
  if (!query.from && !query.to) return null;
  if (!query.from || !query.to)
    throw reject(ErrorCode.VALIDATION_ERROR, {
      [query.from ? 'to' : 'from']: 'Enter both dates.',
    });
  if (!isIsoDate(query.from))
    throw reject(ErrorCode.VALIDATION_ERROR, { from: 'Enter a valid date.' });
  if (!isIsoDate(query.to)) throw reject(ErrorCode.VALIDATION_ERROR, { to: 'Enter a valid date.' });
  if (query.to < query.from)
    throw reject(ErrorCode.VALIDATION_ERROR, { to: '“To” must be on or after “From”.' });
  return jstDateRange(query.from, query.to);
}

/** Resolves the period filter to a half-open UTC interval; month defaults to the current JST month (spec §4). */
export function resolvePeriod(query: DateRangeQuery & { month?: string | undefined }, now: number) {
  if (query.month && (query.from || query.to))
    throw reject(ErrorCode.VALIDATION_ERROR, {
      month: 'Choose a month or a date range, not both.',
    });
  return resolveDateRange(query) ?? jstMonthRange(query.month ?? jstMonthOf(now));
}

export function createActivityService(db: Database, clock: Clock) {
  return {
    list(customerId: string, query: ActivityQuery): ActivityList {
      const { fromMs, toMs } = resolvePeriod(query, clock.now());
      return db.read((q) => {
        const params: Record<string, SQLInputValue> = { customerId, fromMs, toMs };
        const where = [
          'acc.customer_id = :customerId',
          "acc.lifecycle = 'open'",
          'a.effective_at >= :fromMs',
          'a.effective_at < :toMs',
        ];
        const single = query.accountId !== undefined;
        if (single) {
          if (!findOwnedOpenAccount(q, customerId, query.accountId!))
            throw reject(ErrorCode.NOT_FOUND);
          where.push('a.account_id = :accountId');
          params.accountId = query.accountId!;
        }
        const search = query.q?.trim().toLowerCase();
        if (search) {
          // instr() avoids LIKE wildcard escaping for user input.
          where.push(
            "(instr(lower(a.description), :q) > 0 OR instr(lower(a.counterparty), :q) > 0 OR instr(lower(coalesce(t.reference, '')), :q) > 0 OR instr(lower(coalesce(t.id, '')), :q) > 0)",
          );
          params.q = search;
        }
        if (query.transferStatus) {
          where.push('t.customer_id = :customerId', 't.status = :transferStatus');
          params.transferStatus = query.transferStatus;
        }
        if (query.direction) {
          where.push('a.direction = :direction');
          params.direction = query.direction;
        }
        if (query.status) {
          where.push('a.status = :status');
          params.status = query.status;
        }
        if (query.category) {
          where.push('a.category = :category');
          params.category = query.category;
        }
        const order = query.sort === SortOrder.Asc ? 'ASC' : 'DESC';
        // Running balance comes from the complete posted ledger first; filters apply afterwards (spec §4, AC-04).
        const ledger = single
          ? `WITH ledger AS (
               SELECT e.id, acc2.opening_balance_minor + SUM(CASE e.direction WHEN 'credit' THEN e.amount_minor ELSE -e.amount_minor END)
                 OVER (ORDER BY e.posted_at, e.sequence ROWS UNBOUNDED PRECEDING) AS running_balance_minor
               FROM activity e JOIN accounts acc2 ON acc2.id = e.account_id
               WHERE e.account_id = :accountId AND e.status = 'posted')`
          : '';
        const from = `FROM activity a JOIN accounts acc ON acc.id = a.account_id LEFT JOIN transfers t ON t.id = a.transfer_id
          ${single ? 'LEFT JOIN ledger ON ledger.id = a.id' : ''}
          WHERE ${where.join(' AND ')}`;
        const total =
          q.get<{ n: number }>(`${ledger} SELECT COUNT(*) AS n ${from}`, params)?.n ?? 0;
        const rows = q.all<ActivityRow>(
          `${ledger} SELECT ${ENTRY_COLUMNS}, ${single ? 'ledger.running_balance_minor' : 'NULL AS running_balance_minor'}
           ${from} ORDER BY a.effective_at ${order}, a.sequence ${order} LIMIT :limit OFFSET :offset`,
          { ...params, limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
        );
        return {
          items: rows.map((r) => serializeActivity(r, single)),
          page: query.page,
          pageSize: query.pageSize,
          total,
          runningBalance: single,
        };
      });
    },

    get(customerId: string, activityId: string): ActivityDetail {
      return db.read((q) => {
        const row = q.get<ActivityRow & { transfer_id: string | null }>(
          `SELECT ${ENTRY_COLUMNS}, a.transfer_id, NULL AS running_balance_minor
           FROM activity a JOIN accounts acc ON acc.id = a.account_id LEFT JOIN transfers t ON t.id = a.transfer_id
           WHERE a.id = ? AND acc.customer_id = ? AND acc.lifecycle = 'open'`,
          [activityId, customerId],
        );
        if (!row) throw reject(ErrorCode.NOT_FOUND);
        const hold = q.get<{ kind: HoldKind; state: HoldState }>(
          'SELECT kind, state FROM holds WHERE activity_id = ?',
          [activityId],
        );
        const transfer = row.transfer_id
          ? (q.get<TransferViewRow>(`${TRANSFER_VIEW_SQL} WHERE t.id = ?`, [row.transfer_id]) ??
            null)
          : null;
        return serializeActivityDetail(row, customerId, hold ?? null, transfer);
      });
    },
  };
}
