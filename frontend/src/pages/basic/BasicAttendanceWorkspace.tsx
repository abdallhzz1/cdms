import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { basicLocale, basicText as bt } from '@/i18n/basicAttendance';
import { parseRoster, rosterTemplate, type RosterStudent } from './rosterFile';

type Course = { id: number; code: string; name: string; academic_level: string };
type Section = { id: number; course_id: number; course_name: string; course_code: string; number: string; academic_year: string; semester: string; is_active: boolean; students_count: number; lecturers: { id: number; name: string }[]; active_session: Session | null };
type Session = { id: number; title: string; state: string; mode: string; opened_at: string };
type Student = { id: number; name: string; university_number: string; email: string; photo_url?: string | null };
type RecordRow = { student_id: number; session_id: number; status: string; is_late: boolean };
type Report = { sessions: Session[]; students: Student[]; records: RecordRow[]; pagination: { offset: number; total: number; per_page: number } };
const direction = () => basicLocale() === 'ar' ? 'rtl' : 'ltr';
const displayDate = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T')).toLocaleDateString(basicLocale());
const surface = 'rounded-2xl border border-slate-200 bg-white';

function Shell({ title, subtitle, children, back }: { title: string; subtitle?: string; children: React.ReactNode; back?: string }) {
  return <main dir={direction()} className="mx-auto max-w-6xl space-y-5 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
      <div>{back && <Link className="mb-2 inline-block text-sm font-semibold text-teal-700" to={back}>{bt('workBack')}</Link>}
        <p className="text-xs font-semibold text-teal-700">{bt('text017')}</p><h1 className="mt-1 text-2xl font-black text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{subtitle}</p>}</div>
    </header>{children}
  </main>;
}

function Notice({ error, children }: { error?: boolean; children: React.ReactNode }) {
  return <p role={error ? 'alert' : 'status'} className={`rounded-xl p-3 text-sm leading-6 ${error ? 'bg-red-50 text-red-800' : 'bg-teal-50 text-teal-900'}`}>{children}</p>;
}

function useSections() {
  const { user, can } = useAuth();
  return useQuery({ queryKey: ['basic-sections', user?.id], queryFn: () => apiFetch<Section[]>('/basic-attendance/sections'), enabled: can('basic_attendance.view') });
}

