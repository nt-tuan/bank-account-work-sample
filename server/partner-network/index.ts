/**
 * Mock third-party interbank network (spec §8). It keeps its own SQLite file with its own data shape,
 * and is reachable from core code only through server/partner-gateway/network-gateway.ts.
 */
import { randomBytes } from 'node:crypto';
import { openDatabase, type Database } from '../persistence/sqlite.ts';
import fixtures from './fixtures.json' with { type: 'json' };

/** Partner account status codes: usable, closed or frozen. */
export enum PartnerAccountStatus {
  Active = '1',
  Closed = '2',
  Frozen = '9',
}

/** Partner account products: FUTSU is ordinary, TOZA is current. */
export enum PartnerAccountKind {
  Ordinary = 'FUTSU',
  Current = 'TOZA',
}

/** Raw partner account inquiry response, translated by the network adapter. */
export enum PartnerInquiryResult {
  Found = 'FOUND',
  NotFound = 'NOT_FOUND',
  UnavailableAccount = 'UNAVAILABLE_ACCOUNT',
}

export type InquiryResponse =
  | { result: PartnerInquiryResult.Found; holder_name: string; account_kind: PartnerAccountKind }
  | { result: PartnerInquiryResult.NotFound }
  | { result: PartnerInquiryResult.UnavailableAccount };

/** Partner payment response codes; success is 00, E1/E2 account restrictions, E3 name mismatch, E4 missing recipient, E9 other rejection. */
export enum ResultCode {
  Success = '00',
  AccountClosed = 'E1',
  AccountFrozen = 'E2',
  NameMismatch = 'E3',
  RecipientNotFound = 'E4',
  Rejected = 'E9',
}
export type PaymentRecord = { payment_id: string; client_ref: string; result_cd: ResultCode };

export type SubmitRequest = {
  client_ref: string;
  bank_code: string;
  account_no: string;
  beneficiary_name: string;
  amount: string; // decimal string, yen
};

/** Demo fault policy, looked up by client_ref. */
export type PartnerFault = {
  /** Record the payment, then answer only after this delay (beyond the caller's timeout = response lost). */
  delayAfterCommitMs?: number;
  /** Lose the first submission before it is recorded. */
  dropFirstSubmit?: boolean;
  /** Refuse every call for this payment until the given time. */
  outageUntil?: number;
  /** Reject with this result code regardless of account state. */
  rejectWith?: ResultCode;
};

export class PartnerServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerServiceError';
  }
}

