import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { ArrowRight, CalendarDays, CheckCircle2, Expand, QrCode, Users, X } from 'lucide-react';
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

function rowStatus(row: QrRoster, finalized: boolean, checkOutOpen: boolean): RowStatus {
  if (row.outcome === 'excused') return 'excused';
  if (!row.checked_in_at) return finalized ? 'absent' : 'unscanned';
  if (row.outcome === 'late') return 'late';
  if ((finalized || checkOutOpen) && !row.checked_out_at) return 'incomplete';
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
  const [qrExpanded, setQrExpanded] = useState(false);

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
  useEffect(() => setQrExpanded(false), [selected?.id, selected?.state]);
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
        const dataUrl = await QRCode.toDataURL(link, { margin: 2, width: 640, color: { dark: '#102f38', light: '#ffffff' } });
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
  const checkOutOpen = selected?.state === 'check_out_open';
  const totals = useMemo(() => ({
    present: roster.filter(row => rowStatus(row, finalized, checkOutOpen) === 'present').length,
    late: roster.filter(row => rowStatus(row, finalized, checkOutOpen) === 'late').length,
    absent: roster.filter(row => rowStatus(row, finalized, checkOutOpen) === 'absent').length,
    unscanned: roster.filter(row => rowStatus(row, finalized, checkOutOpen) === 'unscanned').length,
    incomplete: roster.filter(row => Boolean(row.checked_in_at) && !row.checked_out_at).length,
    checkedIn: roster.filter(row => row.checked_in_at).length,
    checkedOut: roster.filter(row => row.checked_out_at).length,
  }), [roster, finalized, checkOutOpen]);
  const visibleRows = roster.filter(row => filter === 'all' || (filter === 'incomplete' ? Boolean(row.checked_in_at && !row.checked_out_at) : rowStatus(row, finalized, checkOutOpen) === filter));
  const visibleImage = imagePhase === selected?.state && expires > nowMs ? image : '';
  const seconds = Math.max(0, Math.ceil((expires - nowMs) / 1000));
  const canTransition = selected && Boolean(actions[selected.state]);
  const movePhase = () => {
    if (selected?.state === 'check_out_open' && !window.confirm(`اعتماد الجلسة؟ سجل الدخول ${totals.checkedIn} من ${roster.length}، ولم يسجل الخروج ${totals.incomplete}.`)) return;
    transition.mutate();
  };

  return <div dir="rtl" className="mx-auto w-full min-w-0 max-w-6xl space-y-4 pb-14">
    <header className="space-y-2">
      <Link to="/supervisor/portal" className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800"><ArrowRight className="h-4 w-4"/>لوحة المشرف</Link>
      <h1 className="text-xl font-black text-slate-900">الحضور السريري عبر QR</h1>
      <p className="text-xs leading-5 text-slate-500 sm:text-sm">اختر يوم الدوام والمجموعة، واعرض الرمز للطلبة ليمسحوه بكاميرا الهاتف.</p>
    </header>

    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <label className="block min-w-0 text-xs font-black text-slate-600"><span className="mb-1.5 flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-teal-700"/>يوم الدوام</span><select disabled={!days.length} value={date} onChange={event => setDate(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold disabled:bg-slate-50">{days.length ? days.map(day => <option key={day} value={day}>{formatWeekday(day, true)} — {formatDate(day, true)}</option>) : <option value="">لا توجد أيام دوام منشورة</option>}</select></label>
        <label className="block min-w-0 text-xs font-black text-slate-600"><span className="mb-1.5 flex items-center gap-1.5"><Users className="h-4 w-4 text-teal-700"/>مجموعة هذا اليوم</span><select disabled={!scheduledGroups.length} value={groupKey} onChange={event => setGroupKey(event.target.value)} className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold disabled:bg-slate-50">{scheduledGroups.length ? scheduledGroups.map(item => <option key={item.key} value={item.key}>{groupLabel(item)}</option>) : <option value="">لا توجد مجموعة لهذا اليوم</option>}</select></label>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-600">{group ? `${group.students.length} طالب · ${group.siteAr}` : 'راجع الجدول المنشور وأيام عملك.'}</p>{(!existingSession || selected?.id !== existingSession.id) && <button disabled={!group || !date || open.isPending || sessions.isLoading} onClick={() => existingSession ? setSelected(existingSession) : open.mutate()} className="min-h-11 w-full rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50 sm:w-auto">{existingSession ? 'عرض جلسة هذا اليوم' : 'فتح تسجيل الدخول'}</button>}</div>
      {(workspace.isError || sessions.isError || open.isError) && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{open.isError ? errorMessage(open.error) : 'تعذر تحميل جدولك أو الجلسات. حدّث الصفحة.'}</p>}
    </section>

    {(sessions.data?.length ?? 0) > 0 && <details className="group min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600"><summary className="cursor-pointer">عرض جلسة أخرى</summary><label className="mt-3 block min-w-0">جلساتي السابقة والحالية<select value={selected?.id ?? ''} onChange={event => setSelected(sessions.data?.find(session => session.id === Number(event.target.value)) ?? null)} className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"><option value="" disabled>اختر جلسة</option>{sessions.data?.map(session => <option key={session.id} value={session.id}>{sessionLabel(session)} · {phaseLabels[session.state]}</option>)}</select></label></details>}

    {selected && <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 p-3.5 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-2"><div className="min-w-0"><b className="block text-sm leading-6 text-slate-900">{sessionLabel(selected)}</b><p className="mt-1 text-xs text-slate-500">{roster.length} طالب في الجلسة</p></div><span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-800">{phaseLabels[selected.state]}</span></div>
        {canTransition && <button onClick={movePhase} disabled={transition.isPending} className="mt-3 min-h-11 w-full rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50 sm:w-auto">{actionLabels[selected.state]}</button>}
      </header>
      {transition.isError && <p className="m-3.5 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{errorMessage(transition.error)}</p>}
      <div className={`grid min-w-0 gap-4 p-3.5 sm:p-5 ${finalized ? '' : 'lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]'}`}>
        {!finalized && <div className="min-w-0 self-start rounded-2xl border border-teal-100 bg-gradient-to-b from-teal-50 to-white p-3.5 text-center sm:p-5">
          {selected.state === 'check_in_closed' ? <div className="flex min-h-48 flex-col items-center justify-center gap-3"><QrCode className="h-10 w-10 text-teal-700"/><b className="text-sm text-slate-800">انتهى تسجيل الدخول</b><p className="text-xs leading-5 text-slate-500">عند نهاية الدوام اضغط «فتح الخروج» لعرض رمز الخروج.</p></div> : <>
            <p className="mb-3 text-sm font-black text-teal-900">{selected.state === 'check_out_open' ? 'امسح رمز الخروج' : 'امسح رمز الدخول'}</p>
            <div className="mx-auto w-full max-w-[340px] rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-teal-100 sm:p-3">
              {visibleImage ? <img src={visibleImage} alt={selected.state === 'check_out_open' ? 'رمز تسجيل الخروج' : 'رمز تسجيل الدخول'} className="block aspect-square w-full object-contain"/> : <div className="grid aspect-square place-items-center text-slate-400"><QrCode className="h-10 w-10"/><span className="sr-only">جارٍ تجهيز الرمز الحالي</span></div>}
            </div>
            <p className="mt-3 text-xs font-bold text-slate-600">وجّه كاميرا هاتف الطالب نحو الرمز</p>
            <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-slate-500"><span>{visibleImage ? `يتجدد خلال ${seconds} ثانية` : 'جارٍ تحديث الرمز…'}</span>{visibleImage && <button type="button" onClick={() => setQrExpanded(true)} className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-white px-2.5 py-1.5 font-bold text-teal-800"><Expand className="h-3.5 w-3.5"/>تكبير الرمز</button>}</div>
          </>}
        </div>}
        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat title="الطلبة" value={roster.length}/><Stat title="سجلوا الدخول" value={totals.checkedIn}/><Stat title="سجلوا الخروج" value={totals.checkedOut}/><Stat title={finalized ? 'غائبون' : 'لم يمسحوا'} value={finalized ? totals.absent : totals.unscanned}/></div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-lg bg-amber-50 px-2.5 py-1.5 font-bold text-amber-800">متأخرون: {totals.late}</span><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-bold text-slate-700">دخول دون خروج: {totals.incomplete}</span>{finalized && <span className="rounded-lg bg-teal-50 px-2.5 py-1.5 font-bold text-teal-800"><CheckCircle2 className="ml-1 inline h-3.5 w-3.5"/>اعتمدت {timeLabel(selected.finalized_at)}</span>}</div>
          <div className="mt-4 flex min-w-0 gap-1.5 overflow-x-auto pb-1">{(['all', 'present', 'late', finalized ? 'absent' : 'unscanned', 'incomplete'] as RosterFilter[]).map(value => <button key={value} onClick={() => setFilter(value)} className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-2 text-[11px] font-bold ${filter === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 text-slate-600'}`}>{value === 'all' ? 'الكل' : value === 'present' && !finalized ? 'سجلوا' : statusLabel(value as RowStatus)}</button>)}</div>
          <RosterResults rows={visibleRows} finalized={finalized} checkOutOpen={checkOutOpen}/>
        </div>
      </div>
    </section>}
    {qrExpanded && selected && <div role="dialog" aria-modal="true" aria-label="رمز الحضور المكبر" className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-white p-4 text-center">
      <button type="button" onClick={() => setQrExpanded(false)} aria-label="إغلاق الرمز المكبر" className="absolute left-4 top-4 rounded-xl border border-slate-200 p-2.5 text-slate-700"><X className="h-5 w-5"/></button>
      <p className="mb-4 text-lg font-black text-slate-900">{selected.state === 'check_out_open' ? 'رمز تسجيل الخروج' : 'رمز تسجيل الدخول'}</p>
      <div className="w-full max-w-[min(90vw,520px)] rounded-2xl border border-teal-100 bg-white p-2 shadow-sm">{visibleImage ? <img src={visibleImage} alt="رمز الحضور المكبر" className="block aspect-square w-full object-contain"/> : <div className="grid aspect-square place-items-center text-slate-500">جارٍ تحديث الرمز…</div>}</div>
      <p className="mt-4 text-sm font-bold text-teal-800">{visibleImage ? `يتجدد خلال ${seconds} ثانية` : 'انتظر الرمز الجديد'}</p>
    </div>}
    {!selected && !workspace.isLoading && !sessions.isLoading && <p className="rounded-xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500">اختر يوم الدوام لفتح جلسة QR، وستظهر هنا أسماء الطلبة ونتائجهم.</p>}
  </div>;
}

function Stat({ title, value }: { title: string; value: number }) {
  return <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-2 py-2.5 text-center"><p className="text-lg font-black leading-none text-teal-900">{value}</p><p className="mt-1 text-[11px] font-bold text-teal-800">{title}</p></div>;
}

function RosterResults({ rows, finalized, checkOutOpen }: { rows: QrRoster[]; finalized: boolean; checkOutOpen: boolean }) {
  const statusFor = (row: QrRoster) => rowStatus(row, finalized, checkOutOpen);
  const labelFor = (row: QrRoster) => {
    const status = statusFor(row);
    return status === 'present' && !finalized ? row.checked_out_at ? 'سجل الخروج' : 'سجل الدخول' : statusLabel(status);
  };
  const toneFor = (row: QrRoster) => {
    const status = statusFor(row);
    return status === 'late' ? 'bg-amber-50 text-amber-800' : status === 'absent' ? 'bg-rose-50 text-rose-700' : status === 'present' ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600';
  };

  if (!rows.length) return <p className="mt-3 rounded-xl border border-slate-200 p-5 text-center text-xs text-slate-500">لا يوجد طلبة في هذا التصنيف.</p>;

  return <div className="mt-3 min-w-0">
    <div className="space-y-2 md:hidden">{rows.map(row => <article key={row.id} className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex min-w-0 items-center justify-between gap-2 p-3"><div className="flex min-w-0 items-center gap-2.5"><SupervisorStudentPhoto student={row.student} ar/><span className="min-w-0"><b className="block truncate text-xs text-slate-900">{row.student.full_name_ar}</b><small dir="ltr" className="block text-[10px] text-slate-500">{row.student.university_number}</small></span></div><span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${toneFor(row)}`}>{labelFor(row)}</span></div>
      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-[11px]"><span className="text-slate-500">الدخول <b className="mr-1 text-slate-800">{timeLabel(row.checked_in_at)}</b></span><span className="text-slate-500">الخروج <b className="mr-1 text-slate-800">{timeLabel(row.checked_out_at)}</b></span></div>
      {statusFor(row) === 'late' && !row.checked_out_at && <p className="px-3 py-1.5 text-[10px] text-slate-500">لم يسجل الخروج بعد</p>}
    </article>)}</div>
    <div className="hidden max-h-[520px] overflow-auto rounded-xl border border-slate-200 md:block"><table className="w-full min-w-[540px] text-right text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">الطالب</th><th className="p-3">الدخول</th><th className="p-3">الخروج</th><th className="p-3">الحالة</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}><td className="p-3"><div className="flex items-center gap-2"><SupervisorStudentPhoto student={row.student} ar/><span><b className="block text-slate-800">{row.student.full_name_ar}</b><small dir="ltr" className="text-slate-400">{row.student.university_number}</small></span></div></td><td className="p-3">{timeLabel(row.checked_in_at)}</td><td className="p-3">{timeLabel(row.checked_out_at)}</td><td className="p-3"><span className={`rounded-lg px-2 py-1 font-bold ${toneFor(row)}`}>{labelFor(row)}</span>{statusFor(row) === 'late' && !row.checked_out_at && <small className="mt-1 block text-slate-500">لم يسجل الخروج</small>}</td></tr>)}</tbody></table></div>
  </div>;
}
