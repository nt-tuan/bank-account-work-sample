/** Categories used by activity, insights and purchase/income fixtures. */
export enum Category {
  Groceries = 'groceries',
  Dining = 'dining',
  Transport = 'transport',
  Housing = 'housing',
  Utilities = 'utilities',
  Shopping = 'shopping',
  Health = 'health',
  Entertainment = 'entertainment',
  Subscriptions = 'subscriptions',
  Education = 'education',
  Travel = 'travel',
  Other = 'other',
  Salary = 'salary',
  OtherIncome = 'other_income',
  Transfer = 'transfer',
}

/** Activity classification; incoming and outgoing transfers have separate entries. */
export enum ActivityKind {
  Purchase = 'purchase',
  Income = 'income',
  TransferIn = 'transfer_in',
  TransferOut = 'transfer_out',
}

/** Activity lifecycle; pending reserves funds, posted affects the balance, cancelled releases them. */
export enum ActivityStatus {
  Pending = 'pending',
  Posted = 'posted',
  Cancelled = 'cancelled',
}

/** Money movement relative to the account: debit leaves, credit enters. */
export enum Direction {
  Debit = 'debit',
  Credit = 'credit',
}

/** Created order lifecycle; processing includes delayed orders whose outcome is still unknown. */
export enum TransferStatus {
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
}

/** Resolved destination ownership and network, assigned when an order is created. */
export enum DestinationKind {
  Own = 'own',
  Internal = 'internal',
  External = 'external',
}

/** Requested destination: one of your accounts or a recipient resolved by the server. */
export enum TransferDestinationKind {
  Own = 'own',
  Recipient = 'recipient',
}

/** Whether the accepted recipient name came from bank lookup or manual entry. */
export enum RecipientNameSource {
  Lookup = 'lookup',
  Manual = 'manual',
}

/** Bank account product type exposed in summaries and stored in account rows. */
export enum AccountType {
  Checking = 'checking',
  Savings = 'savings',
}

/** Derived account usability; closed accounts are excluded from customer responses. */
export enum AccountUsabilityStatus {
  Active = 'active',
  Restricted = 'restricted',
  Closed = 'closed',
}

/** Stored account lifecycle, independent of temporary restrictions. */
export enum Lifecycle {
  Open = 'open',
  Closed = 'closed',
}

/** Stored account restriction; blocked accounts cannot send or receive. */
export enum Restriction {
  None = 'none',
  Blocked = 'blocked',
}

/** Reason funds are reserved: card authorization or transfer order. */
export enum HoldKind {
  MerchantAuthorization = 'merchant_authorization',
  Transfer = 'transfer',
}

/** Reservation lifecycle: active, captured into a posting, or released. */
export enum HoldState {
  Active = 'active',
  Captured = 'captured',
  Released = 'released',
}

/** Bank lookup outcomes; unavailable permits manual entry and is not a recipient rejection. */
export enum LookupOutcome {
  Found = 'found',
  NotFound = 'not_found',
  CannotReceive = 'cannot_receive',
  Unavailable = 'unavailable',
}

/** Chronological ordering used by activity queries and filters. */
export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

/** Selectable demo faults, persisted on orders when execution must reproduce the scenario. */
export enum DemoScenarioId {
  CreateResponseLost = 'create_response_lost',
  CreateResponseSlow = 'create_response_slow',
  ExecutionSlow = 'execution_slow',
  ExecutionFailure = 'execution_failure',
  DestinationClosedDuringProcessing = 'destination_closed_during_processing',
  DestinationRestrictedDuringProcessing = 'destination_restricted_during_processing',
  SourceRestrictedDuringProcessing = 'source_restricted_during_processing',
  PartnerReject = 'partner_reject',
  PartnerTimeoutSettled = 'partner_timeout_settled',
  PartnerNotReceived = 'partner_not_received',
  PartnerOutage = 'partner_outage',
  LookupUnavailable = 'lookup_unavailable',
  LookupLimit = 'lookup_limit',
  ReadFailure = 'read_failure',
}
