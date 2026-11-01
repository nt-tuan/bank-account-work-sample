/** Recipient lookup UI state; idle/loading are local, rate limited requires manual entry or retry. */
export enum LookupStatus {
  Idle = 'idle',
  Loading = 'loading',
  Found = 'found',
  NotFound = 'not_found',
  CannotReceive = 'cannot_receive',
  Unavailable = 'unavailable',
  RateLimited = 'rate_limited',
}

export type LookupResult =
  | { status: LookupStatus.Found; holderName: string; key: string }
  | {
      status:
        | LookupStatus.NotFound
        | LookupStatus.CannotReceive
        | LookupStatus.Unavailable
        | LookupStatus.RateLimited;
      key: string;
    };
export type LookupState =
  { status: LookupStatus.Idle } | { status: LookupStatus.Loading } | LookupResult;
