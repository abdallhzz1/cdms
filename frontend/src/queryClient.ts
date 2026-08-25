import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

/**
 * Single shared TanStack Query client for the app. Foundation-only
 * defaults — individual queries override staleTime/retry as their data's
 * freshness needs dictate once business modules exist.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403, 404, 422].includes(error.status)) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
