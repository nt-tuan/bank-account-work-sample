import { LookupStatus } from '../lookup/types.ts';
import { RecipientNameSource, TransferDestinationKind } from '@domain/domain/enums.ts';
import { FieldErrorCode, FIELD_ERROR_MESSAGES, parseAccountNumber } from '@domain/rules/input.ts';
import { useAnnounce } from '@/shared/ui/live-region.tsx';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { useRecipientLookup, type LookupState } from '../lookup/useRecipientLookup.ts';
import type { TransferValues } from './types.ts';

/** Destination-local interaction; accepted recipient data survives in the form. */
export function useRecipientController(
  form: UseFormReturn<TransferValues>,
  nextRef: RefObject<HTMLButtonElement | null>,
) {
  const { getValues, setValue, clearErrors, setError, control } = form;
  const [bankId, accountNumber, name, source] = useWatch({
    control,
    name: ['bankId', 'accountNumber', 'recipientName', 'recipientNameSource'],
  });
  const { state: lookup, run, reset } = useRecipientLookup(bankId, accountNumber);
  const announce = useAnnounce();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const focusTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      window.clearTimeout(focusTimer.current);
    };
  }, []);

  // Cache eviction/hydration cannot change accepted form data or its display mode.
  const state: LookupState =
    lookup.status === LookupStatus.Loading
      ? lookup
      : source === RecipientNameSource.Lookup
        ? { status: LookupStatus.Found, holderName: name, key: `${bankId}:${accountNumber}` }
        : source === RecipientNameSource.Manual
          ? {
              status:
                lookup.status === LookupStatus.RateLimited
                  ? LookupStatus.RateLimited
                  : LookupStatus.Unavailable,
              key: `${bankId}:${accountNumber}`,
            }
          : lookup;

  const runLookup = useCallback(
    async (force = false) => {
      const bank = getValues('bankId');
      const number = getValues('accountNumber');
      if (!bank || !parseAccountNumber(number).ok) return;
      window.clearTimeout(focusTimer.current);
      const id = ++generation.current;
      const current = () =>
        mounted.current &&
        id === generation.current &&
        getValues('kind') === TransferDestinationKind.Recipient &&
        getValues('bankId') === bank &&
        getValues('accountNumber') === number;
      const result = await run(force);
      if (
        !current() ||
        result.status === LookupStatus.Idle ||
        result.status === LookupStatus.Loading
      )
        return;
      const writeName = (value: string, nameSource: TransferValues['recipientNameSource']) => {
        if (getValues('recipientName') !== value)
          setValue('recipientName', value, { shouldDirty: true });
        if (getValues('recipientNameSource') !== nameSource)
          setValue('recipientNameSource', nameSource, { shouldDirty: true });
      };
      const focus = (ref: RefObject<HTMLElement | null>) => {
        focusTimer.current = window.setTimeout(() => {
          if (current()) ref.current?.focus();
        }, 0);
      };
      if (result.status === LookupStatus.Found) {
        writeName(result.holderName, RecipientNameSource.Lookup);
        clearErrors('recipientName');
        announce(`Recipient found: ${result.holderName}`);
        focus(nextRef);
      } else if (
        result.status === LookupStatus.Unavailable ||
        result.status === LookupStatus.RateLimited
      ) {
        if (getValues('recipientNameSource') === RecipientNameSource.Lookup) writeName('', null);
        announce("The recipient's name can't be displayed. Enter the name exactly as registered.");
        focus(nameRef);
      } else {
        writeName('', null);
        if (result.status === LookupStatus.NotFound)
          announce('Recipient not found. Check the bank and account number.');
        else announce("This account can't receive transfers.");
      }
    },
    [getValues, setValue, clearErrors, run, announce, nextRef],
  );

  const onKeyEdit = () => {
    generation.current += 1;
    window.clearTimeout(focusTimer.current);
    reset();
    if (getValues('recipientName')) setValue('recipientName', '', { shouldDirty: true });
    if (getValues('recipientNameSource') !== null)
      setValue('recipientNameSource', null, { shouldDirty: true });
  };
  const onBankChange = () => {
    onKeyEdit();
    // The render for the new bank supplies run with the new query key; blur/Next can also trigger it.
  };
  const previousBank = useRef(bankId);
  useEffect(() => {
    if (previousBank.current !== bankId) void runLookup();
    previousBank.current = bankId;
  }, [bankId, runLookup]);
  const onNumberBlur = () => {
    const number = getValues('accountNumber');
    if (number && !/^[0-9]*$/.test(number))
      setError('accountNumber', {
        message: FIELD_ERROR_MESSAGES[FieldErrorCode.AccountNumberInvalid],
      });
    else if (
      state.status === LookupStatus.Idle ||
      (state.status === LookupStatus.Found && !getValues('recipientNameSource'))
    )
      void runLookup();
  };

  return {
    state,
    nameRef,
    onKeyEdit,
    onBankChange,
    onNumberBlur,
    lookup: () => runLookup(),
    retry: () => runLookup(true),
    busy: state.status === LookupStatus.Loading,
  };
}
