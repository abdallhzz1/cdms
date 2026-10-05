import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, Mail, MapPin, UserRound, Users, XCircle } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';

type Named = { id?: number; code?: string; name?: string; name_ar?: string; name_en?: string | null };
type Supervisor = { id?: number; full_name_ar?: string; full_name_en?: string | null } | null;
type AttendanceGroup = {
  assignment_id: number; student_group_id?: number | null; student_subgroup_id?: number | null; rotation_id?: number | null;
  academic_level?: string | null; academic_year?: Named | null; course?: Named | null; clinical_period?: Named | null;
  block?: { code?: string | null; from_week?: number | null; to_week?: number | null } | null;
  group_name?: string | null; subgroup_name?: string | null; batch_year?: number | null;
  training_site?: Named | null; supervisor?: Supervisor; student_count: number;
};
type AttendanceSubgroup = { key: string; name: string; studentCount: number; entries: AttendanceGroup[] };
type AttendanceMainGroup = { key: string; name: string; academicYear?: Named | null; academicLevel?: string | null; subgroups: AttendanceSubgroup[] };

export function organizeAttendanceGroups(groups: AttendanceGroup[]): AttendanceMainGroup[] {
  const main = new Map<string, AttendanceMainGroup & { subgroupMap: Map<string, AttendanceSubgroup> }>();
  for (const entry of groups) {
    const mainKey = entry.student_group_id != null ? `id:${entry.student_group_id}` : `legacy:${entry.group_name}:${entry.academic_year?.id ?? entry.academic_year?.code}:${entry.academic_level}:${entry.batch_year}`;
    const subgroupKey = entry.student_subgroup_id != null ? `id:${entry.student_subgroup_id}` : `legacy:${entry.subgroup_name}`;
    if (!main.has(mainKey)) main.set(mainKey, {
      key: mainKey, name: entry.group_name || '—', academicYear: entry.academic_year,
      academicLevel: entry.academic_level, subgroups: [], subgroupMap: new Map(),
    });
    const parent = main.get(mainKey)!;
    if (!parent.subgroupMap.has(subgroupKey)) parent.subgroupMap.set(subgroupKey, {
      key: subgroupKey, name: entry.subgroup_name || entry.group_name || '—', studentCount: 0, entries: [],
    });
    const subgroup = parent.subgroupMap.get(subgroupKey)!;
    subgroup.studentCount = Math.max(subgroup.studentCount, entry.student_count);
    const courseKey = (item: AttendanceGroup) => `${item.rotation_id != null ? `rotation:${item.rotation_id}` : `assignment:${item.assignment_id}`}:${item.batch_year ?? 'all'}`;
    if (!subgroup.entries.some(item => courseKey(item) === courseKey(entry))) subgroup.entries.push(entry);
  }
  return [...main.values()].map(group => ({
    key: group.key, name: group.name, academicYear: group.academicYear, academicLevel: group.academicLevel,
    subgroups: [...group.subgroupMap.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  })).sort((a, b) => `${a.academicYear?.code ?? ''}:${a.name}`.localeCompare(`${b.academicYear?.code ?? ''}:${b.name}`, undefined, { numeric: true }));
}
type WeekSummary = {
  number: number; start_date: string; end_date: string; scheduled_days: number; elapsed_scheduled_days: number;
  recorded_days: number; present: number; absent: number; late: number; excused: number;
};
type StudentSummary = {
  student: { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null; photo_url?: string | null };
  attendance_notes?: { date: string | null; note: string; recorded_by?: string | null }[];
  totals: Omit<WeekSummary, 'number' | 'start_date' | 'end_date'> & { absence_percentage: number; warning_level?: 10 | 20 | null };
};
type WeekOption = { number: number; start_date: string; end_date: string };
type ScheduleItem = { rotation_block_id: number; block_code?: string | null; training_site?: Named | null; supervisor?: Supervisor; scheduled_dates: string[]; student_count: number };
type GroupSummary = {
  group: AttendanceGroup;
  weeks: WeekOption[];
  selected_week: WeekOption;
  schedule: ScheduleItem[];
  daily?: DailyAttendance[];
  students: StudentSummary[];
};
type DailyAttendance = {
  date: string; rotation_block_id: number; training_site?: Named | null; supervisor?: Supervisor;
  qr_session?: { state: string; check_in_opened_at?: string | null; check_in_closed_at?: string | null; check_out_opened_at?: string | null; finalized_at?: string | null } | null;
  recorded_count: number;
  students: { student: StudentSummary['student']; status: 'present' | 'absent' | 'late' | 'excused' | null; check_in_at?: string | null; check_out_at?: string | null; recording_source?: string | null; is_incomplete?: boolean; note?: string | null; recorded_by?: string | null }[];
};
type SentWarning = { id: number; sent_at: string; sent_by_user_id?: number | null } | null;
type AttendanceWarning = {
  student: StudentSummary['student'] & { academic_level?: string; email: string };
  rotation_id: number;
  course: Named & { credit_hours?: number };
  total_required_days: number;
  recorded_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  excused_days: number;
  absence_percentage: number;
  current_threshold: 10 | 20;
  last_sent: { '10': SentWarning; '20': SentWarning };
};

const dateLabel = (value: string, ar: boolean) => new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', {
  day: '2-digit', month: '2-digit',
}).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));

