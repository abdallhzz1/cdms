import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Award, CalendarCheck2, CalendarDays, ClipboardCheck, Search, UserRound, Users } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { groupName, groupSupervisorAssignments, today, workspaceQueryKey, type SupervisorGroup, type Workspace } from './supervisorWorkspace';

type GroupSummary = { group: SupervisorGroup; attendanceToday: number; assessed: number; activeToday: boolean; needsAttendance: boolean; needsAssessment: boolean; hasReturned: boolean };

export function SupervisorPortalPage() {
  const { user, can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState('');
  const isSupervisor = (user?.roles ?? []).map(String).map(role => role.toUpperCase()).includes('CLINICAL_SUPERVISOR');
  const query = useQuery({ queryKey: workspaceQueryKey, queryFn: () => apiFetch<Workspace>('/operational/my-supervisor-workspace'), enabled: isSupervisor && can('supervisor.workspace.view') });
  const groups = useMemo(() => groupSupervisorAssignments(query.data?.assignments ?? []), [query.data?.assignments]);
  const summaries = useMemo<GroupSummary[]>(() => {
    if (!query.data) return [];
    const currentDate = today();
    return groups.map(group => {
      const studentIds = new Set(group.students.map(student => student.id));
      const attendanceToday = new Set(query.data.attendance_records.filter(item => studentIds.has(item.student_id) && item.session?.rotation_block_id === group.rotationBlockId && String(item.session?.session_date).slice(0, 10) === currentDate).map(item => item.student_id)).size;
      const groupAssessments = query.data.assessments.filter(item => studentIds.has(item.student_id) && item.session?.rotation_block_id === group.rotationBlockId);
      const assessed = new Set(groupAssessments.filter(item => ['submitted', 'approved'].includes(item.status)).map(item => item.student_id)).size;
      const activeToday = (!group.startDate || currentDate >= group.startDate) && (!group.endDate || currentDate <= group.endDate);
      return { group, attendanceToday, assessed, activeToday, needsAttendance: activeToday && attendanceToday < group.students.length, needsAssessment: assessed < group.students.length, hasReturned: groupAssessments.some(item => item.status === 'returned') };
    });
  }, [groups, query.data]);

  if (!isSupervisor) return <ErrorState title={tr('لوحة المشرف السريري', 'Clinical supervisor dashboard')} message={tr('هذه المساحة مخصصة لحسابات المشرفين السريريين.', 'This workspace is for clinical supervisor accounts.')} />;
  if (!can('supervisor.workspace.view')) return <ErrorState title={tr('الصلاحية غير مفعلة', 'Permission is disabled')} />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState onRetry={() => query.refetch()} />;

  const students = new Set(query.data.assignments.map(item => item.student.id)).size;
  const attendanceActions = summaries.filter(item => item.needsAttendance).length;
  const assessmentActions = summaries.reduce((total, item) => total + Math.max(0, item.group.students.length - item.assessed), 0);
  const returned = query.data.assessments.filter(item => item.status === 'returned').length;
  const actionCount = attendanceActions + assessmentActions + returned;
  const periods = Array.from(new Map(groups.map(group => [String(group.clinicalPeriodId ?? 'annual'), ar ? group.clinicalPeriodAr : group.clinicalPeriodEn])).entries());
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = summaries.filter(item => {
    const group = item.group;
    const text = [groupName(group, ar), ar ? group.siteAr : group.siteEn, group.academicYear].join(' ').toLocaleLowerCase();
    return (!normalizedSearch || text.includes(normalizedSearch))
      && (!period || String(group.clinicalPeriodId ?? 'annual') === period)
      && (!status || (status === 'attendance' && item.needsAttendance) || (status === 'assessment' && item.needsAssessment) || (status === 'returned' && item.hasReturned) || (status === 'complete' && !item.needsAttendance && !item.needsAssessment && !item.hasReturned));
  });

  return <div className="mx-auto max-w-6xl space-y-5 pb-16">
    <PageHeader title={tr('لوحة المشرف السريري', 'Clinical supervisor dashboard')} description={tr('مهامك الحالية واختصارات الحضور والتقييم في مكان واحد.', 'Current tasks and direct attendance and assessment actions in one place.')}>
      <Link to="/clinical-supervisors/me" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-teal-200 hover:text-teal-700"><UserRound className="h-4 w-4" />{tr('ملفي السريري', 'My clinical profile')}</Link>
    </PageHeader>

    <section className="grid gap-3 md:grid-cols-2">
      <ActionLink to="/supervisor/attendance" icon={CalendarDays} title={tr('تسجيل الحضور والغياب', 'Record attendance')} description={tr('افتح سجل المجموعات وأدخل حضور الطلبة.', 'Open group rosters and record student attendance.')} badge={attendanceActions ? tr(`${attendanceActions} تحتاج إجراء`, `${attendanceActions} need action`) : tr('لا مهام اليوم', 'No tasks today')} />
      <ActionLink to="/supervisor/assessments" icon={Award} title={tr('تقييم علامات الطلبة', 'Assess student marks')} description={tr('قيّم طالبًا واحدًا أو مجموعة أو جميع المجموعات.', 'Assess one student, a group, or all groups.')} badge={assessmentActions ? tr(`${assessmentActions} طالبًا بانتظار التقييم`, `${assessmentActions} students pending`) : tr('التقييمات مكتملة', 'Assessments complete')} />
    </section>

    <section className="grid grid-cols-3 gap-3">
      <Metric icon={Users} label={tr('المجموعات', 'Groups')} value={groups.length} />
      <Metric icon={UserRound} label={tr('الطلبة', 'Students')} value={students} />
      <Metric icon={ClipboardCheck} label={tr('تحتاج إجراء', 'Need action')} value={actionCount} accent={actionCount > 0} />
    </section>

    {(actionCount > 0 || !groups.length) && <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"><h2 className="text-xs font-black text-amber-900">{tr('ما يحتاج انتباهك', 'Needs your attention')}</h2><div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-amber-800">{attendanceActions > 0 && <span className="rounded-lg bg-white/70 px-2.5 py-1.5">{tr(`${attendanceActions} مجموعة لم يكتمل حضورها اليوم`, `${attendanceActions} groups have incomplete attendance today`)}</span>}{assessmentActions > 0 && <span className="rounded-lg bg-white/70 px-2.5 py-1.5">{tr(`${assessmentActions} طالبًا لم يتم تقييمه`, `${assessmentActions} students are not assessed`)}</span>}{returned > 0 && <span className="rounded-lg bg-white/70 px-2.5 py-1.5">{tr(`${returned} تقييم معاد للتعديل`, `${returned} assessments returned for revision`)}</span>}{!groups.length && <span>{tr('لا توجد مجموعات مرتبطة بك في جدول منشور حاليًا.', 'No groups are assigned to you in a current published schedule.')}</span>}</div></section>}

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-black text-slate-900">{tr('مجموعاتي الحالية', 'Current group summaries')}</h2><p className="mt-1 text-[11px] text-slate-500">{tr('اعرض ما يحتاج إجراء فقط أو ابحث عن مساق ومجموعة.', 'Filter tasks or search for a course and group.')}</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-600">{filtered.length} / {groups.length}</span></div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_13rem_13rem]"><label className="relative"><Search className={`absolute top-3 h-4 w-4 text-slate-400 ${ar ? 'right-3' : 'left-3'}`} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('بحث بالمساق أو المجموعة أو المستشفى…', 'Search course, group, or hospital…')} className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50 text-xs outline-none transition focus:border-teal-300 focus:bg-white ${ar ? 'pr-9 pl-3' : 'pl-9 pr-3'}`} /></label>
          <select value={period} onChange={event => setPeriod(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 outline-none focus:border-teal-300"><option value="">{tr('كل الفترات', 'All periods')}</option>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 outline-none focus:border-teal-300"><option value="">{tr('كل الحالات', 'All statuses')}</option><option value="attendance">{tr('تحتاج حضور', 'Needs attendance')}</option><option value="assessment">{tr('تحتاج تقييم', 'Needs assessment')}</option><option value="returned">{tr('تقييم معاد', 'Returned assessment')}</option><option value="complete">{tr('مكتملة', 'Complete')}</option></select></div>
      </header>
      {!filtered.length ? <p className="p-8 text-center text-xs font-bold text-slate-400">{tr('لا توجد مجموعات مطابقة للفلاتر.', 'No groups match the selected filters.')}</p> : <div className="divide-y divide-slate-100">{filtered.map(item => <GroupRow key={item.group.key} item={item} ar={ar} />)}</div>}
    </section>
  </div>;
}

function ActionLink({ to, icon: Icon, title, description, badge }: { to: string; icon: typeof CalendarDays; title: string; description: string; badge: string }) {
  return <Link to={to} className="group flex items-center gap-4 rounded-3xl bg-teal-700 p-5 text-white shadow-lg shadow-teal-900/10 transition hover:-translate-y-0.5 hover:bg-teal-800 hover:shadow-xl"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><span className="block text-base font-black">{title}</span><span className="mt-1 block text-[11px] text-teal-50/80">{description}</span><span className="mt-2 inline-block rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold">{badge}</span></span><ArrowLeft className="h-5 w-5 shrink-0 transition group-hover:-translate-x-1" /></Link>;
}

function Metric({ icon: Icon, label, value, accent = false }: { icon: typeof Users; label: string; value: number; accent?: boolean }) {
  return <article className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${accent ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}><div className="flex items-center gap-2 sm:gap-3"><span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex ${accent ? 'bg-amber-100 text-amber-700' : 'bg-teal-50 text-teal-700'}`}><Icon className="h-4 w-4" /></span><div><p className="text-[9px] font-bold text-slate-500 sm:text-[11px]">{label}</p><p className="mt-1 text-xl font-black text-slate-900">{value}</p></div></div></article>;
}

function GroupRow({ item, ar }: { item: GroupSummary; ar: boolean }) {
  const group = item.group;
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  return <article className="grid gap-4 p-4 transition hover:bg-slate-50/60 lg:grid-cols-[1fr_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-black text-slate-900">{groupName(group, ar)}</h3>{item.hasReturned && <span className="rounded-lg bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-800">{tr('تقييم معاد', 'Returned')}</span>}</div><p className="mt-1 text-[11px] text-slate-500">{ar ? group.periodAr : group.periodEn} · {ar ? group.siteAr : group.siteEn} · {group.academicYear}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-600">{tr('الطلبة', 'Students')}: <b className="text-slate-900">{group.students.length}</b></span><span className={`rounded-lg px-2.5 py-1.5 ${item.needsAttendance ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{tr('حضور اليوم', "Today's attendance")}: <b>{item.activeToday ? `${item.attendanceToday}/${group.students.length}` : tr('خارج الفترة', 'Outside period')}</b></span><span className={`rounded-lg px-2.5 py-1.5 ${item.needsAssessment ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>{tr('التقييم', 'Assessment')}: <b>{item.assessed}/{group.students.length}</b></span></div></div><div className="flex flex-wrap gap-2 lg:justify-end"><Link to={`/supervisor/attendance?group=${group.key}`} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-xs font-black text-teal-700 shadow-sm transition hover:bg-teal-50"><CalendarCheck2 className="h-4 w-4" />{tr('تسجيل الحضور', 'Record attendance')}</Link><Link to={`/supervisor/assessments?group=${group.key}`} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-teal-800"><Award className="h-4 w-4" />{tr('تقييم الطلبة', 'Assess students')}</Link></div></article>;
}
