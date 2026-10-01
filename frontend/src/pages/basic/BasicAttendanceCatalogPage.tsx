import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Plus, Users, X } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { basicLocale, basicText as bt } from '@/i18n/basicAttendance';
import { BasicArchiveDialog } from './BasicArchiveDialog';
import { BasicAttendanceSection } from './BasicAttendanceWorkspace';

type Course = { id: number; code: string; name: string; academic_level: string };
type Lecturer = { id: number; name: string; email?: string };
type Section = { id: number; course_id: number; course_name: string; course_code: string; number: string; academic_year: string; semester: string; is_active: boolean; students_count: number; lecturers: Lecturer[]; active_session: { id: number; title: string; state: string; mode: string; opened_at: string } | null };
type ArchiveTarget = { type: 'courses' | 'sections'; id: number; label: string; confirmation: string };
const currentYear = () => { const year = new Date().getFullYear(); return `${year}/${year + 1}`; };
const inputClass = 'input mt-1 w-full';

export function BasicAttendanceCatalogPage() {
  const { can, user } = useAuth();
  const { courseId, sectionId } = useParams();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const ar = basicLocale() === 'ar';
  const [courseFormOpen, setCourseFormOpen] = useState(false);
  const [sectionFormOpen, setSectionFormOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({ code: '', name: '', academic_level: 'first' });
  const [sectionForm, setSectionForm] = useState({ number: '', academic_year: currentYear(), semester: 'first', lecturer_ids: [] as number[] });
  const [archive, setArchive] = useState<ArchiveTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sections = useQuery({ queryKey: ['basic-sections', user?.id], queryFn: () => apiFetch<Section[]>('/basic-attendance/sections'), enabled: can('basic_attendance.view') });
  const options = useQuery({ queryKey: ['basic-options'], queryFn: () => apiFetch<{ courses: Course[]; lecturers: Lecturer[] }>('/basic-attendance/options'), enabled: can('basic_attendance.manage') });
  if (!can('basic_attendance.view')) return <ErrorState />;
  if (sections.isLoading || options.isLoading) return <LoadingState />;
  if (sections.isError || options.isError) return <ErrorState onRetry={() => { void sections.refetch(); void options.refetch(); }} />;

  const courses = options.data?.courses ?? [...new Map((sections.data ?? []).map(item => [item.course_id, { id: item.course_id, code: item.course_code, name: item.course_name, academic_level: '' }])).values()];
  const course = courses.find(item => item.id === Number(courseId)) ?? (sectionId ? courses.find(item => item.id === sections.data?.find(row => row.id === Number(sectionId))?.course_id) : undefined);
  const section = sections.data?.find(item => item.id === Number(sectionId));
  const courseSections = (sections.data ?? []).filter(item => item.course_id === course?.id);
  const Icon = ar ? ChevronLeft : ChevronRight;
  const Back = ar ? ArrowRight : ArrowLeft;
  const tabs = [
    { suffix: '', label: bt('workRoster'), mode: 'roster' as const },
    { suffix: '/lectures', label: bt('workLectures'), mode: 'lectures' as const },
    { suffix: '/report', label: bt('workReport'), mode: 'report' as const },
  ];
  async function submit(action: () => Promise<unknown>, close: () => void) {
    setBusy(true); setError('');
    try { await action(); await Promise.all([qc.invalidateQueries({ queryKey: ['basic-options'] }), qc.invalidateQueries({ queryKey: ['basic-sections'] })]); close(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function openArchive(target: ArchiveTarget) { setError(''); setArchive(target); }
  return <main dir={ar ? 'rtl' : 'ltr'} className="mx-auto max-w-6xl space-y-5 pb-12">
    <div className="border-b border-slate-200 pb-5">
      {course && <Link to={section ? `/basic-attendance/courses/${course.id}` : '/basic-attendance'} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900"><Back size={16} />{section ? course.name : bt('workCourses')}</Link>}
      <p className="text-xs font-bold text-teal-700">{bt('text017')}</p>
      <h1 className="mt-1 text-2xl font-black text-slate-900">{section ? `${bt('workSectionNumber', { number: section.number })} · ${course?.name ?? section.course_name}` : course ? course.name : bt('workCourses')}</h1>
      <p className="mt-2 text-sm text-slate-500">{section ? `${section.academic_year} · ${section.students_count} ${bt('text055')}` : course ? bt('workSectionCount', { count: courseSections.length }) : bt('workCatalogHint')}</p>
    </div>
    {notice && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}

    {!courseId && !sectionId && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7"><h2 className="text-base font-extrabold text-slate-900">{bt('workCourseCatalog')}</h2><div className="flex flex-wrap gap-2">{can('basic_attendance.manage') && <><Link to="/basic-attendance/monthly-report" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">{bt('managerOverview')}</Link><button type="button" onClick={() => { setError(''); setCourseFormOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800"><Plus size={16} />{bt('text038')}</button></>}</div></div>
      {courses.length ? <div className="divide-y divide-slate-100">{courses.map(item => <div key={item.id} className="flex items-center gap-1 pe-4"><Link to={`/basic-attendance/courses/${item.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-5 py-5 transition hover:bg-teal-50/40 sm:px-7"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><BookOpen size={19} /></span><span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{item.name}</span><span dir="ltr" className={`mt-1 block text-xs text-slate-500 ${ar ? 'text-right' : 'text-left'}`}>{item.code}</span></span><span className="hidden text-xs text-slate-500 sm:block">{(sections.data ?? []).filter(row => row.course_id === item.id).length} {bt('workSectionsCount')}</span><Icon size={18} className="shrink-0 text-slate-400" /></Link>{can('basic_attendance.delete') && <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50" onClick={() => openArchive({ type: 'courses', id: item.id, label: item.name, confirmation: item.code })}>{bt('archiveAction')}</button>}</div>)}</div> : <p className="p-10 text-center text-sm text-slate-500">{bt('workNoCourses')}</p>}
    </section>}

    {courseId && !sectionId && (course ? <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7"><h2 className="text-base font-extrabold text-slate-900">{bt('workSections')}</h2>{can('basic_attendance.manage') && <button type="button" onClick={() => { setError(''); setSectionFormOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50"><Plus size={16} />{bt('text053')}</button>}</div>
      {courseSections.length ? <div className="divide-y divide-slate-100">{courseSections.map(item => <div key={item.id} className="flex items-center gap-1 pe-4"><Link to={`/basic-attendance/sections/${item.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-5 py-5 transition hover:bg-teal-50/40 sm:px-7"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><CalendarDays size={19} /></span><span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{bt('workSectionNumber', { number: item.number })}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.academic_year} · {item.lecturers.map(lecturer => lecturer.name).join('، ')}</span></span><span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Users size={14} />{item.students_count}</span><Icon size={18} className="shrink-0 text-slate-400" /></Link>{can('basic_attendance.delete') && <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-50" onClick={() => openArchive({ type: 'sections', id: item.id, label: `${course.name} · ${bt('workSectionNumber', { number: item.number })}`, confirmation: item.number })}>{bt('archiveAction')}</button>}</div>)}</div> : <p className="p-10 text-center text-sm text-slate-500">{bt('workNoSections')}</p>}
    </section> : <ErrorState title={bt('workNotFound')} />)}

    {sectionId && (section ? <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><nav aria-label={bt('workSectionNav')} className="flex gap-1 border-b border-slate-100 p-2 sm:px-5">{tabs.map(tab => { const target = `/basic-attendance/sections/${section.id}${tab.suffix}`; const active = pathname === target; return <Link key={tab.mode} to={target} aria-current={active ? 'page' : undefined} className={`flex-1 rounded-xl px-2 py-3 text-center text-sm font-bold transition sm:flex-none sm:px-5 ${active ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{tab.label}</Link>; })}</nav><div className="p-4 sm:p-6"><BasicAttendanceSection key={`${section.id}-${pathname}`} section={section} current={pathname.endsWith('/lectures') ? 'lectures' : pathname.endsWith('/report') ? 'report' : 'roster'} /></div></section> : <ErrorState title={bt('workNotFound')} />)}

    {courseFormOpen && <CatalogDialog title={bt('text038')} busy={busy} onClose={() => setCourseFormOpen(false)}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(() => apiFetch('/basic-attendance/courses', { method: 'POST', body: courseForm }), () => { setCourseFormOpen(false); setCourseForm({ code: '', name: '', academic_level: 'first' }); }); }}>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="block text-xs font-bold text-slate-700">{bt('text033')}<input autoFocus required maxLength={255} className={inputClass} value={courseForm.name} onChange={event => setCourseForm({ ...courseForm, name: event.target.value })} /></label>
      <label className="block text-xs font-bold text-slate-700">{bt('text032')}<input required maxLength={40} dir="ltr" className={inputClass} value={courseForm.code} onChange={event => setCourseForm({ ...courseForm, code: event.target.value })} /></label>
      <label className="block text-xs font-bold text-slate-700">{bt('text034')}<select className={inputClass} value={courseForm.academic_level} onChange={event => setCourseForm({ ...courseForm, academic_level: event.target.value })}><option value="first">{bt('text035')}</option><option value="second">{bt('text036')}</option><option value="third">{bt('text037')}</option></select></label>
      <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={busy} onClick={() => setCourseFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">{bt('workCancel')}</button><button type="submit" disabled={busy} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white">{bt('text038')}</button></div>
    </form></CatalogDialog>}

    {sectionFormOpen && course && <CatalogDialog title={bt('text053')} busy={busy} onClose={() => setSectionFormOpen(false)}><form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(() => apiFetch('/basic-attendance/sections', { method: 'POST', body: { ...sectionForm, course_id: course.id, is_active: true } }), () => { setSectionFormOpen(false); setSectionForm({ number: '', academic_year: currentYear(), semester: 'first', lecturer_ids: [] }); }); }}>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-sm font-bold text-slate-800">{course.name}</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-slate-700">{bt('text043')}<input autoFocus required maxLength={30} className={inputClass} value={sectionForm.number} onChange={event => setSectionForm({ ...sectionForm, number: event.target.value })} /></label><label className="block text-xs font-bold text-slate-700">{bt('text044')}<input required maxLength={30} className={inputClass} value={sectionForm.academic_year} onChange={event => setSectionForm({ ...sectionForm, academic_year: event.target.value })} /></label></div>
      <label className="block text-xs font-bold text-slate-700">{bt('text045')}<select className={inputClass} value={sectionForm.semester} onChange={event => setSectionForm({ ...sectionForm, semester: event.target.value })}><option value="first">{bt('text046')}</option><option value="second">{bt('text047')}</option><option value="summer">{bt('text048')}</option></select></label>
      <fieldset><legend className="text-xs font-bold text-slate-700">{bt('text049')}</legend><div className="mt-2 max-h-44 space-y-2 overflow-y-auto">{options.data?.lecturers.map(lecturer => <label key={lecturer.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><input type="checkbox" checked={sectionForm.lecturer_ids.includes(lecturer.id)} onChange={event => setSectionForm({ ...sectionForm, lecturer_ids: event.target.checked ? [...sectionForm.lecturer_ids, lecturer.id] : sectionForm.lecturer_ids.filter(id => id !== lecturer.id) })} />{lecturer.name}</label>)}</div></fieldset>
      <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={busy} onClick={() => setSectionFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">{bt('workCancel')}</button><button type="submit" disabled={busy || !sectionForm.lecturer_ids.length} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{bt('text053')}</button></div>
    </form></CatalogDialog>}

    {archive && <BasicArchiveDialog key={`${archive.type}-${archive.id}`} label={archive.label} confirmation={archive.confirmation} busy={busy} error={error} onClose={() => setArchive(null)} onConfirm={reason => void submit(() => apiFetch(`/basic-attendance/${archive.type}/${archive.id}`, { method: 'DELETE', body: { confirm: archive.confirmation, reason } }), () => { setArchive(null); setNotice(bt('archiveDone')); })} />}
  </main>;
}

function CatalogDialog({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/25 p-4"><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl"><header className="mb-5 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label={bt('workClose')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button></header>{children}</section></div>;
}
