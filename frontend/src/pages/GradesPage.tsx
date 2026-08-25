import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ExcelJS from 'exceljs';
import { CheckCircle2, Download, FileCheck2, GraduationCap, RotateCcw, Save, Search, Send } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

type Level = 'fourth' | 'fifth' | 'sixth';
type Course = { id: number; code: string; name_ar: string; name_en?: string; academic_level: Level; is_active?: boolean };
type AcademicYear = { id: number; code: string; name?: string; is_current?: boolean };
type GradeOptions = { academic_years: AcademicYear[]; courses: Course[]; assigned_levels: string[] | null };
type GradeEntry = {
  id: number; clinical_score: number | string | null; osce_score: number | string | null;
  written_score: number | string | null; score: number | string | null; status: 'draft'|'submitted'|'approved'|'returned';
  notes?: string | null; return_reason?: string | null;
};
type RosterRow = {
  student: { id: number; university_number: string; full_name_ar: string; full_name_en?: string; academic_level: string };
  enrollment_id?: number | null; grade_entry?: GradeEntry | null; official_clinical_score?: number | null;
};
type Draft = { osce: string; written: string; notes: string };

const levels: { key: Level; ar: string; en: string }[] = [
  { key: 'fourth', ar: 'السنة الرابعة', en: 'Fourth year' },
  { key: 'fifth', ar: 'السنة الخامسة', en: 'Fifth year' },
  { key: 'sixth', ar: 'السنة السادسة', en: 'Sixth year' },
];
const statusLabel = (status: GradeEntry['status'] | undefined, ar: boolean) => ({
  draft: ar ? 'مسودة' : 'Draft', submitted: ar ? 'بانتظار الاعتماد' : 'Pending approval',
  approved: ar ? 'معتمد' : 'Approved', returned: ar ? 'معاد للتعديل' : 'Returned',
}[status ?? 'draft']);
const errorText = (error: unknown, fallback: string) => error instanceof ApiError ? error.message : fallback;

