import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiUrl } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Download, Filter, RotateCcw, Clock, User, ChevronDown } from 'lucide-react';

type AuditEntry = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  created_at: string;
  user?: { name?: string } | null;
  changes?: Record<string, unknown> | null;
};

export function AuditLogsPage() {
  const { locale, t } = useI18n();
  const { can } = useAuth();
  const [filters, setFilters] = useState({ action: '', entity_type: '', user_id: '', date_from: '', date_to: '' });
  const search = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters]);

  const query = useQuery({
    queryKey: ['audit-logs', search],
    queryFn: () => apiFetch<any>(`/audit-logs?per_page=50${search ? `&${search}` : ''}`),
  });

  if (!can('audit.view')) {
    return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  }

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;

  const items: AuditEntry[] = Array.isArray(query.data) ? query.data : query.data?.items || [];
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const exportUrl = apiUrl(`/audit-logs/export${search ? `?${search}` : ''}`);

  const getActionBadge = (action: string) => {
    if (action.includes('create') || action.includes('store')) {
      return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-700">{action}</span>;
    }
    if (action.includes('delete') || action.includes('archive')) {
      return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-red-100 text-red-700">{action}</span>;
    }
    if (action.includes('update') || action.includes('modify')) {
      return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-100 text-blue-700">{action}</span>;
    }
    return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700">{action}</span>;
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title={locale === 'ar' ? 'سجل العمليات والتدقيق' : 'Audit Logs'}
          description={locale === 'ar' ? 'تتبع كافة التعديلات والتغييرات التي تتم على النظام' : 'Track all system changes, user actions, and modifications'}
        />

        {can('reports.export') && (
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 transition-colors shrink-0 shadow-sm"
          >
            <Download className="w-4 h-4" />
            {locale === 'ar' ? 'تصدير السجل (CSV)' : 'Export CSV'}
          </a>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
          <Filter className="w-3.5 h-3.5" />
          <span>{locale === 'ar' ? 'تصفية السجلات' : 'Filter Logs'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
            placeholder={locale === 'ar' ? 'نوع الإجراء (create, update...)' : 'Action'}
            value={filters.action}
            onChange={(e) => setFilter('action', e.target.value)}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
            placeholder={locale === 'ar' ? 'نوع الكيان (Student, User...)' : 'Entity Type'}
            value={filters.entity_type}
            onChange={(e) => setFilter('entity_type', e.target.value)}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
            placeholder={locale === 'ar' ? 'معرّف المستخدم' : 'User ID'}
            inputMode="numeric"
            value={filters.user_id}
            onChange={(e) => setFilter('user_id', e.target.value)}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilter('date_from', e.target.value)}
          />
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilter('date_to', e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters({ action: '', entity_type: '', user_id: '', date_from: '', date_to: '' })}
              className="rounded-xl px-2.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Logs List */}
      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد سجلات تدقيق مطابقة' : 'No audit records match filters'} />
      ) : (
        <div className="space-y-3">
          {items.map((entry) => (
            <div key={entry.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getActionBadge(entry.action)}
                  <span className="font-bold text-sm text-slate-800">
                    {entry.entity_type} {entry.entity_id ? `(#${entry.entity_id})` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  {entry.user && (
                    <span className="flex items-center gap-1 font-semibold text-slate-600">
                      <User className="w-3.5 h-3.5" />
                      {entry.user.name}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {entry.created_at}
                  </span>
                </div>
              </div>

              {entry.changes && Object.keys(entry.changes).length > 0 && (
                <details className="group pt-2 border-t border-slate-50">
                  <summary className="cursor-pointer text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 select-none">
                    <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                    <span>{locale === 'ar' ? 'عرض تفاصيل التغييرات' : 'View Changes Details'}</span>
                  </summary>
                  <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-900 text-slate-100 p-4 text-xs font-mono">
                    {JSON.stringify(entry.changes, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