export function AttendanceMasterPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [selectedAssignment, setSelectedAssignment] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'details' | 'alerts'>('register');
  const [mailNotice, setMailNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const groupsQuery = useQuery({
    queryKey: ['attendance-review-groups'],
    queryFn: () => apiFetch<AttendanceGroup[]>('/attendance-records/groups'),
    enabled: can('attendance.review'),
  });
  const groups = Array.isArray(groupsQuery.data) ? groupsQuery.data : [];
  const mainGroups = useMemo(() => organizeAttendanceGroups(groups), [groups]);
  useEffect(() => {
    const first = mainGroups[0]?.subgroups[0]?.entries[0];
    if (!first) return;
    setSelectedAssignment(current => groups.some(group => String(group.assignment_id) === current) ? current : String(first.assignment_id));
  }, [groups, mainGroups]);
  const selectedMainGroup = mainGroups.find(group => group.subgroups.some(subgroup => subgroup.entries.some(entry => String(entry.assignment_id) === selectedAssignment))) ?? mainGroups[0];
  const selectedSubgroup = selectedMainGroup?.subgroups.find(subgroup => subgroup.entries.some(entry => String(entry.assignment_id) === selectedAssignment)) ?? selectedMainGroup?.subgroups[0];
  const selectedEntry = selectedSubgroup?.entries.find(entry => String(entry.assignment_id) === selectedAssignment) ?? selectedSubgroup?.entries[0];
  const chooseAssignment = (assignmentId: number) => { setSelectedAssignment(String(assignmentId)); setSelectedWeek(''); setMailNotice(null); };

  const summaryQuery = useQuery({
    queryKey: ['attendance-group-summary', selectedAssignment, selectedWeek],
    queryFn: () => apiFetch<GroupSummary>(`/attendance-records/group-summary?assignment_id=${selectedAssignment}${selectedWeek ? `&week=${selectedWeek}` : ''}`),
    enabled: can('attendance.review') && Boolean(selectedAssignment),
  });
  const summary = summaryQuery.data;
  const warningParams = useMemo(() => {
    const params = new URLSearchParams();
    if (summary?.group.academic_year?.id) params.set('academic_year_id', String(summary.group.academic_year.id));
    if (summary?.group.course?.id) params.set('course_id', String(summary.group.course.id));
    if (summary?.group.clinical_period?.id) params.set('clinical_period_id', String(summary.group.clinical_period.id));
    return params.toString();
  }, [summary]);
  const warningsQuery = useQuery({
    queryKey: ['attendance-warnings', warningParams],
    queryFn: () => apiFetch<AttendanceWarning[]>(`/attendance-warnings?${warningParams}`),
    enabled: can('attendance.review') && Boolean(summary && warningParams),
  });
  const warningStudents = useMemo(() => {
    const groupStudentIds = new Set(summary?.students.map(row => row.student.id) ?? []);
    return (warningsQuery.data ?? []).filter(row => groupStudentIds.has(row.student.id));
  }, [summary, warningsQuery.data]);
  const sendWarning = useMutation({
    mutationFn: ({ warning, resend }: { warning: AttendanceWarning; resend: boolean }) => apiFetch<{ recipient_email: string; threshold_percent: number; sent_at: string }>('/attendance-warnings/send', {
      method: 'POST',
      body: { student_id: warning.student.id, rotation_id: warning.rotation_id, threshold_percent: warning.current_threshold, resend },
    }),
    onSuccess: async result => {
      setMailNotice({ ok: true, text: tr(`تم إرسال الإنذار إلى ${result.recipient_email}.`, `Warning sent to ${result.recipient_email}.`) });
      await queryClient.invalidateQueries({ queryKey: ['attendance-warnings'] });
    },
    onError: error => setMailNotice({ ok: false, text: error instanceof ApiError ? error.message : tr('تعذر إرسال البريد. حاول مرة أخرى.', 'Unable to send the email. Please try again.') }),
  });
  const name = (value?: Named | null) => ar ? value?.name_ar : value?.name_en || value?.name_ar;
  const supervisorName = (value?: Supervisor) => ar ? value?.full_name_ar : value?.full_name_en || value?.full_name_ar;
  const academicLevelName = (level?: string | null) => ({ fourth: tr('الرابعة', 'Fourth year'), fifth: tr('الخامسة', 'Fifth year'), sixth: tr('السادسة', 'Sixth year') }[level || ''] || level || '');

  if (!can('attendance.review')) return <ErrorState title={tr('لا تملك صلاحية عرض سجل الحضور', 'Access denied')} />;
  if (groupsQuery.isLoading) return <LoadingState />;
  if (groupsQuery.isError) return <ErrorState onRetry={() => groupsQuery.refetch()} />;

  return <div className="mx-auto max-w-[1380px] space-y-5 pb-14">
    <PageHeader title={tr('سجل الحضور والغياب', 'Attendance register')} description={tr(
      'ابدأ بالمجموعة الرئيسية، ثم اختر المجموعة الفرعية والمساق لمراجعة الحضور أسبوعًا بأسبوع.',
      'Choose a main group, subgroup and course to review attendance week by week.',
    )}/>

    {!mainGroups.length ? <EmptyState message={tr('لا توجد مجموعات في توزيع سريري منشور ضمن نطاق صلاحياتك.','No groups exist in a published clinical distribution within your access scope.')} /> : <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <label className="block w-full max-w-md">
            <span className="mb-1.5 block text-[11px] font-black text-slate-600">{tr('المجموعة الرئيسية', 'Main group')}</span>
            <select value={selectedMainGroup?.key ?? ''} onChange={event => { const next = mainGroups.find(group => group.key === event.target.value)?.subgroups[0]?.entries[0]; if (next) chooseAssignment(next.assignment_id); }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
              {mainGroups.map(group => <option key={group.key} value={group.key}>{tr('المجموعة', 'Group')} {group.name}{group.academicLevel ? ` · ${academicLevelName(group.academicLevel)}` : ''}{group.academicYear?.code ? ` · ${group.academicYear.code}` : ''}</option>)}
            </select>
          </label>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600"><Users className="h-3.5 w-3.5"/>{selectedMainGroup?.subgroups.length ?? 0} {tr('مجموعات فرعية', 'subgroups')}</span>
        </div>
        <div role="group" aria-label={tr('المجموعات الفرعية', 'Subgroups')} className="grid gap-2 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-5">
          {selectedMainGroup?.subgroups.map(subgroup => <button key={subgroup.key} type="button" aria-pressed={selectedSubgroup?.key === subgroup.key} onClick={() => { const next = subgroup.entries[0]; if (next) chooseAssignment(next.assignment_id); }} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-3 text-start transition focus-visible:outline-2 focus-visible:outline-teal-500 ${selectedSubgroup?.key === subgroup.key ? 'border-teal-600 bg-teal-50 text-teal-900 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-slate-50'}`}>
            <span dir="ltr" className="truncate text-base font-black">{subgroup.name}</span>
            <span className="shrink-0 text-[10px] font-bold text-slate-500">{subgroup.studentCount} {tr('طلاب', 'students')}</span>
          </button>)}
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end sm:p-4">
        <div className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-black text-slate-600">{tr('المساق المختار', 'Selected course')}</span>
          {selectedSubgroup && selectedSubgroup.entries.length > 1 ? <select aria-label={tr('المساق', 'Course')} value={selectedEntry?.assignment_id ?? ''} onChange={event => chooseAssignment(Number(event.target.value))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-500">
            {selectedSubgroup.entries.map(entry => <option key={entry.assignment_id} value={entry.assignment_id}>{name(entry.course) || tr('مساق غير محدد', 'Unnamed course')}{selectedSubgroup.entries.filter(item => item.course?.id === entry.course?.id).length > 1 ? ` · ${name(entry.clinical_period) || entry.block?.code || entry.rotation_id}${entry.batch_year ? ` · ${tr('دفعة', 'Cohort')} ${entry.batch_year}` : ''}` : ''}</option>)}
          </select> : <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3"><BookOpen className="h-4 w-4 shrink-0 text-teal-700"/><span className="min-w-0 truncate text-sm font-black text-slate-900">{name(selectedEntry?.course) || tr('مساق غير محدد', 'Unnamed course')}</span></div>}
          {selectedEntry?.course?.code && <p dir="ltr" className={`mt-1 text-[10px] font-semibold text-slate-500 ${ar ? 'text-right' : 'text-left'}`}>{selectedEntry.course.code}</p>}
        </div>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[11px] font-black text-slate-600">{tr('الأسبوع','Week')}</span>
          <select value={selectedWeek || String(summary?.selected_week?.number ?? '')} disabled={!summary?.weeks.length || summaryQuery.isFetching} onChange={event => setSelectedWeek(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none disabled:bg-slate-50 focus:border-teal-500">
            {(summary?.weeks ?? []).map(week => <option key={week.number} value={week.number}>{tr(`الأسبوع ${week.number}`,`Week ${week.number}`)} · {dateLabel(week.start_date,ar)}–{dateLabel(week.end_date,ar)}</option>)}
          </select>
        </label>
      </section>

      {summaryQuery.isLoading ? <LoadingState /> : summaryQuery.isError || !summary ? <ErrorState onRetry={() => summaryQuery.refetch()} /> : <>
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="text-sm font-black text-slate-900">{summary.group.subgroup_name || summary.group.group_name || '—'}</h2>
              <span className="rounded-full bg-teal-50 px-2 py-1 text-[9px] font-black text-teal-700">{summary.group.student_count} {tr('طالب','students')}</span>
              <span className="text-[11px] font-bold text-slate-600">{name(summary.group.course) || '—'}{summary.group.course?.code ? ` · ${summary.group.course.code}` : ''}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[10px] font-black text-slate-700">
              <CalendarDays className="h-4 w-4 text-teal-700"/>
              <span>{tr('الأسبوع','Week')} {summary.selected_week.number}</span>
              <span dir="ltr" className="font-mono text-slate-500">{dateLabel(summary.selected_week.start_date,ar)}–{dateLabel(summary.selected_week.end_date,ar)}</span>
            </div>
          </div>

          {!summary.schedule.length ? <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] font-bold text-amber-700">{tr('لا يوجد تكليف أو دوام سريري لهذه المجموعة في الأسبوع المختار.','This group has no clinical assignment or duty in the selected week.')}</div> : <div className="mt-2 divide-y divide-slate-100 border-t border-slate-100">{summary.schedule.map(item => <div key={`${item.rotation_block_id}-${item.supervisor?.id ?? 0}-${item.training_site?.id ?? 0}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 text-[10px]">
            <span className="inline-flex items-center gap-1.5 font-bold text-slate-700"><UserRound className="h-3.5 w-3.5 text-teal-700"/>{supervisorName(item.supervisor) || tr('مشرف غير محدد','Supervisor not assigned')}</span>
            <span className="inline-flex items-center gap-1.5 font-bold text-slate-600"><MapPin className="h-3.5 w-3.5 text-teal-700"/>{name(item.training_site) || tr('موقع غير محدد','Site not assigned')}</span>
            {item.scheduled_dates.length ? <div className="flex flex-wrap gap-1.5">{item.scheduled_dates.map(date => <span key={date} className="rounded-md bg-slate-50 px-2 py-1 font-bold text-teal-800">{new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{weekday:'long'}).format(new Date(`${date}T12:00:00`))} <span dir="ltr" className="text-slate-500">{dateLabel(date,ar)}</span></span>)}</div> : <span className="font-bold text-amber-700">{item.supervisor ? tr('لا توجد أيام دوام مطابقة','No matching work days') : tr('لم يعين مشرف','No supervisor assigned')}</span>}
          </div>)}</div>}
        </section>

        <div className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <Tab active={activeTab === 'register'} onClick={() => setActiveTab('register')}>{tr('سجل المجموعة','Group register')}</Tab>
          <Tab active={activeTab === 'details'} onClick={() => setActiveTab('details')}>{tr('تفاصيل الأيام والملاحظات','Daily details and notes')}</Tab>
          <Tab active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')}>{tr(`تنبيهات الغياب (${warningStudents.length})`,`Absence alerts (${warningStudents.length})`)}</Tab>
        </div>

        {activeTab === 'register' && <WeeklyRegister summary={summary} ar={ar} tr={tr}/>}
        {activeTab === 'details' && <DailyDetails days={summary.daily ?? []} ar={ar} tr={tr}/>}
        {activeTab === 'alerts' && <Alerts
          warnings={warningStudents}
          ar={ar}
          tr={tr}
          canNotify={can('attendance.notify')}
          loading={warningsQuery.isLoading}
          failed={warningsQuery.isError}
          notice={mailNotice}
          sendingKey={sendWarning.isPending ? `${sendWarning.variables?.warning.student.id}-${sendWarning.variables?.warning.current_threshold}` : null}
          onRetry={() => warningsQuery.refetch()}
          onSend={(warning, resend) => {
            const level = warning.current_threshold === 20 ? tr('الإنذار الرسمي', 'the formal warning') : tr('التنبيه الأولي', 'the initial notice');
            const action = resend ? tr('إعادة إرسال', 'resend') : tr('إرسال', 'send');
            if (!window.confirm(tr(`${action} ${level} إلى ${warning.student.email}؟`, `${action} ${level} to ${warning.student.email}?`))) return;
            setMailNotice(null);
            sendWarning.mutate({ warning, resend });
          }}
        />}
      </>}
    </>}
  </div>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${active ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{children}</button>; }