export type PartnerNetwork = {
  inquireAccount(bankCode: string, accountNo: string): Promise<InquiryResponse>;
  submitCreditTransfer(req: SubmitRequest): Promise<PaymentRecord>;
  getCreditTransfer(clientRef: string): Promise<PaymentRecord | { status: 'NOT_RECEIVED' }>;
  admin: {
    reset(): void;
    setFault(clientRef: string, fault: PartnerFault): void;
    clearFaults(): void;
    recordSeedPayment(p: {
      payment_id: string;
      client_ref: string;
      bank_code: string;
      account_no: string;
      beneficiary_name: string;
      amount: number;
      received_at: number;
      result_cd: ResultCode;
    }): void;
  };
  close(): void;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS partner_banks (
  bank_code TEXT PRIMARY KEY,
  bank_name TEXT NOT NULL,
  inquiry_available INTEGER NOT NULL CHECK (inquiry_available IN (0, 1))
);
CREATE TABLE IF NOT EXISTS partner_accounts (
  bank_code TEXT NOT NULL REFERENCES partner_banks(bank_code),
  account_no TEXT NOT NULL,
  account_kind TEXT NOT NULL CHECK (account_kind IN ('FUTSU','TOZA')),
  holder_name TEXT NOT NULL,
  status_cd TEXT NOT NULL CHECK (status_cd IN ('1','2','9')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bank_code, account_no)
);
CREATE TABLE IF NOT EXISTS partner_payments (
  payment_id TEXT PRIMARY KEY,
  client_ref TEXT NOT NULL UNIQUE,
  bank_code TEXT NOT NULL,
  account_no TEXT NOT NULL,
  beneficiary_name TEXT NOT NULL,
  amount TEXT NOT NULL,
  result_cd TEXT NOT NULL CHECK (result_cd IN ('00','E1','E2','E3','E4','E9')),
  received_at TEXT NOT NULL
);`;

function jstStamp(ms: number): string {
  const d = new Date(ms + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

const normalizeName = (s: string) => s.trim().replace(/ {2,}/g, ' ').toUpperCase();

export function createPartnerNetwork(opts: {
  dbPath: string;
  now: () => number;
  latencyMs?: { min: number; max: number };
}): PartnerNetwork {
  const db: Database = openDatabase(opts.dbPath);
  db.exec(SCHEMA);
  const faults = new Map<string, PartnerFault>();
  const latency = opts.latencyMs ?? { min: 100, max: 300 };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const jitter = () => sleep(latency.min + Math.random() * (latency.max - latency.min));

  const seed = () =>
    db.immediate((tx) => {
      tx.run('DELETE FROM partner_payments');
      tx.run('DELETE FROM partner_accounts');
      tx.run('DELETE FROM partner_banks');
      for (const b of fixtures.banks)
        tx.run('INSERT INTO partner_banks VALUES (?, ?, ?)', [
          b.bank_code,
          b.bank_name,
          b.inquiry_available,
        ]);
      const stamp = jstStamp(opts.now());
      for (const a of fixtures.accounts) {
        tx.run('INSERT INTO partner_accounts VALUES (?, ?, ?, ?, ?, ?)', [
          a.bank_code,
          a.account_no,
          a.account_kind,
          a.holder_name,
          a.status_cd,
          stamp,
        ]);
      }
      return null;
    });

  const empty =
    db.read((q) => q.get<{ n: number }>('SELECT COUNT(*) AS n FROM partner_banks'))?.n === 0;
  if (empty) seed();

  const assertService = (clientRef?: string) => {
    const fault = clientRef ? faults.get(clientRef) : undefined;
    if (fault?.outageUntil !== undefined && opts.now() < fault.outageUntil)
      throw new PartnerServiceError('Partner network unavailable');
  };

  const findPayment = (clientRef: string) =>
    db.read((q) =>
      q.get<PaymentRecord>(
        'SELECT payment_id, client_ref, result_cd FROM partner_payments WHERE client_ref = ?',
        [clientRef],
      ),
    );

  return {
    async inquireAccount(bankCode, accountNo) {
      await jitter();
      const bank = db.read((q) =>
        q.get<{ inquiry_available: number }>(
          'SELECT inquiry_available FROM partner_banks WHERE bank_code = ?',
          [bankCode],
        ),
      );
      if (!bank || bank.inquiry_available === 0)
        throw new PartnerServiceError('Inquiry service unavailable for this bank');
      const acc = db.read((q) =>
        q.get<{
          holder_name: string;
          account_kind: PartnerAccountKind;
          status_cd: PartnerAccountStatus;
        }>(
          'SELECT holder_name, account_kind, status_cd FROM partner_accounts WHERE bank_code = ? AND account_no = ?',
          [bankCode, accountNo],
        ),
      );
      if (!acc) return { result: PartnerInquiryResult.NotFound };
      if (acc.status_cd !== PartnerAccountStatus.Active)
        return { result: PartnerInquiryResult.UnavailableAccount };
      return {
        result: PartnerInquiryResult.Found,
        holder_name: acc.holder_name,
        account_kind: acc.account_kind,
      };
    },

    async submitCreditTransfer(req) {
      await jitter();
      assertService(req.client_ref);
      const fault = faults.get(req.client_ref);
      if (fault?.dropFirstSubmit) {
        faults.set(req.client_ref, { ...fault, dropFirstSubmit: false });
        throw new PartnerServiceError('Request lost in transit');
      }
      const existing = findPayment(req.client_ref);
      if (existing) return existing;

      let result: ResultCode;
      if (fault?.rejectWith) {
        result = fault.rejectWith;
      } else {
        const acc = db.read((q) =>
          q.get<{ holder_name: string; status_cd: PartnerAccountStatus }>(
            'SELECT holder_name, status_cd FROM partner_accounts WHERE bank_code = ? AND account_no = ?',
            [req.bank_code, req.account_no],
          ),
        );
        if (!acc) result = ResultCode.RecipientNotFound;
        else if (acc.status_cd === PartnerAccountStatus.Closed) result = ResultCode.AccountClosed;
        else if (acc.status_cd === PartnerAccountStatus.Frozen) result = ResultCode.AccountFrozen;
        else if (normalizeName(acc.holder_name) !== normalizeName(req.beneficiary_name))
          result = ResultCode.NameMismatch;
        else result = ResultCode.Success;
      }
      const record: PaymentRecord = {
        payment_id: `PN${randomBytes(6).toString('hex').toUpperCase()}`,
        client_ref: req.client_ref,
        result_cd: result,
      };
      db.immediate((tx) => {
        tx.run('INSERT INTO partner_payments VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
          record.payment_id,
          req.client_ref,
          req.bank_code,
          req.account_no,
          normalizeName(req.beneficiary_name),
          req.amount,
          result,
          jstStamp(opts.now()),
        ]);
        return null;
      });
      if (fault?.delayAfterCommitMs) {
        faults.set(req.client_ref, { ...fault, delayAfterCommitMs: 0 });
        await sleep(fault.delayAfterCommitMs);
      }
      return record;
    },

    async getCreditTransfer(clientRef) {
      await jitter();
      assertService(clientRef);
      return findPayment(clientRef) ?? { status: 'NOT_RECEIVED' };
    },

    admin: {
      reset() {
        faults.clear();
        seed();
      },
      setFault(clientRef, fault) {
        faults.set(clientRef, fault);
      },
      clearFaults() {
        faults.clear();
      },
      recordSeedPayment(p) {
        db.immediate((tx) => {
          tx.run('INSERT OR IGNORE INTO partner_payments VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            p.payment_id,
            p.client_ref,
            p.bank_code,
            p.account_no,
            p.beneficiary_name,
            String(p.amount),
            p.result_cd,
            jstStamp(p.received_at),
          ]);
          return null;
        });
      },
    },

    close() {
      db.close();
    },
  };
}
