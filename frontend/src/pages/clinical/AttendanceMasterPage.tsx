import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Mail, Users } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';

type Named = { id?: number; code?: string; name?: string; name_ar?: string; name_en?: string | null };
type Student = { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null; photo_url?: string | null };
type AttendanceGroup = { assignment_id: number; student_group_id?: number | null; student_subgroup_id?: number | null; rotation_id?: number | null; academic_level?: string | null; academic_year?: Named | null; course?: Named | null; group_name?: string | null; subgroup_name?: string | null; batch_year?: number | null; student_count: number };
type AttendanceSubgroup = { key: string; name: string; studentCount: number; entries: AttendanceGroup[] };
type AttendanceMainGroup = { key: string; id: number | null; name: string; academicYear?: Named | null; academicLevel?: string | null; subgroups: AttendanceSubgroup[] };
export function organizeAttendanceGroups(groups: AttendanceGroup[]): AttendanceMainGroup[] {
  const main = new Map<string, AttendanceMainGroup & { subgroupMap: Map<string, AttendanceSubgroup> }>();
  for (const entry of groups) {
    const mainKey = entry.student_group_id != null ? `id:${entry.student_group_id}` : `legacy:${entry.group_name}:${entry.academic_year?.id ?? entry.academic_year?.code}:${entry.academic_level}:${entry.batch_year}`;
    const subKey = entry.student_subgroup_id != null ? `id:${entry.student_subgroup_id}` : `legacy:${entry.subgroup_name}`;
    if (!main.has(mainKey)) main.set(mainKey, { key: mainKey, id: entry.student_group_id ?? null, name: entry.group_name || '—', academicYear: entry.academic_year, academicLevel: entry.academic_level, subgroups: [], subgroupMap: new Map() });
    const parent = main.get(mainKey)!;
    if (!parent.subgroupMap.has(subKey)) parent.subgroupMap.set(subKey, { key: subKey, name: entry.subgroup_name || entry.group_name || '—', studentCount: 0, entries: [] });
    const sub = parent.subgroupMap.get(subKey)!;
    sub.studentCount = Math.max(sub.studentCount, entry.student_count);
    const key = (item: AttendanceGroup) => `${item.rotation_id != null ? `rotation:${item.rotation_id}` : `assignment:${item.assignment_id}`}:${item.batch_year ?? 'all'}`;
    if (!sub.entries.some(item => key(item) === key(entry))) sub.entries.push(entry);
  }
  return [...main.values()].map(group => ({ key: group.key, id: group.id, name: group.name, academicYear: group.academicYear, academicLevel: group.academicLevel, subgroups: [...group.subgroupMap.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) })).sort((a, b) => `${a.academicYear?.code ?? ''}:${a.name}`.localeCompare(`${b.academicYear?.code ?? ''}:${b.name}`, undefined, { numeric: true }));
}
type Day = { date: string; scheduled: boolean; status: 'present' | 'absent' | 'late' | 'excused' | null; check_in_at?: string | null; check_out_at?: string | null; recording_source?: string | null; is_incomplete?: boolean; note?: string | null; recorded_by?: string | null; qr_session?: { state: string; check_in_opened_at?: string | null; check_in_closed_at?: string | null; check_out_opened_at?: string | null; finalized_at?: string | null } | null; supervisor?: { full_name_ar?: string; full_name_en?: string | null } | null; training_site?: Named | null };
type StudentWeek = { student_id: number; assigned: boolean; schedule_issue?: 'supervisor_missing' | 'site_missing' | 'no_matching_availability' | null; days: Day[] };
type Week = { number: number; start_date: string; end_date: string; students: StudentWeek[] };
type Rotation = { id: number; course?: Named | null; clinical_period?: Named | null; weeks: Week[] };
type Subgroup = { id: number; name: string; students: Student[]; rotations: Rotation[] };
type ReviewGroup = { student_group_id: number; subgroups: Subgroup[] };
type Warning = { student: Student & { email: string }; rotation_id: number; course: Named; absent_days: number; total_required_days: number; absence_percentage: number; current_threshold: 10 | 20; last_sent: { '10': { sent_at: string } | null; '20': { sent_at: string } | null } };
type Selection = { student: Student; week: Week; row: StudentWeek; course?: Named | null };
const shortDate = (date: string, ar: boolean) => new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { day: '2-digit', month: '2-digit' }).format(new Date(`${date.slice(0, 10)}T12:00:00`));
const shortTime = (date: string | null | undefined, ar: boolean) => date ? new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '—';
const nameOf = (value: Named | null | undefined, ar: boolean) => ar ? value?.name_ar || value?.name : value?.name_en || value?.name_ar || value?.name;
const statusOf = (status: Day['status'], tr: (a: string, e: string) => string) => status === 'present' ? tr('حاضر', 'Present') : status === 'absent' ? tr('غائب', 'Absent') : status === 'late' ? tr('متأخر', 'Late') : status === 'excused' ? tr('بعذر', 'Excused') : tr('لم يُرصد', 'Not recorded');