function WeeklyRegister({ summary, ar, tr }: { summary: GroupSummary; ar: boolean; tr: (a: string, e: string) => string }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">{tr(`حضور الأسبوع ${summary.selected_week.number}`,`Week ${summary.selected_week.number} attendance`)}</h2><p className="mt-1 text-[10px] text-slate-500">{tr('يعرض حضور وغياب طلبة المجموعة في الأسبوع المختار فقط.','Shows attendance for the selected group and week only.')}</p></header>
    {!summary.students.length ? <div className="p-6"><EmptyState message={tr('لا يوجد طلبة في هذه المجموعة.','This group has no students.')} /></div> : <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-start">
        <thead><tr className="bg-slate-50 text-[10px] font-black text-slate-500">
          <th className="min-w-[240px] px-4 py-3 text-start">{tr('الطالب','Student')}</th>
          <th className="px-4 py-3 text-center">{tr('حاضر','Present')}</th><th className="px-4 py-3 text-center">{tr('غائب','Absent')}</th>
          <th className="px-4 py-3 text-center">{tr('متأخر','Late')}</th><th className="px-4 py-3 text-center">{tr('بعذر','Excused')}</th>
          <th className="min-w-[150px] px-4 py-3 text-center">{tr('اكتمال الرصد','Recording')}</th><th className="px-4 py-3 text-center">{tr('نسبة الغياب','Absence rate')}</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{summary.students.map(row => <StudentRow key={row.student.id} row={row} ar={ar} tr={tr}/>)}</tbody>
      </table>
    </div>}
  </section>;
}

