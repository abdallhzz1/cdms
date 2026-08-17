import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  getDistributionVersions,
} from '@/api/distribution';
import type { DistributionVersionListItem, PaginatedResponse } from '@/api/distribution';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

export function DistributionList() {
  const { t } = useI18n();
  const { can } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PaginatedResponse<DistributionVersionListItem> | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchVersions = async (currentPage: number, status: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await getDistributionVersions({
        page: currentPage,
        status: status || undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load distribution versions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions(page, statusFilter);
  }, [page, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('nav.distribution', 'التوزيع السريري')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('distribution.list.description', 'إدارة ومراجعة واعتماد خطط توزيع الطلبة على فترات ومواقع التدريب السريري.')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">{t('common.all', 'الكل')}</option>
            <option value="suggested">{t('distribution.status.suggested', 'مقترح')}</option>
            <option value="manual">{t('distribution.status.manual', 'تعديل يدوي')}</option>
            <option value="published">{t('distribution.status.published', 'منشور')}</option>
          </select>
          {can('distribution.create') && (
            <button className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none">
              {t('distribution.actions.create', 'إنشاء توزيع جديد')}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => fetchVersions(page, statusFilter)} />
      ) : loading && !data ? (
        <LoadingState message={t('common.loading')} />
      ) : data?.data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>
                    {t('distribution.list.rotation', 'الدورة التدريبية')}
                  </TableHead>
                  <TableHead>
                    {t('distribution.academic_year', 'العام الأكاديمي')}
                  </TableHead>
                  <TableHead>
                    {t('distribution.list.status', 'الحالة')}
                  </TableHead>
                  <TableHead>
                    {t('distribution.list.progress', 'نسبة الإنجاز')}
                  </TableHead>
                  <TableHead>
                    {t('distribution.last_updated', 'آخر تحديث')}
                  </TableHead>
                  <TableHead><span className="sr-only">{t('common.actions', 'إجراءات')}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((item) => {
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        #{item.id}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {item.rotation?.name || `Rotation #${item.rotation_id}`}
                        </div>
                        <div className="text-xs text-slate-500">
                          Level {item.rotation?.academic_level ?? 'N/A'} • {item.rotation?.code}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.rotation?.academic_year?.name || 'N/A'}
                      </TableCell>
                      <TableCell><StatusBadge status={item.is_current_published ? 'current' : item.is_superseded ? 'superseded' : item.status} /></TableCell>
                      <TableCell>
                        <div className="text-slate-900 font-medium">
                          {item.assigned_students_count} / {item.total_eligible_students}
                        </div>
                        {item.unassigned_students_count > 0 ? (
                          <div className="text-xs font-medium text-amber-600">
                            {item.unassigned_students_count} {t('distribution.summary.unassigned')}
                          </div>
                        ) : (
                          <div className="text-xs text-emerald-600">100%</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(item.updated_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/distribution/${item.id}`}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          {t('common.view', 'عرض')}
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          {data && data.last_page > 1 && (
            <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-between sm:px-6">
              <div className="hidden sm:block">
                <p className="text-sm text-slate-700">
                  {t('directory.showing', 'عرض')} <span className="font-medium">{data.from}</span> - <span className="font-medium">{data.to}</span> /{' '}
                  <span className="font-medium">{data.total}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">
                  {t('common.previous')}
                </Button>
                <Button onClick={() => setPage((p) => Math.min(data.last_page, p + 1))} disabled={page === data.last_page} variant="outline" size="sm" className="ms-3">
                  {t('common.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
