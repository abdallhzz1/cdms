import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpenCheck, CalendarDays, GraduationCap, Search, UserCheck, Users } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { AdvisingNavTabs } from '@/components/advising/AdvisingNavTabs';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type AdvisorOption = { id: number; name: string; person_id?: number | null };
type AdvisingStudent = {
  id: number; university_number: string; full_name_ar: string; full_name_en?: string | null;
  photo_url?: string | null; academic_level: string; gpa?: number | string | null;
  warning_count: number; academic_advisor?: { full_name_ar: string; full_name_en?: string | null } | null;
  open_advising_count: number; advising_records_max_meeting_date?: string | null;
};
type AdvisingRecord = {
  id: number; meeting_number?: string | null; meeting_date: string; category: string; status: string;
  student?: { id: number; full_name_ar: string; full_name_en?: string | null; university_number: string };
  advisor?: { full_name_ar: string; full_name_en?: string | null } | null;
};
type AdvisingOverview = {
  metrics: { students: number; at_risk: number; without_advisor: number; open_cases: number; sessions_this_month: number };
  level_counts: Record<'fourth' | 'fifth' | 'sixth', number>;
  status_counts: Record<string, number>;
  students: AdvisingStudent[];
  recent_records: AdvisingRecord[];
};

const levelLabel = (level: string, ar: boolean) => ({
  fourth: ar ? 'السنة الرابعة' : 'Fourth year', fifth: ar ? 'السنة الخامسة' : 'Fifth year',
  sixth: ar ? 'السنة السادسة' : 'Sixth year',
}[level] ?? level);

