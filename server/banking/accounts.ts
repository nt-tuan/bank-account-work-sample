import { ErrorCode } from '../../shared/errors.ts';
import type { Database, Queryable } from '../persistence/sqlite.ts';
import {
  serializeAccountDetail,
  serializeAccountSummary,
  type AccountRow,
  type HoldRow,
} from '../serializers.ts';
import type { AccountDetail, AccountSummary, Bank } from '../../shared/schemas/api.ts';
import { reject } from './errors.ts';

export type BankRow = { id: string; code: string; name: string; is_host_bank: number };

export function findBank(q: Queryable, bankId: string): BankRow | null {
  return q.get<BankRow>('SELECT * FROM banks WHERE id = ?', [bankId]) ?? null;
}

export const ACCOUNT_SQL = `
  SELECT a.*, b.id AS bank_id, b.code AS bank_code, b.name AS bank_name
  FROM accounts a CROSS JOIN banks b ON b.is_host_bank = 1`;

/** Owned and open, or null — closed and other customers' accounts are indistinguishable from missing (spec §9). */
export function findOwnedOpenAccount(
  q: Queryable,
  customerId: string,
  accountId: string,
): AccountRow | null {
  return (
    q.get<AccountRow>(
      `${ACCOUNT_SQL} WHERE a.id = ? AND a.customer_id = ? AND a.lifecycle = 'open'`,
      [accountId, customerId],
    ) ?? null
  );
}

export function createAccountService(db: Database) {
  return {
    list(customerId: string): AccountSummary[] {
      const rows = db.read((q) =>
        q.all<AccountRow>(
          `${ACCOUNT_SQL} WHERE a.customer_id = ? AND a.lifecycle = 'open' ORDER BY (a.restriction = 'blocked'), a.account_number`,
          [customerId],
        ),
      );
      return rows.map(serializeAccountSummary);
    },

    get(customerId: string, accountId: string): AccountDetail {
      return db.read((q) => {
        const account = findOwnedOpenAccount(q, customerId, accountId);
        if (!account) throw reject(ErrorCode.NOT_FOUND);
        const holds = q.all<HoldRow>(
          `SELECT h.id, h.kind, h.amount_minor, h.created_at, h.activity_id, e.description, h.transfer_id
           FROM holds h JOIN activity e ON e.id = h.activity_id
           WHERE h.account_id = ? AND h.state = 'active' ORDER BY h.created_at DESC`,
          [accountId],
        );
        return serializeAccountDetail(account, holds);
      });
    },

    banks(): Bank[] {
      return db
        .read((q) => q.all<BankRow>('SELECT * FROM banks ORDER BY is_host_bank DESC, name'))
        .map((b) => ({ id: b.id, code: b.code, name: b.name, isHostBank: b.is_host_bank === 1 }));
    },
  };
}
