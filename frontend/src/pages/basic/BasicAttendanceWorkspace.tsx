import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, FileSpreadsheet, Plus, Search, X } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { basicLocale, basicText as bt } from '@/i18n/basicAttendance';
import { parseRoster, rosterTemplate, type RosterStudent } from './rosterFile';
import { BasicArchiveDialog } from './BasicArchiveDialog';
import { BasicMonthlyReportPanel, type MonthlyStudent, type MonthlySummary, type WarningThreshold } from './BasicMonthlyReportPanel';

type Course = { id: number; code: string; name: string; academic_level: string };
type Section = { id: number; course_id: number; course_name: string; course_code: string; number: string; academic_year: string; semester: string; is_active: boolean; students_count: number; lecturers: { id: number; name: string }[]; active_session: Session | null };
type Session = { id: number; title: string; state: string; mode: string; opened_at: string };
type Student = { id: number; name: string; university_number: string; email: string; photo_url?: string | null };
type RecordRow = { student_id: number; session_id: number; status: string; is_late: boolean };
type Report = { sessions: Session[]; students: Student[]; records: RecordRow[]; pagination: { offset: number; total: number; per_page: number } };
const direction = () => basicLocale() === 'ar' ? 'rtl' : 'ltr';
const displayDate = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T')).toLocaleDateString(basicLocale());
const attendanceStatus = (row?: RecordRow) => row ? `${({ present: bt('text005'), absent: bt('text006'), incomplete: bt('text007'), excused: bt('text008'), pending: bt('text009') } as Record<string, string>)[row.status] ?? row.status}${row.is_late ? ` · ${bt('text112')}` : ''}` : '—';
const surface = 'rounded-2xl border border-slate-200 bg-white';
const catalog = 'overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_48px_-40px_rgba(15,23,42,0.5)]';

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <main dir={direction()} className="mx-auto max-w-6xl space-y-5 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-5">
      <div><p className="text-xs font-semibold text-teal-700">{bt('text017')}</p><h1 className="mt-1 text-2xl font-black text-slate-900">{title}</h1>
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

