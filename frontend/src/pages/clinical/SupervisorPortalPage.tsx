import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Award, CalendarCheck2, CalendarDays, CheckCircle2, Users } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { groupSupervisorAssignments, today, workspaceQueryKey, type Workspace } from './supervisorWorkspace';

export function SupervisorPortalPage() {
  const { user, can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const isSupervisor = (user?.roles ?? []).map(String).map(role => role.toUpperCase()).includes('CLINICAL_SUPERVISOR');
  const query = useQuery({
    queryKey: workspaceQueryKey,
    queryFn: () => apiFetch<Workspace>('/operational/my-supervisor-workspace'),
    enabled: isSupervisor && can('supervisor.workspace.view'),
  });
  const groups = useMemo(() => groupSupervisorAssignments(query.data?.assignments ?? []), [query.data?.assignments]);

  if (!isSupervisor) return <ErrorState title={tr('لوحة المشرف السريري', 'Clinical supervisor dashboard')} message={tr('هذه المساحة مخصصة لحسابات المشرفين السريريين.', 'This workspace is for clinical supervisor accounts.')} />;
  if (!can('supervisor.workspace.view')) return <ErrorState title={tr('الصلاحية غير مفعلة', 'Permission is disabled')} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const students = new Set(query.data.assignments.map(item => item.student.id)).size;
  const currentDate = today();
  const attendanceToday = new Set(query.data.attendance_records.filter(item => String(item.session?.session_date).slice(0, 10) === currentDate).map(item => item.student_id)).size;
  const activeWeek = groups.flatMap(group => group.evaluationWeeks).find(item => currentDate >= item.start_date && currentDate <= item.end_date)?.number;
  const weeklyStudents = new Set(groups.filter(group => group.evaluationWeeks.some(item => item.number === activeWeek)).flatMap(group => group.students.map(student => student.id)));
  const assessedStudents = new Set(query.data.assessments.filter(item => item.evaluation_week === activeWeek && ['submitted', 'approved'].includes(item.status)).map(item => item.student_id)).size;
  const pendingStudents = activeWeek ? Math.max(0, weeklyStudents.size - assessedStudents) : 0;
  const supervisorName = ar ? query.data.supervisor.full_name_ar : query.data.supervisor.full_name_en || query.data.supervisor.full_name_ar;

  return <div className="mx-auto max-w-6xl space-y-6 pb-16">
    <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 px-6 py-8 text-white shadow-xl shadow-teal-950/10 sm:px-9 sm:py-10">
      <div className="absolute -start-16 -top-20 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
      <div className="absolute -bottom-24 end-0 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-teal-50 backdrop-blur-sm"><CheckCircle2 className="h-3.5 w-3.5" />{tr('مساحة العمل السريرية', 'Clinical workspace')}</span>
        <h1 className="mt-5 text-2xl font-black tracking-tight sm:text-3xl">{tr('مرحبًا،', 'Welcome,')} {supervisorName}</h1>
        <p className="mt-2 max-w-xl text-xs leading-6 text-teal-50/70 sm:text-sm">{tr('ملخص سريع لطلبتك وتكليفاتك، ومن هنا تنتقل مباشرة إلى العمل المطلوب.', 'A concise overview of your students and assignments, with direct access to your daily work.')}</p>
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={Users} label={tr('المجموعات الحالية', 'Current groups')} value={groups.length} />
      <StatCard icon={Users} label={tr('الطلبة المكلف بهم', 'Assigned students')} value={students} />
      <StatCard icon={CalendarCheck2} label={tr('حضور مسجل اليوم', 'Attendance today')} value={attendanceToday} />
      <StatCard icon={Award} label={activeWeek ? tr(`بانتظار تقييم الأسبوع ${activeWeek}`, `Pending week ${activeWeek}`) : tr('لا يوجد أسبوع فعّال', 'No active week')} value={pendingStudents} highlight={pendingStudents > 0} />
    </section>

    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">{tr('ملخص مجموعاتي', 'My group summary')}</h2><p className="mt-1 text-[11px] text-slate-500">{tr('التكليفات المنشورة الحالية وموقع كل مجموعة.','Current published assignments and each group location.')}</p></div><Link to="/supervisor/schedule" className="text-xs font-black text-teal-700">{tr('عرض الجدول الكامل','Full schedule')}</Link></div><div className="mt-4 grid gap-3 md:grid-cols-2">{groups.map(group=><article key={group.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-black text-slate-900">{ar?group.courseAr:group.courseEn}</h3><p className="mt-1 text-xs font-bold text-teal-700">{group.group} ({group.subgroup})</p><p className="mt-2 text-[11px] text-slate-500">{ar?group.siteAr:group.siteEn} · {group.students.length} {tr('طالب','students')} · {group.scheduledDates.length} {tr('جلسة','sessions')}</p></article>)}</div></section>

    <section className="grid gap-4 lg:grid-cols-3">
      <WorkspaceButton
        to="/supervisor/schedule"
        icon={CalendarDays}
        eyebrow={tr('التكليف المنشور', 'Published assignment')}
        title={tr('جدولي السريري', 'My clinical schedule')}
        description={tr('راجع أيام التدريب والمجموعات والمواقع من جدول واحد واضح.', 'Review training days, groups and sites in one clear schedule.')}
        action={tr('فتح الجدول', 'Open schedule')}
        tone="light"
      />
      <WorkspaceButton
        to="/supervisor/attendance"
        icon={CalendarDays}
        eyebrow={tr('السجل اليومي', 'Daily register')}
        title={tr('الحضور والغياب', 'Attendance')}
        description={tr('سجّل حضور الطلبة وملاحظاتهم حسب المجموعة والتاريخ.', 'Record student attendance and notes by group and date.')}
        action={tr('فتح سجل الحضور', 'Open attendance register')}
        tone="light"
      />
      <WorkspaceButton
        to="/supervisor/assessments"
        icon={Award}
        eyebrow={tr('العلامات السريرية', 'Clinical marks')}
        title={tr('التقييم والعلامات', 'Assessments and marks')}
        description={tr('قيّم طالبًا منفردًا أو احفظ تقييم مجموعة أو جميع المجموعات.', 'Assess one student or save a group or all groups.')}
        action={tr('فتح شاشة التقييم', 'Open assessments')}
        tone="dark"
      />
    </section>
  </div>;
}

