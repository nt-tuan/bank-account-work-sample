import { type RecipientNameSource, TransferDestinationKind } from '../domain/enums.ts';
import type { TransferCommand } from '../schemas/api.ts';
import type { FieldErrors } from '../errors.ts';
import {
  FIELD_ERROR_MESSAGES,
  parseAccountNumber,
  parseAmount,
  parseRecipientName,
  parseReference,
} from './input.ts';

export type NormalizedCommand = {
  sourceAccountId: string;
  destination:
    | { kind: TransferDestinationKind.Own; accountId: string }
    | {
        kind: TransferDestinationKind.Recipient;
        bankId: string;
        accountNumber: string;
        recipientName: string;
        recipientNameSource: RecipientNameSource;
      };
  amountMinor: number;
  reference?: string;
};

/** Applies the input rules to a structurally valid command. Field paths match the command shape. */
export function normalizeTransferCommand(
  cmd: TransferCommand,
): { ok: true; value: NormalizedCommand } | { ok: false; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const amount = parseAmount(cmd.amount);
  if (!amount.ok) fieldErrors.amount = FIELD_ERROR_MESSAGES[amount.error];
  const reference = parseReference(cmd.reference ?? '');
  if (!reference.ok) fieldErrors.reference = FIELD_ERROR_MESSAGES[reference.error];

  let destination: NormalizedCommand['destination'] | undefined;
  if (cmd.destination.kind === TransferDestinationKind.Own) {
    destination = { kind: TransferDestinationKind.Own, accountId: cmd.destination.accountId };
  } else {
    const number = parseAccountNumber(cmd.destination.accountNumber);
    if (!number.ok) fieldErrors['destination.accountNumber'] = FIELD_ERROR_MESSAGES[number.error];
    const name = parseRecipientName(cmd.destination.recipientName);
    if (!name.ok) fieldErrors['destination.recipientName'] = FIELD_ERROR_MESSAGES[name.error];
    if (number.ok && name.ok) {
      destination = {
        kind: TransferDestinationKind.Recipient,
        bankId: cmd.destination.bankId,
        accountNumber: number.value,
        recipientName: name.value,
        recipientNameSource: cmd.destination.recipientNameSource,
      };
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !amount.ok || !reference.ok || !destination) {
    return { ok: false, fieldErrors };
  }
  const value: NormalizedCommand = {
    sourceAccountId: cmd.sourceAccountId,
    destination,
    amountMinor: amount.value,
  };
  if (reference.value !== undefined) value.reference = reference.value;
  return { ok: true, value };
}

/** Canonical JSON (stable key order) of a normalized command, used for the idempotency request hash. */
export function canonicalCommand(cmd: NormalizedCommand): string {
  const d = cmd.destination;
  const dest =
    d.kind === TransferDestinationKind.Own
      ? { kind: TransferDestinationKind.Own, accountId: d.accountId }
      : {
          kind: TransferDestinationKind.Recipient,
          bankId: d.bankId,
          accountNumber: d.accountNumber,
          recipientName: d.recipientName,
          recipientNameSource: d.recipientNameSource,
        };
  return JSON.stringify({
    sourceAccountId: cmd.sourceAccountId,
    destination: dest,
    amountMinor: cmd.amountMinor,
    reference: cmd.reference ?? null,
  });
}
