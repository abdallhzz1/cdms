import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';

export interface HealthData {
  application: 'ok';
  database: 'ok' | 'unreachable';
}

export function fetchHealth(): Promise<HealthData> {
  return apiFetch<HealthData>('/health', { method: 'GET' });
}

/**
 * The only "business" query in Phase 1 — proves the TanStack Query +
 * centralized API client foundation works end to end. Future modules add
 * their own query hooks next to this one; no query logic belongs inside
 * components directly.
 */
export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 1,
    staleTime: 30_000,
  });
}
