import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  BellRing,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  ClipboardList,
  Clock,
  Filter,
  Mail,
  RotateCcw,
  Search,
  Send,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';

type AttendanceWarning = {
  student: {
    id: number;
    university_number: string;
    full_name_ar: string;
    full_name_en?: string | null;
    email: string;
  };
  rotation_id: number;
  course: {
    id: number;
    code: string;
    name_ar: string;
    name_en?: string | null;
    credit_hours: number;
  };
  academic_year?: { id: number; name: string } | null;
  clinical_period?: { id:number;code:string;name_ar:string;name_en?:string|null;sequence:number } | null;
  total_required_days: number;
  recorded_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  excused_days: number;
  absence_percentage: number;
  current_threshold: 10 | 20;
  last_sent: Record<'10' | '20', { id: number; sent_at: string } | null>;
};

type AttendanceRecord = {
  id: number;
  status: keyof typeof STATUS_CONFIG;
  excuse_note?: string | null;
  student?: {
    full_name_ar?: string;
    full_name_en?: string | null;
    university_number?: string;
  };
  session?: {
    title?: string;
    session_date?: string;
    training_site?: { name_ar?: string; name_en?: string | null } | null;
    rotation_block?: {
      rotation?: {
        course?: { name_ar?: string; name_en?: string | null; code?: string } | null;
        clinical_period?: { id:number;code:string;name_ar:string;name_en?:string|null;sequence:number } | null;
      } | null;
    } | null;
  };
  recorder?: { name?: string } | null;
};

type AttendancePayload = {
  items: AttendanceRecord[];
  pagination: { current_page: number; last_page: number; per_page: number; total: number };
  summary: Record<string, number>;
};

type AttendanceOptions = {
  academic_years: Array<{ id: number; code: string; is_current?: boolean }>;
  courses: Array<{ id: number; code: string; name_ar: string; name_en?: string | null }>;
  clinical_periods: Array<{ id: number; code: string; name_ar: string; name_en?: string | null; sequence: number }>;
  training_sites: Array<{ id: number; name_ar: string; name_en?: string | null }>;
  sessions: Array<{ id: number; session_date: string; title: string; clinical_period_id?: number | null }>;
};

type AttendanceGap = {
  date: string;
  expected_students: number;
  recorded_students: number;
  missing_students: number;
  group_name?: string | null;
  course?: { code: string; name_ar: string; name_en?: string | null } | null;
  training_site?: { name_ar: string; name_en?: string | null } | null;
  supervisor?: { full_name_ar: string; full_name_en?: string | null } | null;
};

