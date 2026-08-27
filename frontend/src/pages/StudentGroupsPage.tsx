import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, Download, ExternalLink, Link2, Plus, Save, Search, Settings2, Sparkles, Trash2, UserCog, UserRound, Users } from 'lucide-react';
import { apiFetch, apiUrl, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';

type RegisteredStudent = { id: number; name: string; university_number: string; registered_at?: string };
type Subgroup = { id: number; name: string; capacity: number; max_size: number; is_active: boolean; current_students_count: number; registered_students: RegisteredStudent[] };
type Group = { id: number; name: string; roster_count: number; registered_roster_count: number; recommended_subgroups_count: number; recommended_capacity_plan: number[]; current_active_capacity: number; subgroups: Subgroup[] };
type RosterStudent = { id: number; name: string; university_number: string; photo_url?: string | null; academic_registration_status: string; main_group_id: number; main_group: string; student_subgroup_id: number | null; student_subgroup: string | null };
type Cycle = { id: number; public_id: string; academic_year_id: number; academic_year?: { code: string; name?: string }; academic_level: string; status: string; default_capacity: number; rosters_count: number; registered_rosters_count: number; public_url: string; groups: Group[]; roster_students: RosterStudent[] };
type Year = { id: number; code: string; name?: string; is_current?: boolean };
type YearsResponse = Year[] | { data?: Year[] };
type PlanningMode = 'fixed_count' | 'target_capacity';

const levels = { fourth: 'السنة الرابعة — L, M, N', fifth: 'السنة الخامسة — A, B, C', sixth: 'السنة السادسة' };
const statusLabels: Record<string, string> = { draft: 'مسودة', open: 'التسجيل مفتوح', closed: 'التسجيل مغلق', archived: 'مؤرشفة' };
const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

function balancedPlan(studentsCount: number, mode: PlanningMode, value: number): number[] {
  if (!value || value < 1) return [];
  if (studentsCount <= 0 && mode !== 'fixed_count') return [];
  const groupsCount = mode === 'fixed_count' ? value : Math.ceil(studentsCount / value);
  const base = Math.floor(studentsCount / groupsCount);
  const larger = studentsCount % groupsCount;
  return [...Array(larger).fill(Math.max(1, base + 1)), ...Array(groupsCount - larger).fill(Math.max(1, base))] as number[];
}

function StudentAvatar({ student, small = false }: { student: RosterStudent; small?: boolean }) {
  const localPhoto = typeof window !== 'undefined' ? localStorage.getItem(`student_photo_${student.id}`) : null;
  const photo = student.photo_url || localPhoto;
  return <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-teal-100 bg-teal-50 font-black text-teal-700 ${small ? 'h-9 w-9 rounded-xl' : 'h-12 w-12 rounded-2xl'}`}>{photo ? <img src={photo} alt={student.name} className="h-full w-full object-cover" /> : student.name.slice(0, 1)}</div>;
}

export function StudentGroupsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [yearId, setYearId] = useState('');
  const [level, setLevel] = useState('fourth');
  const [capacity, setCapacity] = useState('');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('fixed_count');
  const [planningValue, setPlanningValue] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const [studentsOpen, setStudentsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});

  const { data: cycles = [], refetch } = useQuery({
    queryKey: ['group-registration-cycles'],
    queryFn: () => apiFetch<Cycle[]>('/group-registration-cycles'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const { data: yearsResponse, isLoading: yearsLoading, isError: yearsError } = useQuery({ queryKey: ['academic-years'], queryFn: () => apiFetch<YearsResponse>('/academic-years?per_page=100') });
  const years = useMemo(() => Array.isArray(yearsResponse) ? yearsResponse : (yearsResponse?.data ?? []), [yearsResponse]);
  const selected = useMemo(() => cycles.find(cycle => cycle.id === selectedId) || cycles[0], [cycles, selectedId]);
  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLocaleLowerCase('ar');
    if (!selected || !term) return selected?.roster_students ?? [];
    return selected.roster_students.filter(student => student.name.toLocaleLowerCase('ar').includes(term) || student.university_number.toLowerCase().includes(term) || student.main_group.toLowerCase().includes(term) || (student.student_subgroup || '').toLowerCase().includes(term));
  }, [selected, studentSearch]);

  useEffect(() => {
    if (!yearId && years.length) setYearId(String(years.find(year => year.is_current)?.id ?? years[0].id));
  }, [yearId, years]);

  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setError(''); setNotice('');
    try {
      await operation();
      await queryClient.invalidateQueries({ queryKey: ['group-registration-cycles'] });
      await refetch();
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) {
        const firstError = Object.values(caught.errors || {}).flat().find(item => typeof item === 'string');
        setError(typeof firstError === 'string' ? firstError : caught.message);
      } else setError('تعذر تنفيذ العملية.');
      return false;
    } finally { setBusy(false); }
  }

  function createCycle(event: FormEvent) {
    event.preventDefault();
    run(() => apiFetch('/group-registration-cycles', { method: 'POST', body: { academic_year_id: Number(yearId), academic_level: level, default_capacity: Number(capacity) } })).then(saved => {
      if (saved) { setCreateOpen(false); setCapacity(''); setNotice('تم إنشاء دورة التسجيل والمجموعات الرئيسية.'); }
    });
  }

  function updateCycle(status: string) {
    if (!selected) return;
    run(() => apiFetch(`/group-registration-cycles/${selected.id}`, { method: 'PUT', body: { status } })).then(saved => saved && setNotice(status === 'open' ? 'تم فتح التسجيل للطلبة.' : 'تم إغلاق التسجيل.'));
  }

  function deleteCycle() {
    if (!selected) return;
    run(() => apiFetch(`/group-registration-cycles/${selected.id}`, { method: 'DELETE' })).then(deleted => {
      if (deleted) { setDeleteOpen(false); setPortalOpen(false); setStudentsOpen(false); setSelectedId(null); setNotice('تم حذف دورة التسجيل. لم يتم حذف أي طالب من دليل الطلاب.'); }
      else setDeleteOpen(false);
    });
  }

  function addSubgroup(group: Group) {
    if (!selected) return;
    const name = prompt('اسم المجموعة الفرعية', `${group.name}${group.subgroups.length + 1}`);
    if (name) run(() => apiFetch(`/group-registration-cycles/${selected.id}/groups/${group.id}/subgroups`, { method: 'POST', body: { name, capacity: selected.default_capacity } }));
  }

  function editSubgroup(subgroup: Subgroup) {
    if (!selected) return;
    const name = prompt('اسم المجموعة الفرعية', subgroup.name);
    if (!name) return;
    const subgroupCapacity = Number(prompt('سعة المجموعة من 1 إلى 30', String(subgroup.capacity || subgroup.max_size || selected.default_capacity)));
    if (subgroupCapacity < 1 || subgroupCapacity > 30) return;
    run(() => apiFetch(`/group-registration-cycles/${selected.id}/subgroups/${subgroup.id}`, { method: 'PUT', body: { name, capacity: subgroupCapacity, is_active: subgroup.is_active } }));
  }

  function removeSubgroup(subgroup: Subgroup) {
    if (!selected || !confirm(`حذف المجموعة ${subgroup.name} نهائيًا؟ يجب أن تكون فارغة.`)) return;
    run(() => apiFetch(`/group-registration-cycles/${selected.id}/subgroups/${subgroup.id}`, { method: 'DELETE' }));
  }

  function generateSubgroups() {
    const value = Number(planningValue);
    if (!selected || selected.rosters_count === 0 || !value) return;
    const description = planningMode === 'fixed_count' ? `${value} مجموعات فرعية لكل مجموعة رئيسية` : `مجموعات بحد أعلى مستهدف ${value} طلاب`;
    if (!confirm(`سيقوم النظام بإنشاء أو استكمال ${description} وتوزيع السعات بالتوازن. هل تريد المتابعة؟`)) return;
    run(() => apiFetch(`/group-registration-cycles/${selected.id}/generate-subgroups`, { method: 'POST', body: { strategy: planningMode, subgroups_per_main_group: planningMode === 'fixed_count' ? value : null, target_capacity: planningMode === 'target_capacity' ? value : null } })).then(saved => saved && setNotice('تم تجهيز المجموعات الفرعية وتوزيع السعات بالتوازن.'));
  }

  function overrideStudent(student: RosterStudent) {
    if (!selected) return;
    const subgroupValue = assignmentDrafts[student.id] ?? String(student.student_subgroup_id ?? '');
    const reason = (reasonDrafts[student.id] ?? '').trim();
    if (reason.length < 3) { setError('يجب كتابة سبب إداري واضح قبل حفظ تعديل الطالب.'); return; }
    const subgroupId = subgroupValue ? Number(subgroupValue) : null;
    const target = selected.groups.flatMap(group => group.subgroups).find(subgroup => subgroup.id === subgroupId);
    const overCapacity = Boolean(target && target.id !== student.student_subgroup_id && target.current_students_count >= target.capacity);
    if (overCapacity && !confirm(`المجموعة ${target?.name} مكتملة. هل تريد تجاوز السعة إداريًا؟`)) return;
    run(() => apiFetch(`/group-registration-cycles/${selected.id}/students/${student.id}/assignment`, { method: 'PUT', body: { student_subgroup_id: subgroupId, reason, allow_over_capacity: overCapacity } })).then(saved => {
      if (saved) { setReasonDrafts(current => ({ ...current, [student.id]: '' })); setNotice(`تم حفظ تعديل الطالب ${student.name}.`); }
    });
  }

  async function copyLink() {
    if (!selected) return;
    await navigator.clipboard.writeText(`${location.origin}${selected.public_url}`);
    setNotice('تم نسخ رابط التسجيل.');
  }

  async function exportResults() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl(`/group-registration-cycles/${selected.id}/export`), { credentials: 'include', headers: { Accept: 'text/csv' } });
      if (!response.ok) throw new Error('export');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `group-registration-${selected.academic_year?.code ?? selected.academic_year_id}-${selected.academic_level}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch { setError('تعذر تصدير نتائج التسجيل. تأكد من الصلاحية ثم حاول مجددًا.'); }
    finally { setBusy(false); }
  }

  function openStudentsModal() { setError(''); setStudentSearch(''); setStudentsOpen(true); }

  return <div dir="rtl" className="mx-auto max-w-[1500px] space-y-4 pb-14">
    <PageHeader title="إدارة التسجيل الذاتي للمجموعات" description="خطط المجموعات الفرعية وتابع اختيار الطلبة من شاشة عمل واحدة.">
      <div className="flex flex-wrap items-center gap-2">
        {can('group_registration.manage_groups') && <Button size="sm" onClick={() => { setError(''); setCreateOpen(true); }}><Plus className="ml-1 h-4 w-4" />دورة جديدة</Button>}
        <Link to="/directory" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"><Users className="h-4 w-4 text-teal-600" />دليل الطلاب</Link>
        {selected && can('group_registration.export') && <button onClick={exportResults} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-teal-700 hover:bg-teal-50 disabled:opacity-50" title="تصدير نتائج الدورة"><Download className="h-4 w-4" /></button>}
      </div>
    </PageHeader>

    {error && !studentsOpen && !portalOpen && !createOpen && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
    {notice && <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm font-bold text-teal-800">{notice}</div>}
    {cycles.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{cycles.map(cycle => <button key={cycle.id} onClick={() => setSelectedId(cycle.id)} className={`whitespace-nowrap rounded-xl border px-4 py-2 text-xs font-bold transition ${selected?.id === cycle.id ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200'}`}>{levels[cycle.academic_level as keyof typeof levels]} · {cycle.academic_year?.code} · {statusLabels[cycle.status] ?? cycle.status}</button>)}</div>}
    {!selected && <Card className="rounded-3xl border-dashed p-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 font-black text-slate-700">لا توجد دورة تسجيل</h2><p className="mt-1 text-xs text-slate-400">أنشئ دورة جديدة ثم اربط قائمة الطلبة من دليل الطلاب.</p></Card>}

    {selected && <>
      <Card className="rounded-3xl border-slate-200 p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-black text-slate-800">{levels[selected.academic_level as keyof typeof levels]} · {selected.academic_year?.code}</h2><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-black text-teal-700">{statusLabels[selected.status] ?? selected.status}</span></div><p className="mt-1 text-xs text-slate-500">{selected.rosters_count} طالب في القائمة · {selected.registered_rosters_count} مسجل أكاديمياً</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setError(''); setPortalOpen(true); }}><Settings2 className="ml-1 h-4 w-4" />الرابط وحالة التسجيل</Button>{can('group_registration.override') && <Button size="sm" variant="outline" onClick={openStudentsModal}><UserCog className="ml-1 h-4 w-4" />التحكم بالطلبة</Button>}{can('group_registration.manage_groups') && <button onClick={() => setDeleteOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 text-red-500 hover:bg-red-50" title="حذف دورة التسجيل"><Trash2 className="h-4 w-4" /></button>}</div></div></Card>

      <Card className="rounded-3xl border-teal-100 p-4 sm:p-5"><div className="flex items-start gap-2"><Sparkles className="mt-0.5 h-5 w-5 text-teal-600" /><div><h3 className="font-black text-slate-800">التخطيط المرن للمجموعات الفرعية</h3><p className="mt-1 text-xs text-slate-500">حدد عدد المجموعات لكل حرف أو الحد الأعلى المستهدف للطلاب، وشاهد التقسيم قبل التنفيذ.</p></div></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><select value={planningMode} onChange={event => { setPlanningMode(event.target.value as PlanningMode); setPlanningValue(''); }} className={inputClass}><option value="fixed_count">تحديد عدد المجموعات لكل حرف</option><option value="target_capacity">تحديد الحد الأعلى لطلاب المجموعة</option></select><input type="number" min={1} max={30} value={planningValue} onChange={event => setPlanningValue(event.target.value)} placeholder={planningMode === 'fixed_count' ? 'مثال: 8 مجموعات لكل حرف' : 'مثال: 6 طلاب كحد أعلى'} className={inputClass} />{can('group_registration.manage_groups') && <Button onClick={generateSubgroups} disabled={busy || selected.rosters_count === 0 || !planningValue} isLoading={busy}><Sparkles className="ml-2 h-4 w-4" />تطبيق التقسيم</Button>}</div><p className="mt-2 text-[11px] text-slate-400">لن يحذف النظام المجموعات الموجودة ولن يغيّر سعة مجموعة تحتوي طلبة.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{selected.groups.map(group => { const plan = balancedPlan(group.roster_count, planningMode, Number(planningValue)); return <div key={group.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="flex items-center justify-between gap-2"><span className="font-black text-slate-800">المجموعة {group.name}</span><span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700">{group.roster_count} طالب</span></div><p className="mt-2 text-xs text-slate-600">{!planningValue ? 'حدد طريقة التقسيم والعدد' : <>النتيجة: <strong>{plan.length}</strong> مجموعات · السعات {plan.join(' + ')}</>}</p><p className="mt-1 text-[11px] text-slate-400">المسجلون: {group.registered_roster_count} · السعة الحالية: {group.current_active_capacity}</p></div>; })}</div></Card>

      <div className="grid gap-4 xl:grid-cols-3">{selected.groups.map(group => <Card key={group.id} className="overflow-hidden border-slate-200"><div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3"><div><h3 className="text-lg font-black text-slate-800">المجموعة {group.name}</h3><p className="mt-0.5 text-[11px] text-slate-500">{group.roster_count} في القائمة · {group.subgroups.reduce((total, subgroup) => total + subgroup.current_students_count, 0)} اختاروا</p></div>{can('group_registration.manage_groups') && <button onClick={() => addSubgroup(group)} className="rounded-xl bg-teal-600 p-2.5 text-white" title="إضافة مجموعة فرعية"><Plus className="h-4 w-4" /></button>}</div><div className="space-y-3 p-4">{group.subgroups.length === 0 && <p className="rounded-xl border border-dashed p-5 text-center text-xs text-slate-400">لم تُنشأ مجموعات فرعية بعد</p>}{group.subgroups.map(subgroup => { const subgroupCapacity = subgroup.capacity || subgroup.max_size; const count = subgroup.current_students_count || 0; const full = count >= subgroupCapacity; return <div key={subgroup.id} className={`rounded-2xl border p-4 ${!subgroup.is_active ? 'opacity-50' : 'border-slate-200 bg-white'}`}><div className="flex items-start justify-between gap-3"><div><button onClick={() => can('group_registration.manage_groups') && editSubgroup(subgroup)} className="text-lg font-black text-slate-800">{subgroup.name}</button><div className="mt-1 flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${full ? 'bg-slate-100 text-slate-700' : 'bg-teal-50 text-teal-700'}`}>{full ? 'مكتملة' : `${subgroupCapacity - count} مقعد متاح`}</span><span className="text-xs font-bold text-slate-500">{count}/{subgroupCapacity}</span></div></div>{can('group_registration.manage_groups') && <button onClick={() => removeSubgroup(subgroup)} className="rounded-lg p-2 text-red-500 hover:bg-red-50" title="حذف المجموعة"><Trash2 className="h-4 w-4" /></button>}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, (count / subgroupCapacity) * 100)}%` }} /></div><div className="mt-3 space-y-1.5">{subgroup.registered_students?.length ? subgroup.registered_students.map(student => <div key={student.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700"><UserRound className="h-3.5 w-3.5" /></div><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{student.name}</p><p className="font-mono text-[10px] text-slate-500">{student.university_number}</p></div></div>) : <p className="rounded-xl border border-dashed p-3 text-center text-xs text-slate-400">لم يسجل أي طالب بعد</p>}</div></div>; })}</div></Card>)}</div>
    </>}

    <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء دورة تسجيل جديدة" maxWidth="lg"><form onSubmit={createCycle} className="space-y-4">{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}<label className="block"><span className="mb-1.5 block text-xs font-black text-slate-600">العام الأكاديمي</span><select required disabled={yearsLoading || years.length === 0} value={yearId} onChange={event => setYearId(event.target.value)} className={inputClass}><option value="">{yearsLoading ? 'جاري تحميل الأعوام...' : 'اختر العام الأكاديمي'}</option>{years.map(year => <option key={year.id} value={year.id}>{year.name || year.code}{year.is_current ? ' — الحالي' : ''}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-black text-slate-600">الدفعة</span><select value={level} onChange={event => setLevel(event.target.value)} className={inputClass}>{Object.entries(levels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="block"><span className="mb-1.5 block text-xs font-black text-slate-600">السعة عند الإضافة اليدوية</span><input required type="number" min={1} max={30} value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="أدخل السعة التي تريدها" className={inputClass} /></label>{yearsError && <p className="text-xs font-bold text-red-700">تعذر تحميل السنوات الأكاديمية.</p>}<div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>إلغاء</Button><Button type="submit" disabled={!yearId || !capacity || yearsError || years.length === 0} isLoading={busy}>إنشاء الدورة</Button></div></form></Modal>

    <Modal isOpen={portalOpen} onClose={() => setPortalOpen(false)} title="رابط التسجيل وحالة البوابة" maxWidth="lg">{selected && <div className="space-y-4">{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}<div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs text-slate-500">الحالة الحالية</p><p className="mt-1 font-black text-slate-800">{statusLabels[selected.status] ?? selected.status}</p></div><span className={`h-3 w-3 rounded-full ${selected.status === 'open' ? 'bg-teal-500' : 'bg-slate-300'}`} /></div><div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2 text-xs font-black text-slate-700"><Link2 className="h-4 w-4 text-teal-600" />رابط الطلبة</div><div dir="ltr" className="mt-3 overflow-hidden rounded-xl bg-slate-50 p-3 text-left font-mono text-xs text-slate-600"><span className="block truncate">{location.origin}{selected.public_url}</span></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={copyLink}><Copy className="ml-1 h-4 w-4" />نسخ الرابط</Button><Button size="sm" variant="outline" onClick={() => window.open(selected.public_url, '_blank', 'noopener,noreferrer')}><ExternalLink className="ml-1 h-4 w-4" />فتح الرابط</Button></div></div>{can('group_registration.open_close') && selected.status !== 'archived' && <div className="flex justify-end border-t border-slate-100 pt-4"><Button variant={selected.status === 'open' ? 'danger' : 'primary'} onClick={() => updateCycle(selected.status === 'open' ? 'closed' : 'open')} isLoading={busy}>{selected.status === 'open' ? 'إغلاق التسجيل' : 'فتح التسجيل'}</Button></div>}</div>}</Modal>

    <Modal isOpen={studentsOpen} onClose={() => setStudentsOpen(false)} title="التحكم الإداري بتسجيل الطلبة" maxWidth="2xl">{selected && <div className="space-y-4">{error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}<div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="ابحث بالاسم أو الرقم الجامعي أو المجموعة..." className={`${inputClass} pr-10`} /></div><div className="flex items-center justify-between text-xs text-slate-500"><span>النتائج: {filteredStudents.length}</span><span>اكتب سبباً قبل النقل أو الإخراج</span></div>
      <div className="space-y-3 md:hidden">{filteredStudents.map((student, index) => { const group = selected.groups.find(item => item.id === student.main_group_id); const value = assignmentDrafts[student.id] ?? String(student.student_subgroup_id ?? ''); return <article key={student.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-600">{index + 1}</span><StudentAvatar student={student} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-slate-800">{student.name}</h3><p className="mt-1 font-mono text-[11px] text-slate-500">{student.university_number}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">{student.main_group}</span><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{student.academic_registration_status === 'registered' ? 'مسجل' : 'غير مسجل'}</span></div></div></div><div className="mt-4 grid gap-2"><select value={value} onChange={event => setAssignmentDrafts(current => ({ ...current, [student.id]: event.target.value }))} className={inputClass}><option value="">بدون مجموعة</option>{group?.subgroups.filter(subgroup => subgroup.is_active).map(subgroup => <option key={subgroup.id} value={subgroup.id}>{subgroup.name} — {subgroup.current_students_count}/{subgroup.capacity}</option>)}</select><input value={reasonDrafts[student.id] ?? ''} onChange={event => setReasonDrafts(current => ({ ...current, [student.id]: event.target.value }))} className={inputClass} placeholder="سبب النقل أو الإخراج..." /><Button size="sm" onClick={() => overrideStudent(student)} disabled={busy || value === String(student.student_subgroup_id ?? '')}><Save className="ml-1 h-4 w-4" />حفظ</Button></div></article>; })}</div>
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block"><table className="w-full min-w-[920px] text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3 text-center">#</th><th className="p-3">الطالب</th><th className="p-3">الحالة</th><th className="p-3">الرئيسية</th><th className="p-3">المجموعة الفرعية</th><th className="p-3">سبب التعديل</th><th className="p-3">الإجراء</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredStudents.map((student, index) => { const group = selected.groups.find(item => item.id === student.main_group_id); const value = assignmentDrafts[student.id] ?? String(student.student_subgroup_id ?? ''); return <tr key={student.id}><td className="p-3 text-center font-black text-slate-400">{index + 1}</td><td className="p-3"><div className="flex items-center gap-2"><StudentAvatar student={student} small /><div><p className="font-bold text-slate-800">{student.name}</p><p className="font-mono text-[10px] text-slate-500">{student.university_number}</p></div></div></td><td className="p-3"><span className={`rounded-full px-2 py-1 font-bold ${student.academic_registration_status === 'registered' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{student.academic_registration_status === 'registered' ? 'مسجل' : 'غير مسجل'}</span></td><td className="p-3 font-black">{student.main_group}</td><td className="p-3"><select value={value} onChange={event => setAssignmentDrafts(current => ({ ...current, [student.id]: event.target.value }))} className="h-10 min-w-36 rounded-xl border border-slate-200 bg-white px-3"><option value="">بدون مجموعة</option>{group?.subgroups.filter(subgroup => subgroup.is_active).map(subgroup => <option key={subgroup.id} value={subgroup.id}>{subgroup.name} — {subgroup.current_students_count}/{subgroup.capacity}</option>)}</select></td><td className="p-3"><input value={reasonDrafts[student.id] ?? ''} onChange={event => setReasonDrafts(current => ({ ...current, [student.id]: event.target.value }))} className="h-10 min-w-52 rounded-xl border border-slate-200 px-3" placeholder="سبب النقل أو الإخراج..." /></td><td className="p-3"><Button size="sm" onClick={() => overrideStudent(student)} disabled={busy || value === String(student.student_subgroup_id ?? '')}><Save className="ml-1 h-4 w-4" />حفظ</Button></td></tr>; })}</tbody></table></div>
      {filteredStudents.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-400">لا يوجد طلاب مطابقون للبحث.</p>}</div>}</Modal>

    <ConfirmDialog isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={deleteCycle} title="حذف دورة التسجيل" message={selected ? `سيتم حذف دورة ${levels[selected.academic_level as keyof typeof levels]} وقائمة ربطها. لن يُحذف الطلاب من دليل الطلاب أو هيكل المجموعات، ولا يمكن الحذف إذا بدأ الطلاب باختيار مجموعاتهم.` : ''} confirmLabel="حذف الدورة" isDanger isConfirming={busy} />
  </div>;
}
