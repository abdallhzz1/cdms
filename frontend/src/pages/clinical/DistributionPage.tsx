import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Grid3X3, Plus, Send, Stethoscope, Trash2, UserRound, Users } from 'lucide-react';
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
type Doctor = { id: number; full_name_ar: string; full_name_en?: string | null; email?: string; specialty?: string };
type Hospital = { id: number; site_code: string; name_ar: string; name_en?: string | null; supervisors: Doctor[] };
type Block = { id: number; block_code: string; from_week: number; to_week: number };
type Subgroup = { id: number; name: string; capacity: number; students_count: number; group?: { id: number; name: string } };
type Cell = { rotation_block_id: number; supervisor_id: number; training_site_id: number; subgroup_id: number; subgroup_name: string; main_group_name?: string };
type Version = { id: number; status: string; updated_at: string };
type Rotation = { id: number; name: string; start_date?: string | null; duration_weeks: number };
type Options = { academic_years: Year[]; courses: Course[]; hospitals: Hospital[] };
type Schedule = { rotation: Rotation | null; version: Version | null; blocks: Block[]; subgroups: Subgroup[]; hospitals: Hospital[]; cells: Cell[] };

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
  const [editingCell, setEditingCell] = useState<{ doctor: Doctor; hospital: Hospital; block: Block; subgroupId: string } | null>(null);
  const [doctorModal, setDoctorModal] = useState(false);
  const [hospitalsExpanded, setHospitalsExpanded] = useState(true);
  const [doctorForm, setDoctorForm] = useState({ full_name_ar: '', full_name_en: '', email: '', password: '', primary_site_id: '', specialty: '' });

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
  const doctorsCount = hospitals.reduce((total, hospital) => total + hospital.supervisors.length, 0);
  const cellMap = useMemo(() => new Map((schedule?.cells ?? []).map((cell) => [`${cell.supervisor_id}|${cell.rotation_block_id}`, cell])), [schedule?.cells]);
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['course-distribution-schedule'] }), queryClient.invalidateQueries({ queryKey: ['course-distribution-options'] })]); };

  const createSchedule = useMutation({
    mutationFn: () => apiFetch('/course-distribution/schedules', { method: 'POST', body: { academic_year_id: Number(yearId), academic_level: level, course_id: Number(courseId), start_date: startDate, weeks_count: weeksCount } }),
    onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم إنشاء شبكة أسابيع المساق. ابدأ بتوزيع المجموعات على الأطباء.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر إنشاء جدول المساق.') }),
  });
  const saveCell = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/cell`, { method: 'PUT', body: { rotation_block_id: editingCell!.block.id, supervisor_id: editingCell!.doctor.id, subgroup_id: Number(editingCell!.subgroupId) } }),
    onSuccess: async () => { setEditingCell(null); await refresh(); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر حفظ الخلية.') }),
  });
  const clearCell = useMutation({
    mutationFn: () => apiFetch(`/course-distribution/versions/${schedule!.version!.id}/cell`, { method: 'DELETE', body: { rotation_block_id: editingCell!.block.id, supervisor_id: editingCell!.doctor.id } }),
    onSuccess: async () => { setEditingCell(null); await refresh(); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر تفريغ الخلية.') }),
  });
  const addDoctor = useMutation({
    mutationFn: () => apiFetch('/course-distribution/doctors', { method: 'POST', body: { ...doctorForm, primary_site_id: Number(doctorForm.primary_site_id) } }),
    onSuccess: async () => { setDoctorModal(false); setDoctorForm({ full_name_ar: '', full_name_en: '', email: '', password: '', primary_site_id: '', specialty: '' }); await refresh(); setNotice({ type: 'success', text: 'تمت إضافة الطبيب وإنشاء حساب مشرف سريري له.' }); },
    onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر إضافة الطبيب.') }),
  });
  const approve = useMutation({ mutationFn: () => approveVersion(schedule!.version!.id), onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم اعتماد الجدول.' }); }, onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر اعتماد الجدول.') }) });
  const publish = useMutation({ mutationFn: () => publishVersion(schedule!.version!.id, { last_updated_at: schedule!.version!.updated_at }), onSuccess: async () => { await refresh(); setNotice({ type: 'success', text: 'تم نشر الجدول للطلبة والمشرفين.' }); }, onError: (error) => setNotice({ type: 'error', text: message(error, 'تعذر نشر الجدول.') }) });

  const openCell = (doctor: Doctor, hospital: Hospital, block: Block) => {
    if (!can('distribution.update') || schedule?.version?.status === 'published') return;
    const current = cellMap.get(`${doctor.id}|${block.id}`);
    setEditingCell({ doctor, hospital, block, subgroupId: current ? String(current.subgroup_id) : '' });
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
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><div className="flex items-center gap-2"><Grid3X3 className="h-5 w-5 text-teal-700" /><h2 className="font-black text-slate-900">{schedule.rotation.name}</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{schedule.version.status}</span></div><p className="mt-1 text-xs text-slate-500">{schedule.blocks.length} أسبوع · {doctorsCount} طبيب · {schedule.subgroups.length} مجموعة فرعية</p></div><div className="flex gap-2">{can('distribution.approve') && schedule.version.status !== 'published' && <Button variant="outline" onClick={() => approve.mutate()} isLoading={approve.isPending}><CheckCircle2 className="ml-1 h-4 w-4" />اعتماد</Button>}{can('distribution.publish') && schedule.version.status !== 'published' && <Button onClick={() => publish.mutate()} isLoading={publish.isPending}><Send className="ml-1 h-4 w-4" />نشر</Button>}</div></section>
      {schedule.subgroups.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">لا توجد مجموعات فرعية للدفعة والعام المحددين. أنشئ المجموعات وسجّل الطلبة أولًا من شاشة مجموعات الطلبة.</div>}
      {doctorsCount === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">لا يوجد أطباء مرتبطون بمستشفيات. أضف طبيبًا من قسم المستشفيات والأطباء أدناه.</div>}
      <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-max border-collapse text-xs"><thead><tr className="bg-slate-100"><th className="sticky right-0 z-20 min-w-52 border border-slate-300 bg-slate-100 p-3 text-right">المستشفى / الطبيب</th>{schedule.blocks.map((block) => <th key={block.id} className="min-w-24 border border-slate-300 p-2 text-center"><div className="font-black">الأسبوع {block.from_week}</div><div className="mt-1 text-[10px] font-normal text-slate-500">{weekDate(schedule.rotation?.start_date, block.from_week)}</div></th>)}</tr></thead><tbody>{hospitals.flatMap((hospital) => hospital.supervisors.map((doctor, index) => <tr key={doctor.id} className="hover:bg-slate-50"><th className="sticky right-0 z-10 border border-slate-300 bg-white p-2.5 text-right"><div className="font-black text-slate-800">{doctor.full_name_ar}</div><div className="mt-0.5 text-[10px] font-normal text-slate-500">{index === 0 ? hospital.name_ar : doctor.specialty || hospital.name_ar}</div></th>{schedule.blocks.map((block) => { const cell = cellMap.get(`${doctor.id}|${block.id}`); return <td key={block.id} className={`border border-slate-300 p-1 text-center ${cell ? 'bg-rose-100' : 'bg-white'}`}><button type="button" onClick={() => openCell(doctor, hospital, block)} className="min-h-10 w-full rounded-lg px-2 font-black text-slate-800 hover:bg-teal-50 disabled:cursor-default" disabled={!can('distribution.update') || schedule.version?.status === 'published'}>{cell ? cell.subgroup_name : <span className="text-slate-300">—</span>}</button></td>; })}</tr>))}</tbody></table></div></section>
    </>}

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setHospitalsExpanded(!hospitalsExpanded)} className="flex w-full items-center justify-between p-4 text-right"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-700" /><div><h2 className="font-black text-slate-900">المستشفيات والأطباء</h2><p className="mt-0.5 text-[11px] text-slate-500">الطبيب يظهر تلقائيًا في شبكة التوزيع تحت مستشفاه.</p></div></div>{hospitalsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{hospitalsExpanded && <div className="border-t border-slate-100 p-4"><div className="mb-4 flex justify-end">{can('people.manage') && <Button onClick={() => setDoctorModal(true)}><Plus className="ml-1 h-4 w-4" />إضافة طبيب وحساب مشرف</Button>}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{hospitals.map((hospital) => <article key={hospital.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-teal-700" /><h3 className="font-black text-slate-900">{hospital.name_ar}</h3></div><div className="mt-3 space-y-2">{hospital.supervisors.length ? hospital.supervisors.map((doctor) => <div key={doctor.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5"><UserRound className="h-4 w-4 text-slate-500" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{doctor.full_name_ar}</p><p className="truncate text-[10px] text-slate-500">{doctor.email || doctor.specialty}</p></div></div>) : <p className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-400">لا يوجد أطباء</p>}</div></article>)}</div></div>}</section>

    <Modal isOpen={Boolean(editingCell)} onClose={() => setEditingCell(null)} title={editingCell ? `${editingCell.doctor.full_name_ar} — الأسبوع ${editingCell.block.from_week}` : ''} footer={editingCell && <><Button variant="outline" onClick={() => setEditingCell(null)}>إلغاء</Button>{cellMap.has(`${editingCell.doctor.id}|${editingCell.block.id}`) && <Button variant="danger" onClick={() => clearCell.mutate()} isLoading={clearCell.isPending}><Trash2 className="ml-1 h-4 w-4" />تفريغ الخلية</Button>}<Button onClick={() => saveCell.mutate()} isLoading={saveCell.isPending} disabled={!editingCell.subgroupId}>حفظ المجموعة</Button></>}><label><span className="mb-2 block text-xs font-black text-slate-600">مجموعة الطلبة</span><select className={inputClass} value={editingCell?.subgroupId ?? ''} onChange={(event) => setEditingCell((current) => current ? { ...current, subgroupId: event.target.value } : null)}><option value="">اختر المجموعة</option>{schedule?.subgroups.map((subgroup) => <option key={subgroup.id} value={subgroup.id}>{subgroup.name} — {subgroup.students_count} طالب</option>)}</select></label><p className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600"><Stethoscope className="ml-1 inline h-3.5 w-3.5" />المستشفى: {editingCell?.hospital.name_ar}</p></Modal>

    <Modal isOpen={doctorModal} onClose={() => setDoctorModal(false)} title="إضافة طبيب وإنشاء حساب مشرف سريري" maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); addDoctor.mutate(); }} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">اسم الطبيب بالعربية</span><input required className={inputClass} value={doctorForm.full_name_ar} onChange={(event) => setDoctorForm({ ...doctorForm, full_name_ar: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">الاسم بالإنجليزية</span><input className={inputClass} value={doctorForm.full_name_en} onChange={(event) => setDoctorForm({ ...doctorForm, full_name_en: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">المستشفى</span><select required className={inputClass} value={doctorForm.primary_site_id} onChange={(event) => setDoctorForm({ ...doctorForm, primary_site_id: event.target.value })}><option value="">اختر المستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">التخصص</span><input className={inputClass} value={doctorForm.specialty} onChange={(event) => setDoctorForm({ ...doctorForm, specialty: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">البريد الإلكتروني</span><input required type="email" dir="ltr" className={inputClass} value={doctorForm.email} onChange={(event) => setDoctorForm({ ...doctorForm, email: event.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">كلمة المرور المؤقتة</span><input required type="password" dir="ltr" minLength={12} className={inputClass} value={doctorForm.password} onChange={(event) => setDoctorForm({ ...doctorForm, password: event.target.value })} placeholder="12+ حرف كبير وصغير ورقم ورمز" /></label></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">سيُنشئ النظام حسابًا فعالًا بدور «مشرف سريري» ويربطه بالطبيب والمستشفى المحدد.</div><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setDoctorModal(false)}>إلغاء</Button><Button type="submit" isLoading={addDoctor.isPending}>إضافة الطبيب والحساب</Button></div></form></Modal>
  </div>;
}