export function AttendanceMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const cache = useQueryClient();
  const [mainKey, setMainKey] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [activeTab, setActiveTab] = useState<'register' | 'alerts'>('register');
  const [mailNotice, setMailNotice] = useState('');
  const groupsQuery = useQuery({ queryKey: ['attendance-review-groups'], queryFn: () => apiFetch<AttendanceGroup[]>('/attendance-records/groups'), enabled: can('attendance.review') });
  const groups = useMemo(() => organizeAttendanceGroups(Array.isArray(groupsQuery.data) ? groupsQuery.data : []), [groupsQuery.data]);
  useEffect(() => { if (groups.length && !groups.some(group => group.key === mainKey)) setMainKey(groups[0].key); }, [groups, mainKey]);
  const main = groups.find(group => group.key === mainKey) ?? groups[0];
  const reviewQuery = useQuery({ queryKey: ['attendance-review-group', main?.id], queryFn: () => apiFetch<ReviewGroup>(`/attendance-records/review-group?student_group_id=${main!.id}`), enabled: can('attendance.review') && main?.id != null });
  const studentIds = useMemo(() => new Set(reviewQuery.data?.subgroups.flatMap(subgroup => subgroup.students.map(student => student.id)) ?? []), [reviewQuery.data]);
  const warningsQuery = useQuery({ queryKey: ['attendance-warnings', main?.academicYear?.id], queryFn: () => apiFetch<Warning[]>(`/attendance-warnings?academic_year_id=${main!.academicYear!.id}`), enabled: can('attendance.review') && Boolean(reviewQuery.data && main?.academicYear?.id) });
  const warnings = (warningsQuery.data ?? []).filter(row => studentIds.has(row.student.id));
  const sendWarning = useMutation({ mutationFn: ({ warning, resend }: { warning: Warning; resend: boolean }) => apiFetch<{ recipient_email: string }>('/attendance-warnings/send', { method: 'POST', body: { student_id: warning.student.id, rotation_id: warning.rotation_id, threshold_percent: warning.current_threshold, resend } }), onSuccess: async result => { setMailNotice(tr(`تم إرسال التنبيه إلى ${result.recipient_email}.`, `Warning sent to ${result.recipient_email}.`)); await cache.invalidateQueries({ queryKey: ['attendance-warnings'] }); }, onError: error => setMailNotice(error instanceof ApiError ? error.message : tr('تعذر إرسال البريد.', 'Unable to send email.')) });
  if (!can('attendance.review')) return <ErrorState title={tr('لا تملك صلاحية عرض سجل الحضور', 'Access denied')} />;
  if (groupsQuery.isLoading) return <LoadingState />;
  if (groupsQuery.isError) return <ErrorState onRetry={() => groupsQuery.refetch()} />;
  return <div className="mx-auto max-w-[1500px] space-y-5 pb-14">
    <PageHeader title={tr('سجل الحضور والغياب', 'Attendance register')} />
    {!groups.length ? <EmptyState message={tr('لا توجد مجموعات في توزيع سريري منشور ضمن صلاحياتك.', 'No published groups in your access scope.')} /> : <>
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label className="block w-full max-w-lg text-xs font-black text-slate-700">{tr('المجموعة الرئيسية', 'Main group')}<select value={main?.key ?? ''} onChange={event => { setMainKey(event.target.value); setSelection(null); setMailNotice(''); }} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus:border-teal-500">{groups.map(group => <option key={group.key} value={group.key}>{group.name} · {group.academicYear?.code ?? '—'}</option>)}</select></label><span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><Users className="h-4 w-4" />{reviewQuery.data?.subgroups.length ?? main?.subgroups.length ?? 0} {tr('مجموعات فرعية', 'subgroups')}</span></section>
      {reviewQuery.isLoading ? <LoadingState /> : reviewQuery.isError ? <ErrorState onRetry={() => reviewQuery.refetch()} /> : !reviewQuery.data?.subgroups.length ? <EmptyState message={tr('لا توجد مجموعات فرعية مكلّفة.', 'No assigned subgroups.')} /> : <>
        <div role="tablist" aria-label={tr('أقسام الحضور', 'Attendance sections')} className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button type="button" role="tab" aria-selected={activeTab === 'register'} onClick={() => setActiveTab('register')} className={activeTab === 'register' ? 'rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-black text-white' : 'rounded-lg px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50'}>{tr('سجل الحضور', 'Attendance')}</button>
          <button type="button" role="tab" aria-selected={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} className={activeTab === 'alerts' ? 'rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-black text-white' : 'rounded-lg px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50'}>{tr('تنبيهات الغياب', 'Absence alerts')}{warnings.length ? ` (${warnings.length})` : ''}</button>
        </div>
        {activeTab === 'register' && <>
        {reviewQuery.data.subgroups.map(subgroup => <section key={subgroup.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5"><div><h2 className="text-lg font-black text-teal-900">{tr('المجموعة الفرعية', 'Subgroup')} <span dir="ltr">{subgroup.name}</span></h2><p className="text-xs text-slate-500">{subgroup.students.length} {tr('طلاب', 'students')}</p></div><span className="text-xs text-slate-500">{subgroup.rotations.length} {tr('مساقات', 'courses')}</span></header>{subgroup.rotations.length ? subgroup.rotations.map(rotation => <RotationMatrix key={rotation.id} rotation={rotation} students={subgroup.students} ar={ar} tr={tr} onSelect={setSelection} />) : <p className="p-5 text-xs text-slate-500">{tr('لا توجد أسابيع مكلّفة.', 'No assigned weeks.')}</p>}</section>)}
        </>}
        {activeTab === 'alerts' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5"><div><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><AlertTriangle className="h-4 w-4 text-amber-600" />{tr('تنبيهات الغياب التراكمية', 'Cumulative absence alerts')}</h2><p className="text-xs text-slate-500">{tr('لطلبة المجموعة المختارة عبر مساقاتهم.', 'For this group across their courses.')}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{warnings.length}</span></header>{mailNotice && <p role="status" className="m-4 rounded-lg bg-teal-50 p-3 text-xs text-teal-800">{mailNotice}</p>}{warningsQuery.isLoading ? <LoadingState /> : warningsQuery.isError ? <div className="p-4"><ErrorState onRetry={() => warningsQuery.refetch()} /></div> : !warnings.length ? <p className="p-5 text-xs text-slate-500">{tr('لا توجد تنبيهات غياب حاليًا.', 'No absence alerts right now.')}</p> : <div className="divide-y divide-slate-100">{warnings.map(warning => { const sent = warning.last_sent[String(warning.current_threshold) as '10' | '20']; return <article key={`${warning.student.id}-${warning.rotation_id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"><div><b className="text-xs text-slate-900">{ar ? warning.student.full_name_ar : warning.student.full_name_en || warning.student.full_name_ar}</b><p className="text-[11px] text-slate-500">{nameOf(warning.course, ar)} · {warning.absent_days}/{warning.total_required_days} {tr('غياب', 'absences')} · {Number(warning.absence_percentage).toFixed(1)}%</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${warning.current_threshold === 20 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{warning.current_threshold === 20 ? tr('إنذار رسمي', 'Formal warning') : tr('تنبيه أولي', 'Initial notice')}</span>{sent && <span className="text-[10px] text-teal-700">{tr('أُرسل', 'Sent')}</span>}{can('attendance.notify') && <button type="button" disabled={sendWarning.isPending} onClick={() => { if (window.confirm(tr(`إرسال التنبيه إلى ${warning.student.email}؟`, `Send warning to ${warning.student.email}?`))) sendWarning.mutate({ warning, resend: Boolean(sent) }); }} className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"><Mail className="h-3.5 w-3.5" />{sent ? tr('إعادة الإرسال', 'Resend') : tr('إرسال', 'Send')}</button>}</div></article>; })}</div>}</section>}
      </>}
    </>}
    <Modal isOpen={Boolean(selection)} onClose={() => setSelection(null)} title={selection ? `${ar ? selection.student.full_name_ar : selection.student.full_name_en || selection.student.full_name_ar} · ${tr('الأسبوع', 'Week')} ${selection.week.number}` : ''} maxWidth="lg">{selection && <WeekDetails selection={selection} ar={ar} tr={tr} />}</Modal>
  </div>;
}

function RotationMatrix({
  rotation, students, ar, tr, onSelect,
}: {
  rotation: Rotation;
  students: Student[];
  ar: boolean;
  tr: (a: string, e: string) => string;
  onSelect: (selection: Selection) => void;
}) {
  const [mobileWeekIndex, setMobileWeekIndex] = useState(0);
  const visibleWeek = rotation.weeks[mobileWeekIndex];

  return <div className="border-b border-slate-100 last:border-0">
    <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-3 sm:px-5">
      <h3 className="text-sm font-black text-slate-900">{nameOf(rotation.course, ar) || tr('مساق غير محدد', 'Unnamed course')}</h3>
      <span dir="ltr" className="text-[11px] text-slate-500">{rotation.course?.code}</span>
    </div>
    {rotation.weeks.length > 1 && <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 sm:hidden">
      <span className="text-[11px] font-bold text-slate-700">{tr('الأسبوع', 'Week')} {visibleWeek?.number}</span>
      <div className="flex gap-1">
        <button type="button" aria-label={tr('الأسبوع السابق', 'Previous week')} disabled={mobileWeekIndex === 0}
          onClick={() => setMobileWeekIndex(index => index - 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" aria-label={tr('الأسبوع التالي', 'Next week')} disabled={mobileWeekIndex === rotation.weeks.length - 1}
          onClick={() => setMobileWeekIndex(index => index + 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
      </div>
    </div>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-xs">
        <thead><tr className="bg-teal-50/70">
          <th className="sticky start-0 z-10 min-w-[145px] border-b border-e border-slate-200 bg-teal-50 p-3 text-start sm:min-w-[210px]">{tr('الطالب', 'Student')}</th>
          {rotation.weeks.map((week, index) => <th key={week.number} className={`min-w-[110px] border-b border-e border-slate-200 p-2 text-center ${index === mobileWeekIndex ? '' : 'hidden sm:table-cell'}`}>
            {tr('الأسبوع', 'Week')} {week.number}
            <small dir="ltr" className="mt-1 block font-normal text-slate-500">{shortDate(week.start_date, ar)}–{shortDate(week.end_date, ar)}</small>
          </th>)}
          <th className="sticky end-0 z-10 min-w-[74px] border-b border-slate-200 bg-teal-50 p-2 text-center">{tr('مجموع الغياب', 'Total absent')}</th>
        </tr></thead>
        <tbody>{students.map(student => {
          const absenceTotal = new Set(rotation.weeks.flatMap(week => week.students.find(row => row.student_id === student.id)?.days.filter(day => day.status === 'absent').map(day => day.date) ?? [])).size;
          return <tr key={student.id} className="border-b border-slate-100 last:border-0">
            <th className="sticky start-0 z-10 border-e border-slate-200 bg-white p-2 text-start font-normal">
              <div className="flex items-center gap-2"><SupervisorStudentPhoto student={student} ar={ar} />
                <span className="min-w-0"><b className="block max-w-[115px] truncate text-[11px] text-slate-900 sm:max-w-[180px]">{ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}</b>
                  <small dir="ltr" className="block text-[9px] text-slate-500">{student.university_number}</small></span></div>
            </th>
            {rotation.weeks.map((week, index) => {
              const row = week.students.find(item => item.student_id === student.id);
              return <td key={week.number} className={`border-e border-slate-100 p-1 text-center ${index === mobileWeekIndex ? '' : 'hidden sm:table-cell'}`}>
                {row?.assigned ? <WeekCell row={row} week={week} student={student} course={rotation.course} ar={ar} tr={tr} onSelect={onSelect} /> : <span className="text-slate-300">—</span>}
              </td>;
            })}
            <td className="sticky end-0 z-10 bg-white p-2 text-center"><b className={absenceTotal ? 'text-rose-700' : 'text-slate-600'}>{absenceTotal}</b></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function WeekCell({ row, week, student, course, ar, tr, onSelect }: {
  row: StudentWeek; week: Week; student: Student; course?: Named | null; ar: boolean;
  tr: (a: string, e: string) => string; onSelect: (selection: Selection) => void;
}) {
  const count = (status: Day['status']) => new Set(row.days.filter(day => day.status === status).map(day => day.date)).size;
  const hasRecorded = row.days.some(day => day.status);
  const upcoming = row.days.length > 0 && row.days.every(day => !day.status && day.date > new Date().toISOString().slice(0, 10));
  const label = !row.days.length
    ? tr('الجدول غير محدد', 'Schedule missing')
    : !hasRecorded
      ? upcoming ? tr('قادم', 'Upcoming') : tr('لم يُرصد', 'Not recorded')
      : '';
  return <button type="button"
    aria-label={`${ar ? student.full_name_ar : student.full_name_en || student.full_name_ar} · ${tr('الأسبوع', 'Week')} ${week.number}`}
    onClick={() => onSelect({ student, week, row, course })}
    className="min-h-12 w-full rounded-lg px-1 py-2 text-[10px] font-bold hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600">
    {label && <span className={row.days.length ? 'text-slate-500' : 'text-amber-700'}>{label}</span>}
    {count('present') > 0 && <span className="block text-teal-800">{count('present')} {tr('حاضر', 'present')}</span>}
    {count('absent') > 0 && <span className="block text-rose-700">{count('absent')} {tr('غائب', 'absent')}</span>}
    {count('late') > 0 && <span className="block text-amber-700">{count('late')} {tr('متأخر', 'late')}</span>}
    {count('excused') > 0 && <span className="block text-sky-700">{count('excused')} {tr('بعذر', 'excused')}</span>}
  </button>;
}

function WeekDetails({ selection, ar, tr }: {
  selection: Selection; ar: boolean; tr: (a: string, e: string) => string;
}) {
  const { row, week, course } = selection;
  const issue = row.schedule_issue === 'supervisor_missing'
    ? tr('لم يُحدد مشرف في تكليف الطالب، لذلك لا يمكن تحديد أيام دوامه.', 'No supervisor is assigned, so duty days cannot be determined.')
    : row.schedule_issue === 'site_missing'
      ? tr('لم يُحدد مركز تدريب في التكليف، لذلك لا يمكن تحديد أيام الدوام.', 'No training site is assigned, so duty days cannot be determined.')
      : row.schedule_issue === 'no_matching_availability'
        ? tr('يوجد تكليف، لكن لا يوجد يوم مطابق في جدول دوام المشرف لهذا الأسبوع.', 'The assignment exists, but the supervisor has no matching availability this week.')
        : tr('لا توجد أيام مجدولة أو مرصودة لهذا الأسبوع.', 'No scheduled or recorded days this week.');

  return <div className="space-y-3 text-xs">
    <p className="text-slate-500">{nameOf(course, ar)} · {shortDate(week.start_date, ar)}–{shortDate(week.end_date, ar)}</p>
    {!row.days.length ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900">{issue}</p> : row.days.map((day, index) => {
      const isFuture = !day.status && day.date > new Date().toISOString().slice(0, 10);
      const status = isFuture ? tr('لم يحن موعده', 'Upcoming') : statusOf(day.status, tr);
      const qrState = day.qr_session?.state === 'finalized' ? tr('معتمدة', 'Finalized')
        : day.qr_session?.state === 'check_in_open' ? tr('الدخول مفتوح', 'Check-in open')
          : day.qr_session?.state === 'check_in_closed' ? tr('الدخول مغلق', 'Check-in closed')
            : day.qr_session?.state === 'check_out_open' ? tr('الخروج مفتوح', 'Check-out open') : null;
      return <article key={`${day.date}-${index}`} className="rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <b className="text-slate-900">{new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { weekday: 'long' }).format(new Date(`${day.date}T12:00:00`))} · {shortDate(day.date, ar)}</b>
          <span className={`rounded-full px-2 py-1 font-bold ${day.status === 'absent' ? 'bg-rose-50 text-rose-700' : day.status === 'late' ? 'bg-amber-50 text-amber-700' : day.status ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{status}</span>
        </div>
        <p className="mt-2 text-slate-600">{nameOf(day.training_site, ar) || tr('موقع غير محدد', 'Site not specified')} · {ar ? day.supervisor?.full_name_ar : day.supervisor?.full_name_en || day.supervisor?.full_name_ar || tr('مشرف غير محدد', 'Supervisor not specified')}</p>
        {(day.check_in_at || day.check_out_at) && <p className="mt-1 text-slate-500">{tr('الدخول', 'Check-in')}: {shortTime(day.check_in_at, ar)} · {tr('الخروج', 'Check-out')}: {shortTime(day.check_out_at, ar)}{day.is_incomplete ? ` · ${tr('الخروج غير مسجل', 'Missing check-out')}` : ''}</p>}
        {qrState && <p className="mt-1 text-slate-500">QR · {qrState}</p>}
        {day.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-50 p-2 text-amber-900">{tr('ملاحظة المشرف', 'Supervisor note')}: {day.note}</p>}
        {day.recorded_by && <p className="mt-1 text-slate-400">{tr('سجله', 'Recorded by')} {day.recorded_by}</p>}
      </article>;
    })}
  </div>;
}
