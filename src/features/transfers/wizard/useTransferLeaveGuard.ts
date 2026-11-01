import { navigationBypass } from '@/shared/navigation/bypass.ts';
import { useEffect, type RefObject } from 'react';
import { useBlocker } from 'react-router';

export function useTransferLeaveGuard(dirty: boolean, orderCreated: RefObject<boolean>) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !orderCreated.current &&
      !navigationBypass.active &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!orderCreated.current && !navigationBypass.active) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, orderCreated]);
  return {
    blocked: blocker.state === 'blocked',
    leave: () => {
      if (blocker.state === 'blocked') blocker.proceed();
    },
    keepEditing: () => {
      if (blocker.state === 'blocked') blocker.reset();
    },
  };
}