export function GradesPage() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const assigned = user?.roles.includes('RTA') ? (user.assigned_levels ?? []) : null;
  const visibleLevels = levels.filter(item => !assigned || assigned.includes(item.key));
  const [level, setLevel] = useState<Level>(visibleLevels[0]?.key ?? 'fourth');
  const [yearId, setYearId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [returnReason, setReturnReason] = useState('');

  const optionsQuery = useQuery({ queryKey: ['grade-options'], queryFn: () => apiFetch<GradeOptions>('/grade-entries/options') });
  const years = optionsQuery.data?.academic_years ?? [];
  const courses = (optionsQuery.data?.courses ?? []).filter(course => course.academic_level === level && course.is_active !== false);
  useEffect(() => { if (!yearId && years.length) setYearId(String(years.find(year => year.is_current)?.id ?? years[0].id)); }, [years, yearId]);
  useEffect(() => { if (!courses.some(course => String(course.id) === courseId)) setCourseId(courses[0] ? String(courses[0].id) : ''); }, [courses, courseId]);

  const rosterQuery = useQuery({
    queryKey: ['grade-roster', yearId, courseId],
    queryFn: () => apiFetch<RosterRow[]>(`/grade-entries/roster?academic_year_id=${yearId}&course_id=${courseId}`),
    enabled: Boolean(yearId && courseId),
  });
  const roster = rosterQuery.data ?? [];
  useEffect(() => {
    const next: Record<number, Draft> = {};
    roster.forEach(row => { next[row.student.id] = { osce: row.grade_entry?.osce_score == null ? '' : String(row.grade_entry.osce_score), written: row.grade_entry?.written_score == null ? '' : String(row.grade_entry.written_score), notes: row.grade_entry?.notes ?? '' }; });
    setDrafts(next);
  }, [rosterQuery.data]);

  const selectedCourse = courses.find(course => String(course.id) === courseId);
  const selectedYear = years.find(year => String(year.id) === yearId);
  const sheetStatus = useMemo(() => {
    const statuses = roster.map(row => row.grade_entry?.status).filter(Boolean) as GradeEntry['status'][];
    if (!statuses.length) return 'draft';
    if (statuses.includes('submitted')) return 'submitted';
    if (statuses.includes('returned')) return 'returned';
    return statuses.every(status => status === 'approved') ? 'approved' : 'draft';
  }, [roster]);
  const editable = can('grades.create') && !['submitted', 'approved'].includes(sheetStatus);
  const filtered = roster.filter(row => `${row.student.university_number} ${row.student.full_name_ar} ${row.student.full_name_en ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const sheetKey = { course_code: selectedCourse?.code, academic_year_id: Number(yearId) };

  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => apiFetch(path, { method: 'POST', body }),
    onSuccess: async () => { setNotice({ ok: true, text: ar ? 'تمت العملية بنجاح.' : 'Operation completed successfully.' }); await queryClient.invalidateQueries({ queryKey: ['grade-roster', yearId, courseId] }); },
    onError: error => setNotice({ ok: false, text: errorText(error, ar ? 'تعذر إتمام العملية.' : 'Operation failed.') }),
  });
  const save = () => {
    if (!selectedCourse) return;
    const invalid = roster.some(row => { const item = drafts[row.student.id]; return item && ((item.osce !== '' && (+item.osce < 0 || +item.osce > 40)) || (item.written !== '' && (+item.written < 0 || +item.written > 40))); });
    if (invalid) { setNotice({ ok: false, text: ar ? 'علامة OSCE أو النظري يجب أن تكون بين 0 و40.' : 'OSCE and written scores must be between 0 and 40.' }); return; }
    mutation.mutate({ path: '/grade-entries/batch', body: { ...sheetKey, grades: roster.map(row => ({ student_id: row.student.id, max_score: 100, osce_score: drafts[row.student.id]?.osce === '' ? null : Number(drafts[row.student.id]?.osce), written_score: drafts[row.student.id]?.written === '' ? null : Number(drafts[row.student.id]?.written), notes: drafts[row.student.id]?.notes || null })) } });
  };
  const totalFor = (row: RosterRow) => {
    const item = drafts[row.student.id];
    if (row.official_clinical_score == null || !item || item.osce === '' || item.written === '') return '—';
    return (Number(row.official_clinical_score) + Number(item.osce) + Number(item.written)).toFixed(2);
  };

  const exportExcel = async () => {
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'Hebron University - Clinical Department';
    const sheet = workbook.addWorksheet(ar ? 'كشف العلامات' : 'Grade Sheet', { views: [{ rightToLeft: ar }] });
    sheet.mergeCells('A1:H1'); sheet.getCell('A1').value = ar ? 'جامعة الخليل' : 'Hebron University';
    sheet.mergeCells('A2:H2'); sheet.getCell('A2').value = ar ? 'كلية الطب والعلوم الصحية — الدائرة السريرية' : 'Faculty of Medicine & Health Sciences — Clinical Department';
    sheet.mergeCells('A3:H3'); sheet.getCell('A3').value = `${selectedCourse?.code ?? ''} — ${ar ? selectedCourse?.name_ar : selectedCourse?.name_en || selectedCourse?.name_ar} | ${selectedYear?.code ?? ''}`;
    ['A1','A2','A3'].forEach((cell, i) => { sheet.getCell(cell).alignment = { horizontal: 'center' }; sheet.getCell(cell).font = { bold: true, size: i ? 12 : 16, color: { argb: 'FF167D7A' } }; });
    const header = sheet.addRow([ar?'الرقم الجامعي':'University ID', ar?'اسم الطالب':'Student name', ar?'السريري /20':'Clinical /20', 'OSCE /40', ar?'النظري /40':'Written /40', ar?'المجموع /100':'Total /100', ar?'الحالة':'Status', ar?'ملاحظات':'Notes']);
    header.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A9D99' } }; cell.alignment = { horizontal: 'center' }; });
    roster.forEach(row => sheet.addRow([row.student.university_number, ar ? row.student.full_name_ar : row.student.full_name_en || row.student.full_name_ar, row.official_clinical_score ?? '', drafts[row.student.id]?.osce ?? '', drafts[row.student.id]?.written ?? '', totalFor(row), statusLabel(row.grade_entry?.status, ar), drafts[row.student.id]?.notes ?? '']));
    sheet.columns = [{ width: 17 }, { width: 34 }, { width: 15 }, { width: 13 }, { width: 14 }, { width: 16 }, { width: 20 }, { width: 30 }];
    const buffer = await workbook.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([buffer]));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `grades-${selectedCourse?.code ?? 'course'}-${selectedYear?.code ?? 'year'}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (assigned && visibleLevels.length === 0) return <EmptyAssignment ar={ar} />;
  if (optionsQuery.isLoading) return <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{ar ? 'جاري تحميل الأعوام والمساقات المخصصة لك...' : 'Loading your assigned years and courses...'}</div>;
  if (optionsQuery.isError) return <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700"><p>{errorText(optionsQuery.error, ar ? 'تعذر تحميل خيارات العلامات.' : 'Unable to load grade options.')}</p><button onClick={() => optionsQuery.refetch()} className="mt-3 rounded-xl border border-red-200 bg-white px-4 py-2">{ar ? 'إعادة المحاولة' : 'Retry'}</button></div>;
  return <div className="space-y-5 pb-20">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-black text-slate-900">{ar ? 'إدارة العلامات السريرية' : 'Clinical Grade Management'}</h1><p className="mt-1 text-sm text-slate-500">{ar ? 'كشف رسمي موحد: التقييم السريري المعتمد + OSCE + الامتحان النظري.' : 'One official sheet: approved clinical assessment + OSCE + written exam.'}</p></div><button onClick={exportExcel} disabled={!roster.length} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-bold text-teal-800 disabled:opacity-40"><Download className="h-4 w-4" />{ar ? 'تصدير Excel' : 'Export Excel'}</button></header>
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-3">
      <Selector label={ar?'العام الأكاديمي':'Academic year'} value={yearId} onChange={setYearId}>{years.map(year=><option key={year.id} value={year.id}>{year.code}{year.is_current?` — ${ar?'الحالي':'Current'}`:''}</option>)}</Selector>
      <Selector label={ar?'الدفعة':'Cohort'} value={level} onChange={value=>setLevel(value as Level)}>{visibleLevels.map(item=><option key={item.key} value={item.key}>{ar?item.ar:item.en}</option>)}</Selector>
      <Selector label={ar?'المساق':'Course'} value={courseId} onChange={setCourseId}><option value="">{ar?'اختر المساق':'Select course'}</option>{courses.map(course=><option key={course.id} value={course.id}>{course.code} — {ar?course.name_ar:course.name_en||course.name_ar}</option>)}</Selector>
    </div></section>
    {notice && <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${notice.ok?'border-teal-200 bg-teal-50 text-teal-800':'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div>}
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-2xl bg-teal-50 p-2.5 text-teal-700"><GraduationCap className="h-5 w-5" /></div><div><p className="font-black text-slate-900">{selectedCourse ? `${selectedCourse.code} — ${ar?selectedCourse.name_ar:selectedCourse.name_en||selectedCourse.name_ar}` : (ar?'اختر المساق':'Select a course')}</p><p className="text-xs text-slate-500">{roster.length} {ar?'طالبًا':'students'} · {statusLabel(sheetStatus, ar)}</p></div></div><div className="relative sm:w-72"><Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?'بحث بالاسم أو الرقم...':'Search name or ID...'} className="w-full rounded-2xl border border-slate-200 py-2 ps-9 pe-3 text-sm"/></div></div>
      <GradeTable ar={ar} rows={filtered} drafts={drafts} setDrafts={setDrafts} totalFor={totalFor} editable={editable} loading={rosterQuery.isLoading} error={rosterQuery.error}/>
      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/60 p-4 lg:flex-row lg:items-center lg:justify-between"><p className="text-xs text-slate-500">{ar?'العلامة السريرية تُحتسب تلقائيًا فقط من تقييمات المشرفين المعتمدة ولا يمكن تعديلها هنا.':'Clinical marks are calculated only from approved supervisor assessments and cannot be edited here.'}</p><div className="flex flex-wrap gap-2">
        {editable&&<><Action onClick={save} disabled={mutation.isPending||!roster.length} icon={<Save className="h-4 w-4"/>}>{ar?'حفظ المسودة':'Save draft'}</Action><Action primary onClick={()=>mutation.mutate({path:'/grade-entries/batch-submit',body:sheetKey})} disabled={mutation.isPending||!roster.length} icon={<Send className="h-4 w-4"/>}>{ar?'إرسال الكشف للاعتماد':'Submit sheet'}</Action></>}
        {can('grades.approve')&&sheetStatus==='submitted'&&<><Action primary onClick={()=>mutation.mutate({path:'/grade-entries/batch-approve',body:sheetKey})} disabled={mutation.isPending} icon={<FileCheck2 className="h-4 w-4"/>}>{ar?'اعتماد الكشف':'Approve sheet'}</Action><input value={returnReason} onChange={e=>setReturnReason(e.target.value)} placeholder={ar?'سبب الإعادة...':'Return reason...'} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs"/><Action onClick={()=>returnReason.trim().length<3?setNotice({ok:false,text:ar?'اكتب سبب الإعادة بوضوح.':'Enter a clear return reason.'}):mutation.mutate({path:'/grade-entries/batch-return',body:{...sheetKey,reason:returnReason.trim()}})} icon={<RotateCcw className="h-4 w-4"/>}>{ar?'إعادة للتعديل':'Return'}</Action></>}
      </div></div>
    </section>
  </div>;
}

function Selector({label,value,onChange,children}:{label:string;value:string;onChange:(value:string)=>void;children:React.ReactNode}) { return <label className="text-xs font-bold text-slate-600">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">{children}</select></label>; }
function Action({children,icon,onClick,disabled,primary=false}:{children:React.ReactNode;icon:React.ReactNode;onClick:()=>void;disabled?:boolean;primary?:boolean}) { return <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-black disabled:opacity-40 ${primary?'bg-teal-600 text-white':'border border-teal-200 bg-white text-teal-800'}`}>{icon}{children}</button>; }
function ScoreInput({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(value:string)=>void}) { return <input type="number" min="0" max="40" step="0.25" value={value} disabled={disabled} onChange={event=>onChange(event.target.value)} className="mx-auto block w-24 rounded-xl border border-slate-200 px-2 py-2 text-center font-bold disabled:bg-slate-50 disabled:text-slate-500"/>; }

function GradeTable({ar,rows,drafts,setDrafts,totalFor,editable,loading,error}:{ar:boolean;rows:RosterRow[];drafts:Record<number,Draft>;setDrafts:React.Dispatch<React.SetStateAction<Record<number,Draft>>>;totalFor:(row:RosterRow)=>string;editable:boolean;loading:boolean;error:unknown}) {
  if (loading) return <div className="p-16 text-center text-sm text-slate-400">{ar?'جاري تحميل الكشف...':'Loading grade sheet...'}</div>;
  if (error) return <div className="p-12 text-center text-sm font-bold text-red-600">{errorText(error,ar?'تعذر تحميل الكشف.':'Could not load sheet.')}</div>;
  if (!rows.length) return <div className="p-16 text-center text-sm text-slate-500">{ar?'لا يوجد طلبة ضمن الاختيار الحالي.':'No students match the current selection.'}</div>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3 text-start">{ar?'الطالب':'Student'}</th><th className="p-3">{ar?'السريري /20':'Clinical /20'}</th><th className="p-3">OSCE /40</th><th className="p-3">{ar?'النظري /40':'Written /40'}</th><th className="p-3">{ar?'المجموع':'Total'}</th><th className="p-3">{ar?'الحالة':'Status'}</th><th className="p-3 text-start">{ar?'ملاحظات':'Notes'}</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row=>{ const draft=drafts[row.student.id]??{osce:'',written:'',notes:''}; return <tr key={row.student.id} className="hover:bg-slate-50/60"><td className="p-3"><p className="font-bold text-slate-900">{ar?row.student.full_name_ar:row.student.full_name_en||row.student.full_name_ar}</p><p className="text-xs text-slate-400">{row.student.university_number}</p></td><td className="p-3 text-center"><span className={`inline-flex min-w-16 justify-center rounded-xl px-2 py-1.5 font-black ${row.official_clinical_score==null?'bg-slate-100 text-slate-400':'bg-teal-50 text-teal-800'}`}>{row.official_clinical_score??'—'}</span></td><td className="p-3"><ScoreInput value={draft.osce} disabled={!editable} onChange={value=>setDrafts(prev=>({...prev,[row.student.id]:{...draft,osce:value}}))}/></td><td className="p-3"><ScoreInput value={draft.written} disabled={!editable} onChange={value=>setDrafts(prev=>({...prev,[row.student.id]:{...draft,written:value}}))}/></td><td className="p-3 text-center font-black">{totalFor(row)}</td><td className="p-3 text-center"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-800">{statusLabel(row.grade_entry?.status,ar)}</span>{row.grade_entry?.return_reason&&<p className="mt-1 text-[10px] text-red-600">{row.grade_entry.return_reason}</p>}</td><td className="p-3"><input disabled={!editable} value={draft.notes} onChange={e=>setDrafts(prev=>({...prev,[row.student.id]:{...draft,notes:e.target.value}}))} className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs disabled:bg-slate-50"/></td></tr>; })}</tbody></table></div>;
}
function EmptyAssignment({ar}:{ar:boolean}) { return <div className="rounded-3xl border border-slate-200 bg-white p-16 text-center shadow-sm"><CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-teal-300"/><h1 className="font-black text-slate-900">{ar?'لم تُسند لك دفعة بعد':'No cohort assigned'}</h1><p className="mt-2 text-sm text-slate-500">{ar?'يجب أن يحدد مدير النظام الدفعة المسؤولة عنها من شاشة التكليف.':'An administrator must assign your responsible cohort first.'}</p></div>; }
