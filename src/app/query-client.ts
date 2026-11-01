import { ApiFailureKind, ApiError } from '@/shared/api/http.ts';
import { QueryClient } from '@tanstack/react-query';
import { installTransferMonitoring } from '@/features/transfers/index.ts';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Only retry reads whose outcome was unknown.
      retry: (count, error) =>
        count < 1 && error instanceof ApiError && error.failure.kind === ApiFailureKind.Unknown,
    },
    mutations: { retry: 0 },
  },
});

const disposeMonitoring = installTransferMonitoring(queryClient);
if (import.meta.hot) import.meta.hot.dispose(disposeMonitoring);
