import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2, Search, User } from 'lucide-react';

export function ClinicalSchedulePage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('');

  const { data: schedule, isLoading, isError, refetch } = useQuery({
    queryKey: ['clinical-schedule', search, siteFilter],
    queryFn: () => apiFetch<any>(
      `/operational/clinical-schedule?per_page=50${search ? `&search=${search}` : ''}${siteFilter ? `&training_site_id=${siteFilter}` : ''}`
    ),
  });

  const { data: sites } = useQuery({
    queryKey: ['training-sites-filter'],
    queryFn: () => apiFetch<any>('/training-sites?per_page=100'),
  });

  const hasAccess = useMemo(() => {
    if (!user) return false;
    const roles = user.roles ? user.roles.map(r => (typeof r === 'string' ? r : (r as any).name || '').toUpperCase()) : [];
    const isAcademicUser = roles.some(r => [
      'RTA', 
      'CLINICAL_SUPERVISOR', 
      'ACADEMIC_ADVISOR', 
      'DEPARTMENT_HEAD', 
      'CLINICAL_DIRECTOR', 
      'ADMIN_ASSISTANT', 
      'SYS_ADMIN', 
      'DEAN', 
      'VICE_DEAN'
    ].includes(r));
    return can('distribution.view') || can('students.view') || can('courses.view') || isAcademicUser;
  }, [user, can]);

  if (!hasAccess) return <ErrorState title="Access Denied" message={locale === 'ar' ? 'غير مصرح للوصول لهذه الصفحة' : 'Access Denied'} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = Array.isArray(schedule) ? schedule : schedule?.items || [];
  const sitesList = Array.isArray(sites) ? sites : sites?.items || [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader
        title={locale === 'ar' ? 'الجدول السريري الإداري' : 'Administrative Clinical Schedule'}
        description={locale === 'ar' ? 'عرض شامل لجميع تعيينات التدريب السريري المنشورة' : 'Comprehensive view of all published clinical training assignments'}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={locale === 'ar' ? 'بحث عن طالب...' : 'Search student...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
          />
        </div>
        <select
          value={siteFilter}
          onChange={e => setSiteFilter(e.target.value)}
          className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
        >
          <option value="">{locale === 'ar' ? 'كل المواقع' : 'All Sites'}</option>
          {sitesList.map((s: any) => (
            <option key={s.id} value={s.id}>{locale === 'ar' ? s.name_ar : s.name_en || s.name_ar}</option>
          ))}
        </select>
      </div>

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد تعيينات سريرية منشورة حالياً' : 'No published clinical assignments found'} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الموقع / المستشفى' : 'Site / Hospital'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المجموعة / المجموعة الفرعية' : 'Group / Subgroup'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الكتلة' : 'Block'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المشرف' : 'Supervisor'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((a: any, i: number) => (
                  <tr key={a.id ?? i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {(a.student?.full_name_ar || a.student?.full_name_en || '?')[0]}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? a.student?.full_name_ar : a.student?.full_name_en || a.student?.full_name_ar}</div>
                          <div className="text-xs text-slate-500">{a.student?.university_number}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700">{locale === 'ar' ? a.training_site?.name_ar : a.training_site?.name_en || a.training_site?.name_ar}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {a.subgroup?.group?.name ?? a.group?.name ?? '—'}
                      {a.subgroup?.name && <span className="text-slate-400"> / {a.subgroup.name}</span>}
                    </td>
                    <td className="px-6 py-4">
                      {a.rotation_block?.block_code ? (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg">{a.rotation_block.block_code}</span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {a.supervisor ? (
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700">{locale === 'ar' ? a.supervisor?.full_name_ar : a.supervisor?.full_name_en || a.supervisor?.full_name_ar}</span>
                        </div>
                      ) : <span className="text-slate-400 text-sm">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
