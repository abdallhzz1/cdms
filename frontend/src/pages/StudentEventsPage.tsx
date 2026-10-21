import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { CalendarDays, CheckCircle2, ClipboardList, MapPin, Pencil, Plus, QrCode, Search, Trash2, X } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Modal } from '@/components/ui/Modal';

type Level = 'first' | 'second' | 'third' | 'fourth' | 'fifth' | 'sixth';
type EventType = 'conference' | 'seminar' | 'lecture';
type EventStatus = 'draft' | 'published' | 'archived';
type Presenter = { name_ar: string; name_en: string; role_ar: string; role_en: string };
type StudentEvent = { id: number; public_id: string; type: EventType; title_ar: string; title_en: string;
  description_ar: string | null; description_en: string | null; location_ar: string; location_en: string;
  starts_at: string; ends_at: string; check_in_enabled: boolean;
  eligible_levels: Level[]; presenters: Presenter[] | null; poster_url: string | null;
  status: EventStatus; attendance_count: number };
type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };
type Attendance = { id: number; checked_in_at: string; source: 'qr' | 'manual';
  student: { university_number: string; full_name_ar: string; full_name_en: string | null; academic_level: Level } };
type EventForm = Pick<StudentEvent, 'type' | 'title_ar' | 'title_en' | 'description_ar' | 'description_en' | 'location_ar' | 'location_en' | 'eligible_levels'> &
  { starts_at: string; ends_at: string; presenters: Presenter[] };

const blank: EventForm = { type: 'lecture', title_ar: '', title_en: '', description_ar: '', description_en: '',
  location_ar: '', location_en: '', starts_at: '', ends_at: '',
  eligible_levels: ['fourth', 'fifth', 'sixth'], presenters: [] };
const toInput = (value: string) => new Date(value).toLocaleString('sv-SE', { timeZone: 'Asia/Hebron', hour12: false }).replace(' ', 'T').slice(0, 16);
const toServer = (value: string) => value.replace('T', ' ') + ':00';

