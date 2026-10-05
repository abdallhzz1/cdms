import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Hospital, ShieldCheck } from 'lucide-react';
import { ApiError, apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { isDepartmentScopedHead } from '@/features/departments/courseOwnership';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ProfilePhotoLightbox } from '@/components/ui/ProfilePhotoLightbox';

type Named = { id: number; code?: string; name_ar: string; name_en?: string | null };
type DailyStudent = { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null; photo_url?: string | null; supervisor_ids?: number[] };
type DailySupervisor = { id: number; full_name_ar: string; full_name_en?: string | null; photo_url?: string | null };
type DailyGroup = {
  site: Named; rotation_id: number; course: Named | null; academic_year: { id: number; code: string } | null;
  group: { id: number; name: string }; subgroup: { id: number; name: string };
  supervisors: DailySupervisor[]; students: DailyStudent[];
};
type PortalStatus = { is_enabled: boolean; public_url: string; updated_at: string | null; updated_by: { name: string } | null };
type ScheduleOptions = { sites: Named[] };

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAtNoon(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftDate(value: string, days: number) {
  const date = dateAtNoon(value);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

function startOfWeek(value: string) {
  return shiftDate(value, -dateAtNoon(value).getDay());
}

export function ClinicalSchedulePage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const name = (value?: Named | null) => ar ? value?.name_ar : value?.name_en || value?.name_ar;
  const qc = useQueryClient();
  const [date, setDate] = useState(localDate);
  const [siteId, setSiteId] = useState('');
  const [rotationId, setRotationId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [subgroupId, setSubgroupId] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const weekStart = startOfWeek(date);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, offset) => shiftDate(weekStart, offset)), [weekStart]);
  const hasAccess = can('clinical_schedule.view');
  const canManagePortal = !isDepartmentScopedHead(user?.roles) && can('distribution.student_portal.manage');

  const optionsQuery = useQuery({ queryKey: ['clinical-schedule-options'], queryFn: () => apiFetch<ScheduleOptions>('/operational/clinical-schedule-options'), enabled: hasAccess });
  useEffect(() => {
    if (!siteId && optionsQuery.data?.sites.length === 1) setSiteId(String(optionsQuery.data.sites[0].id));
  }, [optionsQuery.data, siteId]);
  const dailyQuery = useQuery({
    queryKey: ['clinical-schedule-daily-groups', date, siteId],
    queryFn: () => apiFetch<DailyGroup[]>(`/operational/clinical-schedule/daily-groups?date=${date}&training_site_id=${siteId}`),
    enabled: hasAccess && Boolean(siteId && date),
  });
  const weekQuery = useQuery({
    queryKey: ['clinical-schedule-weekly-counts', weekStart, siteId],
    queryFn: () => apiFetch<{ date: string; group_count: number }[]>(`/operational/clinical-schedule/weekly-counts?week_start=${weekStart}&training_site_id=${siteId}`),
    enabled: hasAccess && Boolean(siteId),
  });
  const weekCounts = new Map((weekQuery.data || []).map(item => [item.date, item.group_count]));
  const selectDay = (nextDate: string) => {
    setDate(nextDate);
    setRotationId('');
    setGroupId('');
    setSubgroupId('');
  };
  const allGroups = Array.isArray(dailyQuery.data) ? dailyQuery.data : [];
  const courses = useMemo(() => [...new Map(allGroups.map(item => [item.rotation_id, item])).values()], [allGroups]);
  const courseGroups = rotationId ? allGroups.filter(item => String(item.rotation_id) === rotationId) : allGroups;
  const mainGroups = [...new Map(courseGroups.map(item => [item.group.id, item.group])).values()];
  const subgroupGroups = groupId ? courseGroups.filter(item => String(item.group.id) === groupId) : courseGroups;
  const subgroups = [...new Map(subgroupGroups.map(item => [item.subgroup.id, item.subgroup])).values()];
  const visibleGroups = subgroupGroups.filter(item => !subgroupId || String(item.subgroup.id) === subgroupId);
  const studentCount = new Set(visibleGroups.flatMap(item => item.students.map(student => student.id))).size;

  const portalQuery = useQuery({ queryKey: ['student-schedule-portal'], queryFn: () => apiFetch<PortalStatus>('/student-schedule-portal'), enabled: hasAccess });
  const togglePortal = useMutation({
    mutationFn: (is_enabled: boolean) => apiFetch<PortalStatus>('/student-schedule-portal', { method: 'PUT', body: { is_enabled } }),
    onSuccess: async result => {
      setActionError('');
      setNotice(result.is_enabled ? tr('تم تفعيل رابط الطالب.', 'Student lookup enabled.') : tr('تم تعطيل رابط الطالب.', 'Student lookup disabled.'));
      await qc.invalidateQueries({ queryKey: ['student-schedule-portal'] });
    },
    onError: error => { setNotice(''); setActionError(error instanceof ApiError ? error.message : tr('تعذر تحديث الرابط.', 'Unable to update the link.')); },
  });
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${portalQuery.data?.public_url || '/portal/student-lookup'}`);
      setNotice(tr('تم نسخ رابط الطالب.', 'Student link copied.'));
      setActionError('');
    } catch { setActionError(tr('تعذر نسخ الرابط.', 'Unable to copy the link.')); }
  };

  if (!hasAccess) return <ErrorState title={tr('غير مصرح', 'Access denied')} />;
  if (optionsQuery.isLoading) return <LoadingState />;
  if (optionsQuery.isError) return <ErrorState onRetry={() => optionsQuery.refetch()} />;

  const control = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-400';
  return <div className="mx-auto max-w-[1320px] space-y-4 pb-12">
    <PageHeader title={tr('الجدول السريري', 'Clinical schedule')} />
    {notice && <p role="status" className="rounded-xl bg-teal-50 p-3 text-xs font-bold text-teal-800">{notice}</p>}
    {actionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">{actionError}</p>}

    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5" aria-label={tr('أسبوع الجدول', 'Schedule week')}>
      <label className="block text-xs font-black text-slate-700">{tr('المشفى أو مركز التدريب', 'Hospital or training site')}<select aria-label={tr('المشفى أو مركز التدريب', 'Hospital or training site')} value={siteId} onChange={event => { setSiteId(event.target.value); setRotationId(''); setGroupId(''); setSubgroupId(''); }} className={`${control} mt-1.5 sm:max-w-sm`}><option value="">{tr('اختر المركز', 'Choose site')}</option>{optionsQuery.data?.sites.map(site => <option key={site.id} value={site.id}>{name(site)}</option>)}</select></label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <div><h2 className="text-sm font-black text-slate-900">{tr('أيام الأسبوع', 'Days of the week')} <span className="text-[11px] font-semibold text-slate-500">· {tr('عدد المجموعات', 'Group count')}</span></h2><p className="text-[11px] font-semibold text-slate-500">{new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { day: 'numeric', month: 'short' }).format(dateAtNoon(weekDays[0]))} – {new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(dateAtNoon(weekDays[6]))}</p></div>
        <div className="flex flex-wrap gap-1.5"><Button variant="outline" onClick={() => selectDay(shiftDate(date, -7))}>{tr('السابق', 'Previous')}</Button><Button variant="outline" onClick={() => selectDay(localDate())} disabled={date === localDate()}>{tr('اليوم', 'Today')}</Button><Button variant="outline" onClick={() => selectDay(shiftDate(date, 7))}>{tr('التالي', 'Next')}</Button></div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label={tr('اختر يومًا من الأسبوع', 'Choose a day of the week')}>
        {weekDays.map(day => {
          const selected = day === date;
          const count = weekCounts.get(day);
          return <button key={day} type="button" aria-pressed={selected} aria-label={`${new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateAtNoon(day))}${siteId && count !== undefined ? `، ${count} ${count === 1 ? tr('مجموعة', 'group') : tr('مجموعات', 'groups')}` : ''}`} onClick={() => selectDay(day)} className={`min-w-0 rounded-xl border px-1 py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 sm:py-3 ${selected ? 'border-teal-700 bg-teal-700 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-300 hover:bg-teal-50'}`}>
            <span className="block truncate text-[10px] font-bold sm:text-xs">{new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { weekday: 'short' }).format(dateAtNoon(day))}</span><span className="mt-0.5 block text-sm font-black sm:text-base">{dateAtNoon(day).getDate()}</span><span className={`mt-0.5 block text-xs font-black ${selected ? 'text-white/90' : count === 0 ? 'text-slate-400' : 'text-teal-700'}`}>{!siteId ? '—' : weekQuery.isLoading ? '…' : count === undefined ? '—' : count}</span>
          </button>;
        })}
      </div>
      {siteId && weekQuery.isError && <div className="mt-3 flex items-center gap-2 text-xs text-rose-700"><span>{tr('تعذر تحميل أعداد المجموعات.', 'Unable to load group counts.')}</span><button type="button" className="font-bold underline" onClick={() => weekQuery.refetch()}>{tr('إعادة المحاولة', 'Retry')}</button></div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={tr('تصنيفات المجموعات', 'Group filters')}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-black text-slate-700">{tr('المساق', 'Course')}<select aria-label={tr('المساق', 'Course')} value={rotationId} disabled={!siteId || dailyQuery.isLoading} onChange={event => { setRotationId(event.target.value); setGroupId(''); setSubgroupId(''); }} className={`${control} mt-1.5`}><option value="">{tr('جميع المساقات', 'All courses')}</option>{courses.map(item => <option key={item.rotation_id} value={item.rotation_id}>{name(item.course) || tr('مساق غير محدد', 'Unnamed course')}{item.academic_year?.code ? ` · ${item.academic_year.code}` : ''}</option>)}</select></label>
        <label className="text-xs font-black text-slate-700">{tr('المجموعة الرئيسية', 'Main group')}<select aria-label={tr('المجموعة الرئيسية', 'Main group')} value={groupId} disabled={!siteId || dailyQuery.isLoading} onChange={event => { setGroupId(event.target.value); setSubgroupId(''); }} className={`${control} mt-1.5`}><option value="">{tr('جميع المجموعات', 'All groups')}</option>{mainGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className="text-xs font-black text-slate-700">{tr('المجموعة الفرعية', 'Subgroup')}<select aria-label={tr('المجموعة الفرعية', 'Subgroup')} value={subgroupId} disabled={!siteId || dailyQuery.isLoading} onChange={event => setSubgroupId(event.target.value)} className={`${control} mt-1.5`}><option value="">{tr('جميع المجموعات الفرعية', 'All subgroups')}</option>{subgroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      </div>
    </section>

    {!siteId ? <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50 p-8 text-center"><Hospital className="mx-auto h-8 w-8 text-teal-700" /><h2 className="mt-3 text-sm font-black text-teal-950">{tr('اختر المشفى أو مركز التدريب', 'Choose a hospital or training site')}</h2><p className="mt-1 text-xs text-teal-800">{tr('ستظهر مجموعات الطلاب المداومة في اليوم المختار.', 'Groups on duty for the selected day will appear here.')}</p></div>
      : dailyQuery.isLoading ? <LoadingState />
        : dailyQuery.isError ? <ErrorState onRetry={() => dailyQuery.refetch()} />
          : !visibleGroups.length ? <EmptyState title={tr('لا توجد مجموعات مداومة', 'No groups on duty')} message={tr('لا توجد مجموعات مطابقة في هذا المركز والتاريخ. جرّب يومًا أو تصنيفًا آخر.', 'No matching groups at this site on this date. Try another day or filter.')} />
            : <><div className="flex flex-wrap items-center justify-between gap-2 px-1"><h2 className="text-sm font-black text-slate-900">{tr('المجموعات المداومة', 'Groups on duty')}</h2><span className="text-xs font-bold text-slate-500">{visibleGroups.length} {tr('مجموعات', 'groups')} · {studentCount} {tr('طلاب', 'students')}</span></div><div className="grid gap-4">{visibleGroups.map(item => <ScheduleGroupCard key={`${item.site.id}-${item.rotation_id}-${item.subgroup.id}`} item={item} ar={ar} tr={tr} />)}</div></>}

    <details className="rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-black text-slate-700"><ShieldCheck className="h-4 w-4 text-teal-700" />{tr('إدارة رابط استعلام الطلبة', 'Manage student lookup link')}</summary><div className="border-t border-slate-100 p-4">{portalQuery.isLoading ? <LoadingState /> : portalQuery.isError ? <ErrorState onRetry={() => portalQuery.refetch()} /> : <div className="flex flex-wrap items-center gap-2"><span className={`me-auto rounded-full px-3 py-1 text-xs font-bold ${portalQuery.data?.is_enabled ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{portalQuery.data?.is_enabled ? tr('مفعّل', 'Enabled') : tr('متوقف', 'Disabled')}</span><Button variant="outline" onClick={copyLink}><Copy className="me-1 h-4 w-4" />{tr('نسخ الرابط', 'Copy link')}</Button><Button variant="outline" onClick={() => window.open(portalQuery.data?.public_url || '/portal/student-lookup', '_blank', 'noopener,noreferrer')}><ExternalLink className="me-1 h-4 w-4" />{tr('فتح الرابط', 'Open link')}</Button>{canManagePortal && <Button variant={portalQuery.data?.is_enabled ? 'danger' : 'primary'} isLoading={togglePortal.isPending} onClick={() => togglePortal.mutate(!portalQuery.data?.is_enabled)}>{portalQuery.data?.is_enabled ? tr('تعطيل الرابط', 'Disable link') : tr('تفعيل الرابط', 'Enable link')}</Button>}</div>}</div></details>
  </div>;
}

