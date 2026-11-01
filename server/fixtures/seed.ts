import {
  ActivityKind,
  ActivityStatus,
  Category,
  DestinationKind,
  Direction,
  HoldKind,
  HoldState,
  Lifecycle,
  RecipientNameSource,
  Restriction,
  TransferStatus,
} from '../../shared/domain/enums.ts';
import { ExecutionFailureCode } from '../../shared/errors.ts';
import type { Database, Tx } from '../persistence/sqlite.ts';
import { CORE_TABLES_IN_DELETE_ORDER, SCHEMA_VERSION, reconcile } from '../persistence/schema.ts';
import { hashPassword } from '../auth/password.ts';
import { JST_OFFSET_MS } from '../../shared/time.ts';
import {
  ACCOUNTS,
  BANKS,
  CUSTOMERS,
  MAIN_CUSTOMER_ID,
  MERCHANTS,
  type AccountDef,
} from './definitions.ts';

/** A deterministic PRNG so a given anchor always produces the same data (docs/technical-design/architecture.md §5.4). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

type ActivityRow = {
  id: string;
  sequence: number;
  account_id: string;
  kind: ActivityKind;
  direction: Direction;
  amount_minor: number;
  status: ActivityStatus;
  description: string;
  counterparty: string;
  category: Category;
  occurred_at: number;
  posted_at: number | null;
  cancelled_at: number | null;
  transfer_id: string | null;
};

type HoldRow = {
  id: string;
  account_id: string;
  activity_id: string;
  kind: HoldKind;
  transfer_id: string | null;
  amount_minor: number;
  state: HoldState;
  created_at: number;
  resolved_at: number | null;
};

type TransferRow = {
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
  status: TransferStatus.Completed | TransferStatus.Failed;
  failure_code: ExecutionFailureCode | null;
  created_at: number;
  completed_at: number | null;
  failed_at: number | null;
  partner_payment_id: string | null;
  execution_attempts: number;
};

/** A seeded external transfer as the partner recorded it, in domain terms; the composition root maps it to partner codes. */
export type SeedPartnerPayment = {
  paymentId: string;
  transferId: string;
  bankCode: string;
  accountNumber: string;
  beneficiaryName: string;
  amountMinor: number;
  receivedAt: number;
  /** `settled`, or the execution failure the partner reported. */
  result:
    | 'settled'
    | ExecutionFailureCode.RECIPIENT_NAME_MISMATCH
    | ExecutionFailureCode.DESTINATION_REJECTED;
};

type AccountRow = AccountDef & {
  opening: number;
  current: number;
  held: number;
  openedAt: number;
  closedAt: number | null;
};