const STATUS_CONFIG: Record<string, {
  icon: LucideIcon;
  label_ar: string;
  label_en: string;
  className: string;
}> = {
  present: { icon: CheckCircle, label_ar: 'حاضر', label_en: 'Present', className: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
  absent: { icon: XCircle, label_ar: 'غائب', label_en: 'Absent', className: 'border-rose-100 bg-rose-50 text-rose-700' },
  late: { icon: Clock, label_ar: 'متأخر', label_en: 'Late', className: 'border-amber-100 bg-amber-50 text-amber-700' },
  excused: { icon: AlertCircle, label_ar: 'بعذر', label_en: 'Excused', className: 'border-sky-100 bg-sky-50 text-sky-700' },
};

const inputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100';

function readableDate(value: string | null | undefined, locale: string, withTime = false): string {
  if (!value) return '—';
  const dateOnly = value.slice(0, 10);
  const parsed = new Date(withTime ? value : `${dateOnly}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateOnly;

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(parsed);
}

function weekday(value: string | null | undefined, locale: string): string {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', { weekday: 'long' }).format(parsed);
}

function StatusBadge({ status, locale }: { status: string; locale: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.present;
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {locale === 'ar' ? config.label_ar : config.label_en}
    </span>
  );
}

export function AttendanceMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => (ar ? arabic : english);

  const [sessionFilter, setSessionFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'records' | 'alerts' | 'gaps'>('records');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const recordQuery = useQuery({
    queryKey: ['attendance-records', periodFilter, yearFilter, courseFilter, siteFilter, sessionFilter, statusFilter, dateFilter, searchFilter, page],
    queryFn: () => {
      const params = new URLSearchParams({ per_page: '25', page_payload: '1', page: String(page) });
      if (sessionFilter) params.set('clinical_session_id', sessionFilter);
      if (periodFilter) params.set('clinical_period_id', periodFilter);
      if (yearFilter) params.set('academic_year_id', yearFilter);
      if (courseFilter) params.set('course_id', courseFilter);
      if (siteFilter) params.set('training_site_id', siteFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFilter) params.set('date', dateFilter);
      if (searchFilter.trim()) params.set('search', searchFilter.trim());
      return apiFetch<AttendancePayload>(`/attendance-records?${params.toString()}`);
    },
    enabled: can('attendance.review') && activeTab === 'records',
  });

  const optionsQuery = useQuery({
    queryKey: ['attendance-record-options'],
    queryFn: () => apiFetch<AttendanceOptions>('/attendance-records/options'),
    enabled: can('attendance.review'),
  });

  const warningQuery = useQuery({
    queryKey: ['attendance-warnings',periodFilter,yearFilter,courseFilter],
    queryFn: () => { const params=new URLSearchParams(); if(periodFilter)params.set('clinical_period_id',periodFilter);if(yearFilter)params.set('academic_year_id',yearFilter);if(courseFilter)params.set('course_id',courseFilter);return apiFetch<AttendanceWarning[]>(`/attendance-warnings${params.size?`?${params}`:''}`); },
    enabled: can('attendance.review') && activeTab === 'alerts',
  });

  const gapQuery = useQuery({
    queryKey: ['attendance-record-gaps', periodFilter, yearFilter, courseFilter],
    queryFn: () => { const params=new URLSearchParams();if(periodFilter)params.set('clinical_period_id',periodFilter);if(yearFilter)params.set('academic_year_id',yearFilter);if(courseFilter)params.set('course_id',courseFilter);return apiFetch<AttendanceGap[]>(`/attendance-records/gaps${params.size?`?${params}`:''}`); },
    enabled: can('attendance.review') && activeTab === 'gaps',
  });

  const sendWarning = useMutation({
    mutationFn: (payload: { student_id: number; rotation_id: number; threshold_percent: 10 | 20; resend?: boolean }) =>
      apiFetch('/attendance-warnings/send', { method: 'POST', body: payload }),
    onSuccess: () => {
      setNotice({
        type: 'success',
        text: tr('تم إرسال الإنذار إلى البريد الجامعي وتوثيقه بنجاح.', 'The warning was emailed and logged successfully.'),
      });
      queryClient.invalidateQueries({ queryKey: ['attendance-warnings'] });
    },
    onError: (error) => {
      setNotice({
        type: 'error',
        text: error instanceof ApiError
          ? error.message
          : tr('تعذر إرسال الإنذار.', 'Could not send the warning.'),
      });
    },
  });

  const records = recordQuery.data?.items ?? [];
  const pagination = recordQuery.data?.pagination ?? { current_page: 1, last_page: 1, per_page: 25, total: 0 };
  const options = optionsQuery.data ?? { academic_years: [], courses: [], clinical_periods: [], training_sites: [], sessions: [] };
  const sessions = options.sessions;
  const warnings = Array.isArray(warningQuery.data) ? warningQuery.data : [];
  const periods = options.clinical_periods;
  const visibleSessions = useMemo(()=>sessions.filter(session=>!periodFilter||String(session.clinical_period_id)===periodFilter),[sessions,periodFilter]);

  const stats = useMemo(
    () => recordQuery.data?.summary ?? {},
    [recordQuery.data?.summary],
  );

  const hasFilters = Boolean(periodFilter || yearFilter || courseFilter || siteFilter || sessionFilter || statusFilter || dateFilter || searchFilter);
  const initialWarnings = warnings.filter((warning) => warning.current_threshold === 10).length;
  const urgentWarnings = warnings.filter((warning) => warning.current_threshold === 20).length;

  const clearFilters = () => {
    setSessionFilter('');
    setPeriodFilter('');
    setYearFilter('');
    setCourseFilter('');
    setSiteFilter('');
    setStatusFilter('');
    setDateFilter('');
    setSearchFilter('');
    setPage(1);
  };

  const handleSend = (warning: AttendanceWarning) => {
    const key = String(warning.current_threshold) as '10' | '20';
    const lastSent = warning.last_sent[key];
    if (
      lastSent
      && !window.confirm(tr(
        'سبق إرسال هذا المستوى من الإنذار. هل تريد إعادة إرساله؟',
        'This warning level was already sent. Send it again?',
      ))
    ) return;

    setNotice(null);
    sendWarning.mutate({
      student_id: warning.student.id,
      rotation_id: warning.rotation_id,
      threshold_percent: warning.current_threshold,
      resend: Boolean(lastSent),
    });
  };

  if (!can('attendance.review')) {
    return <ErrorState title={tr('لا تملك صلاحية عرض سجل الحضور', 'Access denied')} />;
  }
  if (activeTab === 'records' && recordQuery.isLoading) return <LoadingState />;
  if (activeTab === 'records' && recordQuery.isError) return <ErrorState onRetry={() => recordQuery.refetch()} />;

  const statCards: Array<{ status: string; value: number }> = [
    { status: 'present', value: stats.present ?? 0 },
    { status: 'absent', value: stats.absent ?? 0 },
    { status: 'late', value: stats.late ?? 0 },
    { status: 'excused', value: stats.excused ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-[1280px] space-y-5 pb-12">
      <PageHeader
        title={tr('سجل الحضور والغياب', 'Attendance Records')}
        description={tr(
          'متابعة يومية للحضور، ونسب الغياب، والتنبيهات الأكاديمية من شاشة عمل واحدة.',
          'Daily attendance, absence rates, and academic alerts in one workspace.',
        )}
      />

      <div className="grid grid-cols-3 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button type="button" onClick={() => setActiveTab('records')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${activeTab === 'records' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {tr('سجل الحضور', 'Attendance records')}
        </button>
        <button type="button" onClick={() => setActiveTab('alerts')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${activeTab === 'alerts' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {tr('تنبيهات الغياب', 'Absence alerts')}
        </button>
        <button type="button" onClick={() => setActiveTab('gaps')} className={`rounded-xl px-4 py-2.5 text-xs font-black transition ${activeTab === 'gaps' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
          {tr('نواقص الرصد', 'Recording gaps')}
        </button>
      </div>

      {(activeTab === 'alerts' || activeTab === 'gaps') && <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('العام الأكاديمي','Academic year')}</span><select value={yearFilter} onChange={event=>setYearFilter(event.target.value)} className={inputClass}><option value="">{tr('جميع الأعوام','All years')}</option>{options.academic_years.map(year=><option key={year.id} value={year.id}>{year.code}</option>)}</select></label>
        <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('المساق','Course')}</span><select value={courseFilter} onChange={event=>setCourseFilter(event.target.value)} className={inputClass}><option value="">{tr('جميع المساقات','All courses')}</option>{options.courses.map(course=><option key={course.id} value={course.id}>{course.code} — {ar?course.name_ar:course.name_en||course.name_ar}</option>)}</select></label>
        <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('الفترة السريرية','Clinical period')}</span><select value={periodFilter} onChange={event=>setPeriodFilter(event.target.value)} className={inputClass}><option value="">{tr('جميع الفترات','All periods')}</option>{periods.map(period=><option key={period.id} value={period.id}>{period.code} — {ar?period.name_ar:period.name_en||period.name_ar}</option>)}</select></label>
      </section>}

      {activeTab === 'records' && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">{tr('ملخص النتائج الحالية', 'Current results summary')}</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {tr('يتغير الملخص مباشرة حسب الفلاتر المختارة.', 'The summary follows the selected filters.')}
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-500">
            {tr(`${pagination.total} سجل مطابق`, `${pagination.total} matching records`)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
          {statCards.map(({ status, value }) => {
            const config = STATUS_CONFIG[status];
            const Icon = config.icon;
            return (
              <div key={status} className="flex items-center gap-3 bg-white px-4 py-4 sm:justify-center">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-lg font-black leading-none text-slate-900">{value}</p>
                  <p className="mt-1 text-[11px] font-bold text-slate-500">{ar ? config.label_ar : config.label_en}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>}

      {activeTab === 'alerts' && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <BellRing className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">{tr('تنبيهات تجاوز الغياب', 'Absence threshold alerts')}</h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                {tr(
                  'إجمالي أيام المساق = الساعات المعتمدة × 5. يحتسب الغياب الفعلي فقط، ولا يدخل التأخير أو الغياب بعذر في نسبة الإنذار.',
                  'Course days equal credit hours × 5. Only actual absence counts toward alerts; lateness and excused absence are excluded.',
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-black">
            <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5 text-teal-700">
              {tr(`تنبيه أولي: ${initialWarnings}`, `Initial notice: ${initialWarnings}`)}
            </span>
            <span className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-teal-800">
              {tr(`إنذار رسمي: ${urgentWarnings}`, `Formal warning: ${urgentWarnings}`)}
            </span>
          </div>
        </header>

        {notice && (
          <div className="px-4 pt-4 sm:px-5">
            <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-bold ${
              notice.type === 'success'
                ? 'border-teal-100 bg-teal-50 text-teal-800'
                : 'border-rose-100 bg-rose-50 text-rose-700'
            }`}>
              <span className="flex items-center gap-2">
                {notice.type === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                {notice.text}
              </span>
              <button type="button" onClick={() => setNotice(null)} className="rounded-lg p-1 opacity-60 transition hover:bg-white hover:opacity-100" aria-label={tr('إغلاق', 'Close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {warningQuery.isLoading ? (
          <div className="p-8 text-center text-xs font-semibold text-slate-500">
            {tr('جاري احتساب نسب الغياب...', 'Calculating absence rates...')}
          </div>
        ) : warningQuery.isError ? (
          <div className="p-8 text-center">
            <p className="text-xs font-bold text-rose-600">{tr('تعذر تحميل تنبيهات الغياب.', 'Could not load absence alerts.')}</p>
            <button type="button" onClick={() => warningQuery.refetch()} className="mt-3 rounded-xl border border-teal-200 px-4 py-2 text-xs font-bold text-teal-700">
              {tr('إعادة المحاولة', 'Retry')}
            </button>
          </div>
        ) : warnings.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <CheckCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-black text-slate-800">{tr('الوضع مطمئن', 'All clear')}</p>
            <p className="text-xs text-slate-500">{tr('لا يوجد طلبة تجاوزوا حدود الغياب حالياً.', 'No students currently exceed an absence threshold.')}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {warnings.map((warning) => {
              const isUrgent = warning.current_threshold === 20;
              const warningKey = String(warning.current_threshold) as '10' | '20';
              const lastSent = warning.last_sent[warningKey];
              const studentName = ar
                ? warning.student.full_name_ar
                : warning.student.full_name_en || warning.student.full_name_ar;
              const courseName = ar
                ? warning.course.name_ar
                : warning.course.name_en || warning.course.name_ar;
              const isSending = sendWarning.isPending
                && sendWarning.variables?.student_id === warning.student.id
                && sendWarning.variables?.rotation_id === warning.rotation_id;

              return (
                <article key={`${warning.student.id}-${warning.rotation_id}`} className="px-4 py-5 transition hover:bg-slate-50/60 sm:px-5">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)_12rem] xl:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-sm font-black text-teal-700">
                        {studentName.trim().charAt(0) || <UserRound className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-black text-slate-900">{studentName}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${
                            isUrgent
                              ? 'border-teal-200 bg-teal-100 text-teal-800'
                              : 'border-teal-100 bg-teal-50 text-teal-700'
                          }`}>
                            {tr(isUrgent ? 'إنذار رسمي · تجاوز 20%' : 'تنبيه أولي · تجاوز 10%', isUrgent ? 'Formal warning · over 20%' : 'Initial notice · over 10%')}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span className="font-bold text-slate-600">{warning.student.university_number}</span>
                          <span dir="ltr" className="truncate">{warning.student.email}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">
                            <BookOpen className="h-3.5 w-3.5 text-teal-600" />
                            {courseName} · {warning.course.code}
                          </span>
                          {warning.academic_year?.name && (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 font-bold text-slate-600">
                              <CalendarDays className="h-3.5 w-3.5 text-teal-600" />
                              {warning.academic_year.name}
                            </span>
                          )}
                          {warning.clinical_period&&<span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 font-bold text-indigo-700">{ar?warning.clinical_period.name_ar:warning.clinical_period.name_en||warning.clinical_period.name_ar}</span>}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500">{tr('نسبة الغياب المسجلة', 'Recorded absence rate')}</p>
                          <p className="mt-1 text-2xl font-black text-teal-700">{Number(warning.absence_percentage).toFixed(1)}%</p>
                        </div>
                        <p className="text-[11px] font-bold text-slate-500">
                          {tr(
                            `${warning.absent_days} غياب من ${warning.total_required_days} أيام`,
                            `${warning.absent_days} absent of ${warning.total_required_days} days`,
                          )}
                        </p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${Math.min(100, Number(warning.absence_percentage))}%` }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500">
                        <span>{tr('تأخير', 'Late')}: <b className="text-slate-700">{warning.late_days}</b></span>
                        <span>{tr('بعذر', 'Excused')}: <b className="text-slate-700">{warning.excused_days}</b></span>
                        <span>{tr('أيام مرصودة', 'Recorded days')}: <b className="text-slate-700">{warning.recorded_days}</b></span>
                      </div>
                    </div>

                    <div className="xl:text-center">
                      {lastSent && (
                        <p className="mb-2 text-[10px] font-semibold text-slate-400">
                          {tr('آخر إرسال', 'Last sent')}: {readableDate(lastSent.sent_at, locale, true)}
                        </p>
                      )}
                      {can('attendance.notify') ? (
                        <button
                          type="button"
                          disabled={sendWarning.isPending}
                          onClick={() => handleSend(warning)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isSending ? (
                            <RotateCcw className="h-4 w-4 animate-spin" />
                          ) : lastSent ? (
                            <Mail className="h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {tr(lastSent ? 'إعادة الإرسال' : 'إرسال للطالب', lastSent ? 'Resend' : 'Email student')}
                        </button>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-semibold text-slate-500">
                          {tr('يلزم منح صلاحية إرسال الإنذارات.', 'Notification permission is required.')}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>}

      {activeTab === 'gaps' && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">{tr('أيام التدريب التي لم يكتمل رصدها','Training days with incomplete recording')}</h2><p className="mt-1 text-[11px] text-slate-500">{tr('يعتمد الكشف على الجدول المنشور وأيام دوام المشرف حتى تاريخ اليوم.','Based on the published schedule and supervisor working days up to today.')}</p></header>
        {gapQuery.isLoading ? <div className="p-8 text-center text-xs font-bold text-slate-500">{tr('جاري فحص اكتمال الرصد...','Checking recording completeness...')}</div>
          : gapQuery.isError ? <div className="p-8 text-center text-xs font-bold text-rose-600">{tr('تعذر فحص نواقص الرصد.','Could not check recording gaps.')}</div>
          : !(gapQuery.data?.length) ? <div className="p-6"><EmptyState message={tr('لا توجد أيام تدريب ناقصة ضمن الاختيار الحالي.','No incomplete training days match the current selection.')}/></div>
          : <div className="divide-y divide-slate-100">{gapQuery.data.map((gap,index)=>{
            const courseName=ar?gap.course?.name_ar:gap.course?.name_en||gap.course?.name_ar;
            const siteName=ar?gap.training_site?.name_ar:gap.training_site?.name_en||gap.training_site?.name_ar;
            const supervisorName=ar?gap.supervisor?.full_name_ar:gap.supervisor?.full_name_en||gap.supervisor?.full_name_ar;
            return <article key={`${gap.date}-${gap.course?.code}-${gap.group_name}-${index}`} className="grid gap-3 px-5 py-4 md:grid-cols-[9rem_1fr_1fr_10rem] md:items-center">
              <div><p className="text-xs font-black text-slate-800">{weekday(gap.date,locale)}</p><p dir="ltr" className="mt-1 text-start text-[11px] text-slate-500">{readableDate(gap.date,locale)}</p></div>
              <div><p className="text-xs font-black text-slate-800">{courseName||'—'} {gap.course?.code?`· ${gap.course.code}`:''}</p><p className="mt-1 text-[11px] text-slate-500">{tr('المجموعة','Group')}: {gap.group_name||'—'} · {siteName||'—'}</p></div>
              <p className="text-[11px] font-bold text-slate-600">{supervisorName||tr('مشرف غير محدد','Unassigned supervisor')}</p>
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-center"><p className="text-sm font-black text-rose-700">{gap.missing_students}</p><p className="text-[10px] font-bold text-rose-600">{tr(`غير مرصود من ${gap.expected_students}`,`missing of ${gap.expected_students}`)}</p></div>
            </article>;
          })}</div>}
      </section>}

      {activeTab === 'records' && <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-teal-700" />
            <div>
              <h2 className="text-sm font-black text-slate-900">{tr('تصفية سجل الحضور', 'Filter attendance records')}</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">{tr('اختر جلسة أو حالة أو تاريخاً محدداً.', 'Choose a session, status, or date.')}</p>
            </div>
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:bg-teal-50 hover:text-teal-700">
              <RotateCcw className="h-3.5 w-3.5" />
              {tr('مسح الفلاتر', 'Clear filters')}
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative xl:col-span-2"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('البحث عن طالب','Search for a student')}</span><Search className="absolute bottom-3 start-3 h-4 w-4 text-slate-400"/><input value={searchFilter} onChange={event=>{setSearchFilter(event.target.value);setPage(1)}} placeholder={tr('الاسم أو الرقم الجامعي...','Name or university number...')} className={`${inputClass} ps-9`}/></label>
          <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('العام الأكاديمي','Academic year')}</span><select value={yearFilter} onChange={event=>{setYearFilter(event.target.value);setPage(1)}} className={inputClass}><option value="">{tr('جميع الأعوام','All years')}</option>{options.academic_years.map(year=><option key={year.id} value={year.id}>{year.code}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('المساق','Course')}</span><select value={courseFilter} onChange={event=>{setCourseFilter(event.target.value);setPage(1)}} className={inputClass}><option value="">{tr('جميع المساقات','All courses')}</option>{options.courses.map(course=><option key={course.id} value={course.id}>{course.code} — {ar?course.name_ar:course.name_en||course.name_ar}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('الفترة السريرية','Clinical period')}</span><select value={periodFilter} onChange={event=>{setPeriodFilter(event.target.value);setSessionFilter('');setPage(1)}} className={inputClass}><option value="">{tr('جميع الفترات','All periods')}</option>{periods.map(period=><option key={period.id} value={period.id}>{period.code} — {ar?period.name_ar:period.name_en||period.name_ar}</option>)}</select></label>
          <label>
            <span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('الجلسة السريرية', 'Clinical session')}</span>
            <select value={sessionFilter} onChange={(event) => {setSessionFilter(event.target.value);setPage(1)}} className={inputClass}>
              <option value="">{tr('جميع الجلسات', 'All sessions')}</option>
              {visibleSessions.map((session: any) => (
                <option key={session.id} value={session.id}>
                  {readableDate(session.session_date, locale)} — {session.title}
                </option>
              ))}
            </select>
          </label>
          <label><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('الموقع التدريبي','Training site')}</span><select value={siteFilter} onChange={event=>{setSiteFilter(event.target.value);setPage(1)}} className={inputClass}><option value="">{tr('جميع المواقع','All sites')}</option>{options.training_sites.map(site=><option key={site.id} value={site.id}>{ar?site.name_ar:site.name_en||site.name_ar}</option>)}</select></label>
          <label>
            <span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('حالة الحضور', 'Attendance status')}</span>
            <select value={statusFilter} onChange={(event) => {setStatusFilter(event.target.value);setPage(1)}} className={inputClass}>
              <option value="">{tr('جميع الحالات', 'All statuses')}</option>
              {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>{ar ? config.label_ar : config.label_en}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-bold text-slate-600">{tr('تاريخ الجلسة', 'Session date')}</span>
            <input dir="ltr" type="date" value={dateFilter} onChange={(event) => {setDateFilter(event.target.value);setPage(1)}} className={inputClass} />
          </label>
        </div>
      </section>}

      {activeTab === 'records' && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ClipboardList className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-black text-slate-900">{tr('سجلات الطلبة', 'Student records')}</h2>
              <p className="mt-0.5 text-[10px] text-slate-500">{tr(`${pagination.total} نتيجة ضمن الاختيار الحالي`, `${pagination.total} results in the current view`)}</p>
            </div>
          </div>
        </header>

        {records.length === 0 ? (
          <div className="p-6"><EmptyState message={tr('لا توجد سجلات حضور ضمن الاختيار الحالي.', 'No attendance records match the current selection.')} /></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-start">
                <thead>
                  <tr className="bg-slate-50/70 text-[11px] font-bold text-slate-500">
                    <th className="px-5 py-3.5 text-start">{tr('الطالب', 'Student')}</th>
                    <th className="px-5 py-3.5 text-start">{tr('الجلسة', 'Session')}</th>
                    <th className="px-5 py-3.5 text-start">{tr('اليوم', 'Day')}</th>
                    <th className="px-5 py-3.5 text-start">{tr('التاريخ', 'Date')}</th>
                    <th className="px-5 py-3.5 text-start">{tr('المساق والموقع', 'Course and site')}</th>
                    <th className="px-5 py-3.5 text-start">{tr('الحالة', 'Status')}</th>
                    <th className="px-5 py-3.5 text-start">{tr('التوثيق', 'Recorded by')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((record) => {
                    const studentName = ar
                      ? record.student?.full_name_ar
                      : record.student?.full_name_en || record.student?.full_name_ar;
                    const course = record.session?.rotation_block?.rotation?.course;
                    const courseName = ar ? course?.name_ar : course?.name_en || course?.name_ar;
                    const site = record.session?.training_site;
                    const siteName = ar ? site?.name_ar : site?.name_en || site?.name_ar;

                    return (
                      <tr key={record.id} className="transition hover:bg-slate-50/60">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-black text-teal-700">
                              {(studentName || '').trim().charAt(0) || <UserRound className="h-4 w-4" />}
                            </span>
                            <div>
                              <p className="text-xs font-black text-slate-900">{studentName || '—'}</p>
                              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{record.student?.university_number || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <p className="max-w-[18rem] truncate text-xs font-bold text-slate-700">{record.session?.title || '—'}</p>
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-slate-600">{weekday(record.session?.session_date, locale)}</td>
                        <td dir="ltr" className="px-5 py-4 text-start text-xs font-bold text-slate-600">{readableDate(record.session?.session_date, locale)}</td>
                        <td className="px-5 py-4">
                          <p className="text-xs font-bold text-slate-700">{courseName || '—'}{course?.code ? ` · ${course.code}` : ''}</p>
                          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Building2 className="h-3 w-3 text-teal-600" />
                            {siteName || tr('غير محدد', 'Not specified')}
                          </p>
                        </td>
                        <td className="px-5 py-4"><StatusBadge status={record.status} locale={locale} /></td>
                        <td className="px-5 py-4">
                          <p className="text-[11px] font-bold text-slate-600">{record.recorder?.name || tr('إدخال نظامي', 'System entry')}</p>
                          <p className="mt-1 max-w-[14rem] truncate text-[10px] text-slate-400">{record.excuse_note || tr('لا توجد ملاحظة', 'No note')}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {records.map((record) => {
                const studentName = ar
                  ? record.student?.full_name_ar
                  : record.student?.full_name_en || record.student?.full_name_ar;
                const course = record.session?.rotation_block?.rotation?.course;
                const courseName = ar ? course?.name_ar : course?.name_en || course?.name_ar;
                const site = record.session?.training_site;
                const siteName = ar ? site?.name_ar : site?.name_en || site?.name_ar;

                return (
                  <article key={record.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xs font-black text-teal-700">
                          {(studentName || '').trim().charAt(0) || <UserRound className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-900">{studentName || '—'}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{record.student?.university_number || '—'}</p>
                        </div>
                      </div>
                      <StatusBadge status={record.status} locale={locale} />
                    </div>
                    <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3 text-[11px] text-slate-600">
                      <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" /><span><b>{record.session?.title || '—'}</b><br />{weekday(record.session?.session_date, locale)} · <span dir="ltr">{readableDate(record.session?.session_date, locale)}</span></span></p>
                      <p className="flex items-start gap-2"><BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" /><span>{courseName || '—'}{course?.code ? ` · ${course.code}` : ''}</span></p>
                      <p className="flex items-start gap-2"><Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" /><span>{siteName || tr('الموقع غير محدد', 'Site not specified')}</span></p>
                    </div>
                    {(record.recorder?.name || record.excuse_note) && (
                      <p className="mt-3 text-[10px] text-slate-500">
                        {record.recorder?.name || tr('إدخال نظامي', 'System entry')}
                        {record.excuse_note ? ` · ${record.excuse_note}` : ''}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
            {pagination.last_page > 1 && <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <p className="text-[11px] font-bold text-slate-500">{tr(`صفحة ${pagination.current_page} من ${pagination.last_page}`, `Page ${pagination.current_page} of ${pagination.last_page}`)}</p>
              <div className="flex gap-2">
                <button type="button" disabled={pagination.current_page <= 1 || recordQuery.isFetching} onClick={() => setPage(current => Math.max(1, current - 1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5"/>{tr('السابق','Previous')}</button>
                <button type="button" disabled={pagination.current_page >= pagination.last_page || recordQuery.isFetching} onClick={() => setPage(current => Math.min(pagination.last_page, current + 1))} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-40">{tr('التالي','Next')}<ChevronLeft className="h-3.5 w-3.5"/></button>
              </div>
            </div>}
          </>
        )}
      </section>}
    </div>
  );
}
