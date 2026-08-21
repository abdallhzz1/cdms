import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AdvisingNavTabs } from '@/components/advising/AdvisingNavTabs';
import { Users, AlertTriangle, FileText, CheckCircle, GraduationCap, ShieldCheck, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AdvisingDashboardPage() {
  const { can, user } = useAuth();
  const { locale, t } = useI18n();

  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');

  // Check if current user is an Administrator / Department Head / Dean
  const isAdminOrHead = useMemo(() => {
    if (!user?.roles) return false;
    const roles = user.roles.map(r => (typeof r === 'string' ? r : (r as any).name || '').toUpperCase());
    return roles.some(r => ['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  }, [user]);

  // Fetch advisors lookup for admin filter dropdown
  const { data: usersLookup } = useQuery({
    queryKey: ['users-lookup-advising'],
    queryFn: () => apiFetch<any>('/users/lookup'),
    enabled: isAdminOrHead
  });

  // Determine students API endpoint based on role and selected advisor filter
  const studentsEndpoint = useMemo(() => {
    if (isAdminOrHead) {
      if (selectedAdvisorId) return `/students?academic_advisor_id=${selectedAdvisorId}&per_page=1000`;
      return `/students?per_page=1000`;
    }
    return `/students?academic_advisor_id=${user?.id}&per_page=1000`;
  }, [isAdminOrHead, selectedAdvisorId, user?.id]);

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['advised-students-list', studentsEndpoint],
    queryFn: () => apiFetch<any>(studentsEndpoint),
    enabled: Boolean(user?.id)
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['my-advising-records'],
    queryFn: () => apiFetch<any>(`/advising-records?per_page=20`),
    enabled: Boolean(user?.id)
  });

  if (!can('advising.view') && !can('students.view') && !isAdminOrHead) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (studentsLoading || recordsLoading) return <LoadingState />;

  const rawStudentsList: any[] = Array.isArray(students) ? students : (students?.data || students?.items || []);
  const recordsList: any[] = Array.isArray(records) ? records : (records?.data || records?.items || []);
  const advisorsList: any[] = Array.isArray(usersLookup) ? usersLookup : (usersLookup?.data || []);

  const atRiskCount = rawStudentsList.filter((s: any) => {
    const hasWarnings = s.warning_count > 0;
    const isLowGpa = s.gpa !== null && s.gpa !== undefined && Number(s.gpa) > 0 && Number(s.gpa) < 65.0;
    return hasWarnings || isLowGpa;
  }).length;
  const unassignedCount = isAdminOrHead ? rawStudentsList.filter((s: any) => !s.academic_advisor_id).length : 0;

  return (
    <div className="space-y-4 pb-16 px-1 sm:px-0">
      {/* Header Banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-800">
                {locale === 'ar' ? 'لوحة تحكم الإرشاد الأكاديمي' : 'Academic Advising Dashboard'}
              </h1>
              {isAdminOrHead ? (
                <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-md border border-teal-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-teal-600" />
                  {locale === 'ar' ? 'رؤية إدارية شاملة' : 'Admin Overview'}
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md border border-slate-200">
                  {locale === 'ar' ? 'لوحة المرشد الخاص' : 'My Advisor Portal'}
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              {isAdminOrHead 
                ? (locale === 'ar' ? 'متابعة شاملة لجميع طلبة الكلية، رصد التعثر، وتوزيع المرشدين.' : 'Comprehensive view of all faculty students and advisor assignments.')
                : (locale === 'ar' ? 'متابعة وتوجيه الطلاب المعينين لك وتسجيل جلسات الإرشاد الدورية.' : 'Track your assigned students and document advising sessions.')
              }
            </p>
          </div>
        </div>

        {isAdminOrHead && (
          <Link
            to="/advising/assignments"
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'تعيين وتخصيص المرشدين' : 'Assign Advisors'}</span>
          </Link>
        )}
      </div>

      {/* Advising Sub-Navigation Tabs */}
      <AdvisingNavTabs />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total / Assigned Students */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-center text-teal-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-800">{rawStudentsList.length}</div>
            <div className="text-[11px] font-semibold text-slate-500">
              {isAdminOrHead 
                ? (locale === 'ar' ? 'إجمالي طلاب الكلية' : 'Total Faculty Students')
                : (locale === 'ar' ? 'الطلاب المعينين لك' : 'Your Assigned Students')}
            </div>
          </div>
        </div>

        {/* Card 2: Unassigned or Logged Sessions */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-50 border border-sky-100 rounded-xl flex items-center justify-center text-sky-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-800">
              {isAdminOrHead ? unassignedCount : recordsList.length}
            </div>
            <div className="text-[11px] font-semibold text-slate-500">
              {isAdminOrHead 
                ? (locale === 'ar' ? 'طلاب بدون مرشد' : 'Unassigned Students')
                : (locale === 'ar' ? 'الجلسات المسجلة' : 'Logged Sessions')}
            </div>
          </div>
        </div>

        {/* Card 3: At Risk Students */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-800">{atRiskCount}</div>
            <div className="text-[11px] font-semibold text-slate-500">{locale === 'ar' ? 'طلاب متعثرين (< %65)' : 'At-Risk Students'}</div>
          </div>
        </div>

        {/* Card 4: On Track Students */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-800">{rawStudentsList.length - atRiskCount}</div>
            <div className="text-[11px] font-semibold text-slate-500">{locale === 'ar' ? 'طلاب بحالة جيدة' : 'On-Track Students'}</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Assigned Students Table & Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Table: Assigned Students */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-800">
                {isAdminOrHead 
                  ? (locale === 'ar' ? 'سجل طلاب الدائرة السريرية' : 'Clinical Students Directory')
                  : (locale === 'ar' ? 'الطلاب المعينين لك' : 'Your Assigned Students')}
              </h2>
              <span className="text-[11px] font-semibold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md border border-teal-100">
                {rawStudentsList.length} {locale === 'ar' ? 'طالب' : 'Students'}
              </span>
            </div>

            {/* Admin Advisor Filter Dropdown */}
            {isAdminOrHead && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">{locale === 'ar' ? 'تصفية حسب المرشد:' : 'Filter Advisor:'}</span>
                <select
                  value={selectedAdvisorId}
                  onChange={(e) => setSelectedAdvisorId(e.target.value)}
                  className="rounded-xl border border-slate-200 px-2.5 py-1 text-[11px] font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer"
                >
                  <option value="">{locale === 'ar' ? '-- جميع المرشدين الأكاديميين --' : '-- All Advisors --'}</option>
                  {advisorsList.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className={`w-full border-collapse text-xs min-w-[500px] ${locale === 'ar' ? 'text-right' : 'text-left'}`}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold text-[11px]">
                  <th className="p-2.5">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  {isAdminOrHead && <th className="p-2.5">{locale === 'ar' ? 'المرشد الأكاديمي' : 'Advisor'}</th>}
                  <th className="p-2.5 text-center w-20">{locale === 'ar' ? 'المعدل' : 'GPA'}</th>
                  <th className="p-2.5 text-center w-20">{locale === 'ar' ? 'الإنذارات' : 'Warnings'}</th>
                  <th className="p-2.5 text-center w-24">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rawStudentsList.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2.5">
                      <div className="font-semibold text-slate-800 text-xs">{locale === 'ar' ? s.full_name_ar : (s.full_name_en || s.full_name_ar)}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{s.university_number}</div>
                    </td>
                    {isAdminOrHead && (
                      <td className="p-2.5 text-slate-700 text-[11px]">
                        {s.academic_advisor ? (
                          <span className="font-semibold text-teal-700">{s.academic_advisor.name || s.academic_advisor.full_name_ar}</span>
                        ) : (
                          <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-100">
                            {locale === 'ar' ? 'غير معين' : 'Unassigned'}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="p-2.5 text-center font-bold text-slate-700">
                      {s.gpa ?? 'N/A'}
                    </td>
                    <td className="p-2.5 text-center">
                      {s.warning_count > 0 ? (
                        <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-100 text-[11px] font-bold rounded-md">
                          {s.warning_count}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs font-semibold">0</span>
                      )}
                    </td>
                    <td className="p-2.5 text-center">
                      <Link
                        to={`/advising/logs?student=${s.id}`}
                        className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/80 text-[11px] font-semibold transition-colors inline-block"
                      >
                        {locale === 'ar' ? 'جلسة إرشاد' : 'Log Session'}
                      </Link>
                    </td>
                  </tr>
                ))}
                {!rawStudentsList.length && (
                  <tr>
                    <td colSpan={isAdminOrHead ? 5 : 4} className="p-6 text-center text-xs text-slate-400">
                      {locale === 'ar' ? 'لا يوجد طلاب معينين وفق معايير البحث' : 'No students found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar Card: Recent Advising Sessions */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold text-slate-800">{locale === 'ar' ? 'آخر الجلسات المسجلة' : 'Recent Sessions'}</h2>
            <Link to="/advising/logs" className="text-[11px] font-semibold text-teal-600 hover:text-teal-700">
              {locale === 'ar' ? 'عرض الكل' : 'View All'}
            </Link>
          </div>

          <div className="space-y-2">
            {recordsList.slice(0, 5).map((r: any) => (
              <Link to="/advising/logs" key={r.id} className="block p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="font-semibold text-xs text-slate-800 mb-1">
                  {locale === 'ar' ? r.student?.full_name_ar : (r.student?.full_name_en || r.student?.full_name_ar)}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{r.meeting_date}</span>
                  <span className="font-semibold px-2 py-0.5 bg-slate-100 rounded-md text-slate-600">{r.category}</span>
                </div>
              </Link>
            ))}
            {!recordsList.length && (
              <div className="text-xs text-slate-400 text-center py-6">
                {locale === 'ar' ? 'لا توجد جلسات إرشادية مسجلة بعد' : 'No sessions logged yet.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
