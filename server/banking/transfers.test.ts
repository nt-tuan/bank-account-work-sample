import {
  ActivityKind,
  ActivityStatus,
  Category,
  Direction,
  RecipientNameSource,
  SortOrder,
  TransferStatus,
} from '../../shared/domain/enums.ts';
import { Script } from '../partner-gateway/fake-gateway.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bankingFixture,
  key,
  KENJI,
  own,
  recipient,
  rejectionCode,
  type Fixture,
} from '../../tests/helpers.ts';
import type { TransferRow } from '../serializers.ts';

let f: Fixture;
beforeEach(() => {
  f = bankingFixture();
});
afterEach(() => {
  // Every test leaves a ledger that reconciles (AC-02).
  expect(f.reconcile()).toEqual([]);
  f.close();
});

const available = (id: string) => {
  const a = f.account(id);
  return a.current - a.held;
};

describe('order creation and own-account execution (AC-05)', () => {
  it('reserves funds, then posts linked entries and conserves the combined balance', async () => {
    const before = f.account('acc_everyday').current + f.account('acc_savings').current;
    const availBefore = available('acc_everyday');
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      own('acc_everyday', 'acc_savings', 10_000, 'Save'),
    );
    expect(r.kind).toBe('created');
    expect(r.body.status).toBe('processing');
    expect(available('acc_everyday')).toBe(availBefore - 10_000); // the hold applies immediately
    expect(f.account('acc_everyday').current).toBe(before - f.account('acc_savings').current);

    await f.settle();
    const t = f.banking.transfers.get(KENJI, r.body.id);
    expect(t.status).toBe('completed');
    expect(f.account('acc_everyday').current + f.account('acc_savings').current).toBe(before);
    const entries = f.db.read((q) =>
      q.all<{ status: string; direction: string }>(
        'SELECT status, direction FROM activity WHERE transfer_id = ?',
        [r.body.id],
      ),
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.status === 'posted')).toBe(true);
  });

  it('classifies a recipient that resolves to an own account as own', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient('acc_everyday', 'bank_host', '1047302', 'WATANABE KENJI', 1_000),
    );
    expect(r.body.destinationKind).toBe('own');
    await f.settle();
    expect(f.banking.transfers.get(KENJI, r.body.id).status).toBe('completed');
  });
});

describe('amount boundaries (AC-08)', () => {
  it('allows exactly the available balance (with holds) and rejects ¥1 more', async () => {
    const avail = available('acc_everyday');
    expect(f.account('acc_everyday').held).toBeGreaterThan(0);
    expect(
      await rejectionCode(
        f.banking.transfers.createOrder(
          KENJI,
          key(),
          own('acc_everyday', 'acc_savings', avail + 1),
        ),
      ),
    ).toBe('INSUFFICIENT_FUNDS');
    const ok = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      own('acc_everyday', 'acc_savings', avail),
    );
    expect(ok.kind).toBe('created');
    expect(available('acc_everyday')).toBe(0);
  });

  it('allows ¥1,000,000 and rejects ¥1,000,001', async () => {
    expect(
      await rejectionCode(
        f.banking.transfers.createOrder(
          KENJI,
          key(),
          own('acc_savings', 'acc_everyday', 1_000_001),
        ),
      ),
    ).toBe('TRANSFER_LIMIT_EXCEEDED');
    expect(
      (
        await f.banking.transfers.createOrder(
          KENJI,
          key(),
          own('acc_savings', 'acc_everyday', 1_000_000),
        )
      ).kind,
    ).toBe('created');
    expect(
      (await f.banking.transfers.createOrder(KENJI, key(), own('acc_savings', 'acc_everyday', 1)))
        .kind,
    ).toBe('created');
  });
});

