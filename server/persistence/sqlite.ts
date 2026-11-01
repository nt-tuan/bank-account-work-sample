import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

/** SQLite statement operations supported by the shared parameter binder. */
enum StatementOperation {
  Get = 'get',
  All = 'all',
  Run = 'run',
}

/**
 * The only file that touches `node:sqlite` (a release-candidate API in Node 24, spec §11).
 * Everything else depends on the `Database` interface.
 */
export type Params = Record<string, SQLInputValue> | SQLInputValue[];

export interface Queryable {
  get<T>(sql: string, params?: Params): T | undefined;
  all<T>(sql: string, params?: Params): T[];
}

export interface Tx extends Queryable {
  run(sql: string, params?: Params): { changes: number };
}

type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

export interface Database {
  /** Runs fn inside BEGIN IMMEDIATE … COMMIT. fn must be synchronous (spec §7 step 3). */
  immediate<T>(fn: (tx: Tx) => NotPromise<T>): T;
  read<T>(fn: (q: Queryable) => T): T;
  exec(sql: string): void;
  close(): void;
}

export class DatabaseBusyError extends Error {
  constructor(cause: unknown) {
    super('Database is busy', { cause });
    this.name = 'DatabaseBusyError';
  }
}

function isBusy(error: unknown): boolean {
  const e = error as { errcode?: number; code?: string; message?: string };
  // SQLITE_BUSY = 5, SQLITE_LOCKED = 6 (primary result codes).
  return (
    (typeof e?.errcode === 'number' && (e.errcode & 0xff) in { 5: 1, 6: 1 }) ||
    /database is (locked|busy)/i.test(e?.message ?? '')
  );
}

export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 1000; PRAGMA synchronous = NORMAL;',
  );
  const cache = new Map<string, StatementSync>();
  let inTx = false;

  const prepare = (sql: string): StatementSync => {
    let stmt = cache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      cache.set(sql, stmt);
    }
    return stmt;
  };
  const bind = (stmt: StatementSync, params: Params | undefined, op: StatementOperation) => {
    if (params === undefined) return stmt[op]();
    if (Array.isArray(params)) return stmt[op](...params);
    return stmt[op](params);
  };

  const queryable: Tx = {
    get: <T>(sql: string, params?: Params) =>
      bind(prepare(sql), params, StatementOperation.Get) as T | undefined,
    all: <T>(sql: string, params?: Params) =>
      bind(prepare(sql), params, StatementOperation.All) as T[],
    run: (sql: string, params?: Params) => {
      const r = bind(prepare(sql), params, StatementOperation.Run) as { changes: number | bigint };
      return { changes: Number(r.changes) };
    },
  };

  return {
    immediate<T>(fn: (tx: Tx) => NotPromise<T>): T {
      if (inTx) throw new Error('Nested transactions are not supported');
      try {
        db.exec('BEGIN IMMEDIATE');
      } catch (error) {
        if (isBusy(error)) throw new DatabaseBusyError(error);
        throw error;
      }
      inTx = true;
      try {
        const result = fn(queryable);
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          throw new Error(
            'Transaction callback returned a promise; await is not allowed inside a write transaction',
          );
        }
        db.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* already rolled back */
        }
        if (isBusy(error)) throw new DatabaseBusyError(error);
        throw error;
      } finally {
        inTx = false;
      }
    },
    read<T>(fn: (q: Queryable) => T): T {
      return fn(queryable);
    },
    exec(sql: string) {
      db.exec(sql);
    },
    close() {
      cache.clear();
      db.close();
    },
  };
}
