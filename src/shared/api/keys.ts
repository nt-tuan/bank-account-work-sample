/** One query-key factory so invalidation is greppable (docs/technical-design/architecture.md §6.4). */
export const qk = {
  session: ['session'] as const,
  accounts: { all: ['accounts'] as const, detail: (id: string) => ['accounts', id] as const },
  activity: {
    all: ['activity'] as const,
    list: (f: Record<string, unknown>) => ['activity', 'list', f] as const,
    detail: (id: string) => ['activity', 'detail', id] as const,
  },
  transfers: {
    all: ['transfers'] as const,
    detail: (id: string) => ['transfers', 'detail', id] as const,
  },
  insights: (p: { month: string; accountId?: string | undefined }) => ['insights', p] as const,
  banks: ['banks'] as const,
  recipientLookup: (bankId: string, accountNumber: string) =>
    ['recipient-lookup', bankId, accountNumber] as const,
  demoCatalog: ['demo', 'catalog'] as const,
};
