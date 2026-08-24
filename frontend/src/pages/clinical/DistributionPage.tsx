import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Grid3X3, Pencil, Plus, Send, Stethoscope, Trash2, UserRound, Users } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { approveVersion, publishVersion } from '@/api/distribution';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Level = 'fourth' | 'fifth' | 'sixth';
type Year = { id: number; code: string; start_date: string; end_date: string; is_current: boolean };
type Course = { id: number; code: string; name_ar: string; name_en?: string | null; academic_level: Level; semester?: number };
type Doctor = { id: number | null; user_id: number; full_name_ar: string; full_name_en?: string | null; email?: string; specialty?: string; primary_site_id?: number | null; training_site_ids?: number[] };
type Hospital = { id: number; site_code: string; name_ar: string; name_en?: string | null; site_type?: string; city?: string | null; supervisors: Doctor[] };
type Block = { id: number; block_code: string; from_week: number; to_week: number };
type Subgroup = { id: number; name: string; capacity: number; students_count: number; group?: { id: number; name: string } };
type Cell = { course_schedule_row_id: number; rotation_block_id: number; supervisor_id?: number | null; training_site_id: number; subgroup_id: number; subgroup_name: string; main_group_name?: string };
type ScheduleRow = { id: number; row_type: 'doctor' | 'vacancy'; person_id?: number | null; training_site_id: number; label?: string | null; person?: { id: number; full_name_ar: string; specialty?: string | null }; training_site?: { id: number; name_ar: string } };
type Version = { id: number; status: string; updated_at: string };
type Rotation = { id: number; name: string; start_date?: string | null; duration_weeks: number };
type Options = { academic_years: Year[]; courses: Course[]; hospitals: Hospital[]; unassigned_doctors: Doctor[] };
type Schedule = { rotation: Rotation | null; version: Version | null; blocks: Block[]; subgroups: Subgroup[]; hospitals: Hospital[]; unassigned_doctors: Doctor[]; rows: ScheduleRow[]; cells: Cell[] };

const levels: Record<Level, string> = { fourth: 'السنة الرابعة', fifth: 'السنة الخامسة', sixth: 'السنة السادسة' };
const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

function message(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const validation = Object.values(error.errors).flat().find((item) => typeof item === 'string');
  return typeof validation === 'string' ? validation : error.message || fallback;
}

function weekDate(startDate: string | null | undefined, week: number): string {
  if (!startDate) return '';
  const date = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + ((week - 1) * 7));
  return new Intl.DateTimeFormat('ar-PS', { day: '2-digit', month: '2-digit' }).format(date);
}

