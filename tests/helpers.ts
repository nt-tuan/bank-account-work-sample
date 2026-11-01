import { RecipientNameSource, TransferDestinationKind } from '../shared/domain/enums.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../server/persistence/sqlite.ts';
import { migrateCore, reconcile } from '../server/persistence/schema.ts';
import { buildSeedPlan, seedCore } from '../server/fixtures/seed.ts';
import { FakeClock } from '../server/clock.ts';
import { FakeGateway } from '../server/partner-gateway/fake-gateway.ts';
import {
  createBankingServices,
  TransferProcessor,
  type ProcessorTiming,
} from '../server/banking/index.ts';
import type { ExecutionHooks } from '../server/banking/processor.ts';
import type { NormalizedCommand } from '../shared/rules/command.ts';

export const ANCHOR = Date.parse('2026-11-01T03:00:00Z');
export const KENJI = 'cus_kenji';

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bank-test-'));
}

export const FAST_TIMING: ProcessorTiming = {
  backoffMs: [2_000, 4_000, 8_000, 16_000],
  steadyMs: 30_000,
  delayedAfterMs: 120_000,
  delayedIntervalMs: 60_000,
  pollFallbackMs: 50,
};

/** A seeded core store with banking services wired to a FakeGateway and FakeClock. */
export function bankingFixture(opts: { hooks?: ExecutionHooks } = {}) {
  const dir = tempDir();
  const clock = new FakeClock(ANCHOR);
  const db = openDatabase(path.join(dir, 'core.sqlite'));
  migrateCore(db);
  seedCore(db, buildSeedPlan(ANCHOR));
  const gateway = new FakeGateway()
    .addAccount('0152', '4012733', 'SUZUKI HARUTO')
    .addAccount('0152', '4013390', 'KOBAYASHI REN')
    .addAccount('0152', '4019001', 'NAKAMURA YUI', false);
  const banking = createBankingServices({ db, clock, gateway, internalExecutionDelayMs: 1_500 });
  const processor = new TransferProcessor({
    db,
    clock,
    gateway,
    timing: FAST_TIMING,
    ...(opts.hooks ? { hooks: opts.hooks } : {}),
  });

  const account = (id: string) =>
    db.read((q) =>
      q.get<{ current: number; held: number; restriction: string }>(
        'SELECT current_balance_minor AS current, held_minor AS held, restriction FROM accounts WHERE id = ?',
        [id],
      ),
    )!;
  const count = (table: string) =>
    db.read((q) => q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))!.n;
  /** Advance time and run every due step. */
  const settle = async (ms = 2_000) => {
    clock.advance(ms);
    await processor.drain();
  };
  return {
    db,
    clock,
    gateway,
    banking,
    processor,
    account,
    count,
    settle,
    reconcile: () => reconcile(db),
    close: () => db.close(),
  };
}

export const own = (
  source: string,
  dest: string,
  amount: number,
  reference?: string,
): NormalizedCommand => ({
  sourceAccountId: source,
  destination: { kind: TransferDestinationKind.Own, accountId: dest },
  amountMinor: amount,
  ...(reference ? { reference } : {}),
});

export const recipient = (
  source: string,
  bankId: string,
  accountNumber: string,
  name: string,
  amount: number,
  nameSource: RecipientNameSource = RecipientNameSource.Lookup,
): NormalizedCommand => ({
  sourceAccountId: source,
  destination: {
    kind: TransferDestinationKind.Recipient,
    bankId,
    accountNumber,
    recipientName: name,
    recipientNameSource: nameSource,
  },
  amountMinor: amount,
});

export const key = () => randomUUID();

export async function rejectionCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
  return 'NO_REJECTION';
}

export type Fixture = ReturnType<typeof bankingFixture>;
export type { Database };
