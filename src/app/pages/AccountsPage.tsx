import { AccountType } from '@domain/domain/enums.ts';
import { AccountStatus, ErrorState, Money } from '@/shared/ui/primitives.tsx';
import { AccountsSkeleton } from '@/shared/ui/page-skeletons.tsx';
import { ui, twMerge } from '@/shared/ui/classes.ts';
import table from '@/shared/ui/table.module.css';
import { PageLink as Link } from '@/shared/navigation/PageLink.tsx';
import { useAccounts } from '@/features/accounts/index.ts';

export function AccountsPage() {
  const accounts = useAccounts();
  return (
    <>
      {accounts.isPending && <AccountsSkeleton />}
      {accounts.isError && !accounts.data && (
        <ErrorState
          message="We couldn't load your accounts."
          onRetry={() => void accounts.refetch()}
        />
      )}
      {accounts.data && (
        <div className={twMerge(ui.card, ui.tableWrap)}>
          <table className={table.table}>
            <caption className="sr-only">Your open accounts</caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Number</th>
                <th scope="col">Status</th>
                <th scope="col" className={table.r}>
                  Current
                </th>
                <th scope="col" className={table.r}>
                  On hold
                </th>
                <th scope="col" className={table.r}>
                  Available
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                    <br />
                    <span className="text-xs text-muted">
                      {a.type === AccountType.Checking ? 'Checking' : 'Savings'}
                    </span>
                  </td>
                  <td className="text-muted tabular-nums">{a.maskedNumber}</td>
                  <td>
                    <AccountStatus status={a.status} />
                    {a.restrictionReason && (
                      <>
                        <br />
                        <span className="text-xs text-muted">{a.restrictionReason}</span>
                      </>
                    )}
                  </td>
                  <td className={table.r}>
                    <Money minor={a.currentMinor} />
                  </td>
                  <td className={table.r}>
                    <Money minor={a.heldMinor} />
                  </td>
                  <td className={table.r}>
                    <Money minor={a.availableMinor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
