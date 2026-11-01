import type { Database } from './sqlite.ts';

export const SCHEMA_VERSION = 1;

/** Core banking store. Constraints reinforce service validation (spec §6; docs/technical-design/architecture.md §5.3). */
const CORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banks (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(code) = 4 AND code NOT GLOB '*[^0-9]*'),
  name TEXT NOT NULL,
  is_host_bank INTEGER NOT NULL CHECK (is_host_bank IN (0, 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS banks_single_host ON banks(is_host_bank) WHERE is_host_bank = 1;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  account_number TEXT NOT NULL UNIQUE CHECK (length(account_number) = 7 AND account_number NOT GLOB '*[^0-9]*'),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking','savings')),
  currency TEXT NOT NULL DEFAULT 'JPY' CHECK (currency = 'JPY'),
  holder_name TEXT NOT NULL CHECK (length(holder_name) BETWEEN 1 AND 30),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('open','closed')),
  restriction TEXT NOT NULL CHECK (restriction IN ('none','blocked')),
  restriction_reason TEXT,
  opening_balance_minor INTEGER NOT NULL CHECK (opening_balance_minor >= 0),
  current_balance_minor INTEGER NOT NULL CHECK (current_balance_minor >= 0),
  held_minor INTEGER NOT NULL DEFAULT 0 CHECK (held_minor >= 0 AND held_minor <= current_balance_minor),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  CHECK ((lifecycle = 'closed') = (closed_at IS NOT NULL)),
  CHECK ((restriction = 'blocked') = (restriction_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS accounts_customer ON accounts(customer_id);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  source_account_id TEXT NOT NULL REFERENCES accounts(id),
  source_name_snapshot TEXT NOT NULL,
  destination_kind TEXT NOT NULL CHECK (destination_kind IN ('own','internal','external')),
  destination_account_id TEXT REFERENCES accounts(id),
  destination_bank_id TEXT NOT NULL REFERENCES banks(id),
  destination_account_number TEXT NOT NULL,
  recipient_name_snapshot TEXT NOT NULL,
  recipient_name_source TEXT NOT NULL CHECK (recipient_name_source IN ('lookup','manual')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  failure_code TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  failed_at INTEGER,
  delayed_since INTEGER,
  partner_payment_id TEXT,
  execution_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  demo_scenario TEXT,
  CHECK ((destination_kind = 'external') = (destination_account_id IS NULL)),
  CHECK (destination_account_id IS NULL OR destination_account_id <> source_account_id),
  CHECK ((status = 'failed') = (failure_code IS NOT NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((status = 'failed') = (failed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS transfers_due ON transfers(next_attempt_at) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS transfers_customer_created ON transfers(customer_id, created_at);

CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('purchase','income','transfer_in','transfer_out')),
  direction TEXT NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','posted','cancelled')),
  description TEXT NOT NULL,
  counterparty TEXT NOT NULL,
  category TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  posted_at INTEGER,
  cancelled_at INTEGER,
  effective_at INTEGER GENERATED ALWAYS AS (COALESCE(posted_at, occurred_at)) STORED,
  transfer_id TEXT REFERENCES transfers(id),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CHECK (kind <> 'purchase' OR direction = 'debit'),
  CHECK (kind <> 'income' OR direction = 'credit'),
  CHECK (kind <> 'transfer_out' OR direction = 'debit'),
  CHECK (kind <> 'transfer_in' OR direction = 'credit'),
  CHECK (kind NOT IN ('transfer_in','transfer_out') OR (category = 'transfer' AND transfer_id IS NOT NULL)),
  CHECK (kind <> 'income' OR category IN ('salary','other_income')),
  CHECK (kind <> 'purchase' OR category IN ('groceries','dining','transport','housing','utilities','shopping','health','entertainment','subscriptions','education','travel','other'))
);
CREATE INDEX IF NOT EXISTS activity_account_effective ON activity(account_id, effective_at, sequence);
CREATE INDEX IF NOT EXISTS activity_transfer ON activity(transfer_id);

CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  activity_id TEXT NOT NULL UNIQUE REFERENCES activity(id),
  kind TEXT NOT NULL CHECK (kind IN ('merchant_authorization','transfer')),
  transfer_id TEXT UNIQUE REFERENCES transfers(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  state TEXT NOT NULL CHECK (state IN ('active','captured','released')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  CHECK ((kind = 'transfer') = (transfer_id IS NOT NULL)),
  CHECK ((state = 'active') = (resolved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS holds_account_active ON holds(account_id) WHERE state = 'active';

CREATE TABLE IF NOT EXISTS idempotency_records (
  customer_id TEXT NOT NULL REFERENCES customers(id),
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  transfer_id TEXT NOT NULL REFERENCES transfers(id),
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (customer_id, key)
);

CREATE TABLE IF NOT EXISTS lookup_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS lookup_events_customer ON lookup_events(customer_id, at);
`;

export const CORE_TABLES_IN_DELETE_ORDER = [
  'lookup_events',
  'idempotency_records',
  'holds',
  'activity',
  'transfers',
  'accounts',
  'banks',
  'credentials',
  'customers',
  'meta',
] as const;

export function migrateCore(db: Database): void {
  db.exec(CORE_SCHEMA);
}

export function isSeeded(db: Database): boolean {
  return (
    db.read((q) => q.get<{ value: string }>("SELECT value FROM meta WHERE key = 'seed_anchor'")) !==
    undefined
  );
}

/**
 * Verifies the ledger invariants for every account:
 * current = opening + Σ signed posted entries, held = Σ active holds, each active hold matches one pending debit.
 * Returns a list of problems (empty when consistent).
 */
export function reconcile(db: Database): string[] {
  return db.read((q) => {
    const problems: string[] = [];
    const rows = q.all<{
      id: string;
      opening: number;
      current: number;
      held: number;
      posted: number;
      active_holds: number;
    }>(`
      SELECT a.id, a.opening_balance_minor AS opening, a.current_balance_minor AS current, a.held_minor AS held,
        COALESCE((SELECT SUM(CASE direction WHEN 'credit' THEN amount_minor ELSE -amount_minor END)
                  FROM activity WHERE account_id = a.id AND status = 'posted'), 0) AS posted,
        COALESCE((SELECT SUM(amount_minor) FROM holds WHERE account_id = a.id AND state = 'active'), 0) AS active_holds
      FROM accounts a`);
    for (const r of rows) {
      if (r.current !== r.opening + r.posted)
        problems.push(`${r.id}: current ${r.current} != opening ${r.opening} + posted ${r.posted}`);
      if (r.held !== r.active_holds)
        problems.push(`${r.id}: held ${r.held} != active holds ${r.active_holds}`);
    }
    const badHolds = q.all<{ id: string }>(`
      SELECT h.id FROM holds h JOIN activity e ON e.id = h.activity_id
      WHERE h.state = 'active' AND (e.status <> 'pending' OR e.direction <> 'debit' OR e.amount_minor <> h.amount_minor OR e.account_id <> h.account_id)`);
    for (const h of badHolds) problems.push(`hold ${h.id} does not match its pending entry`);
    const orphanPending = q.all<{ id: string }>(`
      SELECT e.id FROM activity e LEFT JOIN holds h ON h.activity_id = e.id AND h.state = 'active'
      WHERE e.status = 'pending' AND h.id IS NULL`);
    for (const e of orphanPending) problems.push(`pending entry ${e.id} has no active hold`);
    return problems;
  });
}
