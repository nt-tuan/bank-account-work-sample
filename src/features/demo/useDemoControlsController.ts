import { DemoScenarioId } from '@domain/domain/enums.ts';
import { api } from '@/shared/api/endpoints.ts';
import { qk } from '@/shared/api/keys.ts';
import { navigationBypass } from '@/shared/navigation/bypass.ts';
import { clearCustomerData } from '@/features/auth/index.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';

export function useDemoControlsController({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: qk.demoCatalog, queryFn: api.demoCatalog, enabled: open });
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const setScenario = useMutation({
    mutationFn: (s: DemoScenarioId | null) => api.demoScenario(s),
    onSuccess: (data, s) => {
      queryClient.setQueryData(qk.demoCatalog, data);
      setMessage(
        s === DemoScenarioId.LookupLimit
          ? 'Lookup counter set to the limit.'
          : s
            ? 'Scenario set for your next applicable request.'
            : 'Scenario cleared.',
      );
    },
    onError: () => setMessage("Couldn't update the scenario."),
  });
  const leaveTo = async () => {
    navigationBypass.active = true;
    clearCustomerData(queryClient);
    onOpenChange(false);
    await navigate('/login', { replace: true });
    navigationBypass.active = false;
  };
  const expire = async () => {
    try {
      await api.demoExpireSession();
    } finally {
      await leaveTo();
    }
  };
  const reset = async () => {
    setConfirmReset(false);
    setMessage('Resetting…');
    try {
      await api.demoReset();
      await leaveTo();
    } catch {
      setMessage("Reset didn't complete. Try again.");
    }
  };
  const selected = catalog.data?.pendingScenario ?? '';
  return {
    catalog,
    message,
    confirmReset,
    setConfirmReset,
    setScenario,
    expire,
    reset,
    selected,
  };
}