describe('order rejections record nothing', () => {
  it.each([
    ['restricted source', own('acc_rent', 'acc_everyday', 100), 'SOURCE_UNAVAILABLE'],
    [
      'restricted own destination',
      own('acc_everyday', 'acc_payroll', 100),
      'DESTINATION_UNAVAILABLE',
    ],
    ['same account', own('acc_everyday', 'acc_everyday', 100), 'SAME_ACCOUNT'],
    ["another customer's source", own('acc_misaki', 'acc_everyday', 100), 'NOT_FOUND'],
    ['closed own source', own('acc_old_checking', 'acc_everyday', 100), 'NOT_FOUND'],
    [
      'unknown internal recipient',
      recipient('acc_everyday', 'bank_host', '9999999', 'X', 100),
      'RECIPIENT_NOT_FOUND',
    ],
    [
      'restricted internal recipient',
      recipient('acc_everyday', 'bank_host', '6620048', 'SATO KEN', 100),
      'DESTINATION_UNAVAILABLE',
    ],
    [
      'closed internal recipient',
      recipient('acc_everyday', 'bank_host', '7731102', 'MORI HARUKA', 100),
      'DESTINATION_UNAVAILABLE',
    ],
    [
      'partner account not found',
      recipient('acc_everyday', 'bank_minato', '4099999', 'NOBODY', 100),
      'RECIPIENT_NOT_FOUND',
    ],
    [
      'partner account closed',
      recipient('acc_everyday', 'bank_minato', '4019001', 'NAKAMURA YUI', 100),
      'DESTINATION_UNAVAILABLE',
    ],
  ])('%s', async (_name, cmd, code) => {
    const counts = ['transfers', 'activity', 'holds', 'idempotency_records'].map((t) => f.count(t));
    expect(await rejectionCode(f.banking.transfers.createOrder(KENJI, key(), cmd))).toBe(code);
    expect(
      ['transfers', 'activity', 'holds', 'idempotency_records'].map((t) => f.count(t)),
    ).toEqual(counts);
  });

  it('reports SAME_ACCOUNT before INSUFFICIENT_FUNDS', async () => {
    expect(
      await rejectionCode(
        f.banking.transfers.createOrder(
          KENJI,
          key(),
          own('acc_everyday', 'acc_everyday', 999_999_999),
        ),
      ),
    ).toBe('SAME_ACCOUNT');
  });

  it('never compares a typed name at order creation', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient(
        'acc_everyday',
        'bank_host',
        '5815810',
        'WRONG NAME',
        100,
        RecipientNameSource.Manual,
      ),
    );
    expect(r.kind).toBe('created');
    await f.settle();
    const t = f.banking.transfers.get(KENJI, r.body.id);
    expect(t.status).toBe('failed');
    expect(t.failureCode).toBe('RECIPIENT_NAME_MISMATCH');
  });
});

