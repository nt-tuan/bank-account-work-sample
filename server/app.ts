/** Builds the whole server from a config. Used by server/main.ts and by integration tests with temporary databases. */
import { openDatabase } from './persistence/sqlite.ts';
import { isSeeded, migrateCore } from './persistence/schema.ts';
import { buildSeedPlan, seedCore, type SeedPartnerPayment } from './fixtures/seed.ts';
import { createPartnerNetwork, ResultCode, type PartnerNetwork } from './partner-network/index.ts';
import { NetworkGateway } from './partner-gateway/network-gateway.ts';
import { createBankingServices, TransferProcessor, type ProcessorTiming } from './banking/index.ts';
import { SessionStore } from './auth/sessions.ts';
import { createAuthService } from './auth/service.ts';
import {
  ScenarioEffects,
  DEFAULT_SCENARIO_TIMING,
  type PartnerFaultAdmin,
  type ScenarioTiming,
} from './demo/scenarios.ts';
import { createHttpApp } from './http/app.ts';
import { systemClock, type Clock } from './clock.ts';
import type { Config } from './config.ts';
import { ExecutionFailureCode } from '../shared/errors.ts';

export type ServerOptions = {
  clock?: Clock;
  timing?: ProcessorTiming;
  scenarioTiming?: Partial<ScenarioTiming>;
  log?: (line: Record<string, unknown>) => void;
};

/*
 * The composition root is the only code besides the gateway adapter that may import the partner module (spec §8).
 * These two translations keep partner codes out of the fixtures and demo modules.
 */
const SEED_RESULT_CODE: Record<SeedPartnerPayment['result'], ResultCode> = {
  settled: ResultCode.Success,
  [ExecutionFailureCode.RECIPIENT_NAME_MISMATCH]: ResultCode.NameMismatch,
  [ExecutionFailureCode.DESTINATION_REJECTED]: ResultCode.AccountClosed,
};

function recordSeedPayment(partner: PartnerNetwork, p: SeedPartnerPayment) {
  partner.admin.recordSeedPayment({
    payment_id: p.paymentId,
    client_ref: p.transferId,
    bank_code: p.bankCode,
    account_no: p.accountNumber,
    beneficiary_name: p.beneficiaryName,
    amount: p.amountMinor,
    received_at: p.receivedAt,
    result_cd: SEED_RESULT_CODE[p.result],
  });
}

function partnerFaultAdmin(partner: PartnerNetwork): PartnerFaultAdmin {
  return {
    setFault: (clientRef, { rejectAccountClosed, ...fault }) =>
      partner.admin.setFault(
        clientRef,
        rejectAccountClosed ? { ...fault, rejectWith: ResultCode.AccountClosed } : fault,
      ),
    clearFaults: () => partner.admin.clearFaults(),
  };
}

export function createDemoBankServer(config: Config, options: ServerOptions = {}) {
  const clock = options.clock ?? systemClock();
  const log = options.log ?? (() => undefined);
  const core = openDatabase(config.coreDbPath);
  migrateCore(core);
  const partner = createPartnerNetwork({
    dbPath: config.partnerDbPath,
    now: () => clock.now(),
    latencyMs: config.partnerLatencyMs,
  });

  const seed = () => {
    const plan = buildSeedPlan(clock.now());
    partner.admin.reset();
    for (const p of plan.partnerPayments) recordSeedPayment(partner, p);
    seedCore(core, plan);
  };
  // Empty databases are seeded once; startup never reseeds a populated store (spec §12).
  if (!isSeeded(core)) seed();

  const gateway = new NetworkGateway(partner, { timeoutMs: config.partnerTimeoutMs });
  const effects = config.demoControls
    ? new ScenarioEffects(core, clock, partnerFaultAdmin(partner), {
        ...DEFAULT_SCENARIO_TIMING,
        partnerTimeoutMs: config.partnerTimeoutMs,
        ...options.scenarioTiming,
      })
    : null;

  const processor: TransferProcessor = new TransferProcessor({
    db: core,
    clock,
    gateway,
    ...(effects ? { hooks: effects } : {}),
    ...(options.timing ? { timing: options.timing } : {}),
    log: (msg, extra) => log({ msg, ...extra }),
  });
  const banking = createBankingServices({
    db: core,
    clock,
    gateway,
    internalExecutionDelayMs: config.internalExecutionDelayMs,
    onOrderCreated: () => processor.wake(),
  });
  const sessions = new SessionStore({ clock, absoluteTtlMs: 8 * 60 * 60 * 1000 });

  /** In-app reset: stop processing, restore both stores, revoke every session, resume (docs/technical-design/features/demo-controls.md). */
  const reset = async () => {
    await processor.stop();
    partner.admin.clearFaults();
    seed();
    sessions.revokeAll();
    processor.start();
  };

  const app = createHttpApp({
    appOrigins: config.appOrigins,
    cookieMode: config.cookieMode,
    sessions,
    auth: createAuthService(core),
    banking,
    demo: effects ? { effects, reset } : null,
    log,
  });

  return {
    app,
    processor,
    sessions,
    core,
    partner,
    reset,
    async close() {
      await processor.stop();
      core.close();
      partner.close();
    },
  };
}
