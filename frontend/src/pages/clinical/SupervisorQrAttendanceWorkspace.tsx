import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { CalendarDays, CheckCircle2, QrCode, Users } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { formatDate, formatWeekday, groupName, groupSupervisorAssignments, preferredDate, type SupervisorGroup, type Workspace } from './supervisorWorkspace';
import { getQrPayload, getQrSession, getQrSessions, openQrSession, transitionQrSession, type QrSession } from '@/api/clinicalQrAttendance';

const labels: Record<string, string> = { check_in_open: 'إغلاق تسجيل الدخول', check_in_closed: 'فتح تسجيل الخروج', check_out_open: 'إنهاء واعتماد الجلسة' };
const actions: Record<string, string> = { check_in_open: 'close_check_in', check_in_closed: 'open_check_out', check_out_open: 'finalize' };

export function SupervisorQrAttendanceWorkspace() {
  const client = useQueryClient();
  const [selected, setSelected] = useState<QrSession | null>(null);
  const [groupKey, setGroupKey] = useState('');
  const [date, setDate] = useState('');
  const [image, setImage] = useState('');
  const [expires, setExpires] = useState(0);
  const workspace = useQuery({ queryKey: ['supervisor-workspace'], queryFn: () => apiFetch<Workspace>('/operational/my-supervisor-workspace') });
  const sessions = useQuery({ queryKey: ['qr-sessions'], queryFn: getQrSessions });
  const groups = useMemo(() => groupSupervisorAssignments(workspace.data?.assignments ?? []), [workspace.data]);
  const group = groups.find(item => item.key === groupKey) ?? null;
  const days = group?.scheduledDates ?? [];

  useEffect(() => { if (!groupKey && groups[0]) setGroupKey(groups[0].key); }, [groups, groupKey]);
  useEffect(() => { if (days.length) setDate(current => days.includes(current) ? current : preferredDate(days)); else setDate(''); }, [groupKey, days]);
  useEffect(() => { if (!selected && sessions.data?.[0]) setSelected(sessions.data[0]); }, [sessions.data, selected]);
  useEffect(() => {
    if (!selected || !['check_in_open', 'check_out_open'].includes(selected.state)) return;
    let stopped = false;
    const refresh = async () => { try { const payload = await getQrPayload(selected.id); if (!stopped) { setImage(await QRCode.toDataURL(payload.token, { margin: 1, width: 300, color: { dark: '#123743', light: '#ffffff' } })); setExpires(new Date(payload.expires_at).getTime()); } } catch { setImage(''); } };
    void refresh(); const timer = window.setInterval(refresh, 15_000); return () => { stopped = true; window.clearInterval(timer); };
  }, [selected?.id, selected?.state]);
  useEffect(() => { if (!selected) return; const timer = window.setInterval(() => { if (!document.hidden) void getQrSession(selected.id).then(setSelected); }, 5_000); return () => window.clearInterval(timer); }, [selected?.id]);

  const open = useMutation({ mutationFn: () => openQrSession(group!.assignmentId, date), onSuccess: session => { setSelected(session); void client.invalidateQueries({ queryKey: ['qr-sessions'] }); } });
  const transition = useMutation({ mutationFn: () => transitionQrSession(selected!.id, actions[selected!.state]), onSuccess: session => { setSelected(session); void client.invalidateQueries({ queryKey: ['qr-sessions'] }); } });
  const roster = selected?.roster ?? [];
  const counts = useMemo(() => ({ checkedIn: roster.filter(row => row.checked_in_at).length, checkedOut: roster.filter(row => row.checked_out_at).length }), [roster]);
  const seconds = Math.max(0, Math.ceil((expires - Date.now()) / 1000));

  return <div dir="rtl" className="mx-auto max-w-5xl space-y-5 pb-12">
    <header><h1 className="text-xl font-black text-slate-900">الحضور السريري عبر QR</h1><p className="mt-1 text-sm text-slate-500">اختر مجموعتك ويوم دوامك، ثم افتح التسجيل للطلبة.</p></header>
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-black text-slate-600"><span className="mb-1.5 flex items-center gap-1.5"><Users className="h-4 w-4 text-teal-700"/>المجموعة المكلف بها</span><select value={groupKey} onChange={event => setGroupKey(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500"><option value="">اختر المجموعة</option>{groups.map(item => <option key={item.key} value={item.key}>{groupLabel(item)}</option>)}</select></label>
      <label className="text-xs font-black text-slate-600"><span className="mb-1.5 flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-teal-700"/>يوم الدوام المجدول</span><select disabled={!days.length} value={date} onChange={event => setDate(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500 disabled:bg-slate-50 disabled:text-slate-400">{days.length ? days.map(day => <option key={day} value={day}>{formatWeekday(day, true)} — {formatDate(day, true)}</option>) : <option>لا توجد أيام دوام مجدولة لهذه المجموعة</option>}</select></label>
    </div>{group && <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-lg bg-teal-50 px-2.5 py-1.5 font-bold text-teal-800">{group.siteAr}</span><span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-600">{group.students.length} طالب</span></div>}<button disabled={!group || !date || open.isPending} onClick={() => open.mutate()} className="mt-4 h-11 w-full rounded-xl bg-teal-700 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">فتح تسجيل الدخول</button>{open.isError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">تعذر فتح الجلسة. حدّث الصفحة ثم أعد المحاولة.</p>}</section>
    {selected && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><b>جلسة {selected.session_date}</b><p className="mt-1 text-xs text-slate-500">{selected.training_site?.name_ar} · {selected.state}</p></div><button onClick={() => transition.mutate()} disabled={transition.isPending || selected.state === 'finalized'} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{labels[selected.state] ?? 'تم اعتماد الجلسة'}</button></div><div className="grid gap-5 p-5 md:grid-cols-[330px_1fr]"><div className="rounded-2xl bg-slate-50 p-4 text-center">{image ? <img src={image} alt="رمز حضور متغير" className="mx-auto w-full max-w-[260px] rounded-xl bg-white p-2"/> : <div className="grid aspect-square place-items-center text-slate-400"><QrCode className="h-12 w-12"/></div>}<p className="mt-3 text-xs font-bold text-teal-800">{selected.state === 'check_out_open' ? 'تسجيل الخروج' : 'تسجيل الدخول'} · يتغير خلال {seconds} ث</p></div><div><div className="grid grid-cols-3 gap-2"><Stat title="الطلبة" value={roster.length}/><Stat title="سجلوا الدخول" value={counts.checkedIn}/><Stat title="سجلوا الخروج" value={counts.checkedOut}/></div><div className="mt-4 max-h-72 overflow-auto divide-y rounded-xl border">{roster.map(row => <div key={row.id} className="flex items-center justify-between gap-3 p-3 text-xs"><div><b>{row.student.full_name_ar}</b><span dir="ltr" className="mr-2 text-slate-400">{row.student.university_number}</span></div><span className={row.checked_out_at ? 'text-emerald-700' : row.checked_in_at ? 'text-amber-700' : 'text-slate-400'}>{row.checked_out_at ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5"/>اكتمل</span> : row.checked_in_at ? 'سجل الدخول' : 'لم يمسح بعد'}</span></div>)}</div></div></div></section>}
  </div>;
}

function groupLabel(group: SupervisorGroup): string { return `${groupName(group, true)} — ${group.siteAr}`; }
function Stat({ title, value }: { title: string; value: number }) { return <div className="rounded-xl bg-teal-50 p-3 text-center"><p className="text-lg font-black text-teal-800">{value}</p><p className="text-[11px] text-teal-700">{title}</p></div>; }
