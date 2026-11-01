import {
  AccountType,
  AccountUsabilityStatus,
  ActivityKind,
  ActivityStatus,
  Category,
  DemoScenarioId,
  DestinationKind,
  Direction,
  HoldKind,
  HoldState,
  LookupOutcome,
  RecipientNameSource,
  SortOrder,
  TransferDestinationKind,
  TransferStatus,
} from '../domain/enums.ts';
import { ErrorCode, ExecutionFailureCode } from '../errors.ts';
import { z } from 'zod';

/* ---------- Response schemas (the client parses every response with these) ---------- */

const iso = z.string();
const minor = z.number().int();

const bankRefSchema = z.object({ id: z.string(), code: z.string(), name: z.string() });
export const bankSchema = bankRefSchema.extend({ isHostBank: z.boolean() });
export type Bank = z.infer<typeof bankSchema>;

export const accountSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(AccountType),
  maskedNumber: z.string(),
  bank: bankRefSchema,
  status: z.enum([AccountUsabilityStatus.Active, AccountUsabilityStatus.Restricted]),
  restrictionReason: z.string().nullable(),
  canSend: z.boolean(),
  canReceive: z.boolean(),
  currentMinor: minor,
  heldMinor: minor,
  availableMinor: minor,
  openedAt: iso,
});
export type AccountSummary = z.infer<typeof accountSummarySchema>;

const holdSchema = z.object({
  id: z.string(),
  kind: z.enum(HoldKind),
  amountMinor: minor,
  createdAt: iso,
  activityId: z.string(),
  description: z.string(),
  transferId: z.string().nullable(),
});
export type Hold = z.infer<typeof holdSchema>;

export const accountDetailSchema = accountSummarySchema.extend({
  accountNumber: z.string(),
  holderName: z.string(),
  currency: z.literal('JPY'),
  holds: z.array(holdSchema),
});
export type AccountDetail = z.infer<typeof accountDetailSchema>;

const accountRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  maskedNumber: z.string(),
});

