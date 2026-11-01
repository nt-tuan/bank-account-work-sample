import type { Database } from '../persistence/sqlite.ts';
import type { Clock } from '../clock.ts';
import type { PartnerBankGateway } from '../partner-gateway/gateway.ts';
import { createAccountService } from './accounts.ts';
import { createActivityService } from './activity.ts';
import { createInsightsService } from './insights.ts';
import { createLookupService } from './lookup.ts';
import { createTransferService } from './transfers.ts';

export type BankingServices = ReturnType<typeof createBankingServices>;

export function createBankingServices(deps: {
  db: Database;
  clock: Clock;
  gateway: PartnerBankGateway;
  internalExecutionDelayMs: number;
  onOrderCreated?: () => void;
}) {
  return {
    accounts: createAccountService(deps.db),
    activity: createActivityService(deps.db, deps.clock),
    insights: createInsightsService(deps.db),
    lookup: createLookupService(deps),
    transfers: createTransferService(deps),
  };
}

export { DomainRejection } from './errors.ts';
export {
  TransferProcessor,
  DEFAULT_TIMING,
  noExecutionHooks,
  type ExecutionHooks,
  type ProcessorTiming,
} from './processor.ts';