describe('idempotency (AC-09)', () => {
  it('replays the same key and payload as the original order', async () => {
    const k = key();
    const a = await f.banking.transfers.createOrder(
      KENJI,
      k,
      own('acc_everyday', 'acc_savings', 500),
    );
    const b = await f.banking.transfers.createOrder(
      KENJI,
      k,
      own('acc_everyday', 'acc_savings', 500),
    );
    expect(b.kind).toBe('replayed');
    expect(b.body.id).toBe(a.body.id);
    expect(
      f.db.read((q) =>
        q.get<{ n: number }>("SELECT COUNT(*) AS n FROM transfers WHERE status = 'processing'"),
      )!.n,
    ).toBe(1);
  });

  it('rejects the same key with a different payload', async () => {
    const k = key();
    await f.banking.transfers.createOrder(KENJI, k, own('acc_everyday', 'acc_savings', 500));
    expect(
      await rejectionCode(
        f.banking.transfers.createOrder(KENJI, k, own('acc_everyday', 'acc_savings', 501)),
      ),
    ).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('returns the original response even after account state changed', async () => {
    const k = key();
    const a = await f.banking.transfers.createOrder(
      KENJI,
      k,
      own('acc_everyday', 'acc_savings', 500),
    );
    f.db.immediate((tx) =>
      tx.run(
        "UPDATE accounts SET restriction = 'blocked', restriction_reason = 'x' WHERE id = 'acc_everyday'",
      ),
    );
    const b = await f.banking.transfers.createOrder(
      KENJI,
      k,
      own('acc_everyday', 'acc_savings', 500),
    );
    expect(b.kind).toBe('replayed');
    expect(b.body).toEqual(a.body);
  });

  it('scopes keys per customer', async () => {
    const k = key();
    await f.banking.transfers.createOrder(KENJI, k, own('acc_everyday', 'acc_savings', 500));
    const other = await f.banking.transfers.createOrder(
      'cus_misaki',
      k,
      recipient('acc_misaki', 'bank_host', '1032481', 'WATANABE KENJI', 500),
    );
    expect(other.kind).toBe('created');
  });
});

describe('execution robustness (AC-07, AC-10)', () => {
  it('fails with the hold released when the source is restricted after the order', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      own('acc_everyday', 'acc_savings', 700),
    );
    f.db.immediate((tx) =>
      tx.run(
        "UPDATE accounts SET restriction = 'blocked', restriction_reason = 'x' WHERE id = 'acc_everyday'",
      ),
    );
    const heldBefore = f.account('acc_everyday').held;
    await f.settle();
    const t = f.banking.transfers.get(KENJI, r.body.id);
    expect([t.status, t.failureCode]).toEqual(['failed', 'SOURCE_UNAVAILABLE']);
    expect(f.account('acc_everyday').held).toBe(heldBefore - 700);
  });

  it('completes an external transfer through the gateway, debiting only the source', async () => {
    const before = f.account('acc_everyday').current;
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient('acc_everyday', 'bank_minato', '4012733', 'SUZUKI HARUTO', 2_500),
    );
    expect(r.body.destinationKind).toBe('external');
    await f.settle(0);
    const row = f.db.read((q) =>
      q.get<TransferRow>('SELECT * FROM transfers WHERE id = ?', [r.body.id]),
    )!;
    expect(row.status).toBe('completed');
    expect(row.partner_payment_id).toMatch(/^FAKE-/);
    expect(f.account('acc_everyday').current).toBe(before - 2_500);
  });

  it('fails on a partner name mismatch', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient(
        'acc_everyday',
        'bank_minato',
        '4012733',
        'SUZUKI HARUKA',
        2_500,
        RecipientNameSource.Manual,
      ),
    );
    await f.settle(0);
    expect(f.banking.transfers.get(KENJI, r.body.id).failureCode).toBe('RECIPIENT_NAME_MISMATCH');
  });

  it('never marks an unknown outcome as failed, and settles exactly once after an inquiry', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient('acc_everyday', 'bank_minato', '4012733', 'SUZUKI HARUTO', 2_500),
    );
    f.gateway.scripts.set(r.body.id, Script.UnknownThenSettled);
    await f.settle(0);
    expect(f.banking.transfers.get(KENJI, r.body.id).status).toBe('processing');
    await f.settle(2_000);
    expect(f.banking.transfers.get(KENJI, r.body.id).status).toBe('completed');
    expect(f.gateway.submits).toHaveLength(1);
  });

  it('resends with the same key when the partner never received the request', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient('acc_everyday', 'bank_minato', '4012733', 'SUZUKI HARUTO', 2_500),
    );
    f.gateway.scripts.set(r.body.id, Script.LostThenSettle);
    await f.settle(0);
    expect(f.banking.transfers.get(KENJI, r.body.id).status).toBe('processing');
    await f.settle(2_000);
    expect(f.banking.transfers.get(KENJI, r.body.id).status).toBe('completed');
    expect(f.gateway.submits.map((s) => s.transferId)).toEqual([r.body.id, r.body.id]);
  });

  it('marks a long-unresolved external transfer Delayed, not Failed', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      recipient('acc_everyday', 'bank_minato', '4012733', 'SUZUKI HARUTO', 2_500),
    );
    f.gateway.inquireTransfer = async () => {
      throw new (await import('../partner-gateway/gateway.ts')).UnknownOutcomeError('down');
    };
    f.gateway.submit = async () => {
      throw new (await import('../partner-gateway/gateway.ts')).UnknownOutcomeError('down');
    };
    for (let i = 0; i < 10; i++) await f.settle(30_000);
    const t = f.banking.transfers.get(KENJI, r.body.id);
    expect(t.status).toBe('processing');
    expect(t.delayedSince).not.toBeNull();
  });

  it('running a step twice with a stale row cannot double-post', async () => {
    const r = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      own('acc_everyday', 'acc_savings', 900),
    );
    f.clock.advance(2_000);
    const row = f.db.read((q) =>
      q.get<TransferRow>('SELECT * FROM transfers WHERE id = ?', [r.body.id]),
    )!;
    const savingsBefore = f.account('acc_savings').current;
    await f.processor.step(row);
    await f.processor.step(row);
    expect(f.account('acc_savings').current).toBe(savingsBefore + 900);
  });
});

