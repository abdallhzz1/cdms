import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpen, Building2, CalendarDays, CheckCircle2, Copy, ExternalLink, Grid3X3, Pencil, Plus, Send, Stethoscope, Trash2, Undo2, UserRound, Users } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { approveVersion, publishVersion } from '@/api/distribution';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useI18n } from '@/i18n/I18nContext';

type Level = 'fourth' | 'fifth' | 'sixth';
type Year = { id: number; code: string; start_date: string; end_date: string; is_current: boolean };
type ClinicalPeriod = { id:number; academic_year_id:number; code:string; name_ar:string; name_en?:string|null; sequence:number; start_date:string; end_date:string; weeks_count:number; status:string };
type Course = { id: number; code: string; name_ar: string; name_en?: string | null; academic_level: Level; semester?: number };
type Doctor = { id: number | null; user_id: number; full_name_ar: string; full_name_en?: string | null; email?: string; specialty?: string; primary_site_id?: number | null; training_site_ids?: number[] };
type Hospital = { id: number; site_code: string; name_ar: string; name_en?: string | null; site_type?: string; city?: string | null; supervisors: Doctor[] };
type ActivityType = 'clinical' | 'lectures' | 'break' | 'exam';
type Block = { id: number; block_code: string; from_week: number; to_week: number; activity_type?: ActivityType; activity_label?: string | null; activity_scope?: 'all' | 'main_groups'; main_group_codes?: string[] | null };
type Subgroup = { id: number; name: string; capacity: number; students_count: number; group?: { id: number; name: string } };
type Cell = { course_schedule_row_id: number; rotation_block_id: number; supervisor_id?: number | null; training_site_id: number; subgroup_id: number; subgroup_name: string; main_group_name?: string };
type ScheduleRow = { id: number; row_type: 'doctor' | 'vacancy'; person_id?: number | null; training_site_id: number; label?: string | null; person?: { id: number; full_name_ar: string; full_name_en?: string | null; specialty?: string | null }; training_site?: { id: number; name_ar: string; name_en?: string | null } };
type Version = { id: number; status: string; updated_at: string };
type ApprovalState = { status: 'required' | 'approved' | 'revoked'; approved_at?: string | null; approved_by?: number | null };
type Rotation = { id: number; name: string; start_date?: string | null; duration_weeks: number; schedule_scope?:'period'|'annual'; clinical_period?:ClinicalPeriod|null };
type Options = { academic_years: Year[]; clinical_periods:ClinicalPeriod[]; courses: Course[]; hospitals: Hospital[]; unassigned_doctors: Doctor[] };
type Schedule = { rotation: Rotation | null; version: Version | null; current_published_version?: Version | null; approval_state?: ApprovalState | null; blocks: Block[]; subgroups: Subgroup[]; hospitals: Hospital[]; unassigned_doctors: Doctor[]; rows: ScheduleRow[]; cells: Cell[] };
type OverridePayload = { force?: boolean; override_reason?: string };
type UnassignedStudent = { id: number; university_number: string; full_name_ar: string };

const levelCodes: Level[] = ['fourth', 'fifth', 'sixth'];
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

function normalizeAssignedLevel(value: string): Level | null {
  const level = String(value).trim().toLowerCase();
  if (['fourth', 'الرابعة', '4', 'year4'].includes(level)) return 'fourth';
  if (['fifth', 'الخامسة', '5', 'year5'].includes(level)) return 'fifth';
  if (['sixth', 'السادسة', '6', 'year6'].includes(level)) return 'sixth';
  return null;
}

function message(error: unknown, fallback: { ar: string; en: string }, locale: 'ar' | 'en'): string {
  const localizedFallback = fallback[locale];
  if (!(error instanceof ApiError)) return localizedFallback;
  const validation = Object.values(error.errors).flat().find((item) => typeof item === 'string');
  if (typeof validation === 'string') return validation;
  if (error.status === 0) return locale === 'ar' ? 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حاول مجدداً.' : 'Unable to reach the server. Check your connection and try again.';
  return error.message || localizedFallback;
}

function hasValidationError(error: unknown, key: string): boolean {
  return error instanceof ApiError && Object.prototype.hasOwnProperty.call(error.errors, key);
}

function weekDate(startDate: string | null | undefined, week: number, locale: 'ar' | 'en'): string {
  if (!startDate) return '';
  const date = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + ((week - 1) * 7));
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', { day: '2-digit', month: '2-digit' }).format(date);
}

