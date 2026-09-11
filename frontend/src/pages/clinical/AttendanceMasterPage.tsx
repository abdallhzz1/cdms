import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, CheckCircle2, MapPin, UserRound, XCircle } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

type Named = { id?: number; code?: string; name?: string; name_ar?: string; name_en?: string | null };
type Supervisor = { id?: number; full_name_ar?: string; full_name_en?: string | null } | null;
type AttendanceGroup = {
  assignment_id: number; academic_year?: Named | null; course?: Named | null; clinical_period?: Named | null;
  block?: { code?: string | null; from_week?: number | null; to_week?: number | null } | null;
  group_name?: string | null; subgroup_name?: string | null; batch_year?: number | null;
  training_site?: Named | null; supervisor?: Supervisor; student_count: number;
};
type WeekSummary = {
  number: number; start_date: string; end_date: string; scheduled_days: number; elapsed_scheduled_days: number;
  recorded_days: number; present: number; absent: number; late: number; excused: number;
};
type StudentSummary = {
  student: { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null; photo_url?: string | null };
  weeks: WeekSummary[];
  totals: Omit<WeekSummary, 'number' | 'start_date' | 'end_date'> & { absence_percentage: number; warning_level?: 10 | 20 | null };
};
type GroupWeek = Omit<WeekSummary, 'recorded_days' | 'present' | 'absent' | 'late' | 'excused'> & { scheduled_dates: string[] };
type GroupSummary = {
  group: AttendanceGroup;
  weeks: GroupWeek[];
  students: StudentSummary[];
};

const dateLabel = (value: string, ar: boolean) => new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', {
  day: '2-digit', month: '2-digit',
}).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));