function ScheduleGroupCard({ item, ar, tr }: { item: DailyGroup; ar: boolean; tr: (a: string, e: string) => string }) {
  const courseName = ar ? item.course?.name_ar : item.course?.name_en || item.course?.name_ar;
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-teal-50/50 px-4 py-3 sm:px-5">
      <div className="min-w-0"><h3 className="text-base font-black text-teal-950">{tr('المجموعة', 'Group')} {item.group.name} <span className="text-slate-400">/</span> <span dir="ltr">{item.subgroup.name}</span></h3><p className="mt-1 text-xs font-semibold text-slate-600">{courseName || tr('مساق غير محدد', 'Unnamed course')}{item.course?.code ? ` · ${item.course.code}` : ''}</p></div>
      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-teal-800">{item.students.length} {tr('طلاب', 'students')}</span>
    </header>
    {item.supervisors.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-slate-100 px-4 py-3 sm:px-5">{item.supervisors.map(supervisor => <div key={supervisor.id} className="flex items-center gap-2 text-xs font-bold text-slate-700"><ProfilePhotoLightbox photoUrl={supervisor.photo_url} name={ar ? supervisor.full_name_ar : supervisor.full_name_en || supervisor.full_name_ar} enlargeLabel={tr('تكبير صورة المشرف', 'Enlarge supervisor photo')} size="sm" />{ar ? supervisor.full_name_ar : supervisor.full_name_en || supervisor.full_name_ar}</div>)}</div>}
    <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">{item.students.map(student => <div key={student.id} className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5"><ProfilePhotoLightbox photoUrl={student.photo_url} name={ar ? student.full_name_ar : student.full_name_en || student.full_name_ar} subtitle={student.university_number} enlargeLabel={tr('تكبير صورة الطالب', 'Enlarge student photo')} size="sm" /><div className="min-w-0"><b className="block truncate text-xs text-slate-900">{ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}</b><span dir="ltr" className="block text-start font-mono text-[10px] text-slate-500">{student.university_number}</span>{item.supervisors.length > 1 && <span className="block text-[10px] text-slate-500">{item.supervisors.filter(person => student.supervisor_ids?.includes(person.id)).map(person => ar ? person.full_name_ar : person.full_name_en || person.full_name_ar).join(ar ? '، ' : ', ')}</span>}</div></div>)}</div>
  </article>;
}