export function AdvisingDashboardPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const ar = locale === 'ar';
  const [level, setLevel] = useState('');
  const [advisorId, setAdvisorId] = useState('');
  const [search, setSearch] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (level) params.set('academic_level', level);
    if (advisorId) params.set('advisor_id', advisorId);
    if (search.trim()) params.set('search', search.trim());
    return params.toString();
  }, [advisorId, level, search]);

  const overviewQuery = useQuery({
    queryKey: ['advising-overview', query],
    queryFn: () => apiFetch<AdvisingOverview>(`/advising-overview${query ? `?${query}` : ''}`),
    enabled: can('advising.view'),
  });
  const advisorsQuery = useQuery({
    queryKey: ['academic-advisor-options'],
    queryFn: () => apiFetch<AdvisorOption[]>('/users/lookup?purpose=advising'),
    enabled: can('advising.assign'),
  });

  if (!can('advising.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (overviewQuery.isLoading) return <LoadingState />;
  if (overviewQuery.isError || !overviewQuery.data) return <ErrorState onRetry={() => overviewQuery.refetch()} />;

  const data = overviewQuery.data;
  const maximumLevel = Math.max(1, ...Object.values(data.level_counts));
  const indicators = [
    { label: ar ? 'الطلبة ضمن نطاقك' : 'Students in scope', value: data.metrics.students, icon: Users },
    { label: ar ? 'حالات تحتاج تدخلاً' : 'Cases requiring attention', value: data.metrics.at_risk, icon: AlertTriangle },
    { label: ar ? 'ملفات إرشاد مفتوحة' : 'Open advising cases', value: data.metrics.open_cases, icon: BookOpenCheck },
    { label: ar ? 'جلسات هذا الشهر' : 'Sessions this month', value: data.metrics.sessions_this_month, icon: CalendarDays },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 pb-14">
      <header className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100"><GraduationCap className="h-5 w-5" /></span>
            <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-teal-600">{ar ? 'الإرشاد الأكاديمي' : 'Academic advising'}</p><h1 className="mt-1 text-lg font-black text-slate-950 sm:text-xl">{ar ? 'متابعة الطلبة والحالات الإرشادية' : 'Student and advising-case follow-up'}</h1><p className="mt-1 max-w-3xl text-[10px] leading-5 text-slate-500 sm:text-xs">{ar ? 'صورة تشغيلية موحدة للطلبة المعينين، مؤشرات التعثر، الجلسات وخطط المتابعة.' : 'A unified operational view of assigned students, risk indicators, sessions, and follow-up plans.'}</p></div>
          </div>
          <div className="flex gap-2">
            {can('advising.assign') && <Link to="/advising/assignments" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-teal-200 px-4 text-[10px] font-bold text-teal-700 transition hover:bg-teal-50 sm:flex-none"><UserCheck className="h-4 w-4" />{ar ? 'تعيين المرشدين' : 'Assign advisors'}</Link>}
            {can('advising.manage') && <Link to="/advising/logs?new=1" className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-[10px] font-black text-white transition hover:bg-teal-700 sm:flex-none"><BookOpenCheck className="h-4 w-4" />{ar ? 'تسجيل جلسة' : 'Log a session'}</Link>}
          </div>
        </div>
      </header>

      <AdvisingNavTabs />

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 border-b border-slate-100 lg:grid-cols-4">
          {indicators.map((item, index) => { const Icon = item.icon; return <div key={item.label} className={`flex min-h-24 items-center gap-3 px-4 py-4 sm:px-5 ${index % 2 ? 'border-s border-slate-100' : ''} ${index > 1 ? 'border-t border-slate-100 lg:border-t-0' : ''} ${index > 0 ? 'lg:border-s lg:border-slate-100' : ''}`}><Icon className="h-4 w-4 shrink-0 text-teal-600" /><div><p className="text-xl font-black tabular-nums text-slate-950">{item.value}</p><p className="mt-1 text-[9px] font-bold leading-4 text-slate-500">{item.label}</p></div></div>; })}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 p-4 sm:p-5 lg:border-e lg:border-slate-100">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="text-sm font-black text-slate-900">{ar ? 'قائمة المتابعة الإرشادية' : 'Advising follow-up roster'}</h2><p className="mt-1 text-[9px] text-slate-400">{ar ? 'مرتبة تلقائياً حسب الإنذارات والمعدل والحاجة للتدخل.' : 'Automatically prioritized by warnings, GPA, and intervention need.'}</p></div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="relative"><Search className="absolute start-3 top-3 h-3.5 w-3.5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'بحث عن طالب...' : 'Search student...'} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-3 text-[10px] outline-none focus:border-teal-300 focus:bg-white" /></label>
                <select value={level} onChange={(event) => setLevel(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600"><option value="">{ar ? 'كل الدفعات' : 'All cohorts'}</option><option value="fourth">{levelLabel('fourth', ar)}</option><option value="fifth">{levelLabel('fifth', ar)}</option><option value="sixth">{levelLabel('sixth', ar)}</option></select>
                {can('advising.assign') && <select value={advisorId} onChange={(event) => setAdvisorId(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600"><option value="">{ar ? 'كل المرشدين' : 'All advisors'}</option>{(advisorsQuery.data ?? []).map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}</select>}
              </div>
            </div>

            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-start text-[10px]"><thead><tr className="border-b border-slate-100 text-slate-400"><th className="px-3 py-3 font-bold">{ar ? 'الطالب' : 'Student'}</th><th className="px-3 py-3 font-bold">{ar ? 'الدفعة' : 'Cohort'}</th><th className="px-3 py-3 font-bold">{ar ? 'المؤشرات' : 'Indicators'}</th><th className="px-3 py-3 font-bold">{ar ? 'المرشد' : 'Advisor'}</th><th className="px-3 py-3 font-bold">{ar ? 'آخر جلسة' : 'Last session'}</th><th className="w-10" /></tr></thead><tbody className="divide-y divide-slate-100">{data.students.map((student) => <StudentRow key={student.id} student={student} ar={ar} />)}</tbody></table></div>
            <div className="divide-y divide-slate-100 md:hidden">{data.students.map((student) => <StudentMobileCard key={student.id} student={student} ar={ar} />)}</div>
            {!data.students.length && <div className="py-14 text-center text-[10px] text-slate-400">{ar ? 'لا يوجد طلاب مطابقون للفلاتر الحالية.' : 'No students match the current filters.'}</div>}
          </div>

          <aside className="space-y-5 bg-slate-50/45 p-4 sm:p-5">
            <div><div className="flex items-center justify-between"><h2 className="text-xs font-black text-slate-900">{ar ? 'توزيع الطلبة' : 'Student distribution'}</h2><span className="text-[9px] font-bold text-teal-700">{data.metrics.students}</span></div><div className="mt-4 space-y-3">{(['fourth', 'fifth', 'sixth'] as const).map((item) => <div key={item}><div className="mb-1.5 flex justify-between text-[9px]"><span className="font-bold text-slate-500">{levelLabel(item, ar)}</span><b className="text-slate-800">{data.level_counts[item]}</b></div><div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${(data.level_counts[item] / maximumLevel) * 100}%` }} /></div></div>)}</div></div>
            <div className="border-t border-slate-200 pt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black text-slate-900">{ar ? 'آخر الجلسات' : 'Recent sessions'}</h2><Link to="/advising/logs" className="text-[9px] font-bold text-teal-700">{ar ? 'عرض السجل' : 'View log'}</Link></div><div className="space-y-2">{data.recent_records.map((record) => <Link key={record.id} to={`/advising/records/${record.id}`} className="block rounded-2xl bg-white p-3 ring-1 ring-slate-100 transition hover:ring-teal-200"><div className="flex items-center justify-between gap-2"><p className="truncate text-[10px] font-black text-slate-700">{ar ? record.student?.full_name_ar : record.student?.full_name_en || record.student?.full_name_ar}</p><span className="shrink-0 text-[8px] text-slate-400">{String(record.meeting_date).slice(0, 10)}</span></div><p className="mt-1 text-[8px] text-slate-400">{categoryLabel(record.category, ar)} · {statusLabel(record.status, ar)}</p></Link>)}{!data.recent_records.length && <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-[9px] text-slate-400">{ar ? 'لم تسجل جلسات بعد.' : 'No sessions recorded yet.'}</p>}</div></div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function StudentRow({ student, ar }: { student: AdvisingStudent; ar: boolean }) {
  const risk = student.warning_count > 0 || (Number(student.gpa) > 0 && Number(student.gpa) < 65);
  return <tr className="transition hover:bg-slate-50"><td className="px-3 py-3"><StudentIdentity student={student} ar={ar} /></td><td className="px-3 py-3 font-bold text-slate-500">{levelLabel(student.academic_level, ar)}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[8px] font-black ${risk ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>{risk ? (ar ? 'يحتاج متابعة' : 'Follow-up needed') : (ar ? 'مستقر' : 'On track')}</span><span className="ms-2 text-[9px] text-slate-400">GPA {student.gpa ?? '—'} · {student.warning_count} ⚑</span></td><td className="px-3 py-3 text-slate-500">{student.academic_advisor ? (ar ? student.academic_advisor.full_name_ar : student.academic_advisor.full_name_en || student.academic_advisor.full_name_ar) : <span className="font-bold text-teal-700">{ar ? 'غير معيّن' : 'Unassigned'}</span>}</td><td className="px-3 py-3 text-slate-400">{student.advising_records_max_meeting_date?.slice(0, 10) ?? '—'}</td><td><Link to={`/advising/logs?student=${student.id}`} className="text-teal-700"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Link></td></tr>;
}

function StudentMobileCard({ student, ar }: { student: AdvisingStudent; ar: boolean }) {
  const risk = student.warning_count > 0 || (Number(student.gpa) > 0 && Number(student.gpa) < 65);
  return <Link to={`/advising/logs?student=${student.id}`} className="block py-4"><div className="flex items-start gap-3"><StudentAvatar student={student} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-800">{ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}</p><p className="mt-1 text-[9px] text-slate-400">{student.university_number} · {levelLabel(student.academic_level, ar)}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500">GPA {student.gpa ?? '—'}</span>{risk && <span className="rounded-full bg-teal-100 px-2 py-1 text-[8px] font-black text-teal-800">{ar ? 'متابعة مطلوبة' : 'Follow-up needed'}</span>}<span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500">{student.open_advising_count} {ar ? 'ملف مفتوح' : 'open'}</span></div></div><ArrowLeft className="mt-2 h-4 w-4 text-slate-300 rtl:rotate-180" /></div></Link>;
}

function StudentIdentity({ student, ar }: { student: AdvisingStudent; ar: boolean }) {
  return <div className="flex items-center gap-2.5"><StudentAvatar student={student} /><div><p className="font-black text-slate-800">{ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}</p><p className="mt-1 font-mono text-[8px] text-slate-400">{student.university_number}</p></div></div>;
}

function StudentAvatar({ student }: { student: AdvisingStudent }) {
  return student.photo_url ? <img src={student.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-black text-teal-700 ring-1 ring-teal-100">{student.full_name_ar?.trim().charAt(0) || 'ط'}</span>;
}

function categoryLabel(category: string, ar: boolean) {
  return ({ academic: ar ? 'أكاديمي' : 'Academic', risk: ar ? 'تعثر وإنذار' : 'Risk', general: ar ? 'عام' : 'General' }[category] ?? category);
}

function statusLabel(status: string, ar: boolean) {
  return status === 'closed' ? (ar ? 'مغلق' : 'Closed') : (ar ? 'مفتوح' : 'Open');
}