export type SeedPlan = {
  anchor: number;
  accounts: AccountRow[];
  activity: ActivityRow[];
  holds: HoldRow[];
  transfers: TransferRow[];
  partnerPayments: SeedPartnerPayment[];
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function buildSeedPlan(anchor: number): SeedPlan {
  const rand = mulberry32(Math.floor(anchor / 1000) % 2 ** 32);
  const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const code = (n: number) =>
    Array.from({ length: n }, () => CROCKFORD[Math.floor(rand() * 32)]).join('');
  const roundTo = (n: number, step: number) => Math.round(n / step) * step;

  const windowStart = anchor - 183 * DAY;
  const accountById = new Map(ACCOUNTS.map((a) => [a.id, a]));
  const bankByCode = new Map<string, (typeof BANKS)[number]>(BANKS.map((b) => [b.code, b]));

  const activity: Omit<ActivityRow, 'sequence'>[] = [];
  const holds: HoldRow[] = [];
  const transfers: TransferRow[] = [];
  const partnerPayments: SeedPartnerPayment[] = [];
  let actCounter = 0;
  const actId = () => `act_${(++actCounter).toString(36).padStart(4, '0')}${code(4).toLowerCase()}`;
  const inWindow = (at: number) => at >= windowStart && at < anchor - HOUR;

  /** JST wall-clock time → UTC ms. */
  const jst = (y: number, m: number, d: number, h: number, min = 0) =>
    Date.UTC(y, m, d, h, min) - JST_OFFSET_MS;

  function purchase(
    accountId: string,
    at: number,
    category: Category,
    opts: { merchant?: string; amount?: number; status?: ActivityStatus } = {},
  ) {
    if (!inWindow(at) && opts.status !== ActivityStatus.Pending) return;
    const m = opts.merchant
      ? { name: opts.merchant, min: opts.amount ?? 0, max: opts.amount ?? 0 }
      : pick(MERCHANTS[category] ?? []);
    const amount = opts.amount ?? roundTo(int(m.min, m.max), 10);
    const status = opts.status ?? ActivityStatus.Posted;
    const id = actId();
    activity.push({
      id,
      account_id: accountId,
      kind: ActivityKind.Purchase,
      direction: Direction.Debit,
      amount_minor: amount,
      status,
      description: m.name,
      counterparty: m.name,
      category,
      occurred_at: at,
      posted_at: status === ActivityStatus.Posted ? at : null,
      cancelled_at: status === ActivityStatus.Cancelled ? at + 6 * HOUR : null,
      transfer_id: null,
    });
    if (status !== ActivityStatus.Posted) {
      holds.push({
        id: `hold_${id}`,
        account_id: accountId,
        activity_id: id,
        kind: HoldKind.MerchantAuthorization,
        transfer_id: null,
        amount_minor: amount,
        state: status === ActivityStatus.Pending ? HoldState.Active : HoldState.Released,
        created_at: at,
        resolved_at: status === ActivityStatus.Pending ? null : at + 6 * HOUR,
      });
    }
  }

  function income(
    accountId: string,
    at: number,
    description: string,
    category: Category.Salary | Category.OtherIncome,
    amount: number,
  ) {
    if (!inWindow(at)) return;
    activity.push({
      id: actId(),
      account_id: accountId,
      kind: ActivityKind.Income,
      direction: Direction.Credit,
      amount_minor: amount,
      status: ActivityStatus.Posted,
      description,
      counterparty: description.replace(/^.*— /, ''),
      category,
      occurred_at: at,
      posted_at: at,
      cancelled_at: null,
      transfer_id: null,
    });
  }

  function transfer(t: {
    customerId?: string;
    source: string;
    at: number;
    amount: number;
    reference?: string;
    dest:
      | {
          kind: DestinationKind.Own | DestinationKind.Internal;
          accountId: string;
          nameSource?: RecipientNameSource;
          enteredName?: string;
        }
      | {
          kind: DestinationKind.External;
          bankCode: string;
          accountNumber: string;
          name: string;
          nameSource: RecipientNameSource;
        };
    outcome: TransferStatus.Completed | TransferStatus.Failed;
    failureCode?:
      | ExecutionFailureCode.RECIPIENT_NAME_MISMATCH
      | ExecutionFailureCode.DESTINATION_REJECTED
      | ExecutionFailureCode.DESTINATION_UNAVAILABLE
      | ExecutionFailureCode.PROCESSING_FAILED;
  }) {
    if (!inWindow(t.at)) return;
    const source = accountById.get(t.source)!;
    const id = `TRF-${code(4)}-${code(4)}`;
    const done = t.at + 2_000;
    let destAccount: AccountDef | undefined;
    let bankId: string;
    let destNumber: string;
    let name: string;
    let nameSource: RecipientNameSource;
    if (t.dest.kind === DestinationKind.External) {
      bankId = bankByCode.get(t.dest.bankCode)!.id;
      destNumber = t.dest.accountNumber;
      name = t.dest.name;
      nameSource = t.dest.nameSource;
    } else {
      destAccount = accountById.get(t.dest.accountId)!;
      bankId = 'bank_host';
      destNumber = destAccount.accountNumber;
      name = t.dest.enteredName ?? destAccount.holderName;
      nameSource = t.dest.nameSource ?? RecipientNameSource.Lookup;
    }
    const ok = t.outcome === TransferStatus.Completed;
    let paymentId: string | null = null;
    if (t.dest.kind === DestinationKind.External) {
      paymentId = `PN${code(12)}`;
      partnerPayments.push({
        paymentId,
        transferId: id,
        bankCode: t.dest.bankCode,
        accountNumber: destNumber,
        beneficiaryName: name,
        amountMinor: t.amount,
        receivedAt: t.at + 1_000,
        result: ok
          ? 'settled'
          : t.failureCode === ExecutionFailureCode.RECIPIENT_NAME_MISMATCH
            ? ExecutionFailureCode.RECIPIENT_NAME_MISMATCH
            : ExecutionFailureCode.DESTINATION_REJECTED,
      });
      if (!ok) paymentId = null;
    }
    transfers.push({
      id,
      customer_id: t.customerId ?? MAIN_CUSTOMER_ID,
      source_account_id: source.id,
      source_name_snapshot:
        t.customerId && t.customerId !== MAIN_CUSTOMER_ID ? source.holderName : source.name,
      destination_kind: t.dest.kind,
      destination_account_id: destAccount?.id ?? null,
      destination_bank_id: bankId,
      destination_account_number: destNumber,
      recipient_name_snapshot: name,
      recipient_name_source: nameSource,
      amount_minor: t.amount,
      reference: t.reference ?? null,
      status: t.outcome,
      failure_code: ok ? null : (t.failureCode ?? ExecutionFailureCode.PROCESSING_FAILED),
      created_at: t.at,
      completed_at: ok ? done : null,
      failed_at: ok ? null : done,
      partner_payment_id: paymentId,
      execution_attempts: t.dest.kind === DestinationKind.External ? 1 : 0,
    });
    const debitDescription =
      t.dest.kind === DestinationKind.Own ? `To ${destAccount!.name}` : `To ${name}`;
    const debitId = actId();
    activity.push({
      id: debitId,
      account_id: source.id,
      kind: ActivityKind.TransferOut,
      direction: Direction.Debit,
      amount_minor: t.amount,
      status: ok ? ActivityStatus.Posted : ActivityStatus.Cancelled,
      description: debitDescription,
      counterparty: t.dest.kind === DestinationKind.Own ? destAccount!.name : name,
      category: Category.Transfer,
      occurred_at: t.at,
      posted_at: ok ? done : null,
      cancelled_at: ok ? null : done,
      transfer_id: id,
    });
    holds.push({
      id: `hold_${debitId}`,
      account_id: source.id,
      activity_id: debitId,
      kind: HoldKind.Transfer,
      transfer_id: id,
      amount_minor: t.amount,
      state: ok ? HoldState.Captured : HoldState.Released,
      created_at: t.at,
      resolved_at: done,
    });
    if (ok && destAccount) {
      const fromName = t.dest.kind === DestinationKind.Own ? source.name : source.holderName;
      activity.push({
        id: actId(),
        account_id: destAccount.id,
        kind: ActivityKind.TransferIn,
        direction: Direction.Credit,
        amount_minor: t.amount,
        status: ActivityStatus.Posted,
        description: `From ${fromName}`,
        counterparty: fromName,
        category: Category.Transfer,
        occurred_at: t.at,
        posted_at: done,
        cancelled_at: null,
        transfer_id: id,
      });
    }
  }

  /* ---------- Expand the definitions over every JST month touching the window ---------- */
  const startJst = new Date(windowStart + JST_OFFSET_MS);
  const endJst = new Date(anchor + JST_OFFSET_MS);
  let y = startJst.getUTCFullYear();
  let m = startJst.getUTCMonth();
  let monthIndex = 0;
  while (
    y < endJst.getUTCFullYear() ||
    (y === endJst.getUTCFullYear() && m <= endJst.getUTCMonth())
  ) {
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const day = () => int(1, daysInMonth);
    const everyday = 'acc_everyday';

    income(everyday, jst(y, m, 25, 9), 'Salary — Nishikawa Design Co.', Category.Salary, 312_000);
    if (m === 6)
      income(
        everyday,
        jst(y, m, 10, 9),
        'Summer bonus — Nishikawa Design Co.',
        Category.Salary,
        236_000,
      );
    if (m === 11)
      income(
        everyday,
        jst(y, m, 10, 9),
        'Winter bonus — Nishikawa Design Co.',
        Category.Salary,
        254_000,
      );
    income(
      everyday,
      jst(y, m, 5, 6),
      'Card cashback — Demo Card',
      Category.OtherIncome,
      roundTo(int(400, 1_600), 10),
    );

    for (let i = 0; i < 12; i++)
      purchase(everyday, jst(y, m, day(), int(8, 21), int(0, 59)), Category.Groceries);
    for (let i = 0; i < 10; i++)
      purchase(everyday, jst(y, m, day(), int(11, 22), int(0, 59)), Category.Dining);
    for (let i = 0; i < 4; i++)
      purchase(everyday, jst(y, m, day(), int(7, 23), int(0, 59)), Category.Transport);
    purchase(everyday, jst(y, m, 27, 10), Category.Housing, {
      merchant: 'Ebisu Heights management fee',
      amount: 12_000,
    });
    purchase(everyday, jst(y, m, 15, 10), Category.Utilities, {
      merchant: 'Tokyo Electric Power',
      amount: roundTo(int(6_200, 11_400), 1),
    });
    purchase(everyday, jst(y, m, 16, 10), Category.Utilities, {
      merchant: 'Tokyo Gas',
      amount: roundTo(int(3_100, 7_200), 1),
    });
    purchase(everyday, jst(y, m, 20, 10), Category.Utilities, {
      merchant: 'Docomo mobile',
      amount: 4_980,
    });
    if (m % 2 === 0)
      purchase(everyday, jst(y, m, 18, 10), Category.Utilities, {
        merchant: 'Tokyo Waterworks',
        amount: roundTo(int(4_200, 6_100), 1),
      });
    purchase(everyday, jst(y, m, 3, 4), Category.Subscriptions, {
      merchant: 'Netflix',
      amount: 1_490,
    });
    purchase(everyday, jst(y, m, 8, 4), Category.Subscriptions, {
      merchant: 'Spotify',
      amount: 980,
    });
    purchase(everyday, jst(y, m, 12, 4), Category.Subscriptions, {
      merchant: 'iCloud storage',
      amount: 400,
    });
    for (let i = 0; i < 2; i++)
      purchase(everyday, jst(y, m, day(), int(10, 20)), Category.Shopping);
    purchase(everyday, jst(y, m, day(), int(10, 18)), Category.Health);
    purchase(everyday, jst(y, m, day(), int(13, 21)), Category.Entertainment);
    purchase(everyday, jst(y, m, day(), int(10, 20)), Category.Education);
    purchase(everyday, jst(y, m, day(), int(9, 17)), Category.Other);

    // Travel fund pays for trips.
    purchase('acc_travel', jst(y, m, int(1, 14), int(8, 20)), Category.Travel);
    if (monthIndex % 2 === 1)
      purchase('acc_travel', jst(y, m, int(15, 28), int(8, 20)), Category.Travel);

    // Monthly transfers.
    transfer({
      source: everyday,
      at: jst(y, m, 25, 10),
      amount: 50_000,
      dest: { kind: DestinationKind.Own, accountId: 'acc_savings' },
      outcome: TransferStatus.Completed,
    });
    transfer({
      source: everyday,
      at: jst(y, m, 26, 10),
      amount: 40_000,
      reference: 'Rent reserve',
      dest: { kind: DestinationKind.Own, accountId: 'acc_rent' },
      outcome: TransferStatus.Completed,
    });
    transfer({
      source: everyday,
      at: jst(y, m, 28, 9, 30),
      amount: 85_000,
      reference: `Rent ${String(m + 2 > 12 ? 1 : m + 2).padStart(2, '0')}`,
      dest: { kind: DestinationKind.Internal, accountId: 'acc_misaki' },
      outcome: TransferStatus.Completed,
    });

    // Old payroll: last salaries from a previous employer, a few purchases.
    if (monthIndex <= 1) {
      income(
        'acc_payroll',
        jst(y, m, 20, 9),
        'Salary — Kitamura Trading',
        Category.Salary,
        180_000,
      );
      purchase('acc_payroll', jst(y, m, 22, 12), Category.Groceries);
      purchase('acc_payroll', jst(y, m, 23, 19), Category.Dining);
      transfer({
        source: 'acc_payroll',
        at: jst(y, m, 24, 10),
        amount: 150_000,
        dest: { kind: DestinationKind.Own, accountId: 'acc_savings' },
        outcome: TransferStatus.Completed,
      });
    }

    // Scripted one-off events.
    if (monthIndex === 1) {
      transfer({
        source: 'acc_savings',
        at: jst(y, m, 12, 11),
        amount: 100_000,
        reference: 'Trip Dec',
        dest: { kind: DestinationKind.Own, accountId: 'acc_travel' },
        outcome: TransferStatus.Completed,
      });
      transfer({
        source: everyday,
        at: jst(y, m, 19, 21),
        amount: 20_000,
        reference: 'Birthday',
        dest: { kind: DestinationKind.Internal, accountId: 'acc_haruka' },
        outcome: TransferStatus.Failed,
        failureCode: ExecutionFailureCode.DESTINATION_UNAVAILABLE,
      });
    }
    if (monthIndex === 2) {
      transfer({
        source: everyday,
        at: jst(y, m, 9, 19),
        amount: 15_000,
        reference: 'Concert',
        dest: {
          kind: DestinationKind.External,
          bankCode: '0152',
          accountNumber: '4013390',
          name: 'KOBAYASHI REN',
          nameSource: RecipientNameSource.Lookup,
        },
        outcome: TransferStatus.Completed,
      });
      transfer({
        source: everyday,
        at: jst(y, m, 14, 20),
        amount: 8_000,
        reference: 'Book club',
        dest: {
          kind: DestinationKind.External,
          bankCode: '0152',
          accountNumber: '4019001',
          name: 'NAKAMURA YUI',
          nameSource: RecipientNameSource.Lookup,
        },
        outcome: TransferStatus.Failed,
        failureCode: ExecutionFailureCode.DESTINATION_REJECTED,
      });
    }
    if (monthIndex === 3) {
      transfer({
        customerId: 'cus_ken',
        source: 'acc_ken',
        at: jst(y, m, 6, 18),
        amount: 12_000,
        reference: 'Concert tickets',
        dest: { kind: DestinationKind.Internal, accountId: everyday },
        outcome: TransferStatus.Completed,
      });
      transfer({
        source: everyday,
        at: jst(y, m, 21, 12),
        amount: 12_000,
        reference: 'Gift',
        dest: {
          kind: DestinationKind.External,
          bankCode: '0427',
          accountNumber: '2700418',
          name: 'YAMADA AOI',
          nameSource: RecipientNameSource.Manual,
        },
        outcome: TransferStatus.Completed,
      });
      income(
        'acc_side',
        jst(y, m, 10, 15),
        'Freelance payment — Aoba Design (KK)',
        Category.OtherIncome,
        45_000,
      );
      transfer({
        source: 'acc_side',
        at: jst(y, m, 13, 9),
        amount: 45_000,
        dest: { kind: DestinationKind.Own, accountId: everyday },
        outcome: TransferStatus.Completed,
      });
    }
    if (monthIndex === 4) {
      transfer({
        source: 'acc_travel',
        at: jst(y, m, 22, 14),
        amount: 30_000,
        reference: 'Ryokan deposit',
        dest: {
          kind: DestinationKind.External,
          bankCode: '0310',
          accountNumber: '3106621',
          name: 'SATO YUUKI',
          nameSource: RecipientNameSource.Manual,
        },
        outcome: TransferStatus.Failed,
        failureCode: ExecutionFailureCode.RECIPIENT_NAME_MISMATCH,
      });
      transfer({
        source: everyday,
        at: jst(y, m, 11, 19),
        amount: 9_800,
        reference: 'Movie night',
        dest: { kind: DestinationKind.Internal, accountId: 'acc_ken' },
        outcome: TransferStatus.Failed,
        failureCode: ExecutionFailureCode.PROCESSING_FAILED,
      });
    }
    if (monthIndex === 5) {
      transfer({
        source: everyday,
        at: jst(y, m, 4, 22),
        amount: 6_000,
        reference: 'Dinner split',
        dest: {
          kind: DestinationKind.External,
          bankCode: '0152',
          accountNumber: '4012733',
          name: 'SUZUKI HARUTO',
          nameSource: RecipientNameSource.Lookup,
        },
        outcome: TransferStatus.Completed,
      });
    }
    // A released card authorization (cancelled entry).
    if (monthIndex === 4)
      purchase(everyday, jst(y, m, 17, 18), Category.Shopping, {
        merchant: 'Uniqlo Shibuya',
        amount: 3_990,
        status: ActivityStatus.Cancelled,
      });

    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
    monthIndex += 1;
  }

  // Active card authorizations at the anchor (merchant holds; fixed until reset).
  purchase('acc_everyday', anchor - 6 * HOUR, Category.Groceries, {
    merchant: 'Sakura Mart Shibuya',
    amount: 8_480,
    status: ActivityStatus.Pending,
  });
  purchase('acc_everyday', anchor - 2 * DAY - 3 * HOUR, Category.Travel, {
    merchant: 'Hotel Kanade Kyoto',
    amount: 7_000,
    status: ActivityStatus.Pending,
  });
  purchase('acc_travel', anchor - 1 * DAY - 5 * HOUR, Category.Travel, {
    merchant: 'Skyway Air',
    amount: 23_400,
    status: ActivityStatus.Pending,
  });

  /* ---------- Order by time, assign sequences, derive balances ---------- */
  activity.sort(
    (a, b) =>
      a.occurred_at - b.occurred_at ||
      (a.posted_at ?? 0) - (b.posted_at ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const rows: ActivityRow[] = activity.map((a, i) => ({ ...a, sequence: i + 1 }));

  const accounts: AccountRow[] = ACCOUNTS.map((def) => {
    const posted = rows
      .filter((r) => r.account_id === def.id && r.status === ActivityStatus.Posted)
      .sort((a, b) => (a.posted_at ?? 0) - (b.posted_at ?? 0) || a.sequence - b.sequence);
    let running = 0;
    let min = 0;
    for (const r of posted) {
      running += r.direction === Direction.Credit ? r.amount_minor : -r.amount_minor;
      min = Math.min(min, running);
    }
    const held = holds
      .filter((h) => h.account_id === def.id && h.state === HoldState.Active)
      .reduce((s, h) => s + h.amount_minor, 0);
    let opening = def.baseline + Math.max(0, -min);
    if (opening + running < held) opening += held - (opening + running);
    const openedAt = anchor - def.openedDaysBefore * DAY;
    return {
      ...def,
      opening,
      current: opening + running,
      held,
      openedAt,
      closedAt: def.closed ? windowStart - 30 * DAY : null,
    };
  });

  return { anchor, accounts, activity: rows, holds, transfers, partnerPayments };
}

function insertPlan(tx: Tx, plan: SeedPlan) {
  for (const table of CORE_TABLES_IN_DELETE_ORDER) tx.run(`DELETE FROM ${table}`);
  tx.run("INSERT INTO meta (key, value) VALUES ('seed_anchor', ?), ('schema_version', ?)", [
    String(plan.anchor),
    String(SCHEMA_VERSION),
  ]);
  for (const c of CUSTOMERS) {
    tx.run('INSERT INTO customers (id, display_name) VALUES (?, ?)', [c.id, c.displayName]);
    tx.run('INSERT INTO credentials (customer_id, username, password_hash) VALUES (?, ?, ?)', [
      c.id,
      c.username,
      hashPassword(c.password),
    ]);
  }
  for (const b of BANKS)
    tx.run('INSERT INTO banks (id, code, name, is_host_bank) VALUES (?, ?, ?, ?)', [
      b.id,
      b.code,
      b.name,
      b.isHostBank ? 1 : 0,
    ]);
  for (const a of plan.accounts) {
    tx.run(
      `INSERT INTO accounts (id, customer_id, account_number, name, type, holder_name, lifecycle, restriction, restriction_reason,
        opening_balance_minor, current_balance_minor, held_minor, opened_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.customerId,
        a.accountNumber,
        a.name,
        a.type,
        a.holderName,
        a.closed ? Lifecycle.Closed : Lifecycle.Open,
        a.restrictionReason ? Restriction.Blocked : Restriction.None,
        a.restrictionReason ?? null,
        a.opening,
        a.current,
        a.held,
        a.openedAt,
        a.closedAt,
      ],
    );
  }
  for (const t of plan.transfers) {
    tx.run(
      `INSERT INTO transfers (id, customer_id, source_account_id, source_name_snapshot, destination_kind, destination_account_id,
        destination_bank_id, destination_account_number, recipient_name_snapshot, recipient_name_source, amount_minor, reference,
        status, failure_code, created_at, completed_at, failed_at, partner_payment_id, execution_attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.customer_id,
        t.source_account_id,
        t.source_name_snapshot,
        t.destination_kind,
        t.destination_account_id,
        t.destination_bank_id,
        t.destination_account_number,
        t.recipient_name_snapshot,
        t.recipient_name_source,
        t.amount_minor,
        t.reference,
        t.status,
        t.failure_code,
        t.created_at,
        t.completed_at,
        t.failed_at,
        t.partner_payment_id,
        t.execution_attempts,
      ],
    );
  }
  for (const r of plan.activity) {
    tx.run(
      `INSERT INTO activity (id, sequence, account_id, kind, direction, amount_minor, status, description, counterparty, category,
        occurred_at, posted_at, cancelled_at, transfer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.id,
        r.sequence,
        r.account_id,
        r.kind,
        r.direction,
        r.amount_minor,
        r.status,
        r.description,
        r.counterparty,
        r.category,
        r.occurred_at,
        r.posted_at,
        r.cancelled_at,
        r.transfer_id,
      ],
    );
  }
  for (const h of plan.holds) {
    tx.run(
      `INSERT INTO holds (id, account_id, activity_id, kind, transfer_id, amount_minor, state, created_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        h.id,
        h.account_id,
        h.activity_id,
        h.kind,
        h.transfer_id,
        h.amount_minor,
        h.state,
        h.created_at,
        h.resolved_at,
      ],
    );
  }
}

/** Replaces the core store contents with a fresh plan in one transaction, then fails loudly if it does not reconcile. */
export function seedCore(db: Database, plan: SeedPlan): void {
  db.immediate((tx) => {
    insertPlan(tx, plan);
    return null;
  });
  const problems = reconcile(db);
  if (problems.length > 0) throw new Error(`Seed does not reconcile:\n${problems.join('\n')}`);
}
