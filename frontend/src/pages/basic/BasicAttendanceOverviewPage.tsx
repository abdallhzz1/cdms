import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { basicLocale, basicText as bt } from '@/i18n/basicAttendance';

type LecturerTotals = { lecturer_id: number; lecturer_name: string | null; lectures: number; present: number; absent: number; excused: number; late: number };
type OverviewSection = { id: number; number: string; academic_year: string; course_id: number; course_code: string; course_name: string; students_count: number; assigned_lecturers: { id: number; name: string }[]; lecturers: LecturerTotals[] };
type Overview = { month: string; sections: OverviewSection[] };
const thisMonth = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; };

export function BasicAttendanceOverviewPage() {
  const { can } = useAuth();
  const [month, setMonth] = useState(thisMonth);
  const [courseId, setCourseId] = useState('');
  const [lecturerId, setLecturerId] = useState('');
  const ar = basicLocale() === 'ar';
  const data = useQuery({ queryKey: ['basic-monthly-overview', month], queryFn: () => apiFetch<Overview>(`/basic-attendance/monthly-overview?month=${month}`), enabled: can('basic_attendance.manage') && /^\d{4}-\d{2}$/.test(month) });
  const courses = useMemo(() => [...new Map((data.data?.sections ?? []).map(section => [section.course_id, { id: section.course_id, name: section.course_name }])).values()], [data.data]);
  const lecturers = useMemo(() => [...new Map((data.data?.sections ?? []).flatMap(section => [...section.assigned_lecturers, ...section.lecturers.map(lecturer => ({ id: lecturer.lecturer_id, name: lecturer.lecturer_name ?? '—' }))]).map(lecturer => [lecturer.id, lecturer])).values()], [data.data]);
  const sections = (data.data?.sections ?? []).filter(section => (!courseId || section.course_id === Number(courseId)) && (!lecturerId || section.assigned_lecturers.some(lecturer => lecturer.id === Number(lecturerId)) || section.lecturers.some(lecturer => lecturer.lecturer_id === Number(lecturerId))));
  const groups = [...new Map(sections.map(section => [section.course_id, section.course_name])).entries()];
  if (!can('basic_attendance.manage')) return <ErrorState />;
  const Back = ar ? ArrowRight : ArrowLeft;
  return <main dir={ar ? 'rtl' : 'ltr'} className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="border-b border-slate-200 pb-5"><Link to="/basic-attendance" className="inline-flex items-center gap-2 text-sm font-bold text-teal-700"><Back size={16} />{bt('workCourses')}</Link><p className="mt-4 text-xs font-bold text-teal-700">{bt('text017')}</p><h1 className="mt-1 text-2xl font-black text-slate-900">{bt('managerOverview')}</h1><p className="mt-2 text-sm text-slate-500">{bt('managerOverviewHint')}</p></header>
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3"><label className="text-xs font-bold text-slate-700">{bt('workReportMonth')}<input type="month" className="input mt-2 w-full" value={month} onChange={event => setMonth(event.target.value)} /></label><label className="text-xs font-bold text-slate-700">{bt('text041')}<select className="input mt-2 w-full" value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">{bt('overviewCourse')}</option>{courses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label><label className="text-xs font-bold text-slate-700">{bt('text049')}<select className="input mt-2 w-full" value={lecturerId} onChange={event => setLecturerId(event.target.value)}><option value="">{bt('overviewLecturer')}</option>{lecturers.map(lecturer => <option key={lecturer.id} value={lecturer.id}>{lecturer.name ?? '—'}</option>)}</select></label></section>
    {data.isLoading ? <LoadingState /> : data.isError ? <ErrorState onRetry={() => data.refetch()} /> : groups.length ? groups.map(([id, name]) => <section key={id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><header className="border-b border-slate-100 bg-slate-50 px-5 py-4"><h2 className="text-lg font-extrabold text-slate-900">{name}</h2></header><div className="divide-y divide-slate-100">{sections.filter(section => section.course_id === id).map(section => {
      const relevant = lecturerId ? section.lecturers.filter(lecturer => lecturer.lecturer_id === Number(lecturerId)) : section.lecturers;
      return <article key={section.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{bt('workSectionNumber', { number: section.number })} <span className="text-sm font-normal text-slate-500">· {section.academic_year}</span></h3><p className="mt-1 text-xs text-slate-500">{bt('overviewStudentCount')}: {section.students_count} · {bt('overviewAssigned')}: {section.assigned_lecturers.map(lecturer => lecturer.name).join('، ') || '—'}</p></div><Link to={`/basic-attendance/sections/${section.id}/report`} className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-50">{bt('overviewOpenSection')}</Link></div>
        {relevant.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{relevant.map(lecturer => <div key={lecturer.lecturer_id} className="rounded-xl border border-slate-200 p-3"><p className="font-bold text-slate-800">{lecturer.lecturer_name ?? '—'}</p><div className="mt-3 grid grid-cols-5 gap-2 text-center text-xs">{[[bt('overviewLectures'), lecturer.lectures], [bt('workPresentCount'), lecturer.present], [bt('workAbsentCount'), lecturer.absent], [bt('workExcusedCount'), lecturer.excused], [bt('workLateCount'), lecturer.late]].map(([label, count]) => <span key={String(label)}><strong className="block text-base text-slate-900">{count}</strong><span className="text-slate-500">{label}</span></span>)}</div></div>)}</div> : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">{bt('overviewNoLectures')}</p>}
      </article>;
    })}</div></section>) : <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{bt('overviewNoLectures')}</p>}
  </main>;
}
