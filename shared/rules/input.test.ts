import {
  Lifecycle,
  RecipientNameSource,
  Restriction,
  TransferDestinationKind,
} from '../domain/enums.ts';
import { describe, expect, it } from 'vitest';
import { parseAccountNumber, parseAmount, parseRecipientName, parseReference } from './input.ts';
import { normalizeTransferCommand, canonicalCommand } from './command.ts';
import { accountUsability, transferLimit } from './policy.ts';

describe('parseAmount (AC-08)', () => {
  it.each([
    ['1', 1],
    ['007', 7],
    ['1000000', 1_000_000],
    ['1000001', 1_000_001],
  ])('accepts %s', (raw, value) => {
    expect(parseAmount(raw)).toEqual({ ok: true, value });
  });

  it.each([
    ['1,000', 'amount_invalid_characters'],
    ['1000.5', 'amount_invalid_characters'],
    ['１０００', 'amount_invalid_characters'], // full-width digits are rejected, not converted
    [' 100', 'amount_invalid_characters'],
    ['-5', 'amount_invalid_characters'],
    ['+5', 'amount_invalid_characters'],
    ['¥100', 'amount_invalid_characters'],
    ['0', 'amount_below_minimum'],
    ['000', 'amount_below_minimum'],
    ['', 'required'],
    ['9999999999999999', 'amount_too_large'],
  ])('rejects %j with %s', (raw, error) => {
    expect(parseAmount(raw)).toEqual({ ok: false, error });
  });

  it('the limit is a policy function', () => {
    expect(transferLimit({ customerId: 'x' })).toEqual({ minMinor: 1, maxMinor: 1_000_000 });
  });
});

describe('parseAccountNumber', () => {
  it('requires exactly seven ASCII digits', () => {
    expect(parseAccountNumber('4012733')).toEqual({ ok: true, value: '4012733' });
    for (const bad of ['401273', '40127330', '401 733', '４０１２７３３', 'abcdefg'])
      expect(parseAccountNumber(bad).ok).toBe(false);
  });
});

describe('reference and recipient name', () => {
  it('collapses spaces and keeps the Latin Zengin subset', () => {
    expect(parseReference('  Rent   Nov (A-1/2).  ')).toEqual({
      ok: true,
      value: 'Rent Nov (A-1/2).',
    });
    expect(parseReference('')).toEqual({ ok: true, value: undefined });
  });
  it('rejects disallowed characters instead of altering input', () => {
    expect(parseReference('Café')).toEqual({ ok: false, error: 'text_invalid_characters' });
    expect(parseReference('家賃')).toEqual({ ok: false, error: 'text_invalid_characters' });
    expect(parseReference('a&b')).toEqual({ ok: false, error: 'text_invalid_characters' });
    expect(parseReference('x'.repeat(141))).toEqual({ ok: false, error: 'reference_too_long' });
    expect(parseReference('x'.repeat(140)).ok).toBe(true);
  });
  it('normalizes recipient names to uppercase with single spaces', () => {
    expect(parseRecipientName('  suzuki   haruto ')).toEqual({ ok: true, value: 'SUZUKI HARUTO' });
    expect(parseRecipientName('x'.repeat(31))).toEqual({ ok: false, error: 'name_too_long' });
    expect(parseRecipientName('   ')).toEqual({ ok: false, error: 'required' });
  });
});

describe('normalizeTransferCommand', () => {
  it('returns field errors keyed by command path', () => {
    const r = normalizeTransferCommand({
      sourceAccountId: 'a',
      destination: {
        kind: TransferDestinationKind.Recipient,
        bankId: 'b',
        accountNumber: '12',
        recipientName: 'X!',
        recipientNameSource: RecipientNameSource.Manual,
      },
      amount: '1,000',
      reference: 'ok',
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.fieldErrors).sort()).toEqual([
        'amount',
        'destination.accountNumber',
        'destination.recipientName',
      ]);
  });

  it('produces the same canonical form for equivalent input', () => {
    const a = normalizeTransferCommand({
      sourceAccountId: 'a',
      destination: { kind: TransferDestinationKind.Own, accountId: 'b' },
      amount: '0100',
      reference: '  hi  ',
    });
    const b = normalizeTransferCommand({
      sourceAccountId: 'a',
      destination: { kind: TransferDestinationKind.Own, accountId: 'b' },
      amount: '100',
      reference: 'hi',
    });
    expect(a.ok && b.ok && canonicalCommand(a.value) === canonicalCommand(b.value)).toBe(true);
  });
});

describe('accountUsability', () => {
  it('derives the permission matrix', () => {
    expect(
      accountUsability({ lifecycle: Lifecycle.Open, restriction: Restriction.None }),
    ).toMatchObject({ status: 'active', canSend: true, canReceive: true });
    expect(
      accountUsability({ lifecycle: Lifecycle.Open, restriction: Restriction.Blocked }),
    ).toMatchObject({ status: 'restricted', canSend: false, canView: true });
    expect(
      accountUsability({ lifecycle: Lifecycle.Closed, restriction: Restriction.None }),
    ).toMatchObject({ status: 'closed', canView: false });
  });
});
