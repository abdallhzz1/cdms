import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Form';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import {
  getDepartmentRoster,
  getDepartmentSummary
} from '../api/distribution';
import type {
  DepartmentSummary,
  PaginatedResponse,
  ClinicalScheduleItem
} from '../api/distribution';

export function DepartmentRoster() {
  const { locale, t } = useI18n();
  const { departmentId } = useParams<{ departmentId: string }>();
  const [scheduleData, setScheduleData] = useState<PaginatedResponse<ClinicalScheduleItem> | null>(null);
  const [summaryData, setSummaryData] = useState<DepartmentSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const fetchRoster = async (currentPage: number, searchTerm: string) => {
    if (!departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const [rosterRes, summaryRes] = await Promise.all([
        getDepartmentRoster(parseInt(departmentId), { page: currentPage, per_page: 25, search: searchTerm || undefined }),
        getDepartmentSummary(parseInt(departmentId)),
      ]);
      setScheduleData(rosterRes);
      setSummaryData(summaryRes.data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load department roster.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster(page, search);
  }, [departmentId, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchRoster(1, search);
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  if (loading && !scheduleData) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => fetchRoster(page, search)} />;
  }

  if (summaryData?.no_current_distribution) {
    return (
      <EmptyState 
        title={t('roster.noDistribution')}
        message={t('roster.noDepartmentAssignments')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {(locale === 'ar' ? summaryData?.department?.name_ar : summaryData?.department?.name_en) || t('directory.department')}
            </h1>
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 uppercase tracking-wider">
              {t('roster.current')}
            </span>
            {summaryData?.department?.dept_type === 'sub' && (
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-500/20">
                Sub-department
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {summaryData?.department?.name_ar}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <Card>
          <CardContent className="p-5">
            <dt className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">{t('roster.totalStudents')}</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{summaryData?.summary?.total_assigned_students || 0}</dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <dt className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">{t('roster.rotationBlocks')}</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{summaryData?.summary?.total_rotation_blocks || 0}</dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <dt className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">{t('roster.trainingSites')}</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{summaryData?.summary?.total_training_sites || 0}</dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <dt className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">{t('roster.supervisors')}</dt>
            <dd className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{summaryData?.summary?.total_supervisors_assigned || 0}</dd>
          </CardContent>
        </Card>
        {Number(summaryData?.summary?.unsupervised_assignments) > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-5">
              <dt className="truncate text-xs font-semibold uppercase tracking-wider text-amber-700">{t('roster.unsupervised')}</dt>
              <dd className="mt-2 text-3xl font-bold tracking-tight text-amber-900">{summaryData?.summary.unsupervised_assignments}</dd>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="text"
              placeholder={t('roster.searchStudents')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="primary">
            {t('common.search')}
          </Button>
        </form>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('roster.universityNumber')}</TableHead>
            <TableHead>{t('roster.studentName')}</TableHead>
            <TableHead>{t('roster.rotationBlock')}</TableHead>
            <TableHead>{t('roster.blockDates')}</TableHead>
            <TableHead>{t('roster.trainingSites')}</TableHead>
            <TableHead>{t('roster.supervisors')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scheduleData?.data.map((item) => (
            <TableRow key={item.assignment_id}>
              <TableCell className="font-medium text-slate-900">
                {item.student?.university_number}
              </TableCell>
              <TableCell>
                <div className="font-semibold text-slate-900">{item.student?.full_name_ar}</div>
                {item.student?.full_name_en && (
                  <div className="text-xs text-slate-500 mt-0.5">{item.student.full_name_en}</div>
                )}
              </TableCell>
              <TableCell>
                <div className="font-medium text-slate-900">{item.rotation?.name}</div>
                <div className="mt-1">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                    Block {item.block?.block_code}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-slate-900">{formatDate(item.block?.start_date)}</div>
                <div className="text-xs text-slate-500 mt-0.5"><span className="text-slate-400">{t('roster.dateTo')}</span> {formatDate(item.block?.end_date)}</div>
              </TableCell>
              <TableCell className="text-slate-700">
                {item.training_site?.name}
              </TableCell>
              <TableCell>
                {item.supervisor ? (
                  <div className="font-medium text-slate-900">{item.supervisor.full_name_en || item.supervisor.full_name_ar}</div>
                ) : (
                  <span className="text-sm italic text-slate-400">{t('roster.unassigned')}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {scheduleData?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                {t('roster.noAssignments')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
        
      {/* Pagination */}
      {scheduleData && scheduleData.last_page > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6 rounded-b-xl shadow-sm">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
          <span className="text-sm text-slate-700">
            {t('roster.pageSummary').replace('{current}', String(scheduleData.current_page)).replace('{last}', String(scheduleData.last_page))}
          </span>
          <Button variant="outline" size="sm" disabled={page === scheduleData.last_page} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
        </div>
      )}
    </div>
  );
}