export function BasicAttendanceHome() {
  const { can, user } = useAuth(); const location = useLocation(); const sections = useSections(); const [params, setParams] = useSearchParams();
  const selectionKey = `basic-attendance-selection:${user?.id ?? 'guest'}`;
  const savedSelection = (() => { try { return JSON.parse(sessionStorage.getItem(selectionKey) ?? '{}') as { course?: number; section?: number }; } catch { return {} as { course?: number; section?: number }; } })();
  const destination = location.pathname.endsWith('/students') ? 'roster' : location.pathname.endsWith('/reports') ? 'report' : 'lectures';
  const title = destination === 'roster' ? bt('workRosterDirectory') : destination === 'report' ? bt('workReportsDirectory') : bt('text018');
  const subtitle = destination === 'roster' ? bt('workRosterDirectoryHint') : destination === 'report' ? bt('workReportsDirectoryHint') : bt('workHomeIntro');
  const courses = [...new Map((sections.data ?? []).map(section => [section.course_id, { id: section.course_id, name: section.course_name, code: section.course_code }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, basicLocale()));
  const requestedSection = (sections.data ?? []).find(section => section.id === Number(params.get('section') ?? savedSelection.section));
  const courseId = courses.some(course => course.id === Number(params.get('course')))
    ? Number(params.get('course')) : requestedSection?.course_id ?? (courses.some(course => course.id === savedSelection.course) ? savedSelection.course : courses[0]?.id) ?? 0;
  const courseSections = (sections.data ?? []).filter(section => section.course_id === courseId)
    .sort((a, b) => a.academic_year.localeCompare(b.academic_year) || a.number.localeCompare(b.number, basicLocale()));
  const selected = courseSections.find(section => section.id === Number(params.get('section') ?? savedSelection.section))
    ?? (destination === 'lectures' ? courseSections.find(section => section.active_session) : undefined)
    ?? courseSections[0];
  useEffect(() => { if (selected) sessionStorage.setItem(selectionKey, JSON.stringify({ course: courseId, section: selected.id })); }, [selectionKey, courseId, selected?.id]);
  if (!can('basic_attendance.view')) return <ErrorState />;
  return <Shell title={title} subtitle={subtitle}>
    {sections.isLoading ? <LoadingState /> : sections.isError ? <ErrorState onRetry={() => sections.refetch()} /> : !courses.length ? <div className={surface + ' p-8 text-center text-sm text-slate-500'}>{bt('text030')}</div> : <>
      <section aria-label={bt('workContext')} className={catalog}>
        <div className="border-b border-slate-100 bg-gradient-to-l from-teal-50/80 via-white to-white px-5 py-5 sm:px-7">
          <p className="mb-4 text-xs font-bold text-teal-700">{bt('workContext')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={bt('text041')}><select className="input" value={courseId} onChange={event => setParams({ course: event.target.value })}>
              {courses.map(course => <option key={course.id} value={course.id}>{course.name} · {course.code}</option>)}
            </select></Field>
            <Field label={bt('workSectionChoice')}><select className="input" value={selected?.id ?? ''} onChange={event => setParams({ course: String(courseId), section: event.target.value })}>
              {courseSections.map(section => <option key={section.id} value={section.id}>{bt('workSectionNumber', { number: section.number })} · {section.academic_year} · {section.students_count} {bt('text055')}</option>)}
            </select></Field>
          </div>
        </div>
        {selected && <div className="px-5 py-5 sm:px-7"><BasicAttendanceSection key={`${destination}-${selected.id}`} section={selected} current={destination} /></div>}
      </section>
    </>}
  </Shell>;
}

export function BasicAttendanceLegacyRedirect() {
  const { sectionId } = useParams();
  const path = useLocation().pathname;
  const destination = path.endsWith('/roster') ? '' : path.endsWith('/report') ? '/report' : '/lectures';
  return <Navigate to={`/basic-attendance/sections/${encodeURIComponent(sectionId ?? '')}${destination}`} replace />;
}

export function BasicAttendanceSetup() {
  const { can } = useAuth(); const location = useLocation(); const qc = useQueryClient();
  const mode = location.pathname.endsWith('/sections') ? 'sections' : 'courses';
  const sections = useSections();
  const options = useQuery({ queryKey: ['basic-options'], queryFn: () => apiFetch<{ courses: Course[]; lecturers: { id: number; name: string }[] }>('/basic-attendance/options'), enabled: can('basic_attendance.manage') });
  const [course, setCourse] = useState({ code: '', name: '', academic_level: 'first' });
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [form, setForm] = useState({ id: 0, course_id: 0, number: '', academic_year: '', semester: 'first', is_active: true, lecturer_ids: [] as number[] });
  const [searchParams] = useSearchParams();
  const [selectedCourseId, setSelectedCourseId] = useState(Number(searchParams.get('course')) || 0);
  const courseId = options.data?.courses.some(item => item.id === selectedCourseId) ? selectedCourseId : options.data?.courses[0]?.id ?? 0;
  const courseSections = (sections.data ?? []).filter(item => item.course_id === courseId)
    .sort((a, b) => a.academic_year.localeCompare(b.academic_year) || a.number.localeCompare(b.number, basicLocale()));
  const emptySectionForm = (selectedId: number) => ({ id: 0, course_id: selectedId, number: '', academic_year: '', semester: 'first', is_active: true, lecturer_ids: [] as number[] });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function save(action: () => Promise<unknown>): Promise<boolean> { setBusy(true); setError(''); setNotice(''); try { await action(); setNotice(bt('text014')); await Promise.all([qc.invalidateQueries({ queryKey: ['basic-options'] }), qc.invalidateQueries({ queryKey: ['basic-sections'] })]); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); } }
  const levelLabel = (level: string) => level === 'first' ? bt('text035') : level === 'second' ? bt('text036') : bt('text037');
  if (!can('basic_attendance.manage')) return <ErrorState />;
  return <Shell title={mode === 'courses' ? bt('workCourses') : bt('workSections')} subtitle={mode === 'courses' ? bt('workCourseIntro') : bt('workSectionIntro')}>
    <Link to={mode === 'sections' && courseId ? `/basic-attendance/courses/${courseId}` : '/basic-attendance'} className="inline-flex w-fit items-center rounded-lg px-2 py-1 text-sm font-bold text-teal-700 hover:bg-teal-50">{bt('workBackToCatalog')}</Link>
    {(mode !== 'courses' || !showCourseForm) && error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {options.isLoading ? <LoadingState /> : options.isError ? <ErrorState onRetry={() => options.refetch()} /> : mode === 'courses' ? <>
      <section className={catalog}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-gradient-to-l from-teal-50/80 via-white to-white px-5 py-5 sm:px-7">
          <div><p className="text-xs font-bold text-teal-700">{bt('workCourseCatalog')}</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{bt('workCourseCount', { count: options.data?.courses.length ?? 0 })}</h2></div>
          <Button onClick={() => { setError(''); setShowCourseForm(true); }}><Plus className="me-2 h-4 w-4" aria-hidden="true" />{bt('text038')}</Button>
        </div>
        {options.data?.courses.length ? <div className="divide-y divide-slate-100">
          {[...options.data.courses].sort((a, b) => ['first', 'second', 'third'].indexOf(a.academic_level) - ['first', 'second', 'third'].indexOf(b.academic_level) || a.name.localeCompare(b.name, basicLocale())).map(c => <div key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-5 transition-colors hover:bg-slate-50/70 sm:flex-nowrap sm:px-7">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><BookOpen size={20} aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><h3 className="text-base font-bold leading-6 text-slate-900">{c.name}</h3><p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span dir="ltr" className="font-semibold tracking-wide">{c.code}</span><span>{levelLabel(c.academic_level)}</span></p></div>
            <span className="ms-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">{(sections.data ?? []).filter(item => item.course_id === c.id).length} {bt('workSectionsCount')}</span>
          </div>)}
        </div> : <div className="flex flex-col items-center px-5 py-12 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><BookOpen size={24} aria-hidden="true" /></span><p className="mt-4 text-sm font-semibold text-slate-700">{bt('workNoCourses')}</p></div>}
      </section>
      {showCourseForm && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-200/75 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setShowCourseForm(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="basic-add-course-title" onKeyDown={e => { if (e.key === 'Escape' && !busy) setShowCourseForm(false); }} className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold text-teal-700">{bt('workCourses')}</p><h2 id="basic-add-course-title" className="mt-1 text-xl font-extrabold text-slate-900">{bt('text038')}</h2></div><button type="button" aria-label={bt('workClose')} onClick={() => setShowCourseForm(false)} disabled={busy} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={20} aria-hidden="true" /></button></div>
          <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); void save(() => apiFetch('/basic-attendance/courses', { method: 'POST', body: course })).then(success => { if (success) { setCourse({ code: '', name: '', academic_level: 'first' }); setShowCourseForm(false); } }); }}>
            {error && <Notice error>{error}</Notice>}
            <Field label={bt('text032')}><input className="input" autoFocus required value={course.code} onChange={e => setCourse({ ...course, code: e.target.value })} /></Field>
            <Field label={bt('text033')}><input className="input" required value={course.name} onChange={e => setCourse({ ...course, name: e.target.value })} /></Field>
            <Field label={bt('text034')}><select className="input" value={course.academic_level} onChange={e => setCourse({ ...course, academic_level: e.target.value })}><option value="first">{bt('text035')}</option><option value="second">{bt('text036')}</option><option value="third">{bt('text037')}</option></select></Field>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="outline" onClick={() => setShowCourseForm(false)} disabled={busy}>{bt('workCancel')}</Button><Button type="submit" disabled={busy}>{bt('text038')}</Button></div>
          </form>
        </section>
      </div>}
    </> : <>
      <section className={catalog}>
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 bg-gradient-to-l from-teal-50/80 via-white to-white px-5 py-5 sm:px-7">
          <div className="min-w-[220px] max-w-xl flex-1"><Field label={bt('text041')}><select className="input" value={courseId} onChange={e => { const id = Number(e.target.value); setSelectedCourseId(id); setForm(emptySectionForm(id)); setShowSectionForm(false); setNotice(''); }}>{options.data?.courses.map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></Field></div>
          <Button disabled={!courseId} onClick={() => { setError(''); setForm(emptySectionForm(courseId)); setShowSectionForm(true); }}><Plus className="me-2 h-4 w-4" aria-hidden="true" />{bt('text053')}</Button>
        </div>
        <div className="border-b border-slate-100 px-5 py-4 text-sm font-bold text-slate-700 sm:px-7">{bt('workSectionCount', { count: courseSections.length })}</div>
        {sections.isLoading ? <LoadingState /> : sections.isError ? <ErrorState onRetry={() => sections.refetch()} /> : courseSections.length ? <div className="divide-y divide-slate-100">{courseSections.map(s => <button type="button" key={s.id} onClick={() => { setError(''); setNotice(''); setForm({ id: s.id, course_id: s.course_id, number: s.number, academic_year: s.academic_year, semester: s.semester, is_active: s.is_active, lecturer_ids: s.lecturers.map(l => l.id) }); setShowSectionForm(true); }} className="flex w-full flex-wrap items-center gap-4 px-5 py-5 text-start transition-colors hover:bg-slate-50/70 focus-visible:bg-teal-50 sm:flex-nowrap sm:px-7">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><CalendarDays size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-bold text-slate-900">{bt('workSectionNumber', { number: s.number })}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{s.academic_year} · {s.semester === 'first' ? bt('text046') : s.semester === 'second' ? bt('text047') : bt('text048')} · {s.lecturers.map(l => l.name).join(bt('text026'))}</span></span>
          <span className="ms-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">{s.students_count} {bt('text055')}</span>
        </button>)}</div> : <div className="px-5 py-12 text-center text-sm text-slate-500">{bt('workNoSections')}</div>}
      </section>
      {showSectionForm && <WorkspaceDialog title={form.id ? bt('text039') : bt('text040')} onClose={() => setShowSectionForm(false)} busy={busy}>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(() => apiFetch(form.id ? `/basic-attendance/sections/${form.id}` : '/basic-attendance/sections', { method: form.id ? 'PUT' : 'POST', body: { ...form, course_id: courseId } })).then(success => { if (success) { setShowSectionForm(false); setForm(emptySectionForm(courseId)); } }); }}>
          {error && <Notice error>{error}</Notice>}
          <p className="text-sm font-semibold text-slate-600">{options.data?.courses.find(c => c.id === courseId)?.name}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label={bt('text043')}><input className="input" autoFocus required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></Field><Field label={bt('text044')}><input className="input" required placeholder="2026/2027" value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })} /></Field></div>
          <Field label={bt('text045')}><select className="input" value={form.semester} onChange={e => setForm({ ...form, semester: e.target.value })}><option value="first">{bt('text046')}</option><option value="second">{bt('text047')}</option><option value="summer">{bt('text048')}</option></select></Field>
          <fieldset><legend className="text-sm font-bold text-slate-700">{bt('text049')}</legend><div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{options.data?.lecturers.map(l => <label key={l.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input type="checkbox" checked={form.lecturer_ids.includes(l.id)} onChange={e => setForm({ ...form, lecturer_ids: e.target.checked ? [...form.lecturer_ids, l.id] : form.lecturer_ids.filter(id => id !== l.id) })} />{l.name}</label>)}{!options.data?.lecturers.length && <p className="text-sm text-amber-800">{bt('text050')}</p>}</div></fieldset>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />{bt('text051')}</label>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="outline" onClick={() => setShowSectionForm(false)} disabled={busy}>{bt('workCancel')}</Button><Button type="submit" disabled={busy || !courseId || !form.lecturer_ids.length}>{bt('text052')}</Button></div>
        </form>
      </WorkspaceDialog>}
    </>}
  </Shell>;
}