describe('read models', () => {
  it('tracks owned transfers through activity, including failed and delayed outcomes', async () => {
    const created = await f.banking.transfers.createOrder(
      KENJI,
      key(),
      own('acc_everyday', 'acc_savings', 100, 'Activity tracking'),
    );
    const query = {
      month: '2026-11',
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 100,
      q: created.body.id,
    };
    const pending = f.banking.activity.list(KENJI, {
      ...query,
      transferStatus: TransferStatus.Processing,
    });
    expect(pending.items).toHaveLength(1);
    expect(pending.items[0]).toMatchObject({
      status: 'pending',
      transferStatus: 'processing',
      transferId: created.body.id,
    });
    f.db.immediate((tx) =>
      tx.run('UPDATE transfers SET delayed_since = ? WHERE id = ?', [
        f.clock.now(),
        created.body.id,
      ]),
    );
    expect(f.banking.activity.list(KENJI, query).items[0]!.transferDelayedSince).not.toBeNull();
    await f.settle();
    expect(
      f.banking.activity.list(KENJI, { ...query, transferStatus: TransferStatus.Processing }).total,
    ).toBe(0);
    const completed = f.banking.activity.list(KENJI, {
      ...query,
      transferStatus: TransferStatus.Completed,
    });
    expect(completed.items).toHaveLength(2); // one entry per owned account
    expect(
      completed.items.every(
        (e) => e.status === ActivityStatus.Posted && e.transferStatus === TransferStatus.Completed,
      ),
    ).toBe(true);
    const failed = f.banking.activity.list(KENJI, {
      from: '2026-01-01',
      to: '2026-12-31',
      transferStatus: TransferStatus.Failed,
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 100,
    });
    expect(failed.total).toBeGreaterThan(0);
    expect(
      failed.items.every(
        (e) => e.status === ActivityStatus.Cancelled && e.transferStatus === TransferStatus.Failed,
      ),
    ).toBe(true);
    const incoming = f.banking.activity.list(KENJI, {
      from: '2026-01-01',
      to: '2026-12-31',
      category: Category.Transfer,
      direction: Direction.Credit,
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 100,
    });
    expect(incoming.items.some((e) => e.transferId === null && e.transferStatus === null)).toBe(
      true,
    );
  });

  it('computes single-account running balances from the full ledger under any filter or sort (AC-04)', () => {
    const month = '2026-10';
    const full = f.banking.activity.list(KENJI, {
      accountId: 'acc_everyday',
      month,
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 100,
    });
    const byId = new Map(full.items.map((e) => [e.id, e.runningBalanceMinor]));
    const filtered = f.banking.activity.list(KENJI, {
      accountId: 'acc_everyday',
      month,
      category: Category.Dining,
      sort: SortOrder.Asc,
      page: 1,
      pageSize: 5,
    });
    expect(filtered.items.length).toBeGreaterThan(0);
    for (const e of filtered.items) expect(e.runningBalanceMinor).toBe(byId.get(e.id));
    // Running balance after the newest posted entry equals the current balance.
    const all = f.banking.activity.list(KENJI, {
      accountId: 'acc_everyday',
      from: '2026-01-01',
      to: '2026-12-31',
      status: ActivityStatus.Posted,
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 1,
    });
    expect(all.items[0]!.runningBalanceMinor).toBe(f.account('acc_everyday').current);
    // The all-accounts view carries no running balance.
    expect(
      f.banking.activity
        .list(KENJI, { month, sort: SortOrder.Desc, page: 1, pageSize: 5 })
        .items.every((e) => e.runningBalanceMinor === null),
    ).toBe(true);
  });

  it('searches descriptions, counterparties and references case-insensitively', () => {
    const r = f.banking.activity.list(KENJI, {
      from: '2026-01-01',
      to: '2026-12-31',
      q: '  ruNNing ',
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 20,
    });
    expect(r.total).toBe(0);
    const s = f.banking.activity.list(KENJI, {
      from: '2026-01-01',
      to: '2026-12-31',
      q: 'concert',
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 20,
    });
    expect(s.items.some((e) => e.transferReference?.toLowerCase().includes('concert'))).toBe(true);
  });

  it('hides closed and other-customer resources', () => {
    expect(() => f.banking.accounts.get(KENJI, 'acc_old_checking')).toThrow();
    expect(() => f.banking.accounts.get(KENJI, 'acc_misaki')).toThrow();
    expect(f.banking.accounts.list(KENJI).map((a) => a.id)).not.toContain('acc_old_checking');
    expect(f.banking.accounts.list(KENJI)).toHaveLength(6);
  });

  it('insights use posted income and purchases only and reconcile to activity (AC-13)', () => {
    const ins = f.banking.insights.get(KENJI, '2026-10');
    expect(ins.categories.reduce((s, c) => s + c.amountMinor, 0)).toBe(ins.spendingMinor);
    expect(ins.categories.some((c) => c.category === Category.Transfer)).toBe(false);
    const purchases = f.banking.activity.list(KENJI, {
      month: '2026-10',
      status: ActivityStatus.Posted,
      sort: SortOrder.Desc,
      page: 1,
      pageSize: 100,
    });
    const expected = purchases.items
      .filter((e) => e.kind === ActivityKind.Purchase)
      .reduce((s, e) => s + e.amountMinor, 0);
    expect(purchases.total).toBeLessThanOrEqual(100);
    expect(ins.spendingMinor).toBe(expected);
    expect(ins.trend).toHaveLength(6);
  });
});

describe('recipient lookup limit (AC-11)', () => {
  it('limits lookups without an order and resets on order creation', async () => {
    for (let i = 0; i < 10; i++)
      await f.banking.lookup.lookup(KENJI, { bankId: 'bank_host', accountNumber: '5815810' });
    expect(
      await rejectionCode(
        f.banking.lookup.lookup(KENJI, { bankId: 'bank_host', accountNumber: '5815810' }),
      ),
    ).toBe('LOOKUP_RATE_LIMITED');
    await f.banking.transfers.createOrder(KENJI, key(), own('acc_everyday', 'acc_savings', 100));
    expect(
      (await f.banking.lookup.lookup(KENJI, { bankId: 'bank_host', accountNumber: '5815810' }))
        .outcome,
    ).toBe('found');
  });

  it('discloses only the outcome for unusable accounts', async () => {
    const r = await f.banking.lookup.lookup(KENJI, {
      bankId: 'bank_host',
      accountNumber: '6620048',
    });
    expect(r).toEqual({
      outcome: 'cannot_receive',
      holderName: null,
      bank: { id: 'bank_host', code: '0999', name: 'Demo Banking' },
      maskedNumber: '•••0048',
    });
  });
});
