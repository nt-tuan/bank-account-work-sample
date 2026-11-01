/**
 * Input rules shared by form resolvers and server request parsing (spec §4, Input rules).
 * Invalid input is rejected with a reason; it is never stripped, rounded or converted.
 */
/** Input validation reasons shared by forms and server parsing. */
export enum FieldErrorCode {
  Required = 'required',
  AmountInvalidCharacters = 'amount_invalid_characters',
  AmountBelowMinimum = 'amount_below_minimum',
  AmountTooLarge = 'amount_too_large',
  AccountNumberInvalid = 'account_number_invalid',
  TextInvalidCharacters = 'text_invalid_characters',
  ReferenceTooLong = 'reference_too_long',
  NameTooLong = 'name_too_long',
}

export const FIELD_ERROR_MESSAGES: Record<FieldErrorCode, string> = {
  [FieldErrorCode.Required]: 'This field is required.',
  [FieldErrorCode.AmountInvalidCharacters]:
    'Enter the amount using digits 0–9 only, without commas, spaces or other characters.',
  [FieldErrorCode.AmountBelowMinimum]: 'The minimum amount is ¥1.',
  [FieldErrorCode.AmountTooLarge]: 'The amount is too large.',
  [FieldErrorCode.AccountNumberInvalid]: 'Enter exactly 7 digits (0–9).',
  [FieldErrorCode.TextInvalidCharacters]: 'Use only A–Z, a–z, 0–9, space and ( ) . - /',
  [FieldErrorCode.ReferenceTooLong]: 'The reference can be up to 140 characters.',
  [FieldErrorCode.NameTooLong]: 'The name can be up to 30 characters.',
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: FieldErrorCode };

/** ASCII digits only; leading zeros normalized; never rounds or strips. */
export function parseAmount(raw: string): ParseResult<number> {
  if (raw === '') return { ok: false, error: FieldErrorCode.Required };
  if (!/^[0-9]+$/.test(raw)) return { ok: false, error: FieldErrorCode.AmountInvalidCharacters };
  const normalized = raw.replace(/^0+(?=\d)/, '');
  // Checked on the string before Number(), so the value stays a safe integer.
  if (normalized.length > 15) return { ok: false, error: FieldErrorCode.AmountTooLarge };
  const value = Number(normalized);
  if (value < 1) return { ok: false, error: FieldErrorCode.AmountBelowMinimum };
  return { ok: true, value };
}

export function parseAccountNumber(raw: string): ParseResult<string> {
  if (raw === '') return { ok: false, error: FieldErrorCode.Required };
  if (!/^[0-9]{7}$/.test(raw)) return { ok: false, error: FieldErrorCode.AccountNumberInvalid };
  return { ok: true, value: raw };
}

/** Latin subset of the Zengin interbank character set. */
const ALLOWED_TEXT = /^[A-Za-z0-9 ().\-/]*$/;

function collapse(raw: string): string {
  return raw.trim().replace(/ {2,}/g, ' ');
}

/** Optional reference: 1–140 allowed characters after trimming; empty means absent. */
export function parseReference(raw: string): ParseResult<string | undefined> {
  const value = collapse(raw);
  if (!ALLOWED_TEXT.test(value)) return { ok: false, error: FieldErrorCode.TextInvalidCharacters };
  if (value.length === 0) return { ok: true, value: undefined };
  if (value.length > 140) return { ok: false, error: FieldErrorCode.ReferenceTooLong };
  return { ok: true, value };
}

/** Manually entered recipient name, normalized to uppercase with single spaces (as holder names are registered). */
export function parseRecipientName(raw: string): ParseResult<string> {
  const value = collapse(raw);
  if (value.length === 0) return { ok: false, error: FieldErrorCode.Required };
  if (!ALLOWED_TEXT.test(value)) return { ok: false, error: FieldErrorCode.TextInvalidCharacters };
  if (value.length > 30) return { ok: false, error: FieldErrorCode.NameTooLong };
  return { ok: true, value: value.toUpperCase() };
}

/** Name comparison used at execution: uppercase, single spaces. */
export function normalizeHolderName(name: string): string {
  return collapse(name).toUpperCase();
}
