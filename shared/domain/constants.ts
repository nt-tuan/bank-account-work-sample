import { ActivityStatus, Category, DemoScenarioId, Direction, TransferStatus } from './enums.ts';

export const PURCHASE_CATEGORIES = [
  Category.Groceries,
  Category.Dining,
  Category.Transport,
  Category.Housing,
  Category.Utilities,
  Category.Shopping,
  Category.Health,
  Category.Entertainment,
  Category.Subscriptions,
  Category.Education,
  Category.Travel,
  Category.Other,
] as const;
export const INCOME_CATEGORIES = [Category.Salary, Category.OtherIncome] as const;
export const CATEGORIES = [
  ...PURCHASE_CATEGORIES,
  ...INCOME_CATEGORIES,
  Category.Transfer,
] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.Groceries]: 'Groceries',
  [Category.Dining]: 'Dining',
  [Category.Transport]: 'Transport',
  [Category.Housing]: 'Housing',
  [Category.Utilities]: 'Utilities',
  [Category.Shopping]: 'Shopping',
  [Category.Health]: 'Health',
  [Category.Entertainment]: 'Entertainment',
  [Category.Subscriptions]: 'Subscriptions',
  [Category.Education]: 'Education',
  [Category.Travel]: 'Travel',
  [Category.Other]: 'Other',
  [Category.Salary]: 'Salary',
  [Category.OtherIncome]: 'Other income',
  [Category.Transfer]: 'Transfer',
};
export const ACTIVITY_STATUSES = [
  ActivityStatus.Pending,
  ActivityStatus.Posted,
  ActivityStatus.Cancelled,
] as const;
export const DIRECTIONS = [Direction.Debit, Direction.Credit] as const;
export const TRANSFER_STATUSES = [
  TransferStatus.Processing,
  TransferStatus.Completed,
  TransferStatus.Failed,
] as const;

export const DEMO_SCENARIOS = [
  {
    id: DemoScenarioId.CreateResponseLost,
    label: 'Order response lost',
    description:
      'The order commits, then the connection drops before the response. The client retries with the same key and gets the original order.',
  },
  {
    id: DemoScenarioId.CreateResponseSlow,
    label: 'Order response slow',
    description:
      'The order response arrives after the 10 s client timeout. The retry replays the original order.',
  },
  {
    id: DemoScenarioId.ExecutionSlow,
    label: 'Slow processing',
    description: 'Processing stays visible for about 8 s, then completes.',
  },
  {
    id: DemoScenarioId.ExecutionFailure,
    label: 'Processing failure',
    description: 'Internal processing error: the transfer fails and the hold is released.',
  },
  {
    id: DemoScenarioId.DestinationClosedDuringProcessing,
    label: 'Recipient closes during processing',
    description:
      'For recipients at this bank or partner banks, including Sakura account 3107777. Submit is accepted, then processing fails because the recipient account is closed; reserved funds are released. Own-account transfers leave this scenario pending. Internal account closures persist until reset.',
  },
  {
    id: DemoScenarioId.DestinationRestrictedDuringProcessing,
    label: 'Own destination restricted',
    description:
      'Your destination account becomes restricted after the order is created (own-account transfers).',
  },
  {
    id: DemoScenarioId.SourceRestrictedDuringProcessing,
    label: 'Source restricted',
    description: 'Your source account becomes restricted after the order is created.',
  },
  {
    id: DemoScenarioId.PartnerReject,
    label: 'Partner bank rejects',
    description: 'The partner bank account is closed after lookup; the transfer fails.',
  },
  {
    id: DemoScenarioId.PartnerTimeoutSettled,
    label: 'Partner response timed out',
    description:
      'The partner processed the payment but the response timed out; an inquiry finds it settled.',
  },
  {
    id: DemoScenarioId.PartnerNotReceived,
    label: 'Partner never received',
    description:
      'The request never reached the partner; an inquiry finds nothing and the same request is resent.',
  },
  {
    id: DemoScenarioId.PartnerOutage,
    label: 'Partner outage (3 min)',
    description:
      'The partner network is down for 3 minutes; the transfer becomes Delayed, then completes.',
  },
  {
    id: DemoScenarioId.LookupUnavailable,
    label: 'Name lookup unavailable',
    description:
      'The next lookup cannot display the recipient name; enter it manually. The partner verifies it at execution.',
  },
  {
    id: DemoScenarioId.LookupLimit,
    label: 'Lookup limit reached',
    description: 'Sets your lookup counter to the limit; the next lookup is rate limited.',
  },
  {
    id: DemoScenarioId.ReadFailure,
    label: 'Next read fails',
    description: 'The next data request fails, showing the error state with retry.',
  },
] as const;
