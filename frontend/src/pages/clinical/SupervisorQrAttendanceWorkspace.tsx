import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowRight, CalendarDays, CheckCircle2, QrCode, Users } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { getQrPayload, getQrSession, getQrSessions, openQrSession, transitionQrSession, type QrRoster, type QrSession } from '@/api/clinicalQrAttendance';
import { SupervisorStudentPhoto } from '@/components/clinical/SupervisorStudentPhoto';
import { formatDate, formatWeekday, groupName, groupSupervisorAssignments, preferredDate, type SupervisorGroup, type Workspace } from './supervisorWorkspace';

const actions: Record<string, string> = { check_in_open: 'close_check_in', check_in_closed: 'open_check_out', check_out_open: 'finalize' };
const actionLabels: Record<string, string> = { check_in_open: 'إغلاق الدخول', check_in_closed: 'فتح الخروج', check_out_open: 'اعتماد الجلسة' };
const phaseLabels: Record<string, string> = { check_in_open: 'الدخول مفتوح', check_in_closed: 'الدخول مغلق', check_out_open: 'الخروج مفتوح', finalized: 'معتمدة' };
type RowStatus = 'present' | 'late' | 'absent' | 'incomplete' | 'unscanned' | 'excused';
type RosterFilter = 'all' | RowStatus;

/** QR sessions are keyed by assignment/block/site/subgroup, not by student cohort. */
export function groupQrAssignments(groups: SupervisorGroup[]): SupervisorGroup[] {
  const combined = new Map<string, SupervisorGroup>();
  for (const group of groups) {
    const key = group.key.split('-').slice(0, -1).join('-');
    const existing = combined.get(key);
    if (!existing) {
      combined.set(key, { ...group, key, students: [...group.students], studentAssignmentIds: { ...group.studentAssignmentIds }, scheduledDates: [...group.scheduledDates] });
      continue;
    }
    existing.studentAssignmentIds = { ...existing.studentAssignmentIds, ...group.studentAssignmentIds };
    existing.students = [...existing.students, ...group.students.filter(student => !existing.students.some(row => row.id === student.id))];
    existing.scheduledDates = [...new Set([...existing.scheduledDates, ...group.scheduledDates])].sort();
  }
  return [...combined.values()];
}

function rowStatus(row: QrRoster, finalized: boolean): RowStatus {
  if (row.outcome === 'excused') return 'excused';
  if (!row.checked_in_at) return finalized ? 'absent' : 'unscanned';
  if (row.outcome === 'late') return 'late';
  if (!row.checked_out_at) return 'incomplete';
  return 'present';
}

function statusLabel(status: RowStatus): string {
  return ({ present: 'حاضر', late: 'متأخر', absent: 'غائب', incomplete: 'لم يسجل الخروج', unscanned: 'لم يمسح بعد', excused: 'بعذر' })[status];
}

