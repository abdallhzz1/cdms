import { QueryClient } from '@tanstack/react-query';

/**
 * Single shared TanStack Query client for the app. Foundation-only
 * defaults — individual queries override staleTime/retry as their data's
 * freshness needs dictate once business modules exist.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
