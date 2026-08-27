import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AdvisingNavTabs } from '@/components/advising/AdvisingNavTabs';
import { AlertTriangle, ChevronRight, CheckCircle2, ShieldCheck, User } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EarlyWarningPage() {
  const { can, user } = useAuth();
  const { locale, t } = useI18n();

  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');

  // Check if current user is an Administrator / Department Head / Dean
  const isAdminOrHead = useMemo(() => {
    if (!user?.roles) return false;
    const roles = user.roles.map(r => (typeof r === 'string' ? r : (r as any).name || '').toUpperCase());
    return roles.some(r => ['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  }, [user]);

  const hasAccess = useMemo(() => {
    return Boolean(user) && can('advising.view');
  }, [user, can]);

  // Fetch advisors lookup for admin filter dropdown
  const { data: usersLookup } = useQuery({
    queryKey: ['users-lookup-early-warning'],
    queryFn: () => apiFetch<any>('/users/lookup?purpose=advising'),
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

  const { data: students, isLoading } = useQuery({
    queryKey: ['early-warning-students-list', studentsEndpoint],
    queryFn: () => apiFetch<any>(studentsEndpoint)
  });

  if (!hasAccess) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;

  const studentsList: any[] = Array.isArray(students) ? students : (students?.data || students?.items || []);
  const advisorsList: any[] = Array.isArray(usersLookup) ? usersLookup : (usersLookup?.data || []);

  // Filter students by risk condition: warning_count > 0 OR gpa < 65%
  let atRiskStudents = studentsList.filter((s: any) => {
    const hasWarnings = s.warning_count > 0;
    const isLowGpa = s.gpa !== null && s.gpa !== undefined && Number(s.gpa) > 0 && Number(s.gpa) < 65.0;
    return hasWarnings || isLowGpa;
  });

  // Apply academic level filter if selected
  if (selectedLevel) {
    atRiskStudents = atRiskStudents.filter((s: any) => s.academic_level === selectedLevel);
  }

  // Summary Metrics
  const totalRisk = atRiskStudents.length;
  const lowGpaCount = atRiskStudents.filter((s: any) => s.gpa !== null && Number(s.gpa) > 0 && Number(s.gpa) < 65.0).length;
  const warningCount = atRiskStudents.filter((s: any) => s.warning_count > 0).length;

  return (
    <div className="space-y-4 pb-16 px-1 sm:px-0">
      {/* Header Banner */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0 shadow-2xs">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-slate-900">
                {locale === 'ar' ? 'نظام الإنذار الأكاديمي المبكر' : 'Early Academic Warning System'}
              </h1>
              {isAdminOrHead && (
                <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[10.5px] font-bold rounded-lg border border-amber-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  {locale === 'ar' ? 'لوحة رصد الدائرة والعمادة' : 'Faculty-Wide Overview'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {locale === 'ar' ? 'رصد تلقائي للطلاب الذين يقل معدلهم المئوي عن %65 أو لديهم إنذارات أكاديمية للتدخل الفوري.' : 'Automatic tracking of students with GPA < 65% or active academic warnings.'}
            </p>
          </div>
        </div>

        {/* Admin Filters Row */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Cohort Level Filter */}
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer shadow-2xs"
          >
            <option value="">{locale === 'ar' ? '-- كافة السنوات --' : '-- All Years --'}</option>
            <option value="fourth">{locale === 'ar' ? 'سنة رابعة' : '4th Year'}</option>
            <option value="fifth">{locale === 'ar' ? 'سنة خامسة' : '5th Year'}</option>
            <option value="sixth">{locale === 'ar' ? 'سنة سادسة' : '6th Year'}</option>
          </select>

          {/* Advisor Filter Dropdown for Admins / Heads */}
          {isAdminOrHead && (
            <select
              value={selectedAdvisorId}
              onChange={(e) => setSelectedAdvisorId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer shadow-2xs"
            >
              <option value="">{locale === 'ar' ? '-- كافة المرشدين --' : '-- All Advisors --'}</option>
              {advisorsList.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Advising Sub-Navigation Tabs */}
      <AdvisingNavTabs />

      {/* KPI Cards Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">{locale === 'ar' ? 'إجمالي الحالات المتعثرة' : 'Total At-Risk'}</div>
            <div className="text-lg font-black text-amber-600 mt-0.5">{totalRisk} {locale === 'ar' ? 'طالب' : 'Students'}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
            {totalRisk}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">{locale === 'ar' ? 'معدل أقل من %65' : 'GPA < 65%'}</div>
            <div className="text-lg font-black text-red-600 mt-0.5">{lowGpaCount} {locale === 'ar' ? 'طالب' : 'Students'}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs">
            {lowGpaCount}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-400">{locale === 'ar' ? 'إنذارات أكاديمية نشطة' : 'Active Warnings'}</div>
            <div className="text-lg font-black text-slate-800 mt-0.5">{warningCount} {locale === 'ar' ? 'حالة' : 'Cases'}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
            {warningCount}
          </div>
        </div>
      </div>

      {/* Risk Grid Content */}
      {atRiskStudents.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center flex flex-col items-center justify-center shadow-2xs">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl flex items-center justify-center mb-3 shadow-2xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 mb-1">
            {locale === 'ar' ? 'لا يوجد طلاب بحالة تعثر أو إنذار حالياً' : 'No At-Risk Students'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm font-medium">
            {locale === 'ar' ? 'جميع الطلاب في هذا النطاق حالياً في وضع أكاديمي سليم ومستقر (المعدل التراكمي أعلى من %65 ولا توجد إنذارات).' : 'All students in this scope are currently in good academic standing.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {atRiskStudents.map((s: any) => {
            const isLowGpa = s.gpa !== null && s.gpa !== undefined && Number(s.gpa) > 0 && Number(s.gpa) < 65.0;
            const hasWarnings = s.warning_count > 0;

            return (
              <div key={s.id} className="bg-white rounded-2xl border border-red-200/80 shadow-2xs overflow-hidden flex flex-col justify-between hover:border-red-300 transition-all">
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 bg-red-50 text-red-600 rounded-xl flex items-center justify-center border border-red-100">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10.5px] font-bold rounded-md border border-red-100">
                      {isLowGpa && hasWarnings 
                        ? (locale === 'ar' ? 'خطر تعثر + إنذارات' : 'Risk & Warnings')
                        : isLowGpa 
                          ? (locale === 'ar' ? 'معدل منخفض (<%65)' : 'Low GPA') 
                          : (locale === 'ar' ? 'إنذار أكاديمي' : 'Warning Alert')}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-bold text-xs text-slate-900 line-clamp-1">
                        {locale === 'ar' ? s.full_name_ar : (s.full_name_en || s.full_name_ar)}
                      </h3>
                      <Link
                        to={`/students/${s.id}`}
                        className="text-[10px] text-teal-700 hover:underline font-bold flex items-center gap-0.5 shrink-0"
                        title={locale === 'ar' ? 'عرض بروفايل الطالب' : 'View Profile'}
                      >
                        <User className="w-3 h-3" />
                        <span>{locale === 'ar' ? 'البروفايل' : 'Profile'}</span>
                      </Link>
                    </div>
                    
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{s.university_number}</div>
                    
                    {s.academic_advisor ? (
                      <div className="text-[10.5px] font-semibold text-teal-700 mt-1">
                        {locale === 'ar' ? 'المرشد:' : 'Advisor:'} {s.academic_advisor.name || s.academic_advisor.full_name_ar}
                      </div>
                    ) : (
                      <div className="text-[10.5px] font-semibold text-amber-600 mt-1">
                        {locale === 'ar' ? 'لم يُعيّن مرشد بعد' : 'No advisor assigned'}
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-500 font-semibold mb-0.5">{locale === 'ar' ? 'المعدل (%100)' : 'GPA (%)'}</div>
                      <div className={`text-sm font-bold ${isLowGpa ? 'text-red-600 font-black' : 'text-slate-800'}`}>
                        {s.gpa ? `%${s.gpa}` : 'N/A'}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                      <div className="text-[10px] text-slate-500 font-semibold mb-0.5">{locale === 'ar' ? 'الإنذارات' : 'Warnings'}</div>
                      <div className={`text-sm font-bold ${hasWarnings ? 'text-red-600 font-black' : 'text-slate-800'}`}>
                        {s.warning_count || 0}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border-t border-slate-100">
                  <Link 
                    to={`/advising/logs?student=${s.id}`} 
                    className="flex items-center justify-between text-xs font-bold text-teal-700 hover:text-teal-800 transition-colors"
                  >
                    <span>{locale === 'ar' ? 'جدولة جلسة إرشادية' : 'Schedule Session'}</span>
                    <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