export const activityEntrySchema = z.object({
  id: z.string(),
  sequence: z.number().int(),
  account: accountRefSchema,
  kind: z.enum(ActivityKind),
  direction: z.enum(Direction),
  amountMinor: minor,
  status: z.enum(ActivityStatus),
  description: z.string(),
  counterparty: z.string(),
  category: z.enum(Category),
  occurredAt: iso,
  postedAt: iso.nullable(),
  cancelledAt: iso.nullable(),
  effectiveAt: iso,
  runningBalanceMinor: minor.nullable(),
  transferReference: z.string().nullable(),
  transferId: z.string().nullable(),
  transferStatus: z.enum(TransferStatus).nullable(),
  transferDelayedSince: iso.nullable(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

const counterpartySchema = z.object({
  name: z.string(),
  bankName: z.string(),
  maskedNumber: z.string(),
  /** Present only when the account is the viewer's own open account (snapshot rule, spec §4). */
  accountId: z.string().nullable(),
});
export type Counterparty = z.infer<typeof counterpartySchema>;

export const transferSchema = z.object({
  id: z.string(),
  sourceActivityId: z.string().nullable(),
  status: z.enum(TransferStatus),
  failureCode: z.enum(ExecutionFailureCode).nullable(),
  delayedSince: iso.nullable(),
  createdAt: iso,
  completedAt: iso.nullable(),
  failedAt: iso.nullable(),
  amountMinor: minor,
  reference: z.string().nullable(),
  destinationKind: z.enum(DestinationKind),
  source: z.object({
    accountId: z.string().nullable(),
    name: z.string(),
    maskedNumber: z.string(),
  }),
  destination: z.object({
    name: z.string(),
    nameSource: z.enum(RecipientNameSource),
    bank: bankRefSchema,
    maskedNumber: z.string(),
    accountId: z.string().nullable(),
  }),
});
export type Transfer = z.infer<typeof transferSchema>;

export const activityDetailSchema = activityEntrySchema.extend({
  hold: z.object({ kind: z.enum(HoldKind), state: z.enum(HoldState) }).nullable(),
  transfer: z
    .object({
      /** Null when the transfer belongs to another customer (incoming): no link is shown. */
      id: z.string().nullable(),
      status: z.enum(TransferStatus).nullable(),
      reference: z.string().nullable(),
      counterparty: counterpartySchema,
      /** Full execution details only for orders owned by the viewer. */
      details: transferSchema.nullable(),
    })
    .nullable(),
});
export type ActivityDetail = z.infer<typeof activityDetailSchema>;

export type List<T> = { items: T[]; page: number; pageSize: number; total: number };

export const activityListSchema = z.object({
  items: z.array(activityEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  runningBalance: z.boolean(),
});
export type ActivityList = z.infer<typeof activityListSchema>;

export const sessionSchema = z.object({
  authenticated: z.boolean(),
  customer: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  csrfToken: z.string(),
  expiresAt: iso.nullable(),
  transferLimit: z.object({ minMinor: minor, maxMinor: minor }),
  demoControls: z.boolean(),
});
export type Session = z.infer<typeof sessionSchema>;

export const lookupResultSchema = z.object({
  outcome: z.enum(LookupOutcome),
  holderName: z.string().nullable(),
  bank: bankRefSchema,
  maskedNumber: z.string(),
});
export type LookupResult = z.infer<typeof lookupResultSchema>;

export const insightsSchema = z.object({
  month: z.string(),
  accountId: z.string().nullable(),
  incomeMinor: minor,
  spendingMinor: minor,
  categories: z.array(z.object({ category: z.enum(Category), amountMinor: minor })),
  trend: z.array(z.object({ month: z.string(), incomeMinor: minor, spendingMinor: minor })),
});
export type Insights = z.infer<typeof insightsSchema>;

export const demoCatalogSchema = z.object({
  credentials: z.object({ username: z.string(), password: z.string() }),
  scenarios: z.array(
    z.object({ id: z.enum(DemoScenarioId), label: z.string(), description: z.string() }),
  ),
  recipients: z.array(
    z.object({
      bankName: z.string(),
      bankCode: z.string(),
      accountNumber: z.string(),
      holderName: z.string(),
      note: z.string(),
    }),
  ),
  pendingScenario: z.enum(DemoScenarioId).nullable(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ErrorCode),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
  }),
});

/* ---------- Request schemas (structure only; input rules are applied by shared/rules) ---------- */

export const loginRequestSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export const transferCommandSchema = z.object({
  sourceAccountId: z.string().min(1).max(64),
  destination: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal(TransferDestinationKind.Own),
      accountId: z.string().min(1).max(64),
    }),
    z.object({
      kind: z.literal(TransferDestinationKind.Recipient),
      bankId: z.string().min(1).max(64),
      accountNumber: z.string().max(64),
      recipientName: z.string().max(200),
      recipientNameSource: z.enum(RecipientNameSource),
    }),
  ]),
  amount: z.string().max(64),
  reference: z.string().max(1000).optional(),
});
export type TransferCommand = z.infer<typeof transferCommandSchema>;

export const lookupRequestSchema = z.object({
  bankId: z.string().min(1).max(64),
  accountNumber: z.string().max(64),
});

const pageParam = z.coerce.number().int().min(1).max(100_000).default(1);
const pageSizeParam = z.coerce.number().int().min(1).max(100).default(20);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const activityQuerySchema = z
  .object({
    accountId: z.string().min(1).max(64).optional(),
    month: month.optional(),
    from: date.optional(),
    to: date.optional(),
    q: z.string().max(200).optional(),
    direction: z.enum(Direction).optional(),
    status: z.enum(ActivityStatus).optional(),
    transferStatus: z.enum(TransferStatus).optional(),
    category: z.enum(Category).optional(),
    sort: z.enum(SortOrder).default(SortOrder.Desc),
    page: pageParam,
    pageSize: pageSizeParam,
  })
  .strict();
export type ActivityQuery = z.infer<typeof activityQuerySchema>;

export const transferQuerySchema = z
  .object({
    accountId: z.string().min(1).max(64).optional(),
    status: z.enum(TransferStatus).optional(),
    q: z.string().max(200).optional(),
    from: date.optional(),
    to: date.optional(),
    page: pageParam,
    pageSize: pageSizeParam,
  })
  .strict();
export type TransferQuery = z.infer<typeof transferQuerySchema>;

export const insightsQuerySchema = z
  .object({ month, accountId: z.string().min(1).max(64).optional() })
  .strict();

export const demoScenarioRequestSchema = z.object({ scenario: z.enum(DemoScenarioId).nullable() });
export const demoResetRequestSchema = z.object({ confirm: z.literal(true) });
