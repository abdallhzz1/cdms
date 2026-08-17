import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/Card';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { getDashboardSummary } from '@/api/distribution';
import type { DashboardFilters } from '@/api/distribution';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

export function ClinicalDashboard() {
  const { t } = useI18n();
  const { can } = useAuth();
  const [filters] = useState<DashboardFilters>({});

  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['dashboard-summary', filters],
    queryFn: () => getDashboardSummary(filters),
    staleTime: 60000,
  });

  const dashboard = response?.data;
  const meta = response?.meta;

  if (isLoading) {
    return <LoadingState message={t('common.loading', 'جاري التحميل...')} />;
  }

  if (isError) {
    return (
      <ErrorState 
        message={error instanceof Error ? error.message : undefined} 
        onRetry={() => refetch()} 
      />
    );
  }

  if (!dashboard || dashboard.distribution_overview.active_rotations_count === 0) {
    return <EmptyState />;
  }

  if (!dashboard) {
    return null;
  }

  const { student_coverage, distribution_overview, alerts } = dashboard;
  const hasAlerts = Object.values(alerts).some(val => val > 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{t('nav.dashboard')}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t('dashboard.title', 'نظام إدارة التدريب السريري')}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {t('dashboard.subtitle', 'لوحة التحكم')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {meta?.generated_at && (
            <span className="text-xs text-slate-500 hidden sm:inline-block">
              {t('distribution.last_updated', 'آخر تحديث')}: {new Date(meta.generated_at).toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
          >
            {isFetching ? t('common.loading', 'جاري التحميل...') : t('common.refresh', 'تحديث')}
          </button>
        </div>
      </div>

      {/* Needs Your Attention (Alerts) */}
      {hasAlerts && (
        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-4">{t('dashboard.needs_attention', 'يحتاج إلى انتباهك')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.unassigned_students_count > 0 && (
              <div className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-amber-900">{t('dashboard.alerts.unassigned', 'طلبة غير موزعين')}</h3>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{alerts.unassigned_students_count}</p>
                </div>
                {can('distribution.view') && (
                  <Link to="/distribution" className="text-sm font-medium text-amber-700 hover:text-amber-900">
                    {t('common.view_details', 'عرض التفاصيل')} &rarr;
                  </Link>
                )}
              </div>
            )}
            
            {alerts.sites_over_capacity_count > 0 && (
              <div className="flex items-start gap-4 rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-900">{t('dashboard.alerts.over_capacity', 'مواقع تجاوزت السعة')}</h3>
                  <p className="mt-1 text-2xl font-bold text-red-700">{alerts.sites_over_capacity_count}</p>
                </div>
              </div>
            )}

            {alerts.sites_near_capacity_count > 0 && (
              <div className="flex items-start gap-4 rounded-xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-orange-900">{t('dashboard.alerts.near_capacity', 'مواقع اقتربت من السعة')}</h3>
                  <p className="mt-1 text-2xl font-bold text-orange-700">{alerts.sites_near_capacity_count}</p>
                </div>
              </div>
            )}

            {alerts.unsupervised_assignments_count > 0 && (
              <div className="flex items-start gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-amber-900">{t('dashboard.alerts.unsupervised', 'تعيينات بدون مشرف')}</h3>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{alerts.unsupervised_assignments_count}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* KPI Cards */}
      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-4">{t('dashboard.overview', 'نظرة عامة')}</h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm p-5 border-none relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-pink-100 rounded-bl-full opacity-50"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              </div>
              <dt className="text-sm font-semibold text-slate-500 mb-1">{t('dashboard.kpi.total_students', 'إجمالي الطلبة')}</dt>
              <dd className="text-3xl font-bold tracking-tight text-slate-900">{student_coverage.total_active_students}</dd>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm p-5 border-none relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-100 rounded-bl-full opacity-50"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <dt className="text-sm font-semibold text-slate-500 mb-1">{t('dashboard.kpi.assigned_students', 'الطلبة الموزعون')}</dt>
              <dd className="text-3xl font-bold tracking-tight text-slate-900">{student_coverage.assigned_students}</dd>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm p-5 border-none relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100 rounded-bl-full opacity-50"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              </div>
              <dt className="text-sm font-semibold text-slate-500 mb-1">{t('dashboard.kpi.coverage', 'نسبة التغطية')}</dt>
              <dd className="text-3xl font-bold tracking-tight text-slate-900">{student_coverage.coverage_percentage}%</dd>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm p-5 border-none relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-100 rounded-bl-full opacity-50"></div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
              <dt className="text-sm font-semibold text-slate-500 mb-1">{t('dashboard.kpi.active_rotations', 'التدريبات الفعالة')}</dt>
              <dd className="text-3xl font-bold tracking-tight text-slate-900">{distribution_overview.active_rotations_count}</dd>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-4">{t('dashboard.quick_actions', 'إجراءات سريعة')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {can('distribution.create') && (
            <Link 
              to="/distribution" 
              className="flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-slate-50"
            >
              {t('distribution.actions.create', 'إنشاء توزيع سريري')}
            </Link>
          )}
          {can('distribution.view') && (
            <Link 
              to="/distribution/schedule" 
              className="flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              {t('nav.schedule', 'عرض الجدول السريري')}
            </Link>
          )}
          {can('reports.view') && (
            <Link 
              to="/operational/reports" 
              className="flex min-h-14 items-center justify-center rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              {t('nav.reports', 'التقارير التشغيلية')}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