function timeLabel(value?: string | null): string {
  return value ? new Intl.DateTimeFormat('ar-PS', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'تعذر إكمال العملية. أعد المحاولة.';
}

function groupLabel(group: SupervisorGroup): string {
  return `${groupName(group, true)} · ${group.siteAr} · ${group.periodAr}`;
}

function sessionLabel(session: QrSession): string {
  const subgroup = session.assignment?.student_subgroup;
  const course = session.assignment?.rotation_block?.rotation?.course?.name_ar;
  return `${formatDate(session.session_date, true)} · ${course ?? 'تدريب سريري'} · ${subgroup?.group?.name ?? subgroup?.name ?? 'مجموعة'} · ${session.training_site?.name_ar ?? 'موقع التدريب'}`;
}

export function SupervisorQrAttendanceWorkspace() {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const requestedDate = params.get('date') ?? '';
  const requestedGroup = params.get('group') ?? '';
  const [date, setDate] = useState('');
  const [groupKey, setGroupKey] = useState('');
  const [selected, setSelected] = useState<QrSession | null>(null);
  const [image, setImage] = useState('');
  const [imagePhase, setImagePhase] = useState('');
  const [expires, setExpires] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [filter, setFilter] = useState<RosterFilter>('all');

  const workspace = useQuery({ queryKey: ['supervisor-workspace'], queryFn: () => apiFetch<Workspace>('/operational/my-supervisor-workspace') });
  const sessions = useQuery({ queryKey: ['qr-sessions'], queryFn: getQrSessions });
  const groups = useMemo(() => groupQrAssignments(groupSupervisorAssignments(workspace.data?.assignments ?? [])), [workspace.data?.assignments]);
  const days = useMemo(() => [...new Set(groups.flatMap(group => group.scheduledDates))].sort(), [groups]);
  const scheduledGroups = useMemo(() => groups.filter(group => group.scheduledDates.includes(date)), [groups, date]);
  const group = scheduledGroups.find(item => item.key === groupKey) ?? null;
  const existingSession = group && sessions.data?.find(session => session.session_date.slice(0, 10) === date && Object.values(group.studentAssignmentIds).includes(session.student_clinical_assignment_id));

  useEffect(() => { if (days.length) setDate(current => requestedDate && days.includes(requestedDate) ? requestedDate : days.includes(current) ? current : preferredDate(days)); }, [days, requestedDate]);
  useEffect(() => { setGroupKey(current => scheduledGroups.some(group => group.key === current) ? current : scheduledGroups.find(group => group.key === requestedGroup || requestedGroup.startsWith(`${group.key}-`))?.key ?? scheduledGroups[0]?.key ?? ''); }, [scheduledGroups, requestedGroup]);
  useEffect(() => {
    if (date && groupKey && sessions.data) setSelected(existingSession ?? null);
  }, [date, groupKey, sessions.data]);
  useEffect(() => setFilter('all'), [selected?.id, selected?.state]);
  useEffect(() => { const timer = window.setInterval(() => setNowMs(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    setImage(''); setImagePhase(''); setExpires(0);
    if (!selected || !['check_in_open', 'check_out_open'].includes(selected.state)) return;
    let stopped = false;
    const refresh = async () => {
      try {
        const payload = await getQrPayload(selected.id);
        const expected = selected.state === 'check_out_open' ? 'check_out' : 'check_in';
        if (payload.phase !== expected) throw new Error('QR phase mismatch');
        const link = `${window.location.origin}/clinical-attendance?qr=${encodeURIComponent(payload.token)}&phase=${payload.phase}`;
        const dataUrl = await QRCode.toDataURL(link, { margin: 1, width: 300, color: { dark: '#123743', light: '#ffffff' } });
        if (!stopped) { setImage(dataUrl); setImagePhase(selected.state); setExpires(new Date(payload.expires_at).getTime()); }
      } catch { if (!stopped) setImage(''); }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [selected?.id, selected?.state]);
  useEffect(() => {
    if (!selected || selected.state === 'finalized') return;
    const timer = window.setInterval(() => { if (!document.hidden) void getQrSession(selected.id).then(setSelected).catch(() => undefined); }, 5_000);
    return () => window.clearInterval(timer);
  }, [selected?.id, selected?.state]);

  const open = useMutation({ mutationFn: () => openQrSession(group!.assignmentId, date), onSuccess: session => { setSelected(session); void client.invalidateQueries({ queryKey: ['qr-sessions'] }); } });
  const transition = useMutation({ mutationFn: () => transitionQrSession(selected!.id, actions[selected!.state]), onSuccess: session => { setSelected(session); void client.invalidateQueries({ queryKey: ['qr-sessions'] }); } });
  const roster = selected?.roster ?? [];
  const finalized = selected?.state === 'finalized';
  const totals = useMemo(() => ({
    present: roster.filter(row => rowStatus(row, finalized) === 'present').length,
    late: roster.filter(row => rowStatus(row, finalized) === 'late').length,
    absent: roster.filter(row => rowStatus(row, finalized) === 'absent').length,
    unscanned: roster.filter(row => rowStatus(row, finalized) === 'unscanned').length,
    incomplete: roster.filter(row => Boolean(row.checked_in_at) && !row.checked_out_at).length,
    checkedIn: roster.filter(row => row.checked_in_at).length,
    checkedOut: roster.filter(row => row.checked_out_at).length,
  }), [roster, finalized]);
  const visibleRows = roster.filter(row => filter === 'all' || rowStatus(row, finalized) === filter);
  const visibleImage = imagePhase === selected?.state && expires > nowMs ? image : '';
  const seconds = Math.max(0, Math.ceil((expires - nowMs) / 1000));
  const canTransition = selected && Boolean(actions[selected.state]);
  const movePhase = () => {
    if (selected?.state === 'check_out_open' && !window.confirm(`اعتماد الجلسة؟ سجل الدخول ${totals.checkedIn} من ${roster.length}، ولم يسجل الخروج ${totals.incomplete}.`)) return;
    transition.mutate();
  };

  return <div dir="rtl" className="mx-auto max-w-6xl space-y-5 pb-12">
    <Link to="/supervisor/portal" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><ArrowRight className="h-4 w-4"/>الرجوع للوحة المشرف</Link>
    <header><h1 className="text-xl font-black text-slate-900">الحضور السريري عبر QR</h1><p className="mt-1 text-sm text-slate-500">اختر يوم الدوام والمجموعة، ثم افتح الدخول والخروج. تظهر النتائج للطلبة والإدارة بعد اعتماد الجلسة.</p></header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-black text-slate-600"><span className="mb-1.5 flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-teal-700"/>يوم الدوام</span><select disabled={!days.length} value={date} onChange={event => setDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold disabled:bg-slate-50">{days.length ? days.map(day => <option key={day} value={day}>{formatWeekday(day, true)} — {formatDate(day, true)}</option>) : <option value="">لا توجد أيام دوام منشورة</option>}</select></label>
        <label className="text-xs font-black text-slate-600"><span className="mb-1.5 flex items-center gap-1.5"><Users className="h-4 w-4 text-teal-700"/>مجموعة هذا اليوم</span><select disabled={!scheduledGroups.length} value={groupKey} onChange={event => setGroupKey(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold disabled:bg-slate-50">{scheduledGroups.length ? scheduledGroups.map(item => <option key={item.key} value={item.key}>{groupLabel(item)}</option>) : <option value="">لا توجد مجموعة لهذا اليوم</option>}</select></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">{group ? `${group.students.length} طالب · ${group.siteAr}` : 'راجع الجدول المنشور وأيام عملك.'}</p><button disabled={!group || !date || open.isPending || sessions.isLoading} onClick={() => existingSession ? setSelected(existingSession) : open.mutate()} className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{existingSession ? 'عرض جلسة هذا اليوم' : 'فتح تسجيل الدخول'}</button></div>
      {(workspace.isError || sessions.isError || open.isError) && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{open.isError ? errorMessage(open.error) : 'تعذر تحميل جدولك أو الجلسات. حدّث الصفحة.'}</p>}
    </section>

    {(sessions.data?.length ?? 0) > 0 && <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-xs font-black text-slate-600">جلساتي السابقة والحالية<select value={selected?.id ?? ''} onChange={event => setSelected(sessions.data?.find(session => session.id === Number(event.target.value)) ?? null)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"><option value="" disabled>اختر جلسة</option>{sessions.data?.map(session => <option key={session.id} value={session.id}>{sessionLabel(session)} · {phaseLabels[session.state]}</option>)}</select></label>}

    {selected && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><b className="text-sm text-slate-900">{sessionLabel(selected)}</b><p className="mt-1 text-xs text-slate-500">{phaseLabels[selected.state]} · {roster.length} طالب</p></div>{canTransition && <button onClick={movePhase} disabled={transition.isPending} className="rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{actionLabels[selected.state]}</button>}</header>
      {transition.isError && <p className="m-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{errorMessage(transition.error)}</p>}
      <div className="grid gap-4 p-4 lg:grid-cols-[270px_1fr]">
        {selected.state !== 'finalized' && <div className="rounded-2xl bg-slate-50 p-4 text-center">{visibleImage ? <img src={visibleImage} alt={selected.state === 'check_out_open' ? 'رمز تسجيل الخروج' : 'رمز تسجيل الدخول'} className="mx-auto w-full max-w-[245px] rounded-xl bg-white p-2"/> : <div className="grid aspect-square place-items-center text-slate-400"><QrCode className="h-10 w-10"/></div>}<p className="mt-3 text-xs font-black text-teal-800">{selected.state === 'check_out_open' ? 'رمز الخروج' : selected.state === 'check_in_open' ? 'رمز الدخول' : 'انتظر فتح الخروج'}</p>{visibleImage && <p className="mt-1 text-[11px] text-slate-500">يتغير خلال {seconds} ثانية</p>}</div>}
        <div className={selected.state === 'finalized' ? 'lg:col-span-2' : ''}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat title="الطلبة" value={roster.length}/><Stat title="سجلوا الدخول" value={totals.checkedIn}/><Stat title="سجلوا الخروج" value={totals.checkedOut}/><Stat title={finalized ? 'غائبون' : 'لم يمسحوا'} value={finalized ? totals.absent : totals.unscanned}/></div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-amber-50 px-2.5 py-1.5 font-bold text-amber-800">متأخرون: {totals.late}</span><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">دخول دون خروج: {totals.incomplete}</span>{finalized && <span className="rounded-lg bg-teal-50 px-2.5 py-1.5 font-bold text-teal-800"><CheckCircle2 className="ml-1 inline h-3.5 w-3.5"/>اعتمدت {timeLabel(selected.finalized_at)}</span>}</div>
          <div className="mt-4 flex flex-wrap gap-1.5">{(['all', 'present', 'late', finalized ? 'absent' : 'unscanned', 'incomplete'] as RosterFilter[]).map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${filter === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 text-slate-600'}`}>{value === 'all' ? 'الكل' : statusLabel(value as RowStatus)}</button>)}</div>
          <div className="mt-3 max-h-[450px] overflow-auto rounded-xl border border-slate-200"><table className="w-full min-w-[550px] text-right text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">الطالب</th><th className="p-3">الدخول</th><th className="p-3">الخروج</th><th className="p-3">الحالة</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map(row => { const status = rowStatus(row, finalized); return <tr key={row.id}><td className="p-3"><div className="flex items-center gap-2"><SupervisorStudentPhoto student={row.student} ar/><span><b className="block text-slate-800">{row.student.full_name_ar}</b><small dir="ltr" className="text-slate-400">{row.student.university_number}</small></span></div></td><td className="p-3">{timeLabel(row.checked_in_at)}</td><td className="p-3">{timeLabel(row.checked_out_at)}</td><td className="p-3"><span className={status === 'late' ? 'font-bold text-amber-700' : status === 'absent' ? 'font-bold text-rose-700' : status === 'present' ? 'font-bold text-teal-700' : 'text-slate-500'}>{statusLabel(status)}</span>{status === 'late' && !row.checked_out_at && <small className="block text-slate-500">لم يسجل الخروج</small>}</td></tr>; })}</tbody></table>{!visibleRows.length && <p className="p-5 text-center text-xs text-slate-500">لا يوجد طلبة في هذا التصنيف.</p>}</div>
        </div>
      </div>
    </section>}
    {!selected && !workspace.isLoading && !sessions.isLoading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">اختر يوم الدوام لفتح جلسة QR، وستظهر هنا أسماء الطلبة ونتائجهم.</p>}
  </div>;
}

function Stat({ title, value }: { title: string; value: number }) {
  return <div className="rounded-xl bg-teal-50 p-3 text-center"><p className="text-lg font-black text-teal-800">{value}</p><p className="text-[11px] text-teal-700">{title}</p></div>;
}
