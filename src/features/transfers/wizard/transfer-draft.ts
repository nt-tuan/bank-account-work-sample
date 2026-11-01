import { TransferDestinationKind } from '@domain/domain/enums.ts';
import { parseAmount, parseRecipientName, parseReference } from '@domain/rules/input.ts';
import type { TransferCommand } from '@domain/schemas/api.ts';
import type { TransferValues } from './types.ts';

export function buildTransferCommand(values: TransferValues): TransferCommand {
  const amount = parseAmount(values.amount);
  const reference = parseReference(values.reference);
  const name = parseRecipientName(values.recipientName);
  if (values.kind === TransferDestinationKind.Recipient && !values.recipientNameSource)
    throw new Error('Recipient name has not been accepted.');
  const command: TransferCommand = {
    sourceAccountId: values.sourceAccountId,
    destination:
      values.kind === TransferDestinationKind.Own
        ? { kind: TransferDestinationKind.Own, accountId: values.destAccountId }
        : {
            kind: TransferDestinationKind.Recipient,
            bankId: values.bankId,
            accountNumber: values.accountNumber,
            recipientName: name.ok ? name.value : values.recipientName,
            recipientNameSource: values.recipientNameSource!,
          },
    amount: amount.ok ? String(amount.value) : values.amount,
  };
  if (reference.ok && reference.value) command.reference = reference.value;
  return command;
}
