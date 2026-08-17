import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiUrl } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type AuditEntry = {
  id: number; action: string; entity_type: string; entity_id: number | null;
  created_at: string; user?: { name?: string } | null; changes?: Record<string, unknown> | null;
};

export function AuditLogsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [filters, setFilters] = useState({ action: '', entity_type: '', user_id: '', date_from: '', date_to: '' });
  const search = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters]);
  const query = useQuery({
    queryKey: ['audit-logs', search],
    queryFn: () => apiFetch<AuditEntry[]>(`/audit-logs?per_page=100${search ? `&${search}` : ''}`),
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const exportUrl = apiUrl(`/audit-logs/export${search ? `?${search}` : ''}`);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-slate-900">{t('audit.title')}</h1>
      {can('reports.export') && <a href={exportUrl} className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">{t('common.export')}</a>}
    </div>
    <div className="grid gap-3 rounded border border-slate-200 bg-white p-4 md:grid-cols-5">
      <input aria-label={t('audit.filterAction')} className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder={t('audit.filterAction')} value={filters.action} onChange={(e) => setFilter('action', e.target.value)} />
      <input aria-label={t('audit.filterEntity')} className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder={t('audit.filterEntity')} value={filters.entity_type} onChange={(e) => setFilter('entity_type', e.target.value)} />
      <input aria-label={t('audit.filterUser')} className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder={t('audit.filterUser')} inputMode="numeric" value={filters.user_id} onChange={(e) => setFilter('user_id', e.target.value)} />
      <input aria-label={t('audit.filterDateFrom')} className="rounded border border-slate-300 px-3 py-2 text-sm" type="date" value={filters.date_from} onChange={(e) => setFilter('date_from', e.target.value)} />
      <div className="flex gap-2"><input aria-label={t('audit.filterDateTo')} className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" type="date" value={filters.date_to} onChange={(e) => setFilter('date_to', e.target.value)} /><Button type="button" variant="outline" size="sm" onClick={() => setFilters({ action: '', entity_type: '', user_id: '', date_from: '', date_to: '' })}>{t('common.reset')}</Button></div>
    </div>
    {!query.data?.length ? <p className="rounded border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('audit.empty')}</p> : <div className="divide-y rounded border border-slate-200 bg-white">
      {query.data.map((entry) => <details key={entry.id} className="p-3 text-sm">
        <summary className="cursor-pointer list-none font-medium text-slate-800"><span>{entry.action}</span><span className="font-normal text-slate-500"> · {entry.entity_type} #{entry.entity_id ?? '—'} · {entry.user?.name || '—'} · {entry.created_at}</span></summary>
        <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-700">{entry.changes ? JSON.stringify(entry.changes, null, 2) : t('audit.noDetails')}</pre>
      </details>)}
    </div>}
  </div>;
}
