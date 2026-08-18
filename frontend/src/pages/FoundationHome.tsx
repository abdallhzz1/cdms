import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { 
  Users, Map, Clock, ClipboardCheck, BookOpen, AlertTriangle, 
  TrendingUp, BarChart3, MessagesSquare, 
  ChevronRight, Sparkles, Activity, ArrowUpRight
} from 'lucide-react';
import hebronLogo from '@/assets/hebron.png';

export function FoundationHome() {
  const { user, can } = useAuth();
  const { locale, t } = useI18n();

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
    <div className="space-y-6 pb-12">
      <h1 className="sr-only">{t('foundation.title', 'Foundation')}</h1>
      {/* 1. CHAKRA SOFT UI TOP METRICS BAR (4 UNIFIED TEAL CARDS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Students */}
        <Link 
          to="/directory" 
          className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'إجمالي الطلبة' : 'Total Students'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-black text-slate-800">{totalStudents}</span>
              <span className="text-xs font-bold text-teal-600">+100%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0">
            <Users className="w-6 h-6" />
          </div>
        </Link>

        {/* Metric 2: Clinical Hospitals */}
        <Link 
          to="/distribution" 
          className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'مواقع التدريب' : 'Clinical Sites'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-black text-slate-800">10+</span>
              <span className="text-xs font-bold text-teal-600">+5%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0">
            <Map className="w-6 h-6" />
          </div>
        </Link>

        {/* Metric 3: Inbox */}
        <Link 
          to="/inbox" 
          className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'المعاملات الواردة' : 'Inbox Items'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-black text-slate-800">{inboxItems.length}</span>
              <span className="text-xs font-bold text-teal-600">+14%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0">
            <MessagesSquare className="w-6 h-6" />
          </div>
        </Link>

        {/* Metric 4: Tasks */}
        <Link 
          to="/tasks" 
          className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center justify-between"
        >
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'المهام المعلقة' : 'Pending Tasks'}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-black text-slate-800">{taskItems.length}</span>
              <span className="text-xs font-bold text-teal-600">+8%</span>
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/30 shrink-0">
            <ClipboardCheck className="w-6 h-6" />
          </div>
        </Link>
      </div>

      {/* 2. CHAKRA SOFT UI HERO FEATURED SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Hero Card */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 sm:p-7 shadow-lg border border-slate-100 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400">{locale === 'ar' ? 'جامعة الخليل · كلية الطب والعلوم الصحية' : 'Hebron University · Medicine & Health Sciences'}</div>
            <h2 className="text-xl font-bold text-slate-800">{locale === 'ar' ? `أهلاً بك، ${user?.name || 'مستخدم النظام'}` : `Welcome back, ${user?.name || 'User'}`}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              {locale === 'ar' 
                ? 'النظام السريري الموحد لإدارة دورات التدريب والمستشفيات وشؤون الطلبة ومسارات الاعتماد الأكاديمي.' 
                : 'Unified clinical management system for student rotations, advising, grade approvals, and accreditation.'}
            </p>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <Link 
              to="/distribution" 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white text-xs font-bold shadow-md shadow-teal-500/30 hover:opacity-95 transition-opacity"
            >
              <span>{locale === 'ar' ? 'التوزيع السريري' : 'Clinical Distribution'}</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link 
              to="/directory" 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors"
            >
              <span>{locale === 'ar' ? 'دليل الطلبة' : 'Directory'}</span>
            </Link>
          </div>
        </div>

        {/* Right Gradient Banner Card */}
        <div className="lg:col-span-5 rounded-2xl bg-gradient-to-tr from-teal-600 via-teal-500 to-teal-400 text-white p-6 sm:p-7 shadow-lg shadow-teal-500/20 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center p-1.5 shadow-xs">
              <img src={hebronLogo} alt="جامعة الخليل" className="h-full w-full object-contain drop-shadow-sm brightness-0 invert" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">{locale === 'ar' ? 'الدائرة السريرية' : 'Clinical Dept Hub'}</h3>
            <p className="text-xs text-white/90 leading-relaxed font-normal">
              {locale === 'ar' ? 'متابعة حية للغياب والتقييمات وتوثيق جلسات الإرشاد بضغطة زر واحدة.' : 'Live attendance tracking, assessments, and early warning system.'}
            </p>
          </div>
          <div className="text-xs font-bold text-teal-100">
            {locale === 'ar' ? 'جامعة الخليل 2026' : 'Hebron University 2026'}
          </div>
        </div>
      </div>

      {/* 3. CLINICAL SUPERVISOR PORTAL ACTIONS */}
      {isSupervisorOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/supervisor/portal" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/30 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'بوابة المشرف' : 'Supervisor Portal'}</h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">{locale === 'ar' ? 'عرض طلبتي والمجموعات' : 'My Students & Groups'}</p>
            </div>
          </Link>
          <Link to="/attendance" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/30 shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'تسجيل الحضور' : 'Take Attendance'}</h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">{locale === 'ar' ? 'جلسات اليوم والغياب' : 'Daily Sessions & Absences'}</p>
            </div>
          </Link>
          <Link to="/assessments" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/30 shrink-0">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'التقييمات السريرية' : 'Clinical Assessments'}</h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">{locale === 'ar' ? 'رصد تقييم الطلاب' : 'Evaluate Students'}</p>
            </div>
          </Link>
        </div>
      )}

      {/* 4. ADVISING MODULES */}
      {isAdvisorOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/advising" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-500/30">
              <Users className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'لوحة تحكم الإرشاد' : 'Advising Dashboard'}</h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">{locale === 'ar' ? 'قائمة الطلبة المسترشدين' : 'My Advisees'}</p>
            </div>
          </Link>
          <Link to="/advising/logs" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-500/30">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'توثيق جلسة إرشاد' : 'Record Session'}</h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">{locale === 'ar' ? 'جلسات فردية وجماعية' : 'Individual & Group'}</p>
            </div>
          </Link>
          <Link to="/advising/early-warning" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shrink-0 shadow-md shadow-teal-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'الإنذار المبكر' : 'Early Warning'}</h3>
              <p className="text-xs text-slate-400 truncate mt-0.5">{locale === 'ar' ? 'متابعة الطلبة المتعثرين' : 'At-Risk Students'}</p>
            </div>
          </Link>
        </div>
      )}

      {/* 5. QUALITY TEAM CUSTOM VIEW */}
      {isQualityOnly && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/quality" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'لوحة الجودة' : 'Dashboard'}</h3>
              <p className="text-xs text-slate-400 truncate">{locale === 'ar' ? 'نظرة عامة' : 'Overview'}</p>
            </div>
          </Link>
          <Link to="/quality/surveys" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'الاستبيانات' : 'Surveys'}</h3>
              <p className="text-xs text-slate-400 truncate">{locale === 'ar' ? 'إدارة الاستبيانات' : 'Manage'}</p>
            </div>
          </Link>
          <Link to="/quality/improvement" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'خطط التحسين' : 'Plans'}</h3>
              <p className="text-xs text-slate-400 truncate">{locale === 'ar' ? 'متابعة الإجراءات' : 'Actions'}</p>
            </div>
          </Link>
          <Link to="/quality/kpis" className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 hover:shadow-xl transition-all flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800">{locale === 'ar' ? 'مؤشرات KPIs' : 'KPIs'}</h3>
              <p className="text-xs text-slate-400 truncate">{locale === 'ar' ? 'المستهدفات' : 'Targets'}</p>
            </div>
          </Link>
        </div>
      )}

      {/* 6. RECENT CORRESPONDENCE & AT-RISK STUDENTS */}
      {!isSupervisorOnly && !isAdvisorOnly && !isQualityOnly && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Incoming Correspondence */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <MessagesSquare className="w-4 h-4 text-teal-600" />
                <span>{locale === 'ar' ? 'أحدث المعاملات والمراسلات' : 'Recent Correspondence'}</span>
              </h2>
              <Link to="/inbox" className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1">
                {locale === 'ar' ? 'عرض الكل' : 'View All'} <ChevronRight className="w-3 h-3 rtl:rotate-180" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {inboxItems.slice(0, 4).map((item: any) => (
                <Link
                  key={item.id}
                  to={`/correspondence/${item.id}`}
                  className="p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{item.subject}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{item.reference_number} · {item.priority}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 text-teal-700 shrink-0">
                    {item.status}
                  </span>
                </Link>
              ))}
              {!inboxItems.length && (
                <p className="text-xs text-slate-400 text-center py-6">{locale === 'ar' ? 'لا توجد مراسلات جديدة' : 'No new messages'}</p>
              )}
            </div>
          </div>

          {/* At-Risk / Early Warnings */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>{locale === 'ar' ? 'تنبيهات الإنذار المبكر والتعثر' : 'Early Warning Alerts'}</span>
              </h2>
              <Link to="/advising/early-warning" className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1">
                {locale === 'ar' ? 'عرض التفاصيل' : 'View Details'} <ChevronRight className="w-3 h-3 rtl:rotate-180" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {warningList.slice(0, 4).map((st: any) => (
                <Link
                  key={st.id}
                  to={`/students/${st.id}`}
                  className="p-3.5 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">
                      {locale === 'ar' ? st.full_name_ar : st.full_name_en || st.full_name_ar}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{st.university_number} · Level {st.academic_level}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 shrink-0">
                    {st.warning_count} {locale === 'ar' ? 'إنذارات' : 'warnings'}
                  </span>
                </Link>
              ))}
              {!warningList.length && (
                <p className="text-xs text-slate-400 text-center py-6">{locale === 'ar' ? 'لا يوجد طلبة متعثرين حالياً' : 'No at-risk students'}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
