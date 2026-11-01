import { AccountsOverview } from '@/features/accounts/AccountsOverview.tsx';
import { RecentActivitySection } from '@/features/accounts/RecentActivitySection.tsx';
import { useAmountsHidden } from '@/shared/amounts/visibility.ts';

export function HomePage() {
  const [hidden, setHidden] = useAmountsHidden();
  return (
    <>
      <AccountsOverview hidden={hidden} onToggleAmounts={() => setHidden(!hidden)} />
      <RecentActivitySection hidden={hidden} />
    </>
  );
}