function DailyDetails({ days, ar, tr }: { days: DailyAttendance[]; ar: boolean; tr: (a: string, e: string) => string }) {
  const [selectedKey, setSelectedKey] = useState('');
  const keyFor = (day: DailyAttendance) => `${day.date}|${day.rotation_block_id}|${day.training_site?.id ?? 0}|${day.supervisor?.id ?? 0}`;
  const day = days.find(item => keyFor(item) === selectedKey) ?? days[0];
  const time = (value?: string | null) => value ? new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  const state = (value?: string | null) => ({ check_in_open: tr('الدخول مفتوح', 'Check-in open'), check_in_closed: tr('الدخول مغلق', 'Check-in closed'), check_out_open: tr('الخروج مفتوح', 'Check-out open'), finalized: tr('معتمدة', 'Finalized') })[value as 'check_in_open'] ?? (day?.recorded_count ? tr('سجل يدوي', 'Manual register') : tr('لم يُسجل بعد', 'Not recorded yet'));
  const status = (value: DailyAttendance['students'][number]['status']) => ({ present: tr('حاضر', 'Present'), absent: tr('غائب', 'Absent'), late: tr('متأخر', 'Late'), excused: tr('بعذر', 'Excused') })[value as 'present'] ?? tr('لم يُعتمد بعد', 'Not finalized');

  if (!day) return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">{tr('لا توجد أيام دوام في الأسبوع المختار.', 'No scheduled days in the selected week.')}</section>;

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="text-xs font-black text-slate-700">{tr('يوم التدريب', 'Training day')}<select value={keyFor(day)} onChange={event => setSelectedKey(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">{days.map(item => <option key={keyFor(item)} value={keyFor(item)}>{dateLabel(item.date, ar)} · {ar ? item.training_site?.name_ar : item.training_site?.name_en || item.training_site?.name_ar} · {ar ? item.supervisor?.full_name_ar : item.supervisor?.full_name_en || item.supervisor?.full_name_ar}</option>)}</select></label><span className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-black text-teal-800">{day.recorded_count}/{day.students.length} {tr('سجل معتمد', 'records finalized')}</span></header>
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[11px] text-slate-600"><b className="text-teal-800">{state(day.qr_session?.state)}</b>{day.qr_session && <><span>{tr('فتح الدخول', 'Check-in opened')}: {time(day.qr_session.check_in_opened_at)}</span><span>{tr('إغلاق الدخول', 'Check-in closed')}: {time(day.qr_session.check_in_closed_at)}</span><span>{tr('فتح الخروج', 'Check-out opened')}: {time(day.qr_session.check_out_opened_at)}</span><span>{tr('الاعتماد', 'Finalized')}: {time(day.qr_session.finalized_at)}</span></>}</div>
    {day.qr_session && day.qr_session.state !== 'finalized' && <p className="border-b border-slate-100 px-4 py-2 text-[11px] font-bold text-amber-700">{tr('الجلسة قيد العمل؛ من لم يمسح الرمز لا يُعد غائباً حتى الاعتماد.', 'Session in progress; students without a scan are not absent until finalization.')}</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-start text-xs"><thead className="bg-slate-50 text-[10px] text-slate-500"><tr><th className="p-3 text-start">{tr('الطالب', 'Student')}</th><th className="p-3 text-start">{tr('الحالة', 'Status')}</th><th className="p-3 text-start">{tr('الدخول', 'Check-in')}</th><th className="p-3 text-start">{tr('الخروج', 'Check-out')}</th><th className="p-3 text-start">{tr('المصدر والملاحظات', 'Source and notes')}</th></tr></thead><tbody className="divide-y divide-slate-100">{day.students.map(row => <tr key={row.student.id}><td className="p-3"><div className="flex items-center gap-2"><SupervisorStudentPhoto student={row.student} ar={ar}/><span><b className="block text-slate-800">{ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar}</b><small dir="ltr" className="text-slate-400">{row.student.university_number}</small></span></div></td><td className="p-3"><b className={row.status === 'absent' ? 'text-rose-700' : row.status === 'late' ? 'text-amber-700' : row.status ? 'text-teal-700' : 'text-slate-500'}>{status(row.status)}</b>{row.is_incomplete && <small className="block text-amber-700">{tr('الخروج غير مسجل', 'Missing check-out')}</small>}</td><td className="p-3">{time(row.check_in_at)}</td><td className="p-3">{time(row.check_out_at)}</td><td className="p-3 text-[11px] text-slate-600">{row.recording_source === 'qr' ? 'QR' : row.recording_source === 'manual' ? tr('تسجيل المشرف', 'Supervisor entry') : row.recording_source === 'manual_override' ? tr('تعديل سابق', 'Prior adjustment') : row.recording_source ? tr('رصد إداري', 'Administrative') : '—'}{row.note && <small className="mt-1 block whitespace-pre-wrap rounded-lg bg-amber-50 px-2 py-1.5 font-medium text-amber-900">{tr('ملاحظة المشرف:', 'Supervisor note:')} {row.note}</small>}{row.recorded_by && <small className="mt-1 block text-slate-400">{tr('بواسطة', 'By')} {row.recorded_by}</small>}</td></tr>)}</tbody></table></div>
  </section>;
}

function StudentRow({ row, ar, tr }: { row: StudentSummary; ar: boolean; tr: (a: string, e: string) => string }) {
  const studentName = ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar;
  return <tr className="text-[11px] hover:bg-slate-50/50">
    <td className="px-4 py-3"><div className="flex items-center gap-2.5"><SupervisorStudentPhoto student={row.student} ar={ar}/><div><b className="block max-w-[180px] truncate text-slate-800">{studentName}</b><span dir="ltr" className="font-mono text-[9px] text-slate-400">{row.student.university_number}</span></div></div>{Boolean(row.attendance_notes?.length)&&<div className="mt-2 max-w-[260px] rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-900"><b>{tr('ملاحظة حضور', 'Attendance note')}{row.attendance_notes![0].date?` · ${dateLabel(row.attendance_notes![0].date!,ar)}`:''}</b><p className="mt-0.5 line-clamp-2 whitespace-pre-wrap">{row.attendance_notes![0].note}</p>{row.attendance_notes![0].recorded_by&&<small className="block text-slate-500">{tr('بواسطة', 'By')} {row.attendance_notes![0].recorded_by}</small>}{row.attendance_notes!.length>1&&<small className="font-bold">+{row.attendance_notes!.length-1} {tr('ملاحظات أخرى في تفاصيل الأيام', 'more in daily details')}</small>}</div>}</td>
    <Count value={row.totals.present} tone="emerald"/><Count value={row.totals.absent} tone="rose"/><Count value={row.totals.late} tone="amber"/><Count value={row.totals.excused} tone="sky"/>
    <td className="px-4 py-3 text-center"><b className="text-slate-700">{row.totals.recorded_days}/{row.totals.elapsed_scheduled_days}</b><p className="mt-1 text-[9px] text-slate-400">{tr('يوم مرصود/مستحق','recorded/due')}</p></td>
    <td className="px-4 py-3 text-center"><b className={row.totals.warning_level ? 'text-rose-700' : 'text-slate-700'}>{Number(row.totals.absence_percentage).toFixed(1)}%</b></td>
  </tr>;
}

function Count({ value, tone }: { value: number; tone: 'emerald' | 'rose' | 'amber' | 'sky' }) { const colors={emerald:'text-emerald-700',rose:'text-rose-700',amber:'text-amber-700',sky:'text-sky-700'}; return <td className={`px-4 py-3 text-center text-sm font-black ${value?colors[tone]:'text-slate-300'}`}>{value}</td>; }

function Alerts({ warnings, ar, tr, canNotify, loading, failed, notice, sendingKey, onRetry, onSend }: {
  warnings: AttendanceWarning[]; ar: boolean; tr: (a: string, e: string) => string; canNotify: boolean;
  loading: boolean; failed: boolean; notice: { ok: boolean; text: string } | null; sendingKey: string | null;
  onRetry: () => void; onSend: (warning: AttendanceWarning, resend: boolean) => void;
}) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">{tr('تنبيهات الغياب التراكمية','Cumulative absence alerts')}</h2><p className="mt-1 text-[10px] text-slate-500">{tr('تنبيه أولي بعد تجاوز 10%، وإنذار رسمي بعد تجاوز 20% من الأيام التدريبية المعتمدة للمساق.','Initial notice above 10%; formal warning above 20% of the course required clinical days.')}</p></header>
    {notice && <div className={`mx-5 mt-4 rounded-xl px-4 py-3 text-[11px] font-bold ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{notice.text}</div>}
    {loading ? <LoadingState /> : failed ? <div className="p-5"><ErrorState onRetry={onRetry}/></div> : !warnings.length ? <div className="flex flex-col items-center gap-2 p-8 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-600"/><b className="text-sm text-slate-800">{tr('لا توجد تنبيهات غياب تراكمية لهذه المجموعة','No cumulative absence alerts for this group')}</b></div> : <div className="divide-y divide-slate-100">{warnings.map(row => {
      const studentName = ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar;
      const urgent = row.current_threshold === 20;
      const sent = row.last_sent[String(row.current_threshold) as '10' | '20'];
      const isSending = sendingKey === `${row.student.id}-${row.current_threshold}`;
      return <article key={`${row.student.id}-${row.rotation_id}`} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_auto_auto] md:items-center"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${urgent?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700'}`}>{urgent?<XCircle className="h-5 w-5"/>:<AlertTriangle className="h-5 w-5"/>}</span><div><b className="text-xs text-slate-900">{studentName}</b><p dir="ltr" className="mt-1 text-start font-mono text-[10px] text-slate-400">{row.student.university_number} · {row.student.email}</p></div></div><div className="text-center"><b className={urgent?'text-rose-700':'text-amber-700'}>{Number(row.absence_percentage).toFixed(1)}%</b><p className="text-[9px] text-slate-400">{row.absent_days} {tr('غياب من','absent of')} {row.total_required_days}</p></div><div className="flex min-w-[190px] flex-col items-stretch gap-1.5"><span className={`self-center rounded-full px-3 py-1 text-[10px] font-black ${urgent?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700'}`}>{urgent?tr('إنذار رسمي','Formal warning'):tr('تنبيه أولي','Initial notice')}</span>{sent && <span className="text-center text-[9px] font-bold text-emerald-700">{tr('أُرسل','Sent')} · {new Intl.DateTimeFormat(ar?'ar-PS':'en-GB',{dateStyle:'short',timeStyle:'short'}).format(new Date(sent.sent_at))}</span>}{canNotify ? <button type="button" disabled={Boolean(sendingKey)} onClick={() => onSend(row, Boolean(sent))} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-[10px] font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><Mail className="h-3.5 w-3.5"/>{isSending ? tr('جارٍ الإرسال...','Sending...') : sent ? tr('إعادة إرسال البريد','Resend email') : urgent ? tr('إرسال الإنذار الرسمي','Send formal warning') : tr('إرسال التنبيه الأولي','Send initial notice')}</button> : <span className="text-center text-[9px] text-slate-400">{tr('تحتاج صلاحية إرسال إنذارات الغياب','Email notification permission required')}</span>}</div></article>;
    })}</div>}
  </section>;
}