export function AttendanceMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'alerts'>('register');

  const groupsQuery = useQuery({
    queryKey: ['attendance-review-groups'],
    queryFn: () => apiFetch<AttendanceGroup[]>('/attendance-records/groups'),
    enabled: can('attendance.review'),
  });
  const groups = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];
  useEffect(() => {
    if (!groups.length) return;
    setSelectedAssignment(current => groups.some(group => String(group.assignment_id) === current) ? current : String(groups[0].assignment_id));
  }, [groups]);

  const summaryQuery = useQuery({
    queryKey: ['attendance-group-summary', selectedAssignment],
    queryFn: () => apiFetch<GroupSummary>(`/attendance-records/group-summary?assignment_id=${selectedAssignment}`),
    enabled: can('attendance.review') && Boolean(selectedAssignment),
  });
  const summary = summaryQuery.data;
  const warningStudents = useMemo(() => summary?.students.filter(row => row.totals.warning_level) ?? [], [summary]);
  const name = (value?: Named | null) => ar ? value?.name_ar : value?.name_en || value?.name_ar;
  const supervisorName = (value?: Supervisor) => ar ? value?.full_name_ar : value?.full_name_en || value?.full_name_ar;
  const groupLabel = (group: AttendanceGroup) => [
    group.subgroup_name || group.group_name || tr('دون مجموعة', 'Ungrouped'),
    name(group.course), group.course?.code, group.academic_year?.code || group.academic_year?.name,
  ].filter(Boolean).join(' — ');

  if (!can('attendance.review')) return <ErrorState title={tr('لا تملك صلاحية عرض سجل الحضور', 'Access denied')} />;
  if (groupsQuery.isLoading) return <LoadingState />;
  if (groupsQuery.isError) return <ErrorState onRetry={() => groupsQuery.refetch()} />;

  return <div className="mx-auto max-w-[1380px] space-y-5 pb-14">
    <PageHeader title={tr('سجل الحضور والغياب', 'Attendance register')} description={tr(
      'اختر مجموعة فرعية لمراجعة سجل طلبتها الأسبوعي والمشرف المسؤول عنها.',
      'Select a subgroup to review its weekly student attendance and assigned supervisor.',
    )}/>

    {!groups.length ? <EmptyState message={tr('لا توجد مجموعات في توزيع سريري منشور ضمن نطاق صلاحياتك.','No groups exist in a published clinical distribution within your access scope.')} /> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="block">
          <span className="mb-2 block text-[11px] font-black text-slate-600">{tr('المجموعة الفرعية','Subgroup')}</span>
          <select value={selectedAssignment} onChange={event => setSelectedAssignment(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100">
            {groups.map(group => <option key={group.assignment_id} value={group.assignment_id}>{groupLabel(group)}</option>)}
          </select>
        </label>
      </section>

      {summaryQuery.isLoading ? <LoadingState /> : summaryQuery.isError || !summary ? <ErrorState onRetry={() => summaryQuery.refetch()} /> : <>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-slate-900">{summary.group.subgroup_name || summary.group.group_name || '—'}</h2>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-black text-teal-700">{summary.group.student_count} {tr('طالب','students')}</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-600">{name(summary.group.course) || '—'}{summary.group.course?.code ? ` · ${summary.group.course.code}` : ''}</p>
            </div>
            <div className="grid gap-2 text-[11px] sm:grid-cols-3 lg:min-w-[620px]">
              <Info icon={UserRound} label={tr('المشرف السريري','Clinical supervisor')} value={supervisorName(summary.group.supervisor) || tr('غير محدد','Not assigned')}/>
              <Info icon={MapPin} label={tr('الموقع التدريبي','Training site')} value={name(summary.group.training_site) || tr('غير محدد','Not assigned')}/>
              <Info icon={CalendarDays} label={tr('فترة التكليف','Assignment period')} value={`${tr('الأسبوع','Week')} ${summary.group.block?.from_week ?? '—'}–${summary.group.block?.to_week ?? '—'}`}/>
            </div>
          </div>
          {!summary.group.supervisor && <Notice>{tr('لا يمكن احتساب أيام الحضور المتوقعة قبل تعيين مشرف سريري للمجموعة.','Expected attendance days cannot be calculated until a clinical supervisor is assigned.')}</Notice>}
          {summary.group.supervisor && summary.weeks.every(week => week.scheduled_dates.length === 0) && <Notice>{tr('المشرف معين، لكن لا توجد أيام دوام مطابقة للموقع وفترة هذه المجموعة. راجع أيام عمل المشرف.','A supervisor is assigned, but no work days match this group’s site and period. Review the supervisor work schedule.')}</Notice>}
        </section>

        <div className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <Tab active={activeTab === 'register'} onClick={() => setActiveTab('register')}>{tr('سجل المجموعة','Group register')}</Tab>
          <Tab active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')}>{tr(`تنبيهات الغياب (${warningStudents.length})`,`Absence alerts (${warningStudents.length})`)}</Tab>
        </div>

        {activeTab === 'register' && <WeeklyRegister summary={summary} ar={ar} tr={tr}/>}
        {activeTab === 'alerts' && <Alerts students={warningStudents} ar={ar} tr={tr}/>}
      </>}
    </>}
  </div>;
}

function Info({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Icon className="h-4 w-4 shrink-0 text-teal-700"/><div><span className="block text-[9px] font-bold text-slate-400">{label}</span><b className="text-slate-700">{value}</b></div></div>;
}
function Notice({ children }: { children: string }) { return <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs font-bold text-amber-800">{children}</div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${active ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{children}</button>; }

function WeeklyRegister({ summary, ar, tr }: { summary: GroupSummary; ar: boolean; tr: (a: string, e: string) => string }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">{tr('الحضور الأسبوعي لطلبة المجموعة','Weekly attendance by student')}</h2><p className="mt-1 text-[10px] text-slate-500">{tr('ح = حاضر، غ = غائب. يظهر التأخير والعذر عند وجودهما.','P = present, A = absent. Late and excused counts appear when applicable.')}</p></header>
    {!summary.students.length ? <div className="p-6"><EmptyState message={tr('لا يوجد طلبة في هذه المجموعة.','This group has no students.')} /></div> : <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-start">
        <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-500">
          <th className="sticky start-0 z-10 min-w-[220px] bg-slate-50 px-4 py-3 text-start">{tr('الطالب','Student')}</th>
          {summary.weeks.map(week => <th key={week.number} className="min-w-[112px] border-s border-slate-100 px-3 py-3 text-center"><span className="block">{tr(`الأسبوع ${week.number}`,`Week ${week.number}`)}</span><span dir="ltr" className="mt-1 block font-normal text-slate-400">{dateLabel(week.start_date,ar)}–{dateLabel(week.end_date,ar)}</span></th>)}
          <th className="min-w-[170px] border-s border-slate-100 px-4 py-3 text-center">{tr('الإجمالي','Total')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{summary.students.map(row => <StudentRow key={row.student.id} row={row} ar={ar} tr={tr}/>)}</tbody>
      </table>
    </div>}
  </section>;
}

function StudentRow({ row, ar, tr }: { row: StudentSummary; ar: boolean; tr: (a: string, e: string) => string }) {
  const studentName = ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar;
  return <tr className="text-[11px] hover:bg-slate-50/50">
    <td className="sticky start-0 z-10 bg-white px-4 py-3"><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-teal-50 font-black text-teal-700">{row.student.photo_url ? <img src={row.student.photo_url} alt="" className="h-full w-full object-cover"/> : studentName.trim().charAt(0)}</span><div><b className="block max-w-[170px] truncate text-slate-800">{studentName}</b><span dir="ltr" className="font-mono text-[9px] text-slate-400">{row.student.university_number}</span></div></div></td>
    {row.weeks.map(week => <td key={week.number} className="border-s border-slate-100 px-3 py-3 text-center"><WeekCell week={week} tr={tr}/></td>)}
    <td className="border-s border-slate-100 px-4 py-3"><div className="flex items-center justify-center gap-3 font-black"><span className="text-emerald-700">{tr('ح','P')} {row.totals.present}</span><span className={row.totals.absent ? 'text-rose-700' : 'text-slate-400'}>{tr('غ','A')} {row.totals.absent}</span></div><p className="mt-1 text-center text-[9px] text-slate-400">{row.totals.recorded_days}/{row.totals.elapsed_scheduled_days} {tr('يوم مستحق','due days')}</p></td>
  </tr>;
}

function WeekCell({ week, tr }: { week: WeekSummary; tr: (a: string, e: string) => string }) {
  if (week.elapsed_scheduled_days === 0) return <span className="text-slate-300">—</span>;
  return <div><div className="flex items-center justify-center gap-2 font-black"><span className="text-emerald-700">{tr('ح','P')} {week.present}</span><span className={week.absent ? 'text-rose-700' : 'text-slate-400'}>{tr('غ','A')} {week.absent}</span></div>{(week.late > 0 || week.excused > 0) && <p className="mt-1 text-[9px] text-slate-500">{tr('ت','L')} {week.late} · {tr('ع','E')} {week.excused}</p>}<p className="mt-1 text-[9px] text-slate-400">{week.recorded_days}/{week.elapsed_scheduled_days} {tr('مرصود','recorded')}</p></div>;
}

function Alerts({ students, ar, tr }: { students: StudentSummary[]; ar: boolean; tr: (a: string, e: string) => string }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">{tr('تنبيهات غياب المجموعة','Group absence alerts')}</h2><p className="mt-1 text-[10px] text-slate-500">{tr('النسبة = أيام الغياب المسجلة ÷ أيام دوام المشرف المستحقة للمجموعة حتى اليوم.','Rate = recorded absences divided by supervisor work days due for this group through today.')}</p></header>
    {!students.length ? <div className="flex flex-col items-center gap-2 p-8 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-600"/><b className="text-sm text-slate-800">{tr('لا توجد تنبيهات غياب لهذه المجموعة','No absence alerts for this group')}</b></div> : <div className="divide-y divide-slate-100">{students.map(row => {
      const studentName = ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar;
      const urgent = row.totals.warning_level === 20;
      return <article key={row.student.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${urgent?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700'}`}>{urgent?<XCircle className="h-5 w-5"/>:<AlertTriangle className="h-5 w-5"/>}</span><div><b className="text-xs text-slate-900">{studentName}</b><p dir="ltr" className="mt-1 text-start font-mono text-[10px] text-slate-400">{row.student.university_number}</p></div></div><div className="text-center"><b className={urgent?'text-rose-700':'text-amber-700'}>{Number(row.totals.absence_percentage).toFixed(1)}%</b><p className="text-[9px] text-slate-400">{row.totals.absent} {tr('غياب من','absent of')} {row.totals.elapsed_scheduled_days}</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${urgent?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700'}`}>{urgent?tr('إنذار رسمي','Formal warning'):tr('تنبيه أولي','Initial alert')}</span></article>;
    })}</div>}
  </section>;
}
