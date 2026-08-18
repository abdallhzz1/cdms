import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { 
  Users, Map, Clock, ClipboardCheck, BookOpen, AlertTriangle, 
  TrendingUp, BarChart3, MessagesSquare, 
  ChevronRight, Sparkles, Activity
} from 'lucide-react';

export function FoundationHome() {
  const { user, can } = useAuth();
  const { locale } = useI18n();

  const userRoles = user?.roles ?? [];

  // General operational stats
  const { data: studentsData } = useQuery({
    queryKey: ['home-students-count'],
    queryFn: () => apiFetch<any>('/students?per_page=1'),
    enabled: can('students.view'),
  });

  const { data: inboxData } = useQuery({
    queryKey: ['home-inbox-count'],
    queryFn: () => apiFetch<any>('/correspondence?filter=inbox&per_page=5'),
    enabled: can('correspondence.view'),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['home-tasks-count'],
    queryFn: () => apiFetch<any>('/tasks?per_page=5'),
    enabled: can('tasks.view'),
  });

  const { data: earlyWarnings } = useQuery({
    queryKey: ['home-early-warnings'],
    queryFn: () => apiFetch<any>('/students?warning_count_min=1&per_page=5'),
    enabled: can('advising.view'),
  });

  const totalStudents = studentsData?.meta?.total ?? studentsData?.pagination?.total ?? '—';
  const inboxItems = Array.isArray(inboxData) ? inboxData : inboxData?.items || [];
  const taskItems = Array.isArray(tasksData) ? tasksData : tasksData?.items || [];
  const warningList = Array.isArray(earlyWarnings) ? earlyWarnings : earlyWarnings?.items || [];

  const isSupervisorOnly = userRoles.includes('CLINICAL_SUPERVISOR') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  const isAdvisorOnly = userRoles.includes('ACADEMIC_ADVISOR') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  const isQualityOnly = userRoles.includes('QUALITY') && !userRoles.some(r => ['CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      {/* Welcome Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-700 text-white p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{locale === 'ar' ? 'نظام إدارة الدائرة السريرية' : 'Clinical Department Management System'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
            {locale === 'ar' ? `أهلاً بك، ${user?.name || 'مستخدم النظام'}` : `Welcome back, ${user?.name || 'User'}`}
          </h1>
          <p className="text-sm text-indigo-100 leading-relaxed font-medium">
            {locale === 'ar' 
              ? 'بوابة جامعة الخليل لإدارة التدريب السريري، المستشفيات، شؤون الطلبة، والمراسلات الإدارية.' 
              : 'Hebron University portal for clinical training, rotations, advising, and quality management.'}
          </p>
        </div>
      </div>

      {/* 1. CLINICAL SUPERVISOR CUSTOM VIEW */}
      {isSupervisorOnly && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link to="/supervisor/portal" className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'بوابة المشرف' : 'Supervisor Portal'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'عرض طلابي والمجموعات' : 'My Students & Groups'}</p>
              </div>
            </Link>
            <Link to="/attendance" className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'تسجيل الحضور' : 'Take Attendance'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'جلسات اليوم والغياب' : 'Daily Sessions & Absences'}</p>
              </div>
            </Link>
            <Link to="/assessments" className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'التقييمات السريرية' : 'Clinical Assessments'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'رصد تقييم الطلاب' : 'Evaluate Students'}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* 2. ACADEMIC ADVISOR CUSTOM VIEW */}
      {isAdvisorOnly && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link to="/advising" className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'لوحة تحكم الإرشاد' : 'Advising Dashboard'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'قائمة الطلبة المسترشدين' : 'My Advisees'}</p>
              </div>
            </Link>
            <Link to="/advising/logs" className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'توثيق جلسة إرشاد' : 'Record Session'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'جلسات فردية وجماعية' : 'Individual & Group'}</p>
              </div>
            </Link>
            <Link to="/advising/early-warning" className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'الإنذار المبكر' : 'Early Warning'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'متابعة الطلبة المتعثرين' : 'At-Risk Students'}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* 3. QUALITY TEAM CUSTOM VIEW */}
      {isQualityOnly && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Link to="/quality" className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-indigo-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">{locale === 'ar' ? 'لوحة الجودة' : 'Dashboard'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'نظرة عامة' : 'Overview'}</p>
              </div>
            </Link>
            <Link to="/quality/surveys" className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
              <ClipboardCheck className="w-8 h-8 text-emerald-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">{locale === 'ar' ? 'الاستبيانات' : 'Surveys'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'إدارة الاستبيانات' : 'Manage'}</p>
              </div>
            </Link>
            <Link to="/quality/improvement" className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-amber-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">{locale === 'ar' ? 'خطط التحسين' : 'Plans'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'متابعة الإجراءات' : 'Actions'}</p>
              </div>
            </Link>
            <Link to="/quality/kpis" className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-600" />
              <div>
                <h3 className="font-bold text-sm text-slate-900">{locale === 'ar' ? 'مؤشرات KPIs' : 'KPIs'}</h3>
                <p className="text-xs text-slate-400">{locale === 'ar' ? 'المستهدفات' : 'Targets'}</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* 4. MAIN OPERATIONAL & LEADERSHIP HUB */}
      {!isSupervisorOnly && !isAdvisorOnly && !isQualityOnly && (
        <div className="space-y-6">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link to="/directory" className="bg-indigo-50/70 rounded-3xl p-5 hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-indigo-700">{totalStudents}</div>
                <div className="text-xs font-bold text-indigo-500">{locale === 'ar' ? 'إجمالي الطلبة' : 'Students'}</div>
              </div>
            </Link>

            <Link to="/distribution" className="bg-emerald-50/70 rounded-3xl p-5 hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm shrink-0">
                <Map className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-700">10+</div>
                <div className="text-xs font-bold text-emerald-500">{locale === 'ar' ? 'مواقع التدريب' : 'Hospitals'}</div>
              </div>
            </Link>

            <Link to="/inbox" className="bg-amber-50/70 rounded-3xl p-5 hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm shrink-0">
                <MessagesSquare className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-amber-700">{inboxItems.length}</div>
                <div className="text-xs font-bold text-amber-500">{locale === 'ar' ? 'الطلبات الواردة' : 'Inbox'}</div>
              </div>
            </Link>

            <Link to="/tasks" className="bg-blue-50/70 rounded-3xl p-5 hover:shadow-md transition-all flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-2xl font-black text-blue-700">{taskItems.length}</div>
                <div className="text-xs font-bold text-blue-500">{locale === 'ar' ? 'المهام المعلقة' : 'Tasks'}</div>
              </div>
            </Link>
          </div>

          {/* Quick Operations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Incoming Correspondence */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <MessagesSquare className="w-5 h-5 text-indigo-600" />
                  <span>{locale === 'ar' ? 'أحدث المعاملات والمراسلات' : 'Recent Correspondence'}</span>
                </h2>
                <Link to="/inbox" className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                  {locale === 'ar' ? 'عرض الكل' : 'View All'} <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              </div>

              <div className="space-y-3">
                {inboxItems.slice(0, 4).map((item: any) => (
                  <Link
                    key={item.id}
                    to={`/correspondence/${item.id}`}
                    className="p-3.5 rounded-2xl border border-slate-50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">{item.subject}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.reference_number} · {item.priority}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 shrink-0">
                      {item.status}
                    </span>
                  </Link>
                ))}
                {!inboxItems.length && (
                  <p className="text-sm text-slate-400 text-center py-6">{locale === 'ar' ? 'لا توجد مراسلات جديدة' : 'No new messages'}</p>
                )}
              </div>
            </div>

            {/* At-Risk / Early Warnings */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <span>{locale === 'ar' ? 'تنبيهات الإنذار المبكر والتعثر' : 'Early Warning Alerts'}</span>
                </h2>
                <Link to="/advising/early-warning" className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1">
                  {locale === 'ar' ? 'عرض التفاصيل' : 'View Details'} <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </Link>
              </div>

              <div className="space-y-3">
                {warningList.slice(0, 4).map((st: any) => (
                  <Link
                    key={st.id}
                    to={`/students/${st.id}`}
                    className="p-3.5 rounded-2xl border border-red-100 bg-red-50/40 hover:bg-red-50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {locale === 'ar' ? st.full_name_ar : st.full_name_en || st.full_name_ar}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{st.university_number} · Level {st.academic_level}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-red-100 text-red-700 shrink-0">
                      {st.warning_count} {locale === 'ar' ? 'إنذار' : 'warnings'}
                    </span>
                  </Link>
                ))}
                {!warningList.length && (
                  <p className="text-sm text-slate-400 text-center py-6">{locale === 'ar' ? 'لا يوجد طلبة متعثرين حالياً' : 'No at-risk students'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