export function DistributionPage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const levelText: Record<Level,string> = { fourth: tr('السنة الرابعة','Fourth year'), fifth: tr('السنة الخامسة','Fifth year'), sixth: tr('السنة السادسة','Sixth year') };
  const statusLabels: Record<string,string> = { draft: tr('مسودة','Draft'), suggested: tr('مقترح','Suggested'), manual: tr('قيد الإعداد','In preparation'), published: tr('منشور','Published'), withdrawn: tr('ملغى النشر','Unpublished') };
  const userRoles = (user?.roles ?? []).map((role) => role.toUpperCase());
  const hasGlobalCohortRole = userRoles.some((role) => ['SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'CLINICAL_DIRECTOR'].includes(role));
  const isCohortScopedRta = userRoles.includes('RTA') && !hasGlobalCohortRole;
  const assignedRtaLevels = Array.from(new Set(
    (user?.assigned_levels ?? []).map(normalizeAssignedLevel).filter((item): item is Level => item !== null),
  ));
  const visibleLevels = levelCodes.filter((item) => !isCohortScopedRta || assignedRtaLevels.includes(item));
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState('');
  const [level, setLevel] = useState<Level>(isCohortScopedRta ? (assignedRtaLevels[0] ?? 'fourth') : 'fourth');
  const [courseId, setCourseId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [weeksCount, setWeeksCount] = useState(12);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [approvalOverrideReason, setApprovalOverrideReason] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: ScheduleRow; block: Block; subgroupIds: number[] } | null>(null);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [blockForm, setBlockForm] = useState<{ activity_type: ActivityType; activity_label: string; activity_scope: 'all' | 'main_groups'; main_group_codes: string[] }>({ activity_type: 'clinical', activity_label: '', activity_scope: 'all', main_group_codes: [] });
  const [rowModal, setRowModal] = useState(false);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [rowForm, setRowForm] = useState({ row_type: 'doctor' as 'doctor' | 'vacancy', hospitalId: '', personId: '', label: tr('شاغر', 'Vacancy'), search: '' });

  const optionsQuery = useQuery({ queryKey: ['course-distribution-options'], queryFn: () => apiFetch<Options>('/course-distribution/options'), enabled: can('distribution.view') });
  const years = optionsQuery.data?.academic_years ?? [];
  const courses = optionsQuery.data?.courses ?? [];
  const periods = useMemo(() => (optionsQuery.data?.clinical_periods ?? []).filter((period) => String(period.academic_year_id) === yearId), [optionsQuery.data?.clinical_periods, yearId]);
  const selectedPeriod = periods.find((period) => String(period.id) === periodId);
  const availableCourses = useMemo(() => courses.filter((course) => course.academic_level === level), [courses, level]);

  useEffect(() => {
    if (isCohortScopedRta && assignedRtaLevels.length && !assignedRtaLevels.includes(level)) {
      setLevel(assignedRtaLevels[0]);
    }
  }, [assignedRtaLevels.join('|'), isCohortScopedRta, level]);
  useEffect(() => { if (!yearId && years.length) setYearId(String(years.find((year) => year.is_current)?.id ?? years[0].id)); }, [yearId, years]);
  useEffect(() => { if (periodId !== 'annual' && !periods.some((period) => String(period.id) === periodId)) setPeriodId(periods[0] ? String(periods[0].id) : 'annual'); }, [periodId, periods]);
  useEffect(() => { if (periodId === 'annual') { const year=years.find((item)=>String(item.id)===yearId); if(year){setStartDate(year.start_date);setWeeksCount(36);} } else if(selectedPeriod){setStartDate(selectedPeriod.start_date);setWeeksCount(selectedPeriod.weeks_count);} }, [periodId, selectedPeriod?.id, yearId]);
  useEffect(() => { if (!availableCourses.some((course) => String(course.id) === courseId)) setCourseId(availableCourses[0] ? String(availableCourses[0].id) : ''); }, [availableCourses, courseId]);
  useEffect(() => { const year = years.find((item) => String(item.id) === yearId); if (year && !startDate) setStartDate(year.start_date); }, [startDate, yearId, years]);

  const scheduleQuery = useQuery({
    queryKey: ['course-distribution-schedule', yearId, level, courseId, periodId],
    queryFn: () => apiFetch<Schedule>(`/course-distribution/schedule?academic_year_id=${yearId}&academic_level=${level}&course_id=${courseId}&schedule_scope=${periodId==='annual'?'annual':'period'}${periodId!=='annual'?`&clinical_period_id=${periodId}`:''}`),
    enabled: Boolean(yearId && courseId && periodId),
  });
  const schedule = scheduleQuery.data;
  const isEditable = ['draft', 'suggested', 'manual'].includes(schedule?.version?.status ?? '');
  const publishedVersion = schedule?.version?.status === 'published' ? schedule.version : schedule?.current_published_version;
  const approvalState = schedule?.approval_state?.status ?? 'required';
  const hospitals = schedule?.hospitals ?? optionsQuery.data?.hospitals ?? [];
  const selectedRowHospital = hospitals.find((hospital) => String(hospital.id) === rowForm.hospitalId);
  const availableRowDoctors = (selectedRowHospital?.supervisors ?? []).filter((doctor) => {
    const query = rowForm.search.trim().toLowerCase();
    return !query || doctor.full_name_ar.toLowerCase().includes(query) || doctor.full_name_en?.toLowerCase().includes(query) || doctor.email?.toLowerCase().includes(query);
  });
  const doctorsCount = (schedule?.rows ?? []).filter((row) => row.row_type === 'doctor').length;
  const cellMap = useMemo(() => {
    const grouped = new Map<string, Cell[]>();
    for (const cell of schedule?.cells ?? []) {
      const key = `${cell.course_schedule_row_id}|${cell.rotation_block_id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), cell]);
    }
    return grouped;
  }, [schedule?.cells]);
  const mainGroupCodes = useMemo(() => Array.from(new Set((schedule?.subgroups ?? []).map((subgroup) => subgroup.group?.name).filter((name): name is string => Boolean(name)))).sort(), [schedule?.subgroups]);
  const blockExcludesGroup = (block: Block, groupName?: string) => (block.activity_type ?? 'clinical') !== 'clinical' && ((block.activity_scope ?? 'all') === 'all' || Boolean(groupName && block.main_group_codes?.includes(groupName)));
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['course-distribution-schedule'] }), queryClient.invalidateQueries({ queryKey: ['course-distribution-options'] })]); };
  const showUnassignedStudents = async (action: 'approve' | 'publish') => {
    try {
      const students = await apiFetch<UnassignedStudent[]>(`/distribution-versions/${schedule!.version!.id}/unassigned`);
      const sample = students.slice(0, 4).map((student) => `${student.full_name_ar} (${student.university_number})`).join('، ');
      const actionText = action === 'approve' ? 'اعتماد' : 'نشر';
      const actionTextEn = action === 'approve' ? 'approved' : 'published';
      setNotice({
        type: 'error',
        text: tr(
          `لا يمكن ${actionText} الجدول: يوجد ${students.length} طالب غير موزع${sample ? `، منهم: ${sample}` : ''}. وزّعهم أولاً أو اطلب من مدير النظام منح صلاحية «تجاوز قيود التوزيع».`,
          `The schedule cannot be ${actionTextEn}: ${students.length} students are unassigned${sample ? `, including: ${sample}` : ''}. Assign them first or ask the system administrator for “Override distribution constraints”.`,
        ),
      });
    } catch {
      setNotice({ type: 'error', text: tr('لا يمكن إكمال العملية لوجود طلبة غير موزعين، وحسابك لا يملك صلاحية التجاوز الاستثنائي.', 'The action cannot continue because students are unassigned and your account cannot override this constraint.') });
    }
  };

  const createSchedule = useMutation({
    mutationFn: () => apiFetch('/course-distribution/schedules', { method: 'POST', body: { academic_year_id: Number(yearId), academic_level: level, course_id: Number(courseId), clinical_period_id: periodId === 'annual' ? null : Number(periodId), schedule_scope: periodId === 'annual' ? 'annual' : 'period', start_date: startDate, weeks_count: weeksCount } }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: tr('تم إنشاء شبكة أسابيع المساق. ابدأ بتوزيع المجموعات على الأطباء.', 'The course week grid was created. You can now assign groups to physicians.') }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر إنشاء جدول المساق.', en: 'Could not create the course schedule.' }, locale) }),
  });
  const saveCell = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/cell`, { method: 'PUT', body: { rotation_block_id: editingCell!.block.id, course_schedule_row_id: editingCell!.row.id, subgroup_ids: editingCell!.subgroupIds } }),
    onSuccess: async () => { setEditingCell(null); await refresh(); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر حفظ الخلية.', en: 'Could not save the schedule cell.' }, locale) }),
  });
  const clearCell = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/cell`, { method: 'DELETE', body: { rotation_block_id: editingCell!.block.id, course_schedule_row_id: editingCell!.row.id } }),
    onSuccess: async () => { setEditingCell(null); await refresh(); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر تفريغ الخلية.', en: 'Could not clear the schedule cell.' }, locale) }),
  });
  const saveBlockActivity = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/blocks/${editingBlock!.id}/activity`, { method: 'PUT', body: blockForm }),
    onSuccess: async () => { setEditingBlock(null); await refresh(); setNotice({ type: 'success', text: tr('تم تحديث الأسبوع ونطاق تطبيقه.', 'The week activity and scope were updated.') }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر تحديث الأسبوع.', en: 'Could not update the week.' }, locale) }),
  });
  const saveRow = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/rows${editingRowId ? `/${editingRowId}` : ''}`, { method: editingRowId ? 'PUT' : 'POST', body: { row_type: rowForm.row_type, person_id: rowForm.row_type === 'doctor' ? Number(rowForm.personId) : null, training_site_id: Number(rowForm.hospitalId), label: rowForm.row_type === 'vacancy' ? rowForm.label : null } }),
    onSuccess: async () => { setRowModal(false); await refresh(); setNotice({ type: 'success', text: editingRowId ? tr('تم تعديل صف الجدول.', 'The schedule row was updated.') : tr('تمت إضافة صف جديد.', 'A new row was added.') }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر حفظ صف الجدول.', en: 'Could not save the schedule row.' }, locale) }),
  });
  const deleteRow = useMutation({
    mutationFn: ({ rowId, versionId }: { rowId: number; versionId: number }) => apiFetch(`/course-distribution/versions/${versionId}/rows/${rowId}`, { method: 'DELETE' }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: tr('تم حذف الصف.', 'The row was deleted.') }); },
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 404) {
        await refresh();
        setNotice({ type: 'error', text: tr('تم تحديث الجدول؛ الصف المحدد لم يعد موجودًا أو لا يتبع النسخة المفتوحة.', 'The schedule was refreshed; the selected row no longer exists or does not belong to the open version.') });
        return;
      }
      setNotice({ type: 'error', text: message(error, { ar: 'تعذر حذف الصف.', en: 'Could not delete the schedule row.' }, locale) });
    },
  });
  const approve = useMutation({
    mutationFn: (payload: OverridePayload = {}) => approveVersion(schedule!.version!.id, payload),
    onSuccess: async (_data, payload) => {
      setApprovalOverrideReason(payload?.override_reason ?? null);
      await refresh();
      setNotice({ type: 'success', text: locale === 'ar' ? (payload?.force ? 'تم اعتماد الجدول استثنائيًا مع توثيق السبب.' : 'تم اعتماد الجدول وأصبح جاهزاً للنشر.') : (payload?.force ? 'The schedule was approved by exception and the reason was recorded.' : 'The schedule is approved and ready to publish.') });
    },
    onError: async (error, payload) => {
      if (!payload?.force && hasValidationError(error, 'unassigned') && can('distribution.override')) {
        const reason = window.prompt(tr('يوجد طلبة غير موزعين. لاعتماد الجدول استثنائيًا، اكتب سبب الاعتماد:', 'Some students are unassigned. Enter a reason to approve the schedule by exception:'));
        if (reason?.trim()) {
          approve.mutate({ force: true, override_reason: reason.trim() });
          return;
        }
      }
      if (hasValidationError(error, 'unassigned') && !can('distribution.override')) {
        await showUnassignedStudents('approve');
        return;
      }
      setNotice({ type: 'error', text: message(error, { ar: 'تعذر اعتماد الجدول.', en: 'Could not approve the distribution schedule.' }, locale) });
    },
  });
  const publish = useMutation({
    mutationFn: (payload: OverridePayload = {}) => publishVersion(schedule!.version!.id, { last_updated_at: schedule!.version!.updated_at, ...payload }),
    onSuccess: async () => {
      setApprovalOverrideReason(null);
      await refresh();
      setNotice({ type: 'success', text: locale === 'ar' ? 'تم نشر الجدول للطلبة والمشرفين.' : 'The schedule was published for students and supervisors.' });
    },
    onError: async (error, payload) => {
      if (!payload?.force && hasValidationError(error, 'unassigned') && can('distribution.override')) {
        const reason = approvalOverrideReason ?? window.prompt(tr('يوجد طلبة غير موزعين. لنشر الجدول استثنائيًا، اكتب سبب النشر:', 'Some students are unassigned. Enter a reason to publish the schedule by exception:'));
        if (reason?.trim()) {
          publish.mutate({ force: true, override_reason: reason.trim() });
          return;
        }
      }
      if (hasValidationError(error, 'unassigned') && !can('distribution.override')) {
        await showUnassignedStudents('publish');
        return;
      }
      setNotice({ type: 'error', text: message(error, { ar: 'تعذر نشر الجدول.', en: 'Could not publish the distribution schedule.' }, locale) });
    },
  });
  const revise = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/revise`, { method: 'POST' }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: tr('تم إنشاء نسخة قابلة للتعديل، والنسخة المنشورة ما زالت فعالة.', 'An editable revision was created while the published version remains active.') }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر إنشاء نسخة التعديل.', en: 'Could not create a revision.' }, locale) }),
  });
  const unpublish = useMutation({
    mutationFn: (reason: string) => apiFetch(`/course-distribution/versions/${publishedVersion!.id}/unpublish`, { method: 'POST', body: { reason } }),
    onSuccess: async () => { setApprovalOverrideReason(null); await refresh(); setNotice({ type: 'success', text: tr('تم إلغاء نشر الجدول وإخفاؤه عن الطلبة والمشرفين.', 'The schedule was unpublished and hidden from students and supervisors.') }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر إلغاء نشر الجدول.', en: 'Could not unpublish the schedule.' }, locale) }),
  });
  const deleteSchedule = useMutation({
    mutationFn: (reason: string) => apiFetch(`/course-distribution/rotations/${schedule!.rotation!.id}`, { method: 'DELETE', body: { reason } }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: tr('تم حذف الجدول ومسوداته وتوزيعاته التابعة.', 'The schedule, drafts, and related assignments were deleted.') }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, { ar: 'تعذر حذف الجدول.', en: 'Could not delete the schedule.' }, locale) }),
  });

  const openCell = (row: ScheduleRow, block: Block) => {
    if (!can('distribution.update') || !isEditable || blockExcludesGroup(block) && (block.activity_scope ?? 'all') === 'all') return;
    const current = cellMap.get(`${row.id}|${block.id}`) ?? [];
    setEditingCell({ row, block, subgroupIds: current.map((cell) => cell.subgroup_id) });
  };

  const openBlock = (block: Block) => {
    setEditingBlock(block);
    setBlockForm({
      activity_type: block.activity_type ?? 'clinical',
      activity_label: block.activity_label ?? '',
      activity_scope: block.activity_scope ?? 'all',
      main_group_codes: block.main_group_codes ?? [],
    });
  };

  const openRow = (row?: ScheduleRow) => {
    setEditingRowId(row?.id ?? null);
    setRowForm({ row_type: row?.row_type ?? 'doctor', hospitalId: row ? String(row.training_site_id) : '', personId: row?.person_id ? String(row.person_id) : '', label: row?.label ?? tr('شاغر', 'Vacancy'), search: '' });
    setRowModal(true);
  };


  if (!can('distribution.view')) return <ErrorState title={tr('غير مصرح', 'Access denied')} message={tr('لا تملك صلاحية عرض التوزيع السريري.', 'You do not have permission to view clinical distribution.')} />;
  if (optionsQuery.isLoading) return <LoadingState />;
  if (optionsQuery.isError) return <ErrorState onRetry={() => optionsQuery.refetch()} />;

  return <div className="mx-auto max-w-[1700px] space-y-5 pb-14">
    <PageHeader title={tr('التوزيع الأسبوعي للمساقات السريرية','Weekly Clinical Course Distribution')} description={tr('اختر الدفعة والمساق، ثم وزّع مجموعات الطلبة أسبوعيًا على أطباء المستشفيات.','Select the cohort and course, then assign student groups to hospital physicians by week.')}>
      <Link to="/distribution/groups" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><Users className="h-4 w-4" />{tr('مجموعات الطلبة','Student groups')}</Link>
      <Link to="/clinical-supervisors" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-800"><Building2 className="h-4 w-4" />{tr('المستشفيات والمشرفون','Hospitals and supervisors')}</Link>
      <Link to="/courses" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><ExternalLink className="h-4 w-4" />{tr('المساقات السريرية','Clinical courses')}</Link>
    </PageHeader>
    {notice && <div className={`flex justify-between rounded-xl border px-4 py-3 text-xs font-bold ${notice.type === 'success' ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-red-200 bg-red-50 text-red-800'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">{tr('العام الأكاديمي','Academic year')}</span><select className={inputClass} value={yearId} onChange={(event) => { setYearId(event.target.value); setStartDate(''); }}><option value="">{tr('اختر العام','Select year')}</option>{years.map((year) => <option key={year.id} value={year.id}>{year.code}{year.is_current ? tr(' — الحالي',' — Current') : ''}</option>)}</select></label>
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">{tr('الفترة السريرية','Clinical period')}</span><select className={inputClass} value={periodId} onChange={(event)=>setPeriodId(event.target.value)}><option value="annual">{tr('السنة كاملة — 36 أسبوع','Full year — 36 weeks')}</option>{periods.map((period)=><option key={period.id} value={period.id}>{period.name_ar} — {period.weeks_count} {tr('أسبوع','weeks')}</option>)}</select></label>
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">{tr('الدفعة / المستوى','Cohort / level')}</span><select className={inputClass} value={level} onChange={(event) => setLevel(event.target.value as Level)} disabled={isCohortScopedRta && visibleLevels.length <= 1}>{visibleLevels.map((value) => <option key={value} value={value}>{levelText[value]}</option>)}</select>{isCohortScopedRta && visibleLevels.length === 0 && <span className="mt-1 block text-[10px] font-bold text-amber-700">{tr('لم يتم تكليف حسابك بأي دفعة.','Your account has not been assigned to a cohort.')}</span>}</label>
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">{tr('المساق السريري','Clinical course')}</span><select className={inputClass} value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={!availableCourses.length}><option value="">{availableCourses.length ? tr('اختر المساق','Select course') : tr('لا توجد مساقات لهذه الدفعة','No courses for this cohort')}</option>{availableCourses.map((course) => <option key={course.id} value={course.id}>{course.code} — {ar ? course.name_ar : course.name_en || course.name_ar}</option>)}</select></label>
    </div></section>

    {scheduleQuery.isLoading && <LoadingState />}
    {scheduleQuery.isError && <ErrorState onRetry={() => scheduleQuery.refetch()} />}
    {schedule && !schedule.rotation && <section className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-7 text-center"><CalendarDays className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-black text-slate-800">{tr('لا يوجد جدول لهذا المساق في الفترة المحددة', 'No schedule exists for this course in the selected period')}</h2><p className="mt-1 text-xs text-slate-500">{periodId==='annual'?tr('سيتم إنشاء جدول سنوي كامل من 36 أسبوعًا.','A full 36-week annual schedule will be created.'):tr(`سيتم إنشاء جدول ${selectedPeriod?.name_ar??''} حسب تواريخ التقويم.`,`The ${selectedPeriod?.name_en??'clinical period'} schedule will follow the calendar dates.`)}</p>{can('rotations.create') ? <div className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-3"><input type="date" className={inputClass} value={startDate} min={periodId==='annual' ? years.find(item=>String(item.id)===yearId)?.start_date : selectedPeriod?.start_date} max={periodId==='annual' ? years.find(item=>String(item.id)===yearId)?.end_date : selectedPeriod?.end_date} onChange={(event)=>setStartDate(event.target.value)} /><input type="text" className={inputClass} value={`${weeksCount} ${tr('أسبوع','weeks')}`} readOnly /><Button onClick={() => createSchedule.mutate()} isLoading={createSchedule.isPending} disabled={!startDate}>{tr('إنشاء جدول المساق', 'Create course schedule')}</Button></div> : <p className="mt-4 text-xs font-bold text-slate-700">{tr('تحتاج صلاحية «إعداد وإضافة دورة سريرية».', 'You need the “Create clinical rotation” permission.')}</p>}</section>}

    {schedule?.rotation && schedule.version && <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><div className="flex items-center gap-2"><Grid3X3 className="h-5 w-5 text-teal-700" /><h2 className="font-black text-slate-800">{schedule.rotation.name}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{statusLabels[schedule.version.status] ?? schedule.version.status}</span>{isEditable && publishedVersion && <span className="rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">{tr('يوجد جدول منشور حاليًا', 'A published schedule is currently active')}</span>}</div><p className="mt-1 text-xs text-slate-500">{tr(`${schedule.blocks.length} أسبوع · ${doctorsCount} طبيب · ${schedule.rows.filter((row) => row.row_type === 'vacancy').length} شاغر · ${schedule.subgroups.length} مجموعة فرعية`, `${schedule.blocks.length} weeks · ${doctorsCount} physicians · ${schedule.rows.filter((row) => row.row_type === 'vacancy').length} vacancies · ${schedule.subgroups.length} subgroups`)}</p></div><div className="flex flex-wrap gap-2">{can('distribution.schedule_rows.manage') && isEditable && <Button variant="outline" onClick={() => openRow()}><Plus className="me-1 h-4 w-4" />{tr('إضافة صف', 'Add row')}</Button>}{can('distribution.approve') && isEditable && approvalState !== 'approved' && <Button variant="outline" onClick={() => approve.mutate({})} isLoading={approve.isPending}><CheckCircle2 className="me-1 h-4 w-4" />{approvalState === 'revoked' ? tr('إعادة الاعتماد', 'Approve again') : tr('اعتماد', 'Approve')}</Button>}{can('distribution.publish') && isEditable && <Button disabled={approvalState !== 'approved'} title={approvalState !== 'approved' ? tr('اعتمد الجدول أولاً', 'Approve the schedule first') : undefined} onClick={() => publish.mutate({})} isLoading={publish.isPending}><Send className="me-1 h-4 w-4" />{tr('نشر', 'Publish')}</Button>}{can('distribution.revise') && ['published', 'withdrawn'].includes(schedule.version.status) && <Button variant="outline" onClick={() => { if (window.confirm(tr('سيتم إنشاء نسخة مستقلة قابلة للتعديل. هل تريد المتابعة؟', 'An independent editable revision will be created. Continue?'))) revise.mutate(); }} isLoading={revise.isPending}><Copy className="me-1 h-4 w-4" />{tr('إنشاء نسخة للتعديل', 'Create revision')}</Button>}{can('distribution.unpublish') && Boolean(publishedVersion) && <Button variant="outline" onClick={() => { const reason = window.prompt(tr('اكتب سبب إلغاء نشر الجدول:', 'Enter the reason for unpublishing:')); if (reason && reason.trim().length >= 5) unpublish.mutate(reason.trim()); }} isLoading={unpublish.isPending}><Undo2 className="me-1 h-4 w-4" />{tr('إلغاء النشر', 'Unpublish')}</Button>}{can('distribution.delete') && !publishedVersion && <Button variant="danger" onClick={() => { if (!window.confirm(tr('سيتم حذف الجدول وكل مسوداته وتوزيعاته نهائياً. هل أنت متأكد؟', 'The schedule, all its drafts, and assignments will be permanently deleted. Are you sure?'))) return; const reason = window.prompt(tr('سبب الحذف (اختياري):', 'Deletion reason (optional):')) ?? ''; deleteSchedule.mutate(reason); }} isLoading={deleteSchedule.isPending}><Trash2 className="me-1 h-4 w-4" />{tr('حذف الجدول', 'Delete schedule')}</Button>}</div></section>
      {isEditable && can('distribution.publish') && approvalState !== 'approved' && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><strong className="block font-black">{locale === 'ar' ? (approvalState === 'revoked' ? 'تم إلغاء الاعتماد بعد تعديل الجدول' : 'الجدول بحاجة إلى اعتماد قبل النشر') : (approvalState === 'revoked' ? 'Approval was revoked after the schedule changed' : 'Approval is required before publishing')}</strong><span className="mt-1 block">{locale === 'ar' ? 'راجع التوزيع، اضغط «اعتماد»، وبعد نجاح الاعتماد اضغط «نشر». أي تعديل لاحق سيتطلب اعتماداً جديداً.' : 'Review the distribution, select Approve, then publish after approval succeeds. Any later change requires a new approval.'}</span></div>}
      {isEditable && approvalState === 'approved' && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{locale === 'ar' ? 'الجدول معتمد وجاهز للنشر. لا تعدّل التوزيع بعد الاعتماد إلا إذا كنت مستعداً لإعادة اعتماده.' : 'The schedule is approved and ready to publish. Further changes will require a new approval.'}</div>}
      {schedule.subgroups.length === 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-800">{tr('لا توجد مجموعات فرعية للدفعة والعام المحددين. أنشئ المجموعات أولًا من شاشة مجموعات الطلبة؛ ويمكن توزيعها قبل تسجيل الطلبة.', 'No subgroups exist for the selected cohort and year. Create them from Student Groups first; empty groups can be assigned before students register.')}</div>}
      {can('distribution.update') && isEditable && <section className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 md:hidden">{schedule.blocks.map((block) => <button key={block.id} type="button" onClick={() => openBlock(block)} className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] font-black ${(block.activity_type ?? 'clinical') === 'clinical' ? 'border-slate-200 text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{tr('أسبوع', 'Week')} {block.from_week}{(block.activity_type ?? 'clinical') !== 'clinical' ? ` · ${block.activity_label}` : ''}</button>)}</section>}
      {schedule.rows.length === 0 ? <section className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center"><UserRound className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-3 font-black text-slate-800">{tr('الجدول فارغ', 'The schedule is empty')}</h3><p className="mt-1 text-xs text-slate-500">{tr('أضف صف طبيب أو صف شاغر، ثم ابدأ بتوزيع المجموعات على الأسابيع.', 'Add a physician or vacancy row, then assign groups across the weeks.')}</p>{can('distribution.schedule_rows.manage') && isEditable ? <Button className="mt-4" onClick={() => openRow()}><Plus className="me-1 h-4 w-4" />{tr('إضافة أول صف', 'Add first row')}</Button> : <p className="mt-3 text-xs font-bold text-slate-700">{tr('تحتاج صلاحية إدارة صفوف أطباء الجدول.', 'You need permission to manage schedule physician rows.')}</p>}</section> :
      <>
        <section className="grid gap-3 md:hidden">{schedule.rows.map((row) => <article key={row.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className={`flex items-start justify-between gap-3 border-b border-slate-100 p-4 ${row.row_type === 'vacancy' ? 'bg-slate-50' : 'bg-teal-50/60'}`}><div><h3 className="text-sm font-black text-slate-800">{row.row_type === 'vacancy' ? row.label || tr('شاغر', 'Vacancy') : (ar ? row.person?.full_name_ar : row.person?.full_name_en || row.person?.full_name_ar)}</h3><p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><Building2 className="h-3.5 w-3.5 text-teal-600" />{ar ? row.training_site?.name_ar : row.training_site?.name_en || row.training_site?.name_ar}</p></div>{can('distribution.schedule_rows.manage') && isEditable && <div className="flex gap-1"><button type="button" onClick={() => openRow(row)} className="rounded-lg bg-white p-2 text-slate-500 shadow-sm" title={tr('تعديل الصف', 'Edit row')}><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={deleteRow.isPending} onClick={() => { if (window.confirm(tr('سيتم حذف الصف وكل توزيعاته. هل أنت متأكد؟', 'The row and all its assignments will be deleted. Are you sure?'))) deleteRow.mutate({ rowId: row.id, versionId: schedule.version!.id }); }} className="rounded-lg bg-white p-2 text-red-500 shadow-sm disabled:opacity-50" title={tr('حذف الصف', 'Delete row')}><Trash2 className="h-3.5 w-3.5" /></button></div>}</header><div className="grid grid-cols-2 gap-2 p-3">{schedule.blocks.map((block) => { const cells = cellMap.get(`${row.id}|${block.id}`) ?? []; const wholeCohortActivity = blockExcludesGroup(block) && (block.activity_scope ?? 'all') === 'all'; return <button key={block.id} type="button" onClick={() => openCell(row, block)} disabled={!can('distribution.update') || !isEditable || wholeCohortActivity} className={`min-h-20 rounded-xl border p-3 text-start transition ${wholeCohortActivity ? 'border-amber-200 bg-amber-50' : cells.length ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'} disabled:cursor-default`}><span className="block text-[10px] font-bold text-slate-400">{tr('الأسبوع', 'Week')} {block.from_week} · {weekDate(schedule.rotation?.start_date, block.from_week, locale)}</span><span className={`mt-2 block text-sm font-black ${wholeCohortActivity ? 'text-amber-800' : cells.length ? 'text-teal-800' : 'text-slate-300'}`}>{wholeCohortActivity ? block.activity_label : cells.length ? cells.map((cell) => cell.subgroup_name).join(' + ') : tr('فارغ', 'Empty')}</span></button>; })}</div></article>)}</section>
        <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="min-w-max border-collapse text-xs"><thead><tr className="bg-slate-50"><th className="sticky start-0 z-20 min-w-64 border border-slate-200 bg-slate-50 p-3 text-start text-slate-800">{tr('المستشفى / الطبيب أو الشاغر', 'Hospital / physician or vacancy')}</th>{schedule.blocks.map((block) => <th key={block.id} className={`min-w-28 border border-slate-200 p-2 text-center text-slate-800 ${(block.activity_type ?? 'clinical') !== 'clinical' ? 'bg-amber-50' : ''}`}><div className="flex items-center justify-center gap-1 font-black">{tr('الأسبوع', 'Week')} {block.from_week}{can('distribution.update') && isEditable && <button type="button" onClick={() => openBlock(block)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-teal-700" title={tr('نوع الأسبوع ونطاقه', 'Week activity and scope')}><Pencil className="h-3 w-3" /></button>}</div><div className="mt-1 text-[10px] font-normal text-slate-500">{weekDate(schedule.rotation?.start_date, block.from_week, locale)}</div>{(block.activity_type ?? 'clinical') !== 'clinical' && <div className="mt-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-black text-amber-800">{block.activity_label} · {(block.activity_scope ?? 'all') === 'all' ? tr('كل الدفعة', 'All cohort') : block.main_group_codes?.join(', ')}</div>}</th>)}</tr></thead><tbody>{schedule.rows.map((row) => <tr key={row.id} className={row.row_type === 'vacancy' ? 'bg-slate-50/40' : 'hover:bg-slate-50'}><th className="sticky start-0 z-10 border border-slate-200 bg-white p-2.5 text-start"><div className="flex items-start justify-between gap-2"><div><div className={`font-black ${row.row_type === 'vacancy' ? 'text-slate-700' : 'text-slate-800'}`}>{row.row_type === 'vacancy' ? row.label || tr('شاغر', 'Vacancy') : (ar ? row.person?.full_name_ar : row.person?.full_name_en || row.person?.full_name_ar)}</div><div className="mt-0.5 text-[10px] font-normal text-slate-500">{ar ? row.training_site?.name_ar : row.training_site?.name_en || row.training_site?.name_ar}</div></div>{can('distribution.schedule_rows.manage') && isEditable && <div className="flex"><button type="button" onClick={() => openRow(row)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title={tr('تعديل الصف', 'Edit row')}><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={deleteRow.isPending} onClick={() => { if (window.confirm(tr('سيتم حذف الصف وكل توزيعاته. هل أنت متأكد؟', 'The row and all its assignments will be deleted. Are you sure?'))) deleteRow.mutate({ rowId: row.id, versionId: schedule.version!.id }); }} className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50" title={tr('حذف الصف', 'Delete row')}><Trash2 className="h-3.5 w-3.5" /></button></div>}</div></th>{schedule.blocks.map((block) => { const cells = cellMap.get(`${row.id}|${block.id}`) ?? []; const wholeCohortActivity = blockExcludesGroup(block) && (block.activity_scope ?? 'all') === 'all'; return <td key={block.id} className={`border border-slate-200 p-1 text-center ${wholeCohortActivity ? 'bg-amber-50' : cells.length ? 'bg-teal-50' : 'bg-white'}`}><button type="button" onClick={() => openCell(row, block)} className="min-h-10 w-full rounded-lg px-2 font-black text-slate-800 hover:bg-teal-100 disabled:cursor-default" disabled={!can('distribution.update') || !isEditable || wholeCohortActivity}>{wholeCohortActivity ? <span className="text-amber-700">{block.activity_label}</span> : cells.length ? cells.map((cell) => cell.subgroup_name).join(' + ') : <span className="text-slate-300">—</span>}</button></td>; })}</tr>)}</tbody></table></div></section>
      </>}
    </>}

    <Modal isOpen={Boolean(editingBlock)} onClose={() => setEditingBlock(null)} title={editingBlock ? `${tr('إعداد الأسبوع', 'Configure week')} ${editingBlock.from_week}` : ''} footer={<><Button variant="outline" onClick={() => setEditingBlock(null)}>{tr('إلغاء', 'Cancel')}</Button><Button onClick={() => saveBlockActivity.mutate()} isLoading={saveBlockActivity.isPending} disabled={blockForm.activity_scope === 'main_groups' && blockForm.main_group_codes.length === 0}>{tr('حفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <label><span className="mb-1 block text-xs font-black text-slate-600">{tr('نوع الأسبوع', 'Week type')}</span><select className={inputClass} value={blockForm.activity_type} onChange={(event) => setBlockForm({ ...blockForm, activity_type: event.target.value as ActivityType })}><option value="clinical">{tr('توزيع سريري', 'Clinical distribution')}</option><option value="lectures">{tr('محاضرات', 'Lectures')}</option><option value="break">{tr('إجازة / توقف', 'Break')}</option><option value="exam">{tr('امتحانات', 'Exams')}</option></select></label>
        {blockForm.activity_type !== 'clinical' && <><label><span className="mb-1 block text-xs font-black text-slate-600">{tr('عنوان يظهر في الجدول', 'Label shown in schedule')}</span><input className={inputClass} value={blockForm.activity_label} onChange={(event) => setBlockForm({ ...blockForm, activity_label: event.target.value })} placeholder={tr('مثال: محاضرات نظرية', 'Example: Theory lectures')} /></label><div><span className="mb-2 block text-xs font-black text-slate-600">{tr('يطبق على', 'Applies to')}</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setBlockForm({ ...blockForm, activity_scope: 'all', main_group_codes: [] })} className={`rounded-xl border p-3 text-xs font-black ${blockForm.activity_scope === 'all' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200'}`}>{tr('كل الدفعة', 'All cohort')}</button><button type="button" onClick={() => setBlockForm({ ...blockForm, activity_scope: 'main_groups' })} className={`rounded-xl border p-3 text-xs font-black ${blockForm.activity_scope === 'main_groups' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200'}`}>{tr('مجموعات محددة', 'Selected groups')}</button></div></div>{blockForm.activity_scope === 'main_groups' && <div className="flex flex-wrap gap-2">{mainGroupCodes.map((code) => <label key={code} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-black ${blockForm.main_group_codes.includes(code) ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200'}`}><input type="checkbox" className="me-2" checked={blockForm.main_group_codes.includes(code)} onChange={() => setBlockForm({ ...blockForm, main_group_codes: blockForm.main_group_codes.includes(code) ? blockForm.main_group_codes.filter((item) => item !== code) : [...blockForm.main_group_codes, code] })} />{code}</label>)}</div>}<p className="rounded-xl bg-amber-50 p-3 text-[11px] font-bold leading-5 text-amber-800"><BookOpen className="me-1 inline h-4 w-4" />{tr('عند الحفظ سيحذف النظام تلقائيًا التوزيعات السريرية المتعارضة لهذا الأسبوع فقط. إذا اخترت مجموعات محددة، يبقى التوزيع متاحًا لبقية المجموعات.', 'Saving removes conflicting clinical assignments for this week only. With selected groups, clinical distribution remains available to the other groups.')}</p></>}
      </div>
    </Modal>

    <Modal isOpen={Boolean(editingCell)} onClose={() => setEditingCell(null)} title={editingCell ? `${editingCell.row.row_type === 'vacancy' ? editingCell.row.label || tr('شاغر', 'Vacancy') : (ar ? editingCell.row.person?.full_name_ar : editingCell.row.person?.full_name_en || editingCell.row.person?.full_name_ar)} — ${tr('الأسبوع', 'Week')} ${editingCell.block.from_week}` : ''} footer={editingCell && <><Button variant="outline" onClick={() => setEditingCell(null)}>{tr('إلغاء', 'Cancel')}</Button>{cellMap.has(`${editingCell.row.id}|${editingCell.block.id}`) && <Button variant="danger" onClick={() => clearCell.mutate()} isLoading={clearCell.isPending}><Trash2 className="me-1 h-4 w-4" />{tr('تفريغ الخلية', 'Clear cell')}</Button>}<Button onClick={() => saveCell.mutate()} isLoading={saveCell.isPending} disabled={editingCell.subgroupIds.length === 0}>{tr('حفظ المجموعات', 'Save groups')}</Button></>}>
      <div><span className="mb-2 block text-xs font-black text-slate-600">{tr('مجموعات الطلبة', 'Student groups')}</span><div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2">{schedule?.subgroups.filter((subgroup) => !editingCell || !blockExcludesGroup(editingCell.block, subgroup.group?.name)).map((subgroup) => { const selected = editingCell?.subgroupIds.includes(subgroup.id) ?? false; return <label key={subgroup.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${selected ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-700'}`}><input type="checkbox" checked={selected} onChange={() => setEditingCell((current) => current ? { ...current, subgroupIds: current.subgroupIds.includes(subgroup.id) ? current.subgroupIds.filter((id) => id !== subgroup.id) : [...current.subgroupIds, subgroup.id] } : null)} /><span>{subgroup.name}</span><span className="ms-auto text-[10px] text-slate-400">{subgroup.students_count > 0 ? tr(`${subgroup.students_count} طالب`, `${subgroup.students_count} students`) : tr('فارغة', 'Empty')}</span></label>; })}</div></div>
      {editingCell && editingCell.subgroupIds.length > 0 && <p className="mt-3 rounded-xl bg-teal-50 p-3 text-xs font-black text-teal-800">{tr('المحدد:', 'Selected:')} {schedule?.subgroups.filter((subgroup) => editingCell.subgroupIds.includes(subgroup.id)).map((subgroup) => subgroup.name).join(' + ')}</p>}
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600"><Stethoscope className="me-1 inline h-3.5 w-3.5" />{tr('المستشفى:', 'Hospital:')} {ar ? editingCell?.row.training_site?.name_ar : editingCell?.row.training_site?.name_en || editingCell?.row.training_site?.name_ar}</p><p className="mt-2 rounded-xl bg-teal-50 p-3 text-[11px] font-bold text-teal-800">{tr('يمكن اختيار مجموعة واحدة أو عدة مجموعات. أي طالب يسجل فيها لاحقًا سيُربط بهذا التوزيع تلقائيًا.', 'Select one or several groups. Students who register later will be linked to this assignment automatically.')}</p>
    </Modal>

    <Modal isOpen={rowModal} onClose={() => setRowModal(false)} title={editingRowId ? tr('تعديل صف الجدول', 'Edit schedule row') : tr('إضافة صف للجدول', 'Add schedule row')} maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); saveRow.mutate(); }} className="space-y-4"><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setRowForm({ ...rowForm, row_type: 'doctor' })} className={`rounded-lg px-3 py-2 text-xs font-black ${rowForm.row_type === 'doctor' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>{tr('طبيب', 'Physician')}</button><button type="button" onClick={() => setRowForm({ ...rowForm, row_type: 'vacancy', personId: '' })} className={`rounded-lg px-3 py-2 text-xs font-black ${rowForm.row_type === 'vacancy' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500'}`}>{tr('شاغر', 'Vacancy')}</button></div>{rowForm.row_type === 'doctor' ? <div className="space-y-3"><label><span className="mb-1 block text-xs font-bold">{tr('المستشفى', 'Hospital')}</span><select required className={inputClass} value={rowForm.hospitalId} onChange={(event) => setRowForm({ ...rowForm, hospitalId: event.target.value, personId: '', search: '' })}><option value="">{tr('اختر المستشفى أولاً', 'Select a hospital first')}</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{ar ? hospital.name_ar : hospital.name_en || hospital.name_ar} — {hospital.supervisors.length} {tr('طبيب', 'physicians')}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">{tr('بحث ضمن أطباء المستشفى المحدد', 'Search the selected hospital physicians')}</span><input className={inputClass} value={rowForm.search} onChange={(event) => setRowForm({ ...rowForm, search: event.target.value })} disabled={!rowForm.hospitalId} placeholder={tr('اكتب اسم الطبيب...', 'Enter physician name...')} /></label><label><span className="mb-1 block text-xs font-bold">{tr('المشرف السريري', 'Clinical supervisor')}</span><select required size={8} className={`${inputClass} h-56`} value={rowForm.personId} disabled={!rowForm.hospitalId} onChange={(event) => setRowForm({ ...rowForm, personId: event.target.value })}><option value="">{rowForm.hospitalId ? tr('اختر المشرف', 'Select supervisor') : tr('اختر المستشفى أولاً', 'Select a hospital first')}</option>{availableRowDoctors.map((doctor) => doctor.id !== null && <option key={doctor.id} value={doctor.id}>{ar ? doctor.full_name_ar : doctor.full_name_en || doctor.full_name_ar}{doctor.specialty ? ` — ${doctor.specialty}` : ''}</option>)}</select></label>{rowForm.hospitalId && availableRowDoctors.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-800">{tr('لا يوجد أطباء مطابقون في هذا المستشفى.', 'No matching physicians are available at this hospital.')}</p>}{rowForm.personId && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">{tr('سيتم الحفظ:', 'Will be saved:')} {ar ? selectedRowHospital?.name_ar : selectedRowHospital?.name_en || selectedRowHospital?.name_ar} — {ar ? availableRowDoctors.find((doctor) => String(doctor.id) === rowForm.personId)?.full_name_ar : availableRowDoctors.find((doctor) => String(doctor.id) === rowForm.personId)?.full_name_en || availableRowDoctors.find((doctor) => String(doctor.id) === rowForm.personId)?.full_name_ar}</div>}</div> : <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">{tr('المستشفى', 'Hospital')}</span><select required className={inputClass} value={rowForm.hospitalId} onChange={(event) => setRowForm({ ...rowForm, hospitalId: event.target.value })}><option value="">{tr('اختر المستشفى', 'Select hospital')}</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{ar ? hospital.name_ar : hospital.name_en || hospital.name_ar}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">{tr('اسم الشاغر', 'Vacancy label')}</span><input required className={inputClass} value={rowForm.label} onChange={(event) => setRowForm({ ...rowForm, label: event.target.value })} placeholder={tr('شاغر', 'Vacancy')} /></label></div>}<div className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-[11px] leading-5 text-teal-800">{tr('اختر المستشفى أولاً ثم اختر أحد المشرفين المرتبطين به. يظهر ملخص الاختيار قبل الحفظ لمنع خلط الطبيب بالمستشفى.', 'Select the hospital first, then choose one of its linked supervisors. A confirmation summary is shown before saving to prevent mismatches.')}</div><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setRowModal(false)}>{tr('إلغاء', 'Cancel')}</Button><Button type="submit" isLoading={saveRow.isPending} disabled={!rowForm.hospitalId || (rowForm.row_type === 'doctor' && !rowForm.personId)}>{tr('حفظ الصف', 'Save row')}</Button></div></form></Modal>
  </div>;
}