export function StudentEventsPage() {
  const { locale } = useI18n(); const ar = locale === 'ar'; const tr = (a: string, e: string) => ar ? a : e;
  const { can } = useAuth(); const client = useQueryClient();
  const [scope, setScope] = useState<'upcoming' | 'past' | 'draft' | 'archived' | 'all'>('upcoming');
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<StudentEvent | null | 'new'>(null);
  const [form, setForm] = useState<EventForm>(blank);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<StudentEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentEvent | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const [showQr, setShowQr] = useState(false); const [qrImage, setQrImage] = useState('');
  const [showPoster, setShowPoster] = useState(false);
  const [posterPreviewUrl, setPosterPreviewUrl] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<StudentEvent | null>(null);
  const [qrError, setQrError] = useState(''); const [qrExpiry, setQrExpiry] = useState('');
  const [manualNumber, setManualNumber] = useState(''); const [reason, setReason] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const date = (value: string) => new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB',
    { timeZone: 'Asia/Hebron', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const title = (event: StudentEvent) => ar ? event.title_ar : event.title_en;
  const location = (event: StudentEvent) => ar ? event.location_ar : event.location_en;
  const typeLabel = (type: EventType) => ({ conference: tr('مؤتمر', 'Conference'), seminar: tr('ندوة', 'Seminar'), lecture: tr('محاضرة', 'Lecture') })[type];
  const levelLabel = (level: Level) => ({ first: tr('الأولى', 'Year 1'), second: tr('الثانية', 'Year 2'),
    third: tr('الثالثة', 'Year 3'), fourth: tr('الرابعة', 'Year 4'),
    fifth: tr('الخامسة', 'Year 5'), sixth: tr('السادسة', 'Year 6') })[level];
  const list = useQuery({ queryKey: ['student-events', scope, search, page], queryFn: () => apiFetch<Page<StudentEvent>>(
    `/student-events?scope=${scope}&search=${encodeURIComponent(search)}&page=${page}`) });
  const roster = useQuery({ queryKey: ['student-event-attendance', selected?.id, rosterPage], queryFn: () => apiFetch<Page<Attendance>>(
    `/student-events/${selected!.id}/attendance?page=${rosterPage}`), enabled: Boolean(selected),
    refetchInterval: selected?.status === 'published' && selected.check_in_enabled ? 3_000 : false,
    refetchIntervalInBackground: false });
  useEffect(() => {
    const total = roster.data?.total;
    if (!selected || total === undefined || total === selected.attendance_count) return;
    setSelected(current => current?.id === selected.id ? { ...current, attendance_count: total } : current);
    void client.invalidateQueries({ queryKey: ['student-events'] });
  }, [client, roster.data?.total, selected?.id, selected?.attendance_count]);
  const refresh = () => { void client.invalidateQueries({ queryKey: ['student-events'] });
    void client.invalidateQueries({ queryKey: ['student-event-attendance'] }); };
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(success); refresh(); return true; }
    catch (exception) { setError(exception instanceof Error ? exception.message : tr('تعذر إتمام العملية.', 'Could not complete the action.')); return false; }
    finally { setBusy(false); }
  };
  const edit = (event?: StudentEvent) => {
    setForm(event ? { type: event.type, title_ar: event.title_ar, title_en: event.title_en,
      description_ar: event.description_ar || '', description_en: event.description_en || '',
      location_ar: event.location_ar, location_en: event.location_en, starts_at: toInput(event.starts_at),
      ends_at: toInput(event.ends_at), eligible_levels: event.eligible_levels,
      presenters: (event.presenters ?? []).map(person => ({ ...person })) } :
      { ...blank, eligible_levels: [...blank.eligible_levels], presenters: [] });
    setEditing(event ?? 'new'); setPosterFile(null); setError('');
  };
  const updatePresenter = (index: number, key: keyof Presenter, value: string) => {
    setForm(current => ({ ...current, presenters: current.presenters.map((person, i) => i === index ? { ...person, [key]: value } : person) }));
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...form, starts_at: toServer(form.starts_at), ends_at: toServer(form.ends_at) };
    const wasNew = editing === 'new';
    const ok = await run(async () => {
      const saved = await apiFetch<StudentEvent>(`/student-events${editing && !wasNew ? `/${editing.id}` : ''}`,
        { method: wasNew ? 'POST' : 'PUT', body: payload });
      if (posterFile) {
        const body = new FormData(); body.append('poster', posterFile);
        try { await apiFetch(`/student-events/${saved.id}/poster`, { method: 'POST', body }); }
        catch {
          // Preserve the created record for a safe retry; a second save must update it, not create a duplicate.
          setEditing(saved);
          throw new Error(tr('حُفظت الفعالية، لكن تعذر رفع البوستر. حاول الحفظ مرة أخرى.',
            'The event was saved, but the poster upload failed. Save again to retry.'));
        }
      }
    }, tr('تم حفظ الفعالية.', 'Event saved.'));
    if (ok) { if (wasNew) setScope('draft'); setEditing(null); setPosterFile(null); }
  };
  const removePoster = async (event: StudentEvent) => {
    if (!window.confirm(tr('إزالة بوستر هذه الفعالية؟', 'Remove this event poster?'))) return;
    await run(async () => {
      const updated = await apiFetch<StudentEvent>(`/student-events/${event.id}/poster`, { method: 'DELETE' });
      setEditing(updated); setPosterFile(null);
    }, tr('تمت إزالة البوستر.', 'Poster removed.'));
  };
  const changeStatus = async (event: StudentEvent, status: EventStatus) => {
    const reason = status === 'archived' ? window.prompt(tr('سبب أرشفة الفعالية (10 أحرف على الأقل):', 'Reason for archiving (at least 10 characters):')) : undefined;
    if (status === 'archived' && (!reason || reason.trim().length < 10)) return;
    const ok = await run(() => apiFetch(`/student-events/${event.id}/status`, { method: 'POST', body: { status, reason } }),
      status === 'published' ? tr('تم نشر الفعالية.', 'Event published.') : tr('تم تحديث حالة الفعالية.', 'Event status updated.'));
    if (ok) { setSelected(null); setShowQr(false); setPublishTarget(null); if (status === 'published') { setScope('all'); setPage(1); } }
  };
  useEffect(() => {
    if (!posterPreviewUrl) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPosterPreviewUrl(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [posterPreviewUrl]);
  const toggleCheckIn = async (event: StudentEvent) => {
    const enabled = !event.check_in_enabled;
    await run(async () => {
      const updated = await apiFetch<StudentEvent>(`/student-events/${event.id}/check-in`,
        { method: 'POST', body: { enabled } });
      setSelected({ ...event, ...updated });
      setQrImage(''); setQrExpiry(''); setQrError('');
    }, enabled ? tr('فُتح تسجيل الحضور وظهر الباركود.', 'Check-in is open and the QR is visible.')
      : tr('أُغلق تسجيل الحضور وتوقف الباركود.', 'Check-in is closed and the QR is disabled.'));
  };
  const confirmDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || deleteConfirmation !== title(deleteTarget) || deleteReason.trim().length < 10) return;
    const ok = await run(() => apiFetch(`/student-events/${deleteTarget.id}`, { method: 'DELETE',
      body: { confirmation: deleteConfirmation, reason: deleteReason.trim() } }),
      tr('حُذفت الفعالية وكشف حضورها نهائيًا.', 'The event and its register were permanently deleted.'));
    if (ok) { setDeleteTarget(null); setDeleteConfirmation(''); setDeleteReason(''); }
  };
  const exportRoster = async (event: StudentEvent) => {
    setBusy(true); setError('');
    try {
      const rows: Attendance[] = [];
      let current = 1; let last = 1;
      do {
        const response = await apiFetch<Page<Attendance>>(`/student-events/${event.id}/attendance?page=${current}`);
        rows.push(...response.data); last = response.last_page; current++;
      } while (current <= last);
      const safe = (value: string) => {
        const escaped = /^[=+\-@]/.test(value) ? `'${value}` : value;
        return `"${escaped.replace(/"/g, '""')}"`;
      };
      const csv = [
        [tr('الرقم الجامعي','University number'),tr('الاسم','Name'),tr('السنة','Year'),tr('وقت الحضور','Checked in at'),tr('المصدر','Source')].map(safe).join(','),
        ...rows.map(row => [row.student.university_number, ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar,
          levelLabel(row.student.academic_level), date(row.checked_in_at), row.source].map(safe).join(',')),
      ].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `student-event-${event.id}-attendance.csv`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exception) { setError(exception instanceof Error ? exception.message : tr('تعذر تصدير الكشف.','Could not export the register.')); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!showQr || !selected?.check_in_enabled) return;
    let stopped = false;
    const refreshQr = async () => {
      try {
        const result = await apiFetch<{ token: string; expires_at: string }>(`/student-events/${selected.id}/qr`);
        const link = `${window.location.origin}/event-check-in?qr=${encodeURIComponent(result.token)}`;
        const image = await QRCode.toDataURL(link, { width: 440, margin: 2, color: { dark: '#164e53', light: '#ffffff' } });
        if (!stopped) { setQrImage(image); setQrExpiry(result.expires_at); setQrError(''); }
      } catch (exception) {
        if (stopped) return;
        setQrImage('');
        setQrError(exception instanceof Error ? exception.message : tr('تعذر عرض الرمز.', 'Could not display the code.'));
        try {
          const latest = await apiFetch<StudentEvent>(`/student-events/${selected.id}`);
          if (!stopped && !latest.check_in_enabled) setSelected(current => current?.id === latest.id ? { ...current, ...latest } : current);
        } catch { /* Keep the error visible if the event or connection is unavailable. */ }
      }
    };
    void refreshQr(); const timer = window.setInterval(refreshQr, 15_000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [showQr, selected?.id, selected?.check_in_enabled]);

  const field = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
  const pill = 'rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50';
  return <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 text-slate-900 sm:px-6 sm:py-7">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3"><span className="rounded-2xl bg-teal-50 p-3 text-teal-700"><CalendarDays className="h-6 w-6"/></span><div>
        <p className="text-xs font-bold text-teal-700">{tr('الحياة الأكاديمية', 'Academic life')}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{tr('فعاليات الكلية', 'College events')}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{tr('مؤتمرات وندوات ومحاضرات الكلية، مع كشف حضور مستقل لكل فعالية.', 'Faculty conferences, seminars and lectures, each with its own attendance register.')}</p>
      </div></div>
      {can('student_events.manage') && <button onClick={() => edit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"><Plus className="h-4 w-4"/>{tr('فعالية جديدة', 'New event')}</button>}
    </header>
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['upcoming','past','draft','all','archived'] as const).map(value => <button key={value} onClick={() => { setScope(value); setPage(1); setSelected(null); }}
          className={`rounded-xl px-4 py-2.5 text-xs font-bold ${scope === value ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{({ upcoming: tr('القادمة','Upcoming'), past: tr('السابقة','Past'), draft: tr('المسودات','Drafts'), all: tr('الكل','All'), archived: tr('الأرشيف','Archive') })[value]}</button>)}
        <label className="relative ms-auto min-w-[180px] flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
          <input aria-label={tr('ابحث عن فعالية','Search events')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder={tr('ابحث عن فعالية…','Search events…')} className="w-full rounded-xl border border-slate-200 py-2.5 pe-3 ps-9 text-sm outline-none focus:border-teal-500"/></label>
      </div>
    </section>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {list.isLoading ? <p className="p-8 text-center text-sm text-slate-500">{tr('جارٍ تحميل الفعاليات…','Loading events…')}</p> : list.isError ? <p role="alert" className="p-8 text-center text-sm text-rose-700">{tr('تعذر تحميل الفعاليات.','Could not load events.')}</p> : !list.data?.data.length ?
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-sm font-semibold text-slate-600">{tr('لا توجد فعاليات في هذا التصنيف.', 'No events in this view.')}</p></section> :
      <div className="grid gap-3 lg:grid-cols-2">{list.data.data.map(event => <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 sm:p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="text-xs font-bold text-teal-700">{typeLabel(event.type)} · {event.eligible_levels.map(levelLabel).join(ar ? '، ' : ', ')}</span><h2 className="mt-2 text-lg font-black leading-7">{title(event)}</h2></div>
          <div className="flex shrink-0 flex-col items-end gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${event.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{event.status === 'published' ? tr('منشورة','Published') : event.status === 'archived' ? tr('مؤرشفة','Archived') : tr('مسودة','Draft')}</span>
            {event.poster_url && <button type="button" aria-label={tr('عرض بوستر الفعالية','View event poster')} onClick={() => { setSelected(event); setShowPoster(true); setShowQr(false); setRosterPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 p-1 hover:border-teal-400"><img src={event.poster_url} alt="" loading="lazy" className="h-20 w-16 rounded-lg object-cover"/></button>}</div></div>
        <div className="mt-4 space-y-2 text-xs text-slate-600"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400"/>{date(event.starts_at)}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400"/>{location(event)}</p>
          {Boolean(event.presenters?.length) && <p className="font-semibold text-slate-700">{tr('المحاضرون والمقدّمون', 'Speakers & presenters')}: {event.presenters!.map(person => ar ? person.name_ar : person.name_en).join(ar ? '، ' : ', ')}</p>}
          {event.status === 'published' && <p className={`font-bold ${event.check_in_enabled ? 'text-emerald-700' : 'text-amber-700'}`}>{event.check_in_enabled ? tr('الحضور مفتوح الآن','Check-in open now') : tr('الحضور مغلق','Check-in closed')}</p>}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><button onClick={() => { setSelected(event); setShowQr(false); setShowPoster(false); setRosterPage(1); setError(''); }} className={pill}><ClipboardList className="me-1 inline h-4 w-4"/>{tr('الكشف','Register')} · {event.attendance_count}</button>
          {can('student_events.attendance.manage') && event.status === 'published' && <button onClick={() => { setSelected(event); setShowQr(true); setShowPoster(false); setRosterPage(1); setError(''); }} className={pill}><QrCode className="me-1 inline h-4 w-4"/>{tr('رمز الحضور','Check-in QR')}</button>}
          {can('student_events.manage') && event.status !== 'archived' && <button onClick={() => edit(event)} className={pill}><Pencil className="me-1 inline h-4 w-4"/>{tr('تعديل','Edit')}</button>}
        </div>
        {can('student_events.manage') && event.status === 'draft' && <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3"><p className="mb-2 text-xs leading-5 text-teal-900">{tr('هذه مسودة؛ لن تظهر للطلاب قبل نشرها. يبقى تسجيل الحضور مغلقًا بعد النشر حتى تفتحه بنفسك.', 'This is a draft. Students will not see it until published. Check-in stays closed until you open it yourself.')}</p><button type="button" disabled={busy} onClick={() => { setError(''); setPublishTarget(event); }} className="min-h-11 w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">{tr('نشر الفعالية للطلاب','Publish event for students')}</button></div>}
      </article>)}</div>}
    {list.data && list.data.last_page > 1 && <div className="flex justify-center gap-3"><button disabled={page <= 1} onClick={() => setPage(page-1)} className={pill}>{tr('السابق','Previous')}</button><span className="self-center text-xs text-slate-500">{page} / {list.data.last_page}</span><button disabled={page >= list.data.last_page} onClick={() => setPage(page+1)} className={pill}>{tr('التالي','Next')}</button></div>}

    <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? tr('إضافة فعالية','Create event') : tr('تعديل الفعالية','Edit event')} maxWidth="2xl">
      <form id="student-event-form" onSubmit={save} className="space-y-5 text-sm">
        <div className="grid gap-3 sm:grid-cols-2"><label>{tr('نوع الفعالية','Event type')}<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EventType })} className={field}><option value="lecture">{tr('محاضرة','Lecture')}</option><option value="seminar">{tr('ندوة','Seminar')}</option><option value="conference">{tr('مؤتمر','Conference')}</option></select></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label>{tr('العنوان بالعربية','Arabic title')}<input required lang="ar" value={form.title_ar} onChange={e => setForm({ ...form, title_ar: e.target.value })} className={field}/></label><label>{tr('العنوان بالإنجليزية','English title')}<input required lang="en" dir="ltr" value={form.title_en} onChange={e => setForm({ ...form, title_en: e.target.value })} className={field}/></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label>{tr('المكان بالعربية','Arabic location')}<input required value={form.location_ar} onChange={e => setForm({ ...form, location_ar: e.target.value })} className={field}/></label><label>{tr('المكان بالإنجليزية','English location')}<input required dir="ltr" value={form.location_en} onChange={e => setForm({ ...form, location_en: e.target.value })} className={field}/></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label>{tr('البداية','Starts')}<input required type="datetime-local" value={form.starts_at} onChange={e => {
          const start = e.target.value; const end = start ? new Date(new Date(start).getTime()+60*60*1000).toLocaleString('sv-SE').replace(' ','T').slice(0,16) : '';
          setForm({ ...form, starts_at: start, ends_at: form.ends_at || end }); }} className={field}/></label>
          <label>{tr('النهاية','Ends')}<input required type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className={field}/></label></div>
        <fieldset><legend className="mb-2 font-semibold">{tr('السنوات المشاركة','Eligible years')}</legend><div className="flex flex-wrap gap-2">{(['first','second','third','fourth','fifth','sixth'] as Level[]).map(level => <label key={level} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><input type="checkbox" checked={form.eligible_levels.includes(level)} onChange={e => setForm({ ...form, eligible_levels: e.target.checked ? [...form.eligible_levels, level] : form.eligible_levels.filter(item => item !== level) })}/>{levelLabel(level)}</label>)}</div></fieldset>
        <section className="space-y-3 rounded-2xl border border-slate-200 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold">{tr('المحاضرون والمقدّمون','Speakers & presenters')}</h3><p className="mt-1 text-xs text-slate-500">{tr('أضف شخصًا أو أكثر بالترتيب الذي تريد عرضه.', 'Add one or more people in display order.')}</p></div>
          <button type="button" disabled={form.presenters.length >= 10} onClick={() => setForm(current => ({ ...current, presenters: [...current.presenters, { name_ar: '', name_en: '', role_ar: '', role_en: '' }] }))} className={`${pill} disabled:opacity-50`}>{tr('إضافة مقدّم','Add presenter')}</button></div>
          {form.presenters.map((person, index) => <div key={index} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-600">{tr('المقدّم', 'Presenter')} {index + 1}</span><button type="button" onClick={() => setForm(current => ({ ...current, presenters: current.presenters.filter((_, i) => i !== index) }))} className="text-xs font-semibold text-rose-700">{tr('إزالة','Remove')}</button></div>
            <div className="grid gap-3 sm:grid-cols-2"><label>{tr('الاسم بالعربية','Arabic name')}<input required value={person.name_ar} onChange={e => updatePresenter(index, 'name_ar', e.target.value)} className={field}/></label><label>{tr('الاسم بالإنجليزية','English name')}<input required dir="ltr" value={person.name_en} onChange={e => updatePresenter(index, 'name_en', e.target.value)} className={field}/></label>
              <label>{tr('التخصص أو الصفة بالعربية (اختياري)','Arabic specialty or role (optional)')}<input value={person.role_ar} onChange={e => updatePresenter(index, 'role_ar', e.target.value)} className={field}/></label><label>{tr('التخصص أو الصفة بالإنجليزية (اختياري)','English specialty or role (optional)')}<input dir="ltr" value={person.role_en} onChange={e => updatePresenter(index, 'role_en', e.target.value)} className={field}/></label></div></div>)}</section>
        <section className="space-y-3 rounded-2xl border border-slate-200 p-3 sm:p-4"><div><h3 className="font-bold">{tr('بوستر الفعالية','Event poster')}</h3><p className="mt-1 text-xs text-slate-500">{tr('ارفع التصميم الجاهز بصيغة JPG أو PNG أو WebP، بحد أقصى 8 ميغابايت.', 'Upload the finished JPG, PNG or WebP artwork, up to 8 MB.')}</p></div>
          <input aria-label={tr('اختيار بوستر الفعالية','Choose event poster')} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0] ?? null; if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)) { setError(tr('اختر صورة JPG أو PNG أو WebP بحجم لا يتجاوز 8 ميغابايت.', 'Choose a JPG, PNG or WebP image no larger than 8 MB.')); e.target.value = ''; setPosterFile(null); return; } setError(''); setPosterFile(file); }} className="block w-full text-xs text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-bold file:text-teal-800"/>
          {posterFile && <p className="text-xs font-semibold text-teal-800">{tr('سيُرفع عند الحفظ:', 'Will upload on save:')} {posterFile.name}</p>}
          {editing && editing !== 'new' && editing.poster_url && <div className="flex flex-wrap items-start gap-3"><img src={editing.poster_url} alt={tr('بوستر الفعالية الحالي','Current event poster')} className="h-32 w-24 rounded-xl border border-slate-200 object-cover"/><button type="button" disabled={busy} onClick={() => void removePoster(editing)} className={`${pill} text-rose-700 disabled:opacity-50`}>{tr('إزالة البوستر الحالي','Remove current poster')}</button></div>}
        </section>
        <p className="rounded-xl bg-teal-50 p-3 text-xs text-teal-900">{tr('بعد النشر يبقى الحضور مغلقًا حتى تفتحه يدويًا من رمز الحضور، ويمكنك إغلاقه في أي وقت.', 'Publishing keeps check-in closed. Open it manually from the QR tab and close it whenever needed.')}</p>
        <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold text-slate-700">{tr('وصف اختياري','Optional description')}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>{tr('وصف عربي اختياري','Optional Arabic description')}<textarea value={form.description_ar || ''} onChange={e => setForm({ ...form, description_ar: e.target.value })} className={field}/></label>
          <label>{tr('وصف إنجليزي اختياري','Optional English description')}<textarea dir="ltr" value={form.description_en || ''} onChange={e => setForm({ ...form, description_en: e.target.value })} className={field}/></label></div></details>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className={pill}>{tr('إلغاء','Cancel')}</button><button disabled={busy || !form.eligible_levels.length} className="rounded-xl bg-teal-700 px-5 py-2.5 font-bold text-white disabled:opacity-50">{tr('حفظ الفعالية','Save event')}</button></div>
      </form>
    </Modal>

    <Modal isOpen={Boolean(selected)} onClose={() => { setSelected(null); setShowQr(false); setShowPoster(false); }} title={selected ? title(selected) : ''} maxWidth="2xl">
      {selected && <div className="space-y-5 text-sm"><div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><span>{date(selected.starts_at)}</span><span>·</span><span>{location(selected)}</span><span>·</span><span>{selected.eligible_levels.map(levelLabel).join(ar ? '، ' : ', ')}</span></div>
        {Boolean(selected.presenters?.length) && <section className="rounded-xl bg-slate-50 p-3"><h3 className="mb-2 text-xs font-bold text-slate-600">{tr('المحاضرون والمقدّمون','Speakers & presenters')}</h3><div className="flex flex-wrap gap-2">{selected.presenters!.map((person, index) => <div key={index} className="rounded-lg border border-slate-200 bg-white px-3 py-2"><b className="block text-sm">{ar ? person.name_ar : person.name_en}</b>{(ar ? person.role_ar : person.role_en) && <small className="text-slate-500">{ar ? person.role_ar : person.role_en}</small>}</div>)}</div></section>}
        <div className="flex flex-wrap gap-2"><button onClick={() => { setShowQr(false); setShowPoster(false); }} className={`${pill} ${!showQr && !showPoster ? 'border-teal-500 bg-teal-50 text-teal-800' : ''}`}>{tr('كشف الحضور','Attendance register')}</button>
          {selected.poster_url && <button onClick={() => { setShowQr(false); setShowPoster(true); }} className={`${pill} ${showPoster ? 'border-teal-500 bg-teal-50 text-teal-800' : ''}`}>{tr('البوستر','Poster')}</button>}
          {can('student_events.attendance.manage') && selected.status === 'published' && <button onClick={() => { setShowQr(true); setShowPoster(false); }} className={`${pill} ${showQr ? 'border-teal-500 bg-teal-50 text-teal-800' : ''}`}>{tr('رمز الحضور','Check-in QR')}</button>}
          {can('student_events.manage') && selected.status === 'draft' && <button disabled={busy} onClick={() => { setError(''); setSelected(null); setPublishTarget(selected); }} className={pill}>{tr('نشر الفعالية','Publish event')}</button>}
          {can('student_events.manage') && selected.status === 'published' && <button disabled={busy} onClick={() => void changeStatus(selected, 'archived')} className={pill}>{tr('أرشفة','Archive')}</button>}
          {can('student_events.delete') && <button disabled={busy} onClick={() => { setDeleteTarget(selected); setSelected(null); setShowQr(false); setShowPoster(false); setDeleteConfirmation(''); setDeleteReason(''); }} className={`${pill} inline-flex items-center gap-1 text-rose-700`}><Trash2 className="h-4 w-4"/>{tr('حذف نهائي','Delete permanently')}</button>}</div>
        {showPoster && selected.poster_url ? <div className="rounded-2xl bg-slate-50 p-3 text-center sm:p-5"><img src={selected.poster_url} alt={tr('بوستر الفعالية','Event poster')} className="mx-auto max-h-[65vh] w-auto max-w-full rounded-xl object-contain shadow-sm"/><button type="button" onClick={() => setPosterPreviewUrl(selected.poster_url)} className="mt-4 inline-block text-sm font-bold text-teal-800 underline">{tr('فتح البوستر بالحجم الكامل','Open full-size poster')}</button></div> : showQr ? <div className="rounded-2xl bg-teal-50 p-5 text-center">
          <p className={`font-bold ${selected.check_in_enabled ? 'text-emerald-800' : 'text-slate-700'}`}>{selected.check_in_enabled ? tr('الحضور مفتوح الآن','Check-in is open now') : tr('الحضور مغلق الآن','Check-in is closed')}</p>
          {can('student_events.attendance.manage') && <button type="button" disabled={busy} onClick={() => void toggleCheckIn(selected)} className={`mt-4 min-h-11 rounded-xl px-5 py-2.5 font-bold text-white disabled:opacity-50 ${selected.check_in_enabled ? 'bg-rose-700 hover:bg-rose-800' : 'bg-teal-700 hover:bg-teal-800'}`}>{selected.check_in_enabled ? tr('إغلاق الحضور وإيقاف الباركود','Close check-in and disable QR') : tr('فتح الحضور وإظهار الباركود','Open check-in and show QR')}</button>}
          {selected.check_in_enabled ? <><p className="mt-5 font-bold text-teal-900">{tr('امسح الرمز لتسجيل حضور هذه الفعالية','Scan to check in to this event')}</p>
            {qrImage ? <img src={qrImage} alt={tr('رمز الحضور المتجدد','Rotating check-in QR code')} className="mx-auto my-4 w-56 rounded-2xl bg-white p-3 shadow-sm sm:w-72"/> : <p className="my-8 text-rose-700">{qrError || tr('جارٍ تجهيز الرمز…','Preparing QR code…')}</p>}
            <p aria-live="polite" className="mb-3 text-sm font-bold text-teal-900">{tr('المسجلون الآن', 'Checked in')}: {roster.data?.total ?? selected.attendance_count}</p>
            <p className="text-xs text-teal-800">{tr('يتجدد الرمز تلقائيًا. لا تشارك صورته أو رابطه.','The code refreshes automatically. Do not share its image or link.')}</p><small className="mt-2 block text-teal-700">{qrExpiry ? tr('تنتهي صلاحية الرمز', 'Code expires') + ': ' + new Date(qrExpiry).toLocaleTimeString(ar ? 'ar-PS' : 'en-GB') : ''}</small></> :
            <p className="mt-4 text-xs text-slate-600">{tr('النشر لا يفتح الحضور تلقائيًا. اضغط فتح الحضور عند جاهزيتك؛ لا يقيّده وقت الفعالية.', 'Publishing does not open check-in. Open it when you are ready; the event schedule does not restrict it.')}</p>}</div> : <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 font-bold"><span>{tr('الحضور المسجل','Recorded attendance')} · {roster.data?.total ?? selected.attendance_count}</span><button disabled={busy} onClick={() => void exportRoster(selected)} className={pill}>{tr('تصدير الكشف CSV','Export CSV')}</button></div>
          {can('student_events.attendance.manage') && <form onSubmit={async e => { e.preventDefault(); const ok = await run(() => apiFetch(`/student-events/${selected.id}/attendance`, { method: 'POST', body: { university_number: manualNumber, reason } }), tr('تم إضافة الحضور.', 'Attendance added.')); if (ok) { setManualNumber(''); setReason(''); } }} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_2fr_auto]">
            <input required value={manualNumber} onChange={e => setManualNumber(e.target.value.replace(/\D/g,''))} placeholder={tr('الرقم الجامعي','University number')} aria-label={tr('الرقم الجامعي','University number')} className={field}/>
            <input required minLength={10} value={reason} onChange={e => setReason(e.target.value)} placeholder={tr('سبب الإضافة اليدوية','Reason for manual correction')} aria-label={tr('سبب الإضافة اليدوية','Reason for manual correction')} className={field}/>
            <button disabled={busy} className="mt-1.5 rounded-xl bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">{tr('إضافة حضور','Add attendance')}</button></form>}
          {roster.isLoading ? <p className="text-slate-500">{tr('جارٍ تحميل الكشف…','Loading register…')}</p> : roster.isError ? <p className="text-rose-700">{tr('تعذر تحميل الكشف.','Could not load register.')}</p> : !roster.data?.data.length ? <p className="rounded-xl border border-dashed border-slate-200 p-7 text-center text-slate-500">{tr('لم يسجل حضور بعد.','No check-ins yet.')}</p> :
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">{roster.data.data.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><div><b className="block text-xs">{ar ? item.student.full_name_ar : item.student.full_name_en || item.student.full_name_ar}</b><small className="text-slate-500" dir="ltr">{item.student.university_number} · {levelLabel(item.student.academic_level)}</small></div><div className="flex items-center gap-2"><small className="text-slate-500">{item.source === 'qr' ? tr('باركود','QR') : tr('يدوي','Manual')} · {new Date(item.checked_in_at).toLocaleTimeString(ar ? 'ar-PS' : 'en-GB')}</small>
              {can('student_events.attendance.manage') && <button type="button" aria-label={tr('إلغاء حضور الطالب','Void attendance')} onClick={async () => { const why = window.prompt(tr('سبب إلغاء الحضور (10 أحرف على الأقل):','Reason for voiding (at least 10 characters):')); if (why && why.trim().length >= 10) await run(() => apiFetch(`/student-events/${selected.id}/attendance/${item.id}/void`, { method: 'POST', body: { reason: why } }), tr('تم إلغاء الحضور مع حفظ سجل التدقيق.','Attendance voided with audit record.')); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4"/></button>}</div></div>)}</div>}
          {roster.data && roster.data.last_page > 1 && <div className="flex items-center justify-center gap-3"><button disabled={rosterPage <= 1} onClick={() => setRosterPage(rosterPage-1)} className={pill}>{tr('السابق','Previous')}</button><span className="text-xs">{rosterPage} / {roster.data.last_page}</span><button disabled={rosterPage >= roster.data.last_page} onClick={() => setRosterPage(rosterPage+1)} className={pill}>{tr('التالي','Next')}</button></div>}
        </>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}{notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-800"><CheckCircle2 className="h-4 w-4"/>{notice}</p>}
      </div>}
    </Modal>
    <Modal isOpen={Boolean(publishTarget)} onClose={() => setPublishTarget(null)} title={tr('نشر الفعالية','Publish event')} maxWidth="lg">
      {publishTarget && <div className="space-y-4 text-sm"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><b className="block text-base">{title(publishTarget)}</b><p className="mt-2 text-slate-600">{date(publishTarget.starts_at)} · {location(publishTarget)}</p></div>
        <p className="leading-6 text-slate-700">{tr('ستصبح الفعالية وبوسترها ظاهرين للطلاب. تسجيل الحضور سيبقى مغلقًا حتى تفتحه يدويًا من زر رمز الحضور.', 'The event and its poster will become visible to students. Check-in will remain closed until you open it manually from the QR control.')}</p>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setPublishTarget(null)} className={pill}>{tr('إلغاء','Cancel')}</button><button type="button" disabled={busy} onClick={() => void changeStatus(publishTarget, 'published')} className="min-h-11 rounded-xl bg-teal-700 px-5 py-2.5 font-bold text-white hover:bg-teal-800 disabled:opacity-50">{tr('تأكيد النشر','Confirm publication')}</button></div>
      </div>}
    </Modal>
    {posterPreviewUrl && <div role="dialog" aria-modal="true" aria-label={tr('بوستر الفعالية بالحجم الكامل','Full-size event poster')} className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 p-3 sm:p-6" onClick={() => setPosterPreviewUrl(null)}>
      <div className="mb-3 flex justify-end"><button type="button" onClick={() => setPosterPreviewUrl(null)} className="min-h-11 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900">{tr('إغلاق','Close')}</button></div>
      <img src={posterPreviewUrl} alt={tr('بوستر الفعالية','Event poster')} onClick={event => event.stopPropagation()} className="m-auto max-h-[calc(100dvh-6rem)] max-w-full rounded-lg object-contain"/>
    </div>}
    <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={tr('حذف الفعالية نهائيًا','Permanently delete event')} maxWidth="lg">
      {deleteTarget && <form onSubmit={confirmDelete} className="space-y-4 text-sm">
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 leading-6 text-rose-900">{tr(
          'سيُحذف سجل الفعالية وكشف حضورها بالكامل، سواء كانت مسودة أو منشورة أو مؤرشفة. لا يمكن التراجع عن هذا الإجراء.',
          'The event and its entire attendance register will be deleted, whether draft, published or archived. This cannot be undone.')}</p>
        <p className="font-bold">{title(deleteTarget)} · {tr('الحضور المسجل','Recorded attendance')}: {deleteTarget.attendance_count}</p>
        <label className="block font-semibold">{tr('اكتب عنوان الفعالية للتأكيد','Type the event title to confirm')}
          <input required value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} className={field}/></label>
        <label className="block font-semibold">{tr('سبب الحذف الإداري (10 أحرف على الأقل)','Administrative reason (at least 10 characters)')}
          <textarea required minLength={10} maxLength={1000} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} className={field}/></label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className={pill}>{tr('إلغاء','Cancel')}</button>
          <button disabled={busy || deleteConfirmation !== title(deleteTarget) || deleteReason.trim().length < 10}
            className="rounded-xl bg-rose-700 px-5 py-2.5 font-bold text-white disabled:opacity-40">{tr('حذف الفعالية وكشفها نهائيًا','Delete event and register permanently')}</button></div>
      </form>}
    </Modal>
  </main>;
}
