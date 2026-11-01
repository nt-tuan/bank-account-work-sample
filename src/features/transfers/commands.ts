import type { QueryClient } from '@tanstack/react-query';
import type { Session, TransferCommand } from '@domain/schemas/api.ts';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { getTransferMonitor } from './monitor-runtime.ts';
import { SubmitResultKind, submitTransfer } from './submission/submit.ts';

/** Register the committed order before returning control to navigation or presentation. */
export async function submitTransferOrder(
  queryClient: QueryClient,
  command: TransferCommand,
  key: string,
  options: Parameters<typeof submitTransfer>[1],
) {
  const session = queryClient.getQueryData<Session>(qk.session);
  const result = await submitTransfer(
    (signal) => api.createTransfer(command, key, signal),
    options,
  );
  if (
    !options.signal.aborted &&
    session === queryClient.getQueryData<Session>(qk.session) &&
    result.kind === SubmitResultKind.Created
  )
    getTransferMonitor(queryClient).recordOrder(result.transfer);
  return result;
}
