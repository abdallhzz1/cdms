import { useState, useEffect, type FormEvent } from 'react';
import { getClinicalSchedule } from '../api/distribution';
import type { ClinicalScheduleItem, PaginatedResponse } from '../api/distribution';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';

export function ClinicalSchedule() {
  const { t } = useI18n();
  const [scheduleData, setScheduleData] = useState<PaginatedResponse<ClinicalScheduleItem> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const fetchSchedule = async (currentPage: number, searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getClinicalSchedule({
        page: currentPage,
        per_page: 25,
        search: searchTerm || undefined,
      });
      setScheduleData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch schedule data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule(page, search);
  }, [page]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSchedule(1, search);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'N/A';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t('nav.schedule', 'الجدول السريري')}
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {t('distribution.status.current', 'التوزيع الحالي')}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {t('schedule.description', 'عرض التعيينات السريرية المعتمدة للطلبة')}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <form onSubmit={handleSearch} className="flex flex-1 max-w-lg gap-2">
          <input
            type="text"
            placeholder={t('common.search', 'ابحث...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 border"
          />
          <Button type="submit" variant="outline">{t('common.search', 'بحث')}</Button>
        </form>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => fetchSchedule(page, search)} />
      ) : loading && !scheduleData ? (
        <LoadingState message={t('common.loading', 'جاري التحميل...')} />
      ) : scheduleData?.data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('schedule.student', 'الطالب')}</TableHead>
                  <TableHead>{t('schedule.rotation', 'الدورة التدريبية')}</TableHead>
                  <TableHead>{t('schedule.block', 'فترة التدريب')}</TableHead>
                  <TableHead>{t('schedule.location', 'الموقع / القسم')}</TableHead>
                  <TableHead>{t('schedule.supervisor', 'المشرف')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduleData?.data.map((item) => (
                  <TableRow key={item.assignment_id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{item.student?.full_name ?? '—'}</div>
                      <div className="text-xs text-slate-500">{item.student?.university_number ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-slate-900">{item.rotation?.name ?? '—'}</div>
                      <div className="text-xs text-slate-500">L{item.rotation?.academic_level ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-slate-900">{item.block?.block_code ?? '—'}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(item.block?.start_date)} - {formatDate(item.block?.end_date)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-slate-900">{item.training_site?.name ?? '—'}</div>
                      <div className="text-xs text-slate-500">{item.department?.name ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      {item.supervisor ? item.supervisor.name : <span className="text-amber-600 text-xs font-medium">{t('schedule.unassigned', 'بدون مشرف')}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          {scheduleData && scheduleData.last_page > 1 && (
            <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center justify-between sm:px-6">
              <div className="hidden sm:block">
                <p className="text-sm text-slate-700">
                  {scheduleData.from} - {scheduleData.to} / {scheduleData.total}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} variant="outline" size="sm">
                  {t('common.prev', 'السابق')}
                </Button>
                <Button onClick={() => setPage(p => Math.min(scheduleData.last_page, p + 1))} disabled={page === scheduleData.last_page} variant="outline" size="sm">
                  {t('common.next', 'التالي')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