function SectionNav({ sectionId, current }: { sectionId: number; current: 'lectures' | 'roster' | 'report' }) {
  const { can } = useAuth();
  const tabs = [
    { id: 'lectures', to: `/basic-attendance/sections/${sectionId}`, text: bt('workLectures') },
    ...(can('basic_attendance.manage') ? [{ id: 'roster', to: `/basic-attendance/sections/${sectionId}/roster`, text: bt('workRoster') }] : []),
    { id: 'report', to: `/basic-attendance/sections/${sectionId}/report`, text: bt('workReport') },
  ];
  return <nav aria-label={bt('workSectionNav')} className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">{tabs.map(tab =>
    <Link key={tab.id} aria-current={current === tab.id ? 'page' : undefined} to={tab.to} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${current === tab.id ? 'bg-teal-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{tab.text}</Link>)}</nav>;
}

export function BasicAttendanceHome() {
  const { can } = useAuth(); const sections = useSections(); const [search, setSearch] = useState('');
  if (!can('basic_attendance.view')) return <ErrorState />;
  return <Shell title={bt('text018')} subtitle={bt('workHomeIntro')}>
    {can('basic_attendance.manage') && <div className="flex justify-end"><Link className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-teal-800" to="/basic-attendance/setup/courses">{bt('workSetup')}</Link></div>}
    <div className={surface + ' p-4 sm:p-5'}><label className="block max-w-lg text-sm font-semibold text-slate-700">{bt('text022')}
      <input className="input mt-2" value={search} onChange={e => setSearch(e.target.value)} placeholder={bt('text023')} /></label></div>
    {sections.isLoading ? <LoadingState /> : sections.isError ? <ErrorState onRetry={() => sections.refetch()} /> : <section className={surface + ' divide-y divide-slate-100 overflow-hidden'}>
      {(sections.data ?? []).filter(s => `${s.course_name} ${s.course_code} ${s.number} ${s.academic_year}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(s =>
        <Link key={s.id} to={`/basic-attendance/sections/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5">
          <div><p className="text-lg font-black text-slate-900">{bt('workSectionNumber', { number: s.number })}</p><p className="mt-1 text-sm font-medium text-slate-700">{s.course_name} · {s.course_code}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{s.academic_year} · {s.students_count} {bt('text055')} · {s.lecturers.map(l => l.name).join(bt('text026'))}</p></div>
          <span className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800">{!s.is_active ? bt('text027') : s.active_session ? bt('workActiveLecture') : bt('workOpenSection')}</span>
        </Link>)}
      {sections.data?.length === 0 && <p className="p-8 text-center text-sm text-slate-500">{bt('text030')}</p>}
      {!!sections.data?.length && !sections.data.some(s => `${s.course_name} ${s.course_code} ${s.number} ${s.academic_year}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="p-8 text-center text-sm text-slate-500">{bt('workNoSearch')}</p>}
    </section>}
  </Shell>;
}

export function BasicAttendanceSetup() {
  const { can } = useAuth(); const location = useLocation(); const qc = useQueryClient();
  const mode = location.pathname.endsWith('/sections') ? 'sections' : 'courses';
  const sections = useSections();
  const options = useQuery({ queryKey: ['basic-options'], queryFn: () => apiFetch<{ courses: Course[]; lecturers: { id: number; name: string }[] }>('/basic-attendance/options'), enabled: can('basic_attendance.manage') });
  const [course, setCourse] = useState({ code: '', name: '', academic_level: 'first' });
  const [form, setForm] = useState({ id: 0, course_id: 0, number: '', academic_year: '', semester: 'first', is_active: true, lecturer_ids: [] as number[] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function save(action: () => Promise<unknown>) { setBusy(true); setError(''); setNotice(''); try { await action(); setNotice(bt('text014')); await Promise.all([qc.invalidateQueries({ queryKey: ['basic-options'] }), qc.invalidateQueries({ queryKey: ['basic-sections'] })]); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  if (!can('basic_attendance.manage')) return <ErrorState />;
  return <Shell title={bt('workSetup')} subtitle={bt('workSetupIntro')} back="/basic-attendance">
    <nav className="flex flex-wrap gap-2"><Link className={`rounded-xl px-4 py-2 text-sm font-bold ${mode === 'courses' ? 'bg-teal-800 text-white' : 'bg-white text-teal-800'}`} to="/basic-attendance/setup/courses">{bt('workCourses')}</Link><Link className={`rounded-xl px-4 py-2 text-sm font-bold ${mode === 'sections' ? 'bg-teal-800 text-white' : 'bg-white text-teal-800'}`} to="/basic-attendance/setup/sections">{bt('workSections')}</Link></nav>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {options.isLoading ? <LoadingState /> : options.isError ? <ErrorState onRetry={() => options.refetch()} /> : mode === 'courses' ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
      <section className={surface + ' p-5'}><h2 className="font-bold">{bt('workCourses')}</h2><div className="mt-4 divide-y divide-slate-100">{options.data?.courses.map(c => <p key={c.id} className="py-3 text-sm"><b>{c.name}</b><span className="ms-2 text-slate-500">{c.code}</span></p>)}{!options.data?.courses.length && <p className="py-3 text-sm text-slate-500">{bt('workNoCourses')}</p>}</div></section>
      <form className={surface + ' space-y-4 p-5'} onSubmit={e => { e.preventDefault(); void save(async () => { await apiFetch('/basic-attendance/courses', { method: 'POST', body: course }); setCourse({ code: '', name: '', academic_level: 'first' }); }); }}><h2 className="font-bold">{bt('text038')}</h2>
        <Field label={bt('text032')}><input className="input" required value={course.code} onChange={e => setCourse({ ...course, code: e.target.value })} /></Field>
        <Field label={bt('text033')}><input className="input" required value={course.name} onChange={e => setCourse({ ...course, name: e.target.value })} /></Field>
        <Field label={bt('text034')}><select className="input" value={course.academic_level} onChange={e => setCourse({ ...course, academic_level: e.target.value })}><option value="first">{bt('text035')}</option><option value="second">{bt('text036')}</option><option value="third">{bt('text037')}</option></select></Field>
        <Button type="submit" disabled={busy}>{bt('text038')}</Button></form>
    </div> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className={surface + ' p-5'}><h2 className="font-bold">{bt('workSections')}</h2>{sections.isLoading ? <LoadingState /> : sections.isError ? <ErrorState onRetry={() => sections.refetch()} /> : <div className="mt-4 divide-y divide-slate-100">{sections.data?.map(s => <button type="button" key={s.id} onClick={() => { setNotice(''); setForm({ id: s.id, course_id: s.course_id, number: s.number, academic_year: s.academic_year, semester: s.semester, is_active: s.is_active, lecturer_ids: s.lecturers.map(l => l.id) }); }} className="block w-full py-3 text-start text-sm hover:text-teal-800"><b>{bt('workSectionNumber', { number: s.number })}</b> · {s.course_name}<span className="block text-xs text-slate-500">{s.academic_year} · {s.lecturers.map(l => l.name).join(bt('text026'))}</span></button>)}{!sections.data?.length && <p className="py-3 text-sm text-slate-500">{bt('workNoSections')}</p>}</div>}</section>
      <form className={surface + ' space-y-4 p-5'} onSubmit={e => { e.preventDefault(); void save(async () => { await apiFetch(form.id ? `/basic-attendance/sections/${form.id}` : '/basic-attendance/sections', { method: form.id ? 'PUT' : 'POST', body: form }); if (!form.id) setForm({ id: 0, course_id: 0, number: '', academic_year: '', semester: 'first', is_active: true, lecturer_ids: [] }); }); }}><div className="flex items-center justify-between gap-2"><h2 className="font-bold">{form.id ? bt('text039') : bt('text040')}</h2>{form.id > 0 && <button type="button" className="text-xs font-bold text-teal-700" onClick={() => setForm({ id: 0, course_id: 0, number: '', academic_year: '', semester: 'first', is_active: true, lecturer_ids: [] })}>{bt('text053')}</button>}</div>
        <Field label={bt('text041')}><select className="input" required value={form.course_id || ''} onChange={e => setForm({ ...form, course_id: Number(e.target.value) })}><option value="">{bt('text042')}</option>{options.data?.courses.map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label={bt('text043')}><input className="input" required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></Field><Field label={bt('text044')}><input className="input" required placeholder="2026/2027" value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })} /></Field></div>
        <Field label={bt('text045')}><select className="input" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}><option value="first">{bt('text046')}</option><option value="second">{bt('text047')}</option><option value="summer">{bt('text048')}</option></select></Field>
        <fieldset><legend className="text-sm font-bold">{bt('text049')}</legend><div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{options.data?.lecturers.map(l => <label key={l.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input type="checkbox" checked={form.lecturer_ids.includes(l.id)} onChange={e => setForm({ ...form, lecturer_ids: e.target.checked ? [...form.lecturer_ids, l.id] : form.lecturer_ids.filter(id => id !== l.id) })} />{l.name}</label>)}{!options.data?.lecturers.length && <p className="text-sm text-amber-800">{bt('text050')}</p>}</div></fieldset>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />{bt('text051')}</label><Button type="submit" disabled={busy || !form.lecturer_ids.length}>{bt('text052')}</Button></form>
    </div>}
  </Shell>;
}

export function BasicAttendanceSection() {
  const { sectionId: value } = useParams(); const sectionId = Number(value); const location = useLocation(); const navigate = useNavigate(); const qc = useQueryClient(); const { can } = useAuth();
  const current = location.pathname.endsWith('/roster') ? 'roster' : location.pathname.endsWith('/report') ? 'report' : 'lectures';
  const sections = useSections(); const section = sections.data?.find(s => s.id === sectionId);
  const sessions = useQuery({ queryKey: ['basic-sessions', sectionId], queryFn: () => apiFetch<Session[]>(`/basic-attendance/sections/${sectionId}/sessions`), enabled: !!section && current === 'lectures' });
  const roster = useQuery({ queryKey: ['basic-roster', sectionId], queryFn: () => apiFetch<Student[]>(`/basic-attendance/sections/${sectionId}/roster`), enabled: !!section && current === 'roster' && can('basic_attendance.manage') });
  const [offset, setOffset] = useState(0);
  const report = useQuery({ queryKey: ['basic-report', sectionId, offset], queryFn: () => apiFetch<Report>(`/basic-attendance/sections/${sectionId}/report?offset=${offset}`), enabled: !!section && current === 'report' });
  const reportRecords = useMemo(() => new Map((report.data?.records ?? []).map(r => [`${r.student_id}:${r.session_id}`, r])), [report.data]);
  const [lecture, setLecture] = useState({ title: `${bt('text013')}${new Date().toLocaleDateString(basicLocale())}`, mode: 'single', window_minutes: 5, late_after_minutes: 2 });
  const [showLectureForm, setShowLectureForm] = useState(false); const [preview, setPreview] = useState<RosterStudent[]>([]); const [fileErrors, setFileErrors] = useState<string[]>([]); const [fileName, setFileName] = useState('');
  const [search, setSearch] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await action(); await Promise.all([qc.invalidateQueries({ queryKey: ['basic-sections'] }), qc.invalidateQueries({ queryKey: ['basic-roster', sectionId] }), qc.invalidateQueries({ queryKey: ['basic-sessions', sectionId] })]); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function downloadTemplate() { try { const xlsx = await import('xlsx'); const blob = rosterTemplate(xlsx, basicLocale()); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'basic-attendance-students-template.xlsx'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError((e as Error).message); } }
  async function readFile(file: File) { setPreview([]); setFileErrors([]); setFileName(file.name); setError(''); try { const xlsx = await import('xlsx'); const result = parseRoster(xlsx, await file.arrayBuffer(), basicLocale()); setPreview(result.rows); setFileErrors(result.errors); } catch (e) { setFileErrors([(e as Error).message]); } }
  if (!can('basic_attendance.view')) return <ErrorState />;
  if (sections.isLoading) return <LoadingState />;
  if (sections.isError) return <ErrorState onRetry={() => sections.refetch()} />;
  if (!section || !Number.isInteger(sectionId)) return <ErrorState title={bt('workNotFound')} />;
  if (current === 'roster' && !can('basic_attendance.manage')) return <ErrorState />;
  return <Shell title={`${bt('workSectionNumber', { number: section.number })} — ${section.course_name}`} subtitle={`${section.academic_year} · ${section.course_code} · ${section.students_count} ${bt('text055')}`} back="/basic-attendance">
    <SectionNav sectionId={sectionId} current={current} />
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {current === 'lectures' && <div className="space-y-4">
      {section.active_session && <Link to={`/basic-attendance/sessions/${section.active_session.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-5 font-bold text-teal-900"><span>{bt('workActiveLecture')}: {section.active_session.title}</span><span aria-hidden>←</span></Link>}
      {can('basic_attendance.record') && section.is_active && !section.active_session && <section className={surface + ' p-5'}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{bt('workNewLecture')}</h2><p className="mt-1 text-sm text-slate-500">{bt('workNewLectureHint')}</p></div><Button onClick={() => setShowLectureForm(!showLectureForm)} disabled={!section.students_count}>{showLectureForm ? bt('workCancel') : bt('workStartLecture')}</Button></div>
        {showLectureForm && <form className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await apiFetch<{ id: number }>(`/basic-attendance/sections/${sectionId}/sessions`, { method: 'POST', body: lecture }); navigate(`/basic-attendance/sessions/${result.id}`); }); }}>
          <div className="sm:col-span-3"><Field label={bt('text076')}><input className="input" required value={lecture.title} onChange={e => setLecture({ ...lecture, title: e.target.value })} /></Field></div>
          <Field label={bt('text077')}><select className="input" value={lecture.mode} onChange={e => setLecture({ ...lecture, mode: e.target.value })}><option value="single">{bt('text078')}</option><option value="double">{bt('text079')}</option></select></Field>
          <Field label={bt('text080')}><input className="input" type="number" min={1} max={30} value={lecture.window_minutes} onChange={e => setLecture({ ...lecture, window_minutes: Number(e.target.value) })} /></Field>
          <Field label={bt('text081')}><input className="input" type="number" min={0} max={30} value={lecture.late_after_minutes} onChange={e => setLecture({ ...lecture, late_after_minutes: Number(e.target.value) })} /></Field>
          <div className="sm:col-span-3"><Button type="submit" disabled={busy}>{bt('text082')}</Button></div></form>}
      </section>}
      <section className={surface + ' overflow-hidden'}><h2 className="border-b border-slate-100 px-5 py-4 font-bold">{bt('workLectureHistory')}</h2>{sessions.isLoading ? <LoadingState /> : sessions.isError ? <ErrorState onRetry={() => sessions.refetch()} /> : <div className="divide-y divide-slate-100">{sessions.data?.map(s => <Link key={s.id} to={`/basic-attendance/sessions/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"><div><p className="font-bold">{s.title}</p><p className="mt-1 text-xs text-slate-500">{displayDate(s.opened_at)}</p></div><span className="text-sm font-semibold text-teal-700">{s.state === 'finalized' ? bt('text004') : s.state === 'paused' ? bt('text002') : bt('workOpenSection')}</span></Link>)}{!sessions.data?.length && <p className="p-6 text-sm text-slate-500">{bt('text083')}</p>}</div>}</section>
      <p className="text-xs leading-6 text-slate-500">{bt('text084')}<a className="font-semibold text-teal-700" href="/lecture-attendance">{window.location.origin}/lecture-attendance</a>{bt('text085')}</p>
    </div>}
    {current === 'roster' && <div className="space-y-5"><section className={surface + ' space-y-4 p-5'}><div><h2 className="text-lg font-bold">{bt('workImport')}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{bt('workImportHint')}</p></div>
      <div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={() => void downloadTemplate()}>{bt('workDownloadTemplate')}</Button><span className="text-xs text-slate-500">{bt('workTemplateNote')}</span></div>
      <label className="block max-w-xl text-sm font-semibold">{bt('workChooseFile')}<input type="file" accept=".xlsx,.xls,.csv" className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm" onChange={e => { const file = e.target.files?.[0]; if (file) void readFile(file); }} /></label>
      {!!fileErrors.length && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">{bt('workImportErrors', { count: fileErrors.length })}</p><ul className="mt-2 list-inside list-disc space-y-1">{fileErrors.slice(0, 8).map((message, index) => <li key={index}>{message}</li>)}</ul>{fileErrors.length > 8 && <p className="mt-2">{bt('workMoreErrors', { count: fileErrors.length - 8 })}</p>}</div>}
      {!!preview.length && <div className="space-y-3"><Notice>{bt('workPreviewCount', { count: preview.length, file: fileName })}</Notice><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[540px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-start">{bt('text067')}</th><th className="p-3 text-start">{bt('text066')}</th><th className="p-3 text-start">{bt('workEmail')}</th></tr></thead><tbody>{preview.slice(0, 5).map(st => <tr key={st.university_number} className="border-t border-slate-100"><td className="p-3" dir="ltr">{st.university_number}</td><td className="p-3">{st.name}</td><td className="p-3" dir="ltr">{st.email}</td></tr>)}</tbody></table></div><p className="text-xs text-slate-500">{bt('workPreviewNote')}</p><Button disabled={busy} onClick={() => void run(async () => { await apiFetch(`/basic-attendance/sections/${sectionId}/roster`, { method: 'POST', body: { rows: preview } }); setPreview([]); setNotice(bt('workImportDone')); })}>{bt('workConfirmImport')}</Button></div>}
    </section><section className={surface + ' overflow-hidden'}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-bold">{bt('workCurrentRoster')}</h2><p className="mt-1 text-xs text-slate-500">{section.students_count} {bt('text055')}</p></div><input className="input max-w-xs" aria-label={bt('workFindStudent')} placeholder={bt('workFindStudent')} value={search} onChange={e => setSearch(e.target.value)} /></div>
      {roster.isLoading ? <LoadingState /> : roster.isError ? <ErrorState onRetry={() => roster.refetch()} /> : <div className="divide-y divide-slate-100">{roster.data?.filter(st => `${st.name} ${st.university_number}`.includes(search)).map(st => <div key={st.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div className="flex items-center gap-3">{st.photo_url ? <img src={st.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 font-bold text-teal-800">{st.name.slice(0, 1)}</span>}<div><p className="text-sm font-bold">{st.name}</p><p className="mt-0.5 text-xs text-slate-500"><span dir="ltr">{st.university_number}</span> · <span dir="ltr">{st.email}</span></p></div></div><button className="text-xs font-bold text-red-700" disabled={busy} onClick={() => { if (window.confirm(bt('text068'))) void run(async () => { await apiFetch(`/basic-attendance/sections/${sectionId}/roster/${st.id}`, { method: 'DELETE' }); setNotice(bt('workWithdrawn')); }); }}>{bt('text069')}</button></div>)}{!roster.data?.length && <p className="p-6 text-sm text-slate-500">{bt('workEmptyRoster')}</p>}</div>}</section></div>}
    {current === 'report' && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm leading-6 text-slate-500">{bt('text070')}</p>{can('basic_attendance.export') && <a className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-teal-800" href={apiUrl(`/basic-attendance/sections/${sectionId}/export`)}>{bt('text058')}</a>}</div>
      {report.isLoading ? <LoadingState /> : report.isError ? <ErrorState onRetry={() => report.refetch()} /> : report.data && <><div className={surface + ' overflow-x-auto'}><table className="w-full min-w-[600px] text-sm"><thead className="bg-slate-50"><tr><th className="sticky start-0 min-w-44 bg-slate-50 p-3 text-start">{bt('text066')}</th>{report.data.sessions.map(s => <th key={s.id} className="min-w-32 p-3 text-center"><span className="block font-bold">{s.title}</span><span className="text-xs font-normal text-slate-500">{displayDate(s.opened_at)}</span></th>)}</tr></thead><tbody>{report.data.students.map(st => <tr key={st.id} className="border-t border-slate-100"><td className="sticky start-0 bg-white p-3"><p className="font-bold">{st.name}</p><p dir="ltr" className="text-start text-xs text-slate-500">{st.university_number}</p></td>{report.data!.sessions.map(s => { const record = reportRecords.get(`${st.id}:${s.id}`); return <td key={s.id} className="p-3 text-center">{record ? `${({ present: bt('text005'), absent: bt('text006'), incomplete: bt('text007'), excused: bt('text008'), pending: bt('text009') } as Record<string, string>)[record.status] ?? record.status}${record.is_late ? ` · ${bt('text112')}` : ''}` : '—'}</td>; })}</tr>)}</tbody></table>{!report.data.sessions.length && <p className="p-6 text-sm text-slate-500">{bt('text126')}</p>}</div><div className="flex justify-between gap-2"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 7))}>{bt('text071')}</Button><Button variant="outline" disabled={offset + 7 >= report.data.pagination.total} onClick={() => setOffset(offset + 7)}>{bt('text072')}</Button></div></>}
    </div>}
  </Shell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>; }