export function DistributionPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState('');
  const [level, setLevel] = useState<Level>('fourth');
  const [courseId, setCourseId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [weeksCount, setWeeksCount] = useState(12);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: ScheduleRow; block: Block; subgroupId: string } | null>(null);
  const [rowModal, setRowModal] = useState(false);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [rowForm, setRowForm] = useState({ row_type: 'doctor' as 'doctor' | 'vacancy', hospitalId: '', personId: '', label: 'شاغر', search: '' });
  const [doctorModal, setDoctorModal] = useState(false);
  const [assigningDoctor, setAssigningDoctor] = useState<{ doctor: Doctor; siteId: string } | null>(null);
  const [hospitalModal, setHospitalModal] = useState(false);
  const [editingHospitalId, setEditingHospitalId] = useState<number | null>(null);
  const [hospitalsExpanded, setHospitalsExpanded] = useState(true);
  const [doctorForm, setDoctorForm] = useState({ full_name_ar: '', full_name_en: '', email: '', password: '', primary_site_id: '', specialty: '' });
  const [hospitalForm, setHospitalForm] = useState({ site_code: '', name_ar: '', name_en: '', site_type: 'hospital_public', city: '' });

  const optionsQuery = useQuery({ queryKey: ['course-distribution-options'], queryFn: () => apiFetch<Options>('/course-distribution/options'), enabled: can('distribution.view') });
  const years = optionsQuery.data?.academic_years ?? [];
  const courses = optionsQuery.data?.courses ?? [];
  const availableCourses = useMemo(() => courses.filter((course) => course.academic_level === level), [courses, level]);

  useEffect(() => { if (!yearId && years.length) setYearId(String(years.find((year) => year.is_current)?.id ?? years[0].id)); }, [yearId, years]);
  useEffect(() => { if (!availableCourses.some((course) => String(course.id) === courseId)) setCourseId(availableCourses[0] ? String(availableCourses[0].id) : ''); }, [availableCourses, courseId]);
  useEffect(() => { const year = years.find((item) => String(item.id) === yearId); if (year && !startDate) setStartDate(year.start_date); }, [startDate, yearId, years]);

  const scheduleQuery = useQuery({
    queryKey: ['course-distribution-schedule', yearId, level, courseId],
    queryFn: () => apiFetch<Schedule>(`/course-distribution/schedule?academic_year_id=${yearId}&academic_level=${level}&course_id=${courseId}`),
    enabled: Boolean(yearId && courseId),
  });
  const schedule = scheduleQuery.data;
  const hospitals = schedule?.hospitals ?? optionsQuery.data?.hospitals ?? [];
  const unassignedDoctors = schedule?.unassigned_doctors ?? optionsQuery.data?.unassigned_doctors ?? [];
  const doctorsCount = (schedule?.rows ?? []).filter((row) => row.row_type === 'doctor').length;
  const cellMap = useMemo(() => new Map((schedule?.cells ?? []).map((cell) => [`${cell.course_schedule_row_id}|${cell.rotation_block_id}`, cell])), [schedule?.cells]);
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['course-distribution-schedule'] }), queryClient.invalidateQueries({ queryKey: ['course-distribution-options'] })]); };

  const createSchedule = useMutation({
    mutationFn: () => apiFetch('/course-distribution/schedules', { method: 'POST', body: { academic_year_id: Number(yearId), academic_level: level, course_id: Number(courseId), start_date: startDate, weeks_count: weeksCount } }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم إنشاء شبكة أسابيع المساق. ابدأ بتوزيع المجموعات على الأطباء.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر إنشاء جدول المساق.') }),
  });
  const saveCell = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/cell`, { method: 'PUT', body: { rotation_block_id: editingCell!.block.id, course_schedule_row_id: editingCell!.row.id, subgroup_id: Number(editingCell!.subgroupId) } }),
    onSuccess: async () => { setEditingCell(null); await refresh(); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر حفظ الخلية.') }),
  });
  const clearCell = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/cell`, { method: 'DELETE', body: { rotation_block_id: editingCell!.block.id, course_schedule_row_id: editingCell!.row.id } }),
    onSuccess: async () => { setEditingCell(null); await refresh(); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر تفريغ الخلية.') }),
  });
  const addDoctor = useMutation({
    mutationFn: () => apiFetch('/course-distribution/doctors', { method: 'POST', body: { ...doctorForm, primary_site_id: Number(doctorForm.primary_site_id) } }),
    onSuccess: async () => { setDoctorModal(false); setDoctorForm({ full_name_ar: '', full_name_en: '', email: '', password: '', primary_site_id: '', specialty: '' }); await refresh(); setNotice({ type: 'success', text: 'تمت إضافة الطبيب وإنشاء حساب مشرف سريري له.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر إضافة الطبيب.') }),
  });
  const assignHospital = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/doctors/${assigningDoctor!.doctor.user_id}/hospital`, { method: 'PUT', body: { primary_site_id: assigningDoctor!.siteId ? Number(assigningDoctor!.siteId) : null } }),
    onSuccess: async () => { setAssigningDoctor(null); await refresh(); setNotice({ type: 'success', text: 'تم تحديث مستشفى الطبيب.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر تحديث مستشفى الطبيب.') }),
  });
  const saveHospital = useMutation({
    mutationFn: () => apiFetch(editingHospitalId ? `/training-sites/${editingHospitalId}` : '/training-sites', { method: editingHospitalId ? 'PUT' : 'POST', body: hospitalForm }),
    onSuccess: async () => { setHospitalModal(false); setEditingHospitalId(null); setHospitalForm({ site_code: '', name_ar: '', name_en: '', site_type: 'hospital_public', city: '' }); await refresh(); setNotice({ type: 'success', text: 'تم حفظ بيانات المستشفى.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر حفظ المستشفى.') }),
  });
  const saveRow = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/rows${editingRowId ? `/${editingRowId}` : ''}`, { method: editingRowId ? 'PUT' : 'POST', body: { row_type: rowForm.row_type, person_id: rowForm.row_type === 'doctor' ? Number(rowForm.personId) : null, training_site_id: Number(rowForm.hospitalId), label: rowForm.row_type === 'vacancy' ? rowForm.label : null } }),
    onSuccess: async () => { setRowModal(false); await refresh(); setNotice({ type: 'success', text: editingRowId ? 'تم تعديل صف الجدول.' : 'تمت إضافة صف جديد.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر حفظ صف الجدول.') }),
  });
  const deleteRow = useMutation({
    mutationFn: (rowId: number) => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/rows/${rowId}`, { method: 'DELETE' }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم حذف الصف.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر حذف الصف.') }),
  });
  const approve = useMutation({ mutationFn: () => approveVersion(schedule!.version!.id), onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم اعتماد الجدول.' }); }, onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر اعتماد الجدول.') }) });
  const publish = useMutation({ mutationFn: () => publishVersion(schedule!.version!.id, { last_updated_at: schedule!.version!.updated_at }), onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم نشر الجدول للطلبة والمشرفين.' }); }, onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر نشر الجدول.') }) });

  const openCell = (row: ScheduleRow, block: Block) => {
    if (!can('distribution.update') || schedule?.version?.status === 'published') return;
    const current = cellMap.get(`${row.id}|${block.id}`);
    setEditingCell({ row, block, subgroupId: current ? String(current.subgroup_id) : '' });
  };

  const openRow = (row?: ScheduleRow) => {
    setEditingRowId(row?.id ?? null);
    setRowForm({ row_type: row?.row_type ?? 'doctor', hospitalId: row ? String(row.training_site_id) : '', personId: row?.person_id ? String(row.person_id) : '', label: row?.label ?? 'شاغر', search: '' });
    setRowModal(true);
  };

  const openHospital = (hospital?: Hospital) => {
    setEditingHospitalId(hospital?.id ?? null);
    setHospitalForm({
      site_code: hospital?.site_code ?? '',
      name_ar: hospital?.name_ar ?? '',
      name_en: hospital?.name_en ?? '',
      site_type: hospital?.site_type ?? 'hospital_public',
      city: hospital?.city ?? '',
    });
    setHospitalModal(true);
  };

  if (!can('distribution.view')) return <ErrorState title="غير مصرح" message="لا تملك صلاحية عرض التوزيع السريري." />;
  if (optionsQuery.isLoading) return <LoadingState />;
  if (optionsQuery.isError) return <ErrorState onRetry={() => optionsQuery.refetch()} />;

  return <div className="mx-auto max-w-[1700px] space-y-5 pb-14" dir="rtl">
    <PageHeader title="التوزيع الأسبوعي للمساقات السريرية" description="اختر الدفعة والمساق، ثم وزّع مجموعات الطلبة أسبوعيًا على أطباء المستشفيات.">
      <Link to="/distribution/groups" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><Users className="h-4 w-4" />مجموعات الطلبة</Link>
      <Link to="/courses" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><ExternalLink className="h-4 w-4" />مساقات السريري</Link>
    </PageHeader>
    {notice && <div className={`flex justify-between rounded-xl border px-4 py-3 text-xs font-bold ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}><span>{notice.text}</span><button onClick={() => setNotice(null)}>×</button></div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-3">
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">العام الأكاديمي</span><select className={inputClass} value={yearId} onChange={(event) => { setYearId(event.target.value); setStartDate(''); }}><option value="">اختر العام</option>{years.map((year) => <option key={year.id} value={year.id}>{year.code}{year.is_current ? ' — الحالي' : ''}</option>)}</select></label>
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">الدفعة / المستوى</span><select className={inputClass} value={level} onChange={(event) => setLevel(event.target.value as Level)}>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label><span className="mb-1.5 block text-[11px] font-black text-slate-500">المساق السريري</span><select className={inputClass} value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={!availableCourses.length}><option value="">{availableCourses.length ? 'اختر المساق' : 'لا توجد مساقات لهذه الدفعة'}</option>{availableCourses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.name_ar}</option>)}</select></label>
    </div></section>

    {scheduleQuery.isLoading && <LoadingState />}
    {scheduleQuery.isError && <ErrorState onRetry={() => scheduleQuery.refetch()} />}
    {schedule && !schedule.rotation && <section className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-7 text-center"><CalendarDays className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-black text-slate-900">لا يوجد جدول لهذا المساق بعد</h2><p className="mt-1 text-xs text-slate-500">حدد تاريخ أول أسبوع وعدد أسابيع المساق؛ سيُنشئ النظام أعمدة الأسابيع تلقائيًا.</p>{can('rotations.create') ? <div className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-3"><input type="date" className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /><select className={inputClass} value={weeksCount} onChange={(event) => setWeeksCount(Number(event.target.value))}>{[8,10,12,14,16].map((count) => <option key={count} value={count}>{count} أسبوع</option>)}</select><Button onClick={() => createSchedule.mutate()} isLoading={createSchedule.isPending} disabled={!startDate}>إنشاء جدول المساق</Button></div> : <p className="mt-4 text-xs font-bold text-amber-700">تحتاج صلاحية «إعداد وإضافة دورة سريرية».</p>}</section>}

    {schedule?.rotation && schedule.version && <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><div className="flex items-center gap-2"><Grid3X3 className="h-5 w-5 text-teal-700" /><h2 className="font-black text-slate-900">{schedule.rotation.name}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{schedule.version.status}</span></div><p className="mt-1 text-xs text-slate-500">{schedule.blocks.length} أسبوع · {doctorsCount} طبيب · {schedule.rows.filter((row) => row.row_type === 'vacancy').length} شاغر · {schedule.subgroups.length} مجموعة فرعية</p></div><div className="flex flex-wrap gap-2">{can('distribution.schedule_rows.manage') && schedule.version.status !== 'published' && <Button variant="outline" onClick={() => openRow()}><Plus className="ml-1 h-4 w-4" />إضافة صف</Button>}{can('distribution.approve') && schedule.version.status !== 'published' && <Button variant="outline" onClick={() => approve.mutate()} isLoading={approve.isPending}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button>}{can('distribution.publish') && schedule.version.status !== 'published' && <Button onClick={() => publish.mutate()} isLoading={publish.isPending}><Send className="ml-1 h-4 w-4" />نشر</Button>}</div></section>
      {schedule.subgroups.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">لا توجد مجموعات فرعية للدفعة والعام المحددين. أنشئ المجموعات وسجّل الطلبة أولًا من شاشة مجموعات الطلبة.</div>}
      {schedule.rows.length === 0 ? <section className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center"><UserRound className="mx-auto h-10 w-10 text-slate-300" /><h3 className="mt-3 font-black text-slate-800">الجدول فارغ</h3><p className="mt-1 text-xs text-slate-500">أضف صف طبيب أو صف شاغر، ثم ابدأ بتوزيع المجموعات على الأسابيع.</p>{can('distribution.schedule_rows.manage') ? <Button className="mt-4" onClick={() => openRow()}><Plus className="ml-1 h-4 w-4" />إضافة أول صف</Button> : <p className="mt-3 text-xs font-bold text-amber-700">تحتاج صلاحية إدارة صفوف أطباء الجدول.</p>}</section> :
      <><section className="grid gap-3 md:hidden">{schedule.rows.map((row) => <article key={row.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${row.row_type === 'vacancy' ? 'border-amber-200' : 'border-slate-200'}`}><header className={`flex items-start justify-between gap-3 border-b p-4 ${row.row_type === 'vacancy' ? 'border-amber-100 bg-amber-50' : 'border-slate-100 bg-gradient-to-l from-teal-50 to-white'}`}><div><h3 className={`text-sm font-black ${row.row_type === 'vacancy' ? 'text-amber-800' : 'text-slate-900'}`}>{row.row_type === 'vacancy' ? row.label || 'شاغر' : row.person?.full_name_ar}</h3><p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><Building2 className="h-3.5 w-3.5 text-teal-600" />{row.training_site?.name_ar}</p></div>{can('distribution.schedule_rows.manage') && schedule.version?.status !== 'published' && <div className="flex gap-1"><button type="button" onClick={() => openRow(row)} className="rounded-lg bg-white p-2 text-slate-500 shadow-sm"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { if (window.confirm('سيتم حذف الصف وكل توزيعاته. هل أنت متأكد؟')) deleteRow.mutate(row.id); }} className="rounded-lg bg-white p-2 text-red-500 shadow-sm"><Trash2 className="h-3.5 w-3.5" /></button></div>}</header><div className="grid grid-cols-2 gap-2 p-3">{schedule.blocks.map((block) => { const cell = cellMap.get(`${row.id}|${block.id}`); return <button key={block.id} type="button" onClick={() => openCell(row, block)} disabled={!can('distribution.update') || schedule.version?.status === 'published'} className={`min-h-20 rounded-xl border p-3 text-right transition ${cell ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'} disabled:cursor-default`}><span className="block text-[10px] font-bold text-slate-400">الأسبوع {block.from_week} · {weekDate(schedule.rotation?.start_date, block.from_week)}</span><span className={`mt-2 block text-sm font-black ${cell ? 'text-teal-800' : 'text-slate-300'}`}>{cell ? cell.subgroup_name : 'فارغ'}</span></button>; })}</div></article>)}</section><section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="min-w-max border-collapse text-xs"><thead><tr className="bg-[#eef3f8]"><th className="sticky right-0 z-20 min-w-64 border border-slate-200 bg-[#eef3f8] p-3 text-right text-[#102a43]">المستشفى / الطبيب أو الشاغر</th>{schedule.blocks.map((block) => <th key={block.id} className="min-w-24 border border-slate-200 p-2 text-center text-[#102a43]"><div className="font-black">الأسبوع {block.from_week}</div><div className="mt-1 text-[10px] font-normal text-slate-500">{weekDate(schedule.rotation?.start_date, block.from_week)}</div></th>)}</tr></thead><tbody>{schedule.rows.map((row) => <tr key={row.id} className={row.row_type === 'vacancy' ? 'bg-amber-50/40' : 'hover:bg-slate-50'}><th className="sticky right-0 z-10 border border-slate-200 bg-white p-2.5 text-right"><div className="flex items-start justify-between gap-2"><div><div className={`font-black ${row.row_type === 'vacancy' ? 'text-amber-700' : 'text-slate-800'}`}>{row.row_type === 'vacancy' ? row.label || 'شاغر' : row.person?.full_name_ar}</div><div className="mt-0.5 text-[10px] font-normal text-slate-500">{row.training_site?.name_ar}</div></div>{can('distribution.schedule_rows.manage') && schedule.version?.status !== 'published' && <div className="flex"><button type="button" onClick={() => openRow(row)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title="تعديل الصف"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => { if (window.confirm('سيتم حذف الصف وكل توزيعاته. هل أنت متأكد؟')) deleteRow.mutate(row.id); }} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="حذف الصف"><Trash2 className="h-3.5 w-3.5" /></button></div>}</div></th>{schedule.blocks.map((block) => { const cell = cellMap.get(`${row.id}|${block.id}`); return <td key={block.id} className={`border border-slate-200 p-1 text-center ${cell ? 'bg-teal-50' : 'bg-white'}`}><button type="button" onClick={() => openCell(row, block)} className="min-h-10 w-full rounded-lg px-2 font-black text-slate-800 hover:bg-teal-100 disabled:cursor-default" disabled={!can('distribution.update') || schedule.version?.status === 'published'}>{cell ? cell.subgroup_name : <span className="text-slate-300">—</span>}</button></td>; })}</tr>)}</tbody></table></div></section></>}
    </>}

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setHospitalsExpanded(!hospitalsExpanded)} className="flex w-full items-center justify-between p-4 text-right">
        <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-700" /><div><h2 className="font-black text-slate-900">إدارة المستشفيات والأطباء</h2><p className="mt-0.5 text-[11px] text-slate-500">كل حساب يحمل دور «مشرف سريري» يظهر هنا كطبيب، ثم يُربط بالمستشفى المناسب.</p></div></div>
        {hospitalsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {hospitalsExpanded && <div className="space-y-5 border-t border-slate-100 p-4">
        <div className="flex flex-wrap justify-end gap-2">
          {can('training_sites.manage') && <Button variant="outline" onClick={() => openHospital()}><Plus className="ml-1 h-4 w-4" />إضافة مستشفى</Button>}
          {can('people.manage') && <Button onClick={() => setDoctorModal(true)}><Plus className="ml-1 h-4 w-4" />إضافة طبيب وحساب مشرف</Button>}
        </div>

        {unassignedDoctors.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-black text-amber-900">أطباء بانتظار تعيين مستشفى</h3><p className="mt-0.5 text-[11px] text-amber-700">هؤلاء موجودون في المستخدمين بدور مشرف سريري ولن يظهروا في شبكة الجدول حتى يتم تعيين مستشفى.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-amber-800">{unassignedDoctors.length}</span></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{unassignedDoctors.map((doctor) => <div key={doctor.user_id} className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{doctor.full_name_ar}</p><p dir="ltr" className="truncate text-left text-[10px] text-slate-500">{doctor.email}</p></div>{can('people.manage') && <Button variant="outline" size="sm" onClick={() => setAssigningDoctor({ doctor, siteId: '' })}>تعيين</Button>}</div>)}</div>
        </div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{hospitals.map((hospital) => <article key={hospital.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-teal-700" /><h3 className="font-black text-slate-900">{hospital.name_ar}</h3></div><p className="mt-1 text-[10px] text-slate-500">{hospital.site_code}{hospital.city ? ` · ${hospital.city}` : ''} · {hospital.supervisors.length} طبيب</p></div>{can('training_sites.manage') && <button type="button" onClick={() => openHospital(hospital)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="تعديل المستشفى"><Pencil className="h-4 w-4" /></button>}</div>
          <div className="mt-3 space-y-2">{hospital.supervisors.length ? hospital.supervisors.map((doctor) => <div key={doctor.user_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5"><div className="flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-slate-500" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{doctor.full_name_ar}</p><p className="truncate text-[10px] text-slate-500">{doctor.email || doctor.specialty}</p></div></div>{can('people.manage') && <button type="button" onClick={() => setAssigningDoctor({ doctor, siteId: String(hospital.id) })} className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-teal-700 hover:bg-teal-50">نقل</button>}</div>) : <p className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-400">لا يوجد أطباء</p>}</div>
        </article>)}</div>
      </div>}
    </section>

    <Modal isOpen={Boolean(editingCell)} onClose={() => setEditingCell(null)} title={editingCell ? `${editingCell.row.row_type === 'vacancy' ? editingCell.row.label || 'شاغر' : editingCell.row.person?.full_name_ar} — الأسبوع ${editingCell.block.from_week}` : ''} footer={editingCell && <><Button variant="outline" onClick={() => setEditingCell(null)}>إلغاء</Button>{cellMap.has(`${editingCell.row.id}|${editingCell.block.id}`) && <Button variant="danger" onClick={() => clearCell.mutate()} isLoading={clearCell.isPending}><Trash2 className="ml-1 h-4 w-4" />تفريغ الخلية</Button>}<Button onClick={() => saveCell.mutate()} isLoading={saveCell.isPending} disabled={!editingCell.subgroupId}>حفظ المجموعة</Button></>}><label><span className="mb-2 block text-xs font-black text-slate-600">مجموعة الطلبة</span><select className={inputClass} value={editingCell?.subgroupId ?? ''} onChange={(event) => setEditingCell((current) => current ? { ...current, subgroupId: event.target.value } : null)}><option value="">اختر المجموعة</option>{schedule?.subgroups.map((subgroup) => <option key={subgroup.id} value={subgroup.id}>{subgroup.name} — {subgroup.students_count} طالب</option>)}</select></label><p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600"><Stethoscope className="ml-1 inline h-3.5 w-3.5" />المستشفى: {editingCell?.row.training_site?.name_ar}</p></Modal>

    <Modal isOpen={rowModal} onClose={() => setRowModal(false)} title={editingRowId ? 'تعديل صف الجدول' : 'إضافة صف للجدول'} maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); saveRow.mutate(); }} className="space-y-4"><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setRowForm({ ...rowForm, row_type: 'doctor' })} className={`rounded-lg px-3 py-2 text-xs font-black ${rowForm.row_type === 'doctor' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>طبيب</button><button type="button" onClick={() => setRowForm({ ...rowForm, row_type: 'vacancy', personId: '' })} className={`rounded-lg px-3 py-2 text-xs font-black ${rowForm.row_type === 'vacancy' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>شاغر</button></div>{rowForm.row_type === 'doctor' ? <div className="space-y-2"><label><span className="mb-1 block text-xs font-bold">بحث عن طبيب</span><input className={inputClass} value={rowForm.search} onChange={(event) => setRowForm({ ...rowForm, search: event.target.value })} placeholder="اكتب اسم الطبيب أو المستشفى..." /></label><label><span className="mb-1 block text-xs font-bold">الأطباء مصنفون حسب المستشفى</span><select required size={10} className={`${inputClass} h-64`} value={rowForm.personId && rowForm.hospitalId ? `${rowForm.hospitalId}:${rowForm.personId}` : ''} onChange={(event) => { const [hospitalId, personId] = event.target.value.split(':'); setRowForm({ ...rowForm, hospitalId, personId }); }}>{hospitals.map((hospital) => { const query = rowForm.search.trim().toLowerCase(); const matchesHospital = hospital.name_ar.toLowerCase().includes(query); const doctors = hospital.supervisors.filter((doctor) => !query || matchesHospital || doctor.full_name_ar.toLowerCase().includes(query) || doctor.email?.toLowerCase().includes(query)); return doctors.length ? <optgroup key={hospital.id} label={`${hospital.name_ar} — ${doctors.length} طبيب`}>{doctors.map((doctor) => doctor.id !== null && <option key={`${hospital.id}:${doctor.id}`} value={`${hospital.id}:${doctor.id}`}>{doctor.full_name_ar}{doctor.specialty ? ` — ${doctor.specialty}` : ''}</option>)}</optgroup> : null; })}</select></label></div> : <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">المستشفى</span><select required className={inputClass} value={rowForm.hospitalId} onChange={(event) => setRowForm({ ...rowForm, hospitalId: event.target.value })}><option value="">اختر المستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">اسم الشاغر</span><input required className={inputClass} value={rowForm.label} onChange={(event) => setRowForm({ ...rowForm, label: event.target.value })} placeholder="شاغر" /></label></div>}<div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">إضافة الطبيب هنا لا تغيّر دليل الأطباء. إذا لم تجد الطبيب، أضفه أولاً من قسم إدارة المستشفيات والأطباء ثم سيظهر مباشرة في هذه القائمة.</div><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setRowModal(false)}>إلغاء</Button><Button type="submit" isLoading={saveRow.isPending} disabled={!rowForm.hospitalId || (rowForm.row_type === 'doctor' && !rowForm.personId)}>حفظ الصف</Button></div></form></Modal>

    <Modal isOpen={doctorModal} onClose={() => setDoctorModal(false)} title="إضافة طبيب وإنشاء حساب مشرف سريري" maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); addDoctor.mutate(); }} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">اسم الطبيب بالعربية</span><input required className={inputClass} value={doctorForm.full_name_ar} onChange={(event) => setDoctorForm({ ...doctorForm, full_name_ar: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">الاسم بالإنجليزية</span><input className={inputClass} value={doctorForm.full_name_en} onChange={(event) => setDoctorForm({ ...doctorForm, full_name_en: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">المستشفى</span><select required className={inputClass} value={doctorForm.primary_site_id} onChange={(event) => setDoctorForm({ ...doctorForm, primary_site_id: event.target.value })}><option value="">اختر المستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">التخصص</span><input className={inputClass} value={doctorForm.specialty} onChange={(event) => setDoctorForm({ ...doctorForm, specialty: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">البريد الإلكتروني</span><input required type="email" dir="ltr" className={inputClass} value={doctorForm.email} onChange={(event) => setDoctorForm({ ...doctorForm, email: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">كلمة المرور المؤقتة</span><input required type="password" dir="ltr" minLength={12} className={inputClass} value={doctorForm.password} onChange={(event) => setDoctorForm({ ...doctorForm, password: event.target.value })} placeholder="12+ حرف كبير وصغير ورقم ورمز" /></label></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">سيُنشئ النظام حسابًا فعالًا بدور «مشرف سريري» ويربطه بالطبيب والمستشفى المحدد.</div><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setDoctorModal(false)}>إلغاء</Button><Button type="submit" isLoading={addDoctor.isPending}>إضافة الطبيب والحساب</Button></div></form></Modal>

    <Modal isOpen={Boolean(assigningDoctor)} onClose={() => setAssigningDoctor(null)} title={assigningDoctor ? `تعيين مستشفى — ${assigningDoctor.doctor.full_name_ar}` : ''} footer={<><Button variant="outline" onClick={() => setAssigningDoctor(null)}>إلغاء</Button><Button onClick={() => assignHospital.mutate()} isLoading={assignHospital.isPending}>حفظ</Button></>}>
      <label><span className="mb-2 block text-xs font-black text-slate-600">المستشفى</span><select className={inputClass} value={assigningDoctor?.siteId ?? ''} onChange={(event) => setAssigningDoctor((current) => current ? { ...current, siteId: event.target.value } : null)}><option value="">بدون مستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></label>
      <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">يمكن نقل الطبيب إلى مستشفى آخر أو اختيار «بدون مستشفى» لإزالته مؤقتًا من شبكة التوزيع.</p>
    </Modal>

    <Modal isOpen={hospitalModal} onClose={() => setHospitalModal(false)} title={editingHospitalId ? 'تعديل بيانات المستشفى' : 'إضافة مستشفى'} maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); saveHospital.mutate(); }} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">رمز المستشفى</span><input required dir="ltr" className={inputClass} value={hospitalForm.site_code} onChange={(event) => setHospitalForm({ ...hospitalForm, site_code: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">اسم المستشفى بالعربية</span><input required className={inputClass} value={hospitalForm.name_ar} onChange={(event) => setHospitalForm({ ...hospitalForm, name_ar: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">الاسم بالإنجليزية</span><input className={inputClass} value={hospitalForm.name_en} onChange={(event) => setHospitalForm({ ...hospitalForm, name_en: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">نوع المنشأة</span><select className={inputClass} value={hospitalForm.site_type} onChange={(event) => setHospitalForm({ ...hospitalForm, site_type: event.target.value })}><option value="hospital_public">مستشفى حكومي</option><option value="hospital_private">مستشفى خاص</option><option value="medical_center">مركز طبي</option><option value="clinic">عيادة</option><option value="other">أخرى</option></select></label><label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold">المدينة</span><input className={inputClass} value={hospitalForm.city} onChange={(event) => setHospitalForm({ ...hospitalForm, city: event.target.value })} /></label></div><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setHospitalModal(false)}>إلغاء</Button><Button type="submit" isLoading={saveHospital.isPending}>حفظ المستشفى</Button></div></form></Modal>
  </div>;
}
