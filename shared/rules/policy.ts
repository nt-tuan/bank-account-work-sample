import { AccountUsabilityStatus, Lifecycle, Restriction } from '../domain/enums.ts';
import { formatYen } from '../money.ts';

export type CustomerPolicyInput = { customerId: string };

/**
 * Per-transfer limit. Real products derive it from customer attributes; the demo uses one value,
 * kept behind a policy function so a customer-dependent rule could replace it (spec §7).
 */
export function transferLimit(_customer: CustomerPolicyInput): {
  minMinor: number;
  maxMinor: number;
} {
  return { minMinor: 1, maxMinor: 1_000_000 };
}

/** Customer copy for an amount above the limit, built from the limit so the value is stated in one place. */
export function transferLimitMessage(maxMinor: number): string {
  return `The maximum for one transfer is ${formatYen(maxMinor)}.`;
}

export type Usability =
  | { status: AccountUsabilityStatus.Active; canSend: true; canReceive: true; canView: true }
  | { status: AccountUsabilityStatus.Restricted; canSend: false; canReceive: false; canView: true }
  | { status: AccountUsabilityStatus.Closed; canSend: false; canReceive: false; canView: false };

/** Derived from lifecycle and restriction, never stored (spec §4 permission matrix). */
export function accountUsability(a: { lifecycle: Lifecycle; restriction: Restriction }): Usability {
  if (a.lifecycle === Lifecycle.Closed)
    return {
      status: AccountUsabilityStatus.Closed,
      canSend: false,
      canReceive: false,
      canView: false,
    };
  if (a.restriction === Restriction.Blocked)
    return {
      status: AccountUsabilityStatus.Restricted,
      canSend: false,
      canReceive: false,
      canView: true,
    };
  return { status: AccountUsabilityStatus.Active, canSend: true, canReceive: true, canView: true };
}
