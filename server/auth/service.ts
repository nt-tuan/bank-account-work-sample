import type { Database } from '../persistence/sqlite.ts';
import { DUMMY_HASH, verifyPassword } from './password.ts';

export function createAuthService(db: Database) {
  return {
    /** Returns the customer ID, or null. Unknown usernames still pay for a hash check (uniform timing). */
    verify(username: string, password: string): string | null {
      const row = db.read((q) =>
        q.get<{ customer_id: string; password_hash: string }>(
          'SELECT customer_id, password_hash FROM credentials WHERE username = ?',
          [username],
        ),
      );
      const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
      return ok && row ? row.customer_id : null;
    },
    displayName(customerId: string): string | null {
      return (
        db.read((q) =>
          q.get<{ display_name: string }>('SELECT display_name FROM customers WHERE id = ?', [
            customerId,
          ]),
        )?.display_name ?? null
      );
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
