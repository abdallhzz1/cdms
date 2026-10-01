import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { basicLocale, basicText as bt } from '@/i18n/basicAttendance';
import { BasicAttendanceSection } from './BasicAttendanceWorkspace';

type Course = { id: number; code: string; name: string; academic_level: string };
type Section = { id: number; course_id: number; course_name: string; course_code: string; number: string; academic_year: string; semester: string; is_active: boolean; students_count: number; lecturers: { id: number; name: string }[]; active_session: { id: number; title: string; state: string; mode: string; opened_at: string } | null };

export function BasicAttendanceCatalogPage() {
  const { can, user } = useAuth();
  const { courseId, sectionId } = useParams();
  const { pathname } = useLocation();
  const ar = basicLocale() === 'ar';
  const sections = useQuery({ queryKey: ['basic-sections', user?.id], queryFn: () => apiFetch<Section[]>('/basic-attendance/sections'), enabled: can('basic_attendance.view') });
  const options = useQuery({ queryKey: ['basic-options'], queryFn: () => apiFetch<{ courses: Course[] }>('/basic-attendance/options'), enabled: can('basic_attendance.manage') });
  if (!can('basic_attendance.view')) return <ErrorState />;
  if (sections.isLoading || options.isLoading) return <LoadingState />;
  if (sections.isError || options.isError) return <ErrorState onRetry={() => { void sections.refetch(); void options.refetch(); }} />;

  const courses = options.data?.courses ?? [...new Map((sections.data ?? []).map(section => [section.course_id, { id: section.course_id, code: section.course_code, name: section.course_name, academic_level: '' }])).values()];
  const course = courses.find(item => item.id === Number(courseId)) ?? (sectionId ? courses.find(item => item.id === sections.data?.find(section => section.id === Number(sectionId))?.course_id) : undefined);
  const section = sections.data?.find(item => item.id === Number(sectionId));
  const Icon = ar ? ChevronLeft : ChevronRight;
  const Back = ar ? ArrowRight : ArrowLeft;
  const tabs = [
    { suffix: '', label: bt('workRoster'), mode: 'roster' as const },
    { suffix: '/lectures', label: bt('workLectures'), mode: 'lectures' as const },
    { suffix: '/report', label: bt('workReport'), mode: 'report' as const },
  ];

  return <main dir={ar ? 'rtl' : 'ltr'} className="mx-auto max-w-6xl space-y-5 pb-12">
    <div className="border-b border-slate-200 pb-5">
      {course && <Link to={section ? `/basic-attendance/courses/${course.id}` : '/basic-attendance'} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900"><Back size={16} />{section ? course.name : bt('workCourses')}</Link>}
      <p className="text-xs font-bold text-teal-700">{bt('text017')}</p>
      <h1 className="mt-1 text-2xl font-black text-slate-900">{section ? `${bt('workSectionNumber', { number: section.number })} · ${course?.name ?? section.course_name}` : course ? course.name : bt('workCourses')}</h1>
      <p className="mt-2 text-sm text-slate-500">{section ? `${section.academic_year} · ${section.students_count} ${bt('text055')}` : course ? bt('workSectionCount', { count: (sections.data ?? []).filter(item => item.course_id === course.id).length }) : bt('workCatalogHint')}</p>
    </div>

    {!courseId && !sectionId && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7"><h2 className="text-base font-extrabold text-slate-900">{bt('workCourseCatalog')}</h2>{can('basic_attendance.manage') && <Link to="/basic-attendance/setup/courses" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800"><Plus size={16} />{bt('text038')}</Link>}</div>
      {courses.length ? <div className="divide-y divide-slate-100">{courses.map(item => <Link key={item.id} to={`/basic-attendance/courses/${item.id}`} className="flex items-center gap-4 px-5 py-5 transition hover:bg-teal-50/40 sm:px-7"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><BookOpen size={19} /></span><span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{item.name}</span><span dir="ltr" className="mt-1 block text-start text-xs text-slate-500">{item.code}</span></span><span className="hidden text-xs text-slate-500 sm:block">{(sections.data ?? []).filter(row => row.course_id === item.id).length} {bt('workSectionsCount')}</span><Icon size={18} className="shrink-0 text-slate-400" /></Link>)}</div> : <p className="p-10 text-center text-sm text-slate-500">{bt('workNoCourses')}</p>}
    </section>}

    {courseId && !sectionId && (course ? <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-7"><h2 className="text-base font-extrabold text-slate-900">{bt('workSections')}</h2>{can('basic_attendance.manage') && <Link to={`/basic-attendance/setup/sections?course=${course.id}`} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50"><Plus size={16} />{bt('text053')}</Link>}</div>
      {(sections.data ?? []).filter(item => item.course_id === course.id).length ? <div className="divide-y divide-slate-100">{(sections.data ?? []).filter(item => item.course_id === course.id).map(item => <Link key={item.id} to={`/basic-attendance/sections/${item.id}`} className="flex items-center gap-4 px-5 py-5 transition hover:bg-teal-50/40 sm:px-7"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><CalendarDays size={19} /></span><span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{bt('workSectionNumber', { number: item.number })}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.academic_year} · {item.lecturers.map(lecturer => lecturer.name).join('، ')}</span></span><span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"><Users size={14} />{item.students_count}</span><Icon size={18} className="shrink-0 text-slate-400" /></Link>)}</div> : <p className="p-10 text-center text-sm text-slate-500">{bt('workNoSections')}</p>}
    </section> : <ErrorState title={bt('workNotFound')} />)}

    {sectionId && (section ? <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><nav aria-label={bt('workSectionNav')} className="flex gap-1 border-b border-slate-100 p-2 sm:px-5">{tabs.map(tab => { const target = `/basic-attendance/sections/${section.id}${tab.suffix}`; const active = pathname === target; return <Link key={tab.mode} to={target} aria-current={active ? 'page' : undefined} className={`flex-1 rounded-xl px-2 py-3 text-center text-sm font-bold transition sm:flex-none sm:px-5 ${active ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{tab.label}</Link>; })}</nav><div className="p-4 sm:p-6"><BasicAttendanceSection key={`${section.id}-${pathname}`} section={section} current={pathname.endsWith('/lectures') ? 'lectures' : pathname.endsWith('/report') ? 'report' : 'roster'} /></div></section> : <ErrorState title={bt('workNotFound')} />)}
  </main>;
}