export function BasicAttendanceSection({ section: selectedSection, current: selectedMode }: { section?: Section; current?: 'lectures' | 'roster' | 'report' } = {}) {
  const { sectionId: value } = useParams(); const sectionId = selectedSection?.id ?? Number(value); const location = useLocation(); const navigate = useNavigate(); const qc = useQueryClient(); const { can } = useAuth();
  const current = selectedMode ?? (location.pathname.endsWith('/roster') ? 'roster' : location.pathname.endsWith('/report') ? 'report' : 'lectures');
  const sections = useSections(); const section = selectedSection ?? sections.data?.find(s => s.id === sectionId);
  const sessions = useQuery({ queryKey: ['basic-sessions', sectionId], queryFn: () => apiFetch<Session[]>(`/basic-attendance/sections/${sectionId}/sessions`), enabled: !!section && current === 'lectures' });
  const roster = useQuery({ queryKey: ['basic-roster', sectionId], queryFn: () => apiFetch<Student[]>(`/basic-attendance/sections/${sectionId}/roster`), enabled: !!section && current === 'roster' });
  const [offset, setOffset] = useState(0);
  const [mobileSessionId, setMobileSessionId] = useState(0);
  const [month, setMonth] = useState(() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`; });
  const summary = useQuery({ queryKey: ['basic-monthly-summary', sectionId, month], queryFn: () => apiFetch<MonthlySummary>(`/basic-attendance/sections/${sectionId}/monthly-summary?month=${month}`), enabled: !!section && current === 'report' });
  const report = useQuery({ queryKey: ['basic-report', sectionId, offset], queryFn: () => apiFetch<Report>(`/basic-attendance/sections/${sectionId}/report?offset=${offset}`), enabled: !!section && current === 'report' });
  const reportRecords = useMemo(() => new Map((report.data?.records ?? []).map(r => [`${r.student_id}:${r.session_id}`, r])), [report.data]);
  const mobileSession = report.data?.sessions.find(item => item.id === mobileSessionId) ?? report.data?.sessions.at(-1);
  const [lecture, setLecture] = useState({ title: `${bt('text013')}${new Date().toLocaleDateString(basicLocale())}`, mode: 'single', window_minutes: 15, late_after_minutes: 2, lecturer_id: 0 });
  const [showLectureForm, setShowLectureForm] = useState(false); const [showImport, setShowImport] = useState(false); const [showManual, setShowManual] = useState(false);
  const [archiveSession, setArchiveSession] = useState<Session | null>(null);
  const [manualStudent, setManualStudent] = useState({ university_number: '', name: '', email: '' });
  const [preview, setPreview] = useState<RosterStudent[]>([]); const [fileErrors, setFileErrors] = useState<string[]>([]); const [fileName, setFileName] = useState('');
  const [search, setSearch] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [bulkProgress, setBulkProgress] = useState('');
  const filteredRoster = roster.data?.filter(student => `${student.name} ${student.university_number}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) ?? [];
  async function run(action: () => Promise<void>): Promise<boolean> { setBusy(true); setError(''); setNotice(''); try { await action(); await Promise.all([qc.invalidateQueries({ queryKey: ['basic-sections'] }), qc.invalidateQueries({ queryKey: ['basic-roster', sectionId] }), qc.invalidateQueries({ queryKey: ['basic-sessions', sectionId] })]); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); } }
  async function downloadReport(detail = false) {
    setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl(`/basic-attendance/sections/${sectionId}/export${detail ? '' : `?month=${month}`}`), { credentials: 'include', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Accept-Language': basicLocale() } });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(data?.message || bt('workExportFailed'));
      }
      const url = URL.createObjectURL(await response.blob());
      const courseCode = section?.course_code.replace(/[^A-Za-z0-9_-]/g, '-') || 'course';
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `basic-attendance-${courseCode}-section-${sectionId}${detail ? '-detail' : `-${month}`}.xlsx`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError((e as Error).message || bt('workExportFailed')); }
    finally { setBusy(false); }
  }
  async function sendWarning(student: MonthlyStudent, threshold: WarningThreshold) {
    if (!window.confirm(bt(threshold === 3 ? 'workWarningThreeConfirm' : 'workWarningTwoConfirm', { name: student.name, count: student.total_absent, email: student.email }))) return;
    await run(async () => {
      await apiFetch(`/basic-attendance/sections/${sectionId}/students/${student.id}/absence-warning`, { method: 'POST', body: { threshold } });
      await qc.invalidateQueries({ queryKey: ['basic-monthly-summary', sectionId] });
      setNotice(bt('workWarningSent'));
    });
  }
  async function sendBulkWarnings(threshold: WarningThreshold, students: MonthlyStudent[]) {
    if (!students.length || !window.confirm(bt(threshold === 3 ? 'workBulkConfirmThree' : 'workBulkConfirmTwo', { count: students.length }))) return;
    setBusy(true); setError(''); setNotice('');
    let sent = 0; let skipped = 0; let failed = 0;
    try {
      for (let i = 0; i < students.length; i += 10) {
        const result = await apiFetch<{ sent: number[]; already_sent: number[]; not_eligible: number[]; missing_email: number[]; failed: number[] }>(`/basic-attendance/sections/${sectionId}/absence-warnings/bulk`, { method: 'POST', body: { threshold, student_ids: students.slice(i, i + 10).map(student => student.id) } });
        sent += result.sent.length;
        skipped += result.already_sent.length + result.not_eligible.length + result.missing_email.length;
        failed += result.failed.length;
        setBulkProgress(bt('workBulkProgress', { done: Math.min(i + 10, students.length), total: students.length }));
      }
      setNotice(bt('workBulkResult', { sent, skipped, failed }));
    } catch (e) {
      setError(bt('workBulkInterrupted', { sent, error: (e as Error).message }));
    } finally {
      setBulkProgress(''); setBusy(false);
      await qc.invalidateQueries({ queryKey: ['basic-monthly-summary', sectionId] });
    }
  }
  async function downloadTemplate() { try { const xlsx = await import('xlsx'); const blob = rosterTemplate(xlsx, basicLocale()); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'basic-attendance-students-template.xlsx'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError((e as Error).message); } }
  async function readFile(file: File) { setPreview([]); setFileErrors([]); setFileName(file.name); setError(''); try { const xlsx = await import('xlsx'); const result = parseRoster(xlsx, await file.arrayBuffer(), basicLocale()); setPreview(result.rows); setFileErrors(result.errors); } catch (e) { setFileErrors([(e as Error).message]); } }
  if (!can('basic_attendance.view')) return <ErrorState />;
  if (!selectedSection && sections.isLoading) return <LoadingState />;
  if (!selectedSection && sections.isError) return <ErrorState onRetry={() => sections.refetch()} />;
  if (!section || !Number.isInteger(sectionId)) return <ErrorState title={bt('workNotFound')} />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-5"><div>{!selectedSection && <h2 className="text-lg font-extrabold text-slate-900">{bt('workSectionNumber', { number: section.number })}</h2>}<p className="text-xs leading-5 text-slate-500">{section.lecturers.map(lecturer => lecturer.name).join(bt('text026'))}</p></div>
      {current === 'lectures' && can('basic_attendance.record') && section.is_active && !section.active_session && <Button disabled={!section.students_count} onClick={() => { setError(''); setShowLectureForm(true); }}><Plus className="me-2 h-4 w-4" aria-hidden="true" />{bt('workStartLecture')}</Button>}
      {current === 'roster' && can('basic_attendance.manage') && <div className="flex flex-wrap gap-2"><Button onClick={() => { setError(''); setManualStudent({ university_number: '', name: '', email: '' }); setShowManual(true); }}><Plus className="me-2 h-4 w-4" aria-hidden="true" />{bt('workAddStudent')}</Button><Button variant="outline" onClick={() => { setError(''); setShowImport(true); }}><FileSpreadsheet className="me-2 h-4 w-4" aria-hidden="true" />{bt('workImport')}</Button></div>}
      {current === 'report' && can('basic_attendance.export') && <Button disabled={busy} onClick={() => void downloadReport()}><FileSpreadsheet className="me-2 h-4 w-4" aria-hidden="true" />{bt('workExportMonth')}</Button>}
    </div>
    {!(showLectureForm || showImport || showManual) && error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}{bulkProgress && <Notice>{bulkProgress}</Notice>}
    {current === 'lectures' && <div className="space-y-4">
      {section.active_session && <Link to={`/basic-attendance/sessions/${section.active_session.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm font-bold text-teal-900"><span>{bt('workActiveLecture')}: {section.active_session.title}</span><span>{bt('workContinueLecture')}</span></Link>}
      <div><h3 className="text-sm font-bold text-slate-700">{bt('workLectureHistory')}</h3>{sessions.isLoading ? <LoadingState /> : sessions.isError ? <ErrorState onRetry={() => sessions.refetch()} /> : sessions.data?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{sessions.data.map(s => <div key={s.id} className="flex items-center rounded-xl border border-slate-200 pe-3 transition-colors hover:border-teal-300"><Link to={`/basic-attendance/sessions/${s.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{s.title}</p><p className="mt-1 text-xs text-slate-500">{displayDate(s.opened_at)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.state === 'finalized' ? 'bg-slate-100 text-slate-600' : 'bg-teal-50 text-teal-800'}`}>{s.state === 'finalized' ? bt('text004') : s.state === 'paused' ? bt('text002') : bt('workOpenSection')}</span></Link>{can('basic_attendance.delete') && s.state === 'finalized' && <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50" onClick={() => { setError(''); setArchiveSession(s); }}>{bt('archiveAction')}</button>}</div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">{bt('text083')}</p>}</div>
      {showLectureForm && <WorkspaceDialog title={bt('workNewLecture')} busy={busy} onClose={() => setShowLectureForm(false)}><form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await apiFetch<{ id: number }>(`/basic-attendance/sections/${sectionId}/sessions`, { method: 'POST', body: { ...lecture, lecturer_id: lecture.lecturer_id || undefined } }); navigate(`/basic-attendance/sessions/${result.id}`); }); }}>
        {error && <Notice error>{error}</Notice>}<p className="text-sm text-slate-500">{bt('workNewLectureHint')}</p>
        <Field label={bt('text076')}><input className="input" autoFocus required value={lecture.title} onChange={e => setLecture({ ...lecture, title: e.target.value })} /></Field>
        {can('basic_attendance.manage') && section.lecturers.length > 1 && <Field label={bt('workLectureLecturer')}><select required className="input" value={lecture.lecturer_id || ''} onChange={event => setLecture({ ...lecture, lecturer_id: Number(event.target.value) })}><option value="">{bt('workChooseLecturer')}</option>{section.lecturers.map(lecturer => <option key={lecturer.id} value={lecturer.id}>{lecturer.name}</option>)}</select></Field>}
        <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-700">{bt('workLectureAdvanced')}</summary><div className="mt-4 space-y-3"><Field label={bt('text077')}><select className="input" value={lecture.mode} onChange={e => setLecture({ ...lecture, mode: e.target.value })}><option value="single">{bt('text078')}</option><option value="double">{bt('text079')}</option></select></Field><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label={bt('text080')}><input className="input" type="number" min={1} max={30} value={lecture.window_minutes} onChange={e => setLecture({ ...lecture, window_minutes: Number(e.target.value) })} /></Field><Field label={bt('text081')}><input className="input" type="number" min={0} max={30} value={lecture.late_after_minutes} onChange={e => setLecture({ ...lecture, late_after_minutes: Number(e.target.value) })} /></Field></div></div></details>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="outline" disabled={busy} onClick={() => setShowLectureForm(false)}>{bt('workCancel')}</Button><Button type="submit" disabled={busy}>{bt('text082')}</Button></div>
      </form></WorkspaceDialog>}
    </div>}
    {current === 'roster' && <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-700">{bt('workCurrentRoster')}</h3><label className="relative block w-full sm:w-72"><Search size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-slate-400" aria-hidden="true" /><input className="input w-full ps-10" aria-label={bt('workFindStudent')} placeholder={bt('workFindStudent')} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
      {roster.isLoading ? <LoadingState /> : roster.isError ? <ErrorState onRetry={() => roster.refetch()} /> : filteredRoster.length ? <div className="divide-y divide-slate-100 border-t border-slate-100">{filteredRoster.map(st => <div key={st.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="flex min-w-0 items-center gap-3">{st.photo_url ? <img src={st.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 font-bold text-teal-800">{st.name.slice(0, 1)}</span>}<div className="min-w-0"><p className="text-sm font-bold text-slate-900">{st.name}</p><p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span dir="ltr">{st.university_number}</span><span dir="ltr" className="break-all">{st.email}</span></p></div></div>{can('basic_attendance.delete') && <button className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50" disabled={busy} onClick={() => { if (window.confirm(bt('text068'))) void run(async () => { await apiFetch(`/basic-attendance/sections/${sectionId}/roster/${st.id}`, { method: 'DELETE' }); setNotice(bt('workWithdrawn')); }); }}>{bt('text069')}</button>}</div>)}</div> : <p className="py-8 text-center text-sm text-slate-500">{bt('workEmptyRoster')}</p>}
      {showManual && <WorkspaceDialog title={bt('workAddStudent')} onClose={() => setShowManual(false)} busy={busy}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => { await apiFetch(`/basic-attendance/sections/${sectionId}/roster/student`, { method: 'POST', body: { university_number: manualStudent.university_number.trim(), name: manualStudent.name.trim(), email: manualStudent.email.trim() } }); }).then(success => { if (success) { setShowManual(false); setManualStudent({ university_number: '', name: '', email: '' }); setNotice(bt('workStudentAdded')); } }); }}>
        {error && <Notice error>{error}</Notice>}
        <p className="text-sm leading-6 text-slate-500">{bt('workManualHint')}</p>
        <Field label={bt('workUniversityNumber')}><input className="input" autoFocus required inputMode="numeric" pattern="[0-9]{6,20}" minLength={6} maxLength={20} dir="ltr" value={manualStudent.university_number} onChange={event => setManualStudent({ ...manualStudent, university_number: event.target.value })} /></Field>
        <Field label={bt('workStudentName')}><input className="input" maxLength={255} value={manualStudent.name} onChange={event => setManualStudent({ ...manualStudent, name: event.target.value })} /></Field>
        <Field label={bt('workEmail')}><input className="input" type="email" maxLength={255} dir="ltr" value={manualStudent.email} onChange={event => setManualStudent({ ...manualStudent, email: event.target.value })} /></Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="outline" disabled={busy} onClick={() => setShowManual(false)}>{bt('workCancel')}</Button><Button type="submit" disabled={busy}>{bt('workSaveStudent')}</Button></div>
      </form></WorkspaceDialog>}
      {showImport && <WorkspaceDialog title={bt('workImport')} onClose={() => setShowImport(false)} busy={busy}><div className="space-y-4">
        {error && <Notice error>{error}</Notice>}<p className="text-sm leading-6 text-slate-500">{bt('workImportHint')}</p>
        <div className="rounded-2xl bg-slate-50 p-4"><Button variant="outline" onClick={() => void downloadTemplate()}>{bt('workDownloadTemplate')}</Button><p className="mt-2 text-xs leading-5 text-slate-500">{bt('workTemplateNote')}</p></div>
        <label className="block text-sm font-semibold">{bt('workChooseFile')}<input type="file" accept=".xlsx,.xls,.csv" className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm" onChange={e => { const file = e.target.files?.[0]; if (file) void readFile(file); }} /></label>
        {!!fileErrors.length && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="font-bold">{bt('workImportErrors', { count: fileErrors.length })}</p><ul className="mt-2 list-inside list-disc space-y-1">{fileErrors.slice(0, 8).map((message, index) => <li key={index}>{message}</li>)}</ul>{fileErrors.length > 8 && <p className="mt-2">{bt('workMoreErrors', { count: fileErrors.length - 8 })}</p>}</div>}
        {!!preview.length && <div className="space-y-3"><Notice>{bt('workPreviewCount', { count: preview.length, file: fileName })}</Notice><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[540px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="p-3 text-start">{bt('text067')}</th><th className="p-3 text-start">{bt('text066')}</th><th className="p-3 text-start">{bt('workEmail')}</th></tr></thead><tbody>{preview.slice(0, 5).map(st => <tr key={st.university_number} className="border-t border-slate-100"><td className="p-3" dir="ltr">{st.university_number}</td><td className="p-3">{st.name}</td><td className="p-3" dir="ltr">{st.email}</td></tr>)}</tbody></table></div><p className="text-xs text-slate-500">{bt('workPreviewNote')}</p><div className="flex justify-end"><Button disabled={busy} onClick={() => void run(() => apiFetch(`/basic-attendance/sections/${sectionId}/roster`, { method: 'POST', body: { rows: preview } })).then(success => { if (success) { setPreview([]); setShowImport(false); setNotice(bt('workImportDone')); } })}>{bt('workConfirmImport')}</Button></div></div>}
      </div></WorkspaceDialog>}
    </div>}
    {current === 'report' && <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-lg font-extrabold text-slate-900">{bt('workMonthlyReport')}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{bt('workMonthlyNote')}</p></div><Field label={bt('workReportMonth')}><input className="input w-44" type="month" value={month} onChange={event => setMonth(event.target.value)} /></Field></div>
      {summary.isLoading ? <LoadingState /> : summary.isError ? <ErrorState onRetry={() => summary.refetch()} /> : summary.data && <>
        <BasicMonthlyReportPanel key={month} summary={summary.data} busy={busy} canNotify={can('basic_attendance.record') || can('basic_attendance.manage')} onWarn={(student, threshold) => void sendWarning(student, threshold)} onBulk={(threshold, students) => void sendBulkWarnings(threshold, students)} />
        {can('basic_attendance.export') && <p className="text-xs text-slate-500">{bt('workExportMonthHint')}</p>}
      </>}
      <details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">{bt('workLectureDetails')}</summary><div className="space-y-4 border-t border-slate-100 p-4">
      <p className="text-xs leading-6 text-slate-500">{bt('text070')}</p>
      {can('basic_attendance.delete') && <p className="text-xs leading-5 text-rose-700">{bt('workDeleteLectureHint')}</p>}
      {report.isLoading ? <LoadingState /> : report.isError ? <ErrorState onRetry={() => report.refetch()} /> : report.data && <>
        {mobileSession ? <div className="space-y-3 md:hidden"><Field label={bt('workReportLecture')}><select className="input" value={mobileSession.id} onChange={event => setMobileSessionId(Number(event.target.value))}>{report.data.sessions.map(item => <option key={item.id} value={item.id}>{item.title} · {displayDate(item.opened_at)}</option>)}</select></Field>{can('basic_attendance.delete') && mobileSession.state === 'finalized' && <button type="button" disabled={busy} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700" onClick={() => { setError(''); setArchiveSession(mobileSession); }}>{bt('workDeleteLectureFromReport')}</button>}<div className="divide-y divide-slate-100 border-t border-slate-100">{report.data.students.map(student => <div key={student.id} className="flex items-center justify-between gap-3 py-3"><div className="flex min-w-0 items-center gap-3">{student.photo_url ? <img src={student.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">{student.name.slice(0, 1)}</span>}<div className="min-w-0"><p className="text-sm font-bold text-slate-900">{student.name}</p><p dir="ltr" className="text-start text-xs text-slate-500">{student.university_number}</p></div></div><span className="shrink-0 text-xs font-bold text-slate-700">{attendanceStatus(reportRecords.get(`${student.id}:${mobileSession.id}`))}</span></div>)}</div></div> : <p className="py-8 text-center text-sm text-slate-500 md:hidden">{bt('text126')}</p>}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 md:block"><table className="w-full min-w-[680px] text-sm"><thead className="bg-teal-50/80"><tr><th className="sticky start-0 z-10 min-w-48 bg-teal-50 p-3 text-start">{bt('text066')}</th>{report.data.sessions.map(s => <th key={s.id} className="min-w-32 p-3 text-center"><span className="block font-bold text-slate-800">{s.title}</span><span className="text-xs font-normal text-slate-500">{displayDate(s.opened_at)}</span>{can('basic_attendance.delete') && s.state === 'finalized' && <button type="button" disabled={busy} className="mt-1 block w-full text-xs font-bold text-rose-700" onClick={() => { setError(''); setArchiveSession(s); }}>{bt('workDeleteLectureFromReport')}</button>}</th>)}</tr></thead><tbody>{report.data.students.map(st => <tr key={st.id} className="border-t border-slate-100"><td className="sticky start-0 bg-white p-3"><p className="font-bold">{st.name}</p><p dir="ltr" className="text-start text-xs text-slate-500">{st.university_number}</p></td>{report.data!.sessions.map(s => <td key={s.id} className="p-3 text-center text-slate-700">{attendanceStatus(reportRecords.get(`${st.id}:${s.id}`))}</td>)}</tr>)}</tbody></table>{!report.data.sessions.length && <p className="p-6 text-sm text-slate-500">{bt('text126')}</p>}</div>
        {report.data.pagination.total > 7 && <div className="flex justify-between gap-2 border-t border-slate-100 pt-4"><Button variant="outline" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - 7)); setMobileSessionId(0); }}>{bt('text071')}</Button><Button variant="outline" disabled={offset + 7 >= report.data.pagination.total} onClick={() => { setOffset(offset + 7); setMobileSessionId(0); }}>{bt('text072')}</Button></div>}
      </>}
      {can('basic_attendance.export') && <Button variant="outline" disabled={busy} onClick={() => void downloadReport(true)}><FileSpreadsheet className="me-2 h-4 w-4" aria-hidden="true" />{bt('workExportDetail')}</Button>}
      </div></details>
    </div>}
    {archiveSession && <BasicArchiveDialog key={archiveSession.id} label={archiveSession.title} confirmation={archiveSession.title} busy={busy} error={error} onClose={() => setArchiveSession(null)} onConfirm={reason => void run(() => apiFetch(`/basic-attendance/sessions/${archiveSession.id}`, { method: 'DELETE', body: { confirm: archiveSession.title, reason } })).then(success => { if (success) { setArchiveSession(null); setNotice(bt('archiveDone')); void qc.invalidateQueries({ queryKey: ['basic-monthly-summary', sectionId] }); void qc.invalidateQueries({ queryKey: ['basic-report', sectionId] }); } })} />}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">{label}</span>{children}</label>; }

function WorkspaceDialog({ title, children, onClose, busy = false }: { title: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-200/75 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => { if (event.key === 'Escape' && !busy) onClose(); }} className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4"><h2 className="text-xl font-extrabold text-slate-900">{title}</h2><button type="button" aria-label={bt('workClose')} onClick={onClose} disabled={busy} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={20} aria-hidden="true" /></button></div>
      {children}
    </section>
  </div>;
}