function StatCard({ icon: Icon, label, value, highlight = false }: { icon: typeof Users; label: string; value: number; highlight?: boolean }) {
  return <article className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${highlight ? 'border-amber-200' : 'border-slate-200'}`}>
    {highlight && <div className="absolute inset-x-0 top-0 h-1 bg-amber-400" />}
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold leading-5 text-slate-500 sm:text-xs">{label}</p><p className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{value}</p></div><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${highlight ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}><Icon className="h-5 w-5" /></span></div>
  </article>;
}

function WorkspaceButton({ to, icon: Icon, eyebrow, title, description, action, tone }: { to: string; icon: typeof Award; eyebrow: string; title: string; description: string; action: string; tone: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return <Link to={to} className={`group relative overflow-hidden rounded-[1.75rem] border p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl sm:p-7 ${dark ? 'border-teal-800 bg-teal-800 text-white shadow-teal-900/10' : 'border-slate-200 bg-white text-slate-900'}`}>
    <div className={`absolute -end-12 -top-12 h-40 w-40 rounded-full transition group-hover:scale-125 ${dark ? 'bg-white/5' : 'bg-teal-50'}`} />
    <div className="relative flex min-h-48 flex-col">
      <div className="flex items-start justify-between gap-4"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${dark ? 'bg-white/15 text-white' : 'bg-teal-50 text-teal-700'}`}><Icon className="h-6 w-6" /></span><ArrowLeft className={`h-5 w-5 transition group-hover:-translate-x-1 ${dark ? 'text-teal-100' : 'text-teal-700'}`} /></div>
      <p className={`mt-6 text-[10px] font-black uppercase tracking-wider ${dark ? 'text-teal-100/70' : 'text-teal-700'}`}>{eyebrow}</p>
      <h2 className="mt-1 text-xl font-black">{title}</h2>
      <p className={`mt-2 text-xs leading-6 ${dark ? 'text-teal-50/70' : 'text-slate-500'}`}>{description}</p>
      <span className={`mt-auto pt-5 text-xs font-black ${dark ? 'text-white' : 'text-teal-700'}`}>{action}</span>
    </div>
  </Link>;
}
