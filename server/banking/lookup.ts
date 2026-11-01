import { ErrorCode } from '../../shared/errors.ts';
import { type Lifecycle, LookupOutcome, type Restriction } from '../../shared/domain/enums.ts';
import type { Database } from '../persistence/sqlite.ts';
import type { Clock } from '../clock.ts';
import type { PartnerBankGateway } from '../partner-gateway/gateway.ts';
import type { LookupResult } from '../../shared/schemas/api.ts';
import { FIELD_ERROR_MESSAGES, parseAccountNumber } from '../../shared/rules/input.ts';
import { maskAccountNumber } from '../../shared/money.ts';
import { accountUsability } from '../../shared/rules/policy.ts';
import { findBank } from './accounts.ts';
import { DomainRejection, reject } from './errors.ts';

export const LOOKUP_LIMIT = 10;
export const LOOKUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Recipient lookup with a per-customer limit on lookups that do not lead to a transfer (spec §4; docs/technical-design/features/recipient-lookup.md).
 * Discloses only holder name, bank and outcome.
 */
export function createLookupService(deps: {
  db: Database;
  clock: Clock;
  gateway: PartnerBankGateway;
}) {
  const { db, clock, gateway } = deps;

  function reserveLookup(customerId: string) {
    const now = clock.now();
    db.immediate((tx) => {
      const events = tx.all<{ at: number }>(
        'SELECT at FROM lookup_events WHERE customer_id = ? AND at > ? ORDER BY at ASC',
        [customerId, now - LOOKUP_WINDOW_MS],
      );
      if (events.length >= LOOKUP_LIMIT) {
        const oldest = events[events.length - LOOKUP_LIMIT]!.at;
        const retryAfter = Math.max(1, Math.ceil((oldest + LOOKUP_WINDOW_MS - now) / 1000));
        throw new DomainRejection(ErrorCode.LOOKUP_RATE_LIMITED, undefined, undefined, {
          'Retry-After': String(retryAfter),
        });
      }
      // Reserve before awaiting the partner, so in-flight lookups also consume quota.
      tx.run('INSERT INTO lookup_events (customer_id, at) VALUES (?, ?)', [customerId, now]);
      return null;
    });
  }

  return {
    async lookup(
      customerId: string,
      req: { bankId: string; accountNumber: string },
      opts: { forceUnavailable?: boolean } = {},
    ): Promise<LookupResult> {
      const number = parseAccountNumber(req.accountNumber);
      if (!number.ok)
        throw reject(ErrorCode.VALIDATION_ERROR, {
          accountNumber: FIELD_ERROR_MESSAGES[number.error],
        });
      const bank = db.read((q) => findBank(q, req.bankId));
      if (!bank) throw reject(ErrorCode.VALIDATION_ERROR, { bankId: 'Choose a bank.' });
      reserveLookup(customerId);

      let outcome: LookupResult['outcome'];
      let holderName: string | null = null;
      if (opts.forceUnavailable) {
        outcome = LookupOutcome.Unavailable;
      } else if (bank.is_host_bank === 1) {
        const account = db.read((q) =>
          q.get<{ holder_name: string; lifecycle: Lifecycle; restriction: Restriction }>(
            'SELECT holder_name, lifecycle, restriction FROM accounts WHERE account_number = ?',
            [number.value],
          ),
        );
        if (!account) outcome = LookupOutcome.NotFound;
        // Closed, frozen and restricted look identical: no reason is disclosed.
        else if (!accountUsability(account).canReceive) outcome = LookupOutcome.CannotReceive;
        else {
          // The customer's own accounts behave like any other recipient; the order classifies them as `own`.
          outcome = LookupOutcome.Found;
          holderName = account.holder_name;
        }
      } else {
        const r = await gateway.inquire(bank.code, number.value);
        outcome = r.outcome;
        if (r.outcome === LookupOutcome.Found) holderName = r.holderName;
      }

      return {
        outcome,
        holderName,
        bank: { id: bank.id, code: bank.code, name: bank.name },
        maskedNumber: maskAccountNumber(number.value),
      };
    },
  };
}
