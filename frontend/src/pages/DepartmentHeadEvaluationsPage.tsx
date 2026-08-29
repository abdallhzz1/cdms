import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileDown, History, Plus, Printer, Save, Send, ShieldCheck, Undo2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/i18n/I18nContext';

type Domain = { code: string; name_ar: string; name_en: string; weight: number; score: number; weighted_score?: number; comment: string };
type Evaluation = {
  id: number; department_head_user_id: number; department_head_name: string; department_name?: string | null;
  academic_year_id: number; academic_year_name?: string | null; evaluation_purpose: string; status: string;
  domains: Domain[]; major_achievements: string[]; development_areas: string[]; overall_score: number; overall_rating?: string | null;
  recommendation?: string | null; recommendation_notes?: string | null; evaluator_name?: string | null; evaluator_role?: string | null;
  evaluator_signed_at?: string | null; dean_name?: string | null; dean_role?: string | null; dean_signed_at?: string | null; activity_log?: Array<{ action: string; user_name: string; at: string }>;
};
type Options = { heads: Array<{ user_id: number; name: string; department_id: number; department_name: string }>; academic_years: Array<{ id: number; code: string; is_current: boolean }> };

const domains: Omit<Domain, 'score' | 'comment' | 'weighted_score'>[] = [
  { code: 'leadership_administration', name_ar: 'القيادة والإدارة', name_en: 'Leadership and Administration', weight: 15 },
  { code: 'curriculum_planning', name_ar: 'إدارة المنهاج والتخطيط التعليمي', name_en: 'Curriculum Management and Educational Planning', weight: 15 },
  { code: 'teaching_activities', name_ar: 'التدريس والأنشطة التعليمية', name_en: 'Teaching and Educational Activities', weight: 15 },
  { code: 'assessment_management', name_ar: 'إدارة التقييمات والامتحانات', name_en: 'Assessment and Examination Management', weight: 15 },
  { code: 'faculty_management', name_ar: 'إدارة الهيئة التدريسية والموارد البشرية', name_en: 'Faculty Management and Human Resources', weight: 10 },
  { code: 'quality_assurance', name_ar: 'ضمان الجودة والاعتماد', name_en: 'Quality Assurance and Accreditation', weight: 10 },
  { code: 'research_scholarly', name_ar: 'البحث والنشاط العلمي', name_en: 'Research and Scholarly Activities', weight: 5 },
  { code: 'student_affairs', name_ar: 'شؤون الطلبة والالتزام المهني', name_en: 'Student Affairs and Professionalism', weight: 5 },
  { code: 'strategic_development', name_ar: 'التطوير الاستراتيجي للقسم', name_en: 'Strategic Development of the Department', weight: 5 },
  { code: 'program_contributions', name_ar: 'إسهامات خاصة في تطوير برنامج الطب', name_en: 'Special Contributions to Medical Program Development', weight: 5 },
];
const scoreOptions = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

const newForm = (headId = '', yearId = '') => ({
  department_head_user_id: headId,
  academic_year_id: yearId,
  evaluation_purpose: 'renewal',
  domains: Object.fromEntries(domains.map(domain => [domain.code, { score: 0, comment: '' }])),
  major_achievements: [''], development_areas: [''], recommendation: 'renew', recommendation_notes: '',
});

const statusLabel: Record<string, { ar: string; en: string }> = { draft: { ar: 'مسودة', en: 'Draft' }, submitted: { ar: 'بانتظار اعتماد العميد', en: 'Awaiting dean approval' }, approved: { ar: 'معتمد', en: 'Approved' } };
const purposeLabel: Record<string, { ar: string; en: string }> = { annual_performance: { ar: 'تقييم أداء سنوي', en: 'Annual performance evaluation' }, renewal: { ar: 'تجديد التكليف', en: 'Appointment renewal' }, reappointment: { ar: 'إعادة تكليف', en: 'Reappointment' } };
const recommendationLabel: Record<string, { ar: string; en: string }> = { renew: { ar: 'يوصى بالتجديد', en: 'Renewal recommended' }, renew_with_conditions: { ar: 'يوصى بالتجديد بشروط', en: 'Renewal recommended with conditions' }, not_recommend: { ar: 'لا يوصى بالتجديد', en: 'Renewal not recommended' } };

function formatDate(value: string | null | undefined, locale: 'ar' | 'en') { return value ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-PS' : 'en-GB', { dateStyle: 'medium' }).format(new Date(value)) : '—'; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char)); }

export function DepartmentHeadEvaluationsPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const statusText = (value: string) => statusLabel[value]?.[locale] || value;
  const purposeText = (value: string) => purposeLabel[value]?.[locale] || value;
  const recommendationText = (value: string) => recommendationLabel[value]?.[locale] || value;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState(newForm(searchParams.get('head') || ''));
  const [notice, setNotice] = useState('');
  const canCreate = can('department_head_evaluations.create');
  const canApprove = can('department_head_evaluations.approve');
  const canExport = can('department_head_evaluations.export');

  const optionsQuery = useQuery({ queryKey: ['department-head-evaluation-options'], queryFn: () => apiFetch<Options>('/department-head-evaluations/options') });
  const evaluationsQuery = useQuery({ queryKey: ['department-head-evaluations'], queryFn: () => apiFetch<Evaluation[]>('/department-head-evaluations') });
  const selectedQuery = useQuery({ queryKey: ['department-head-evaluation', selectedId], queryFn: () => apiFetch<Evaluation>(`/department-head-evaluations/${selectedId}`), enabled: Boolean(selectedId) });
  const options = optionsQuery.data;
  const selected = selectedQuery.data;

  useEffect(() => {
    if (!options) return;
    const requestedHead = searchParams.get('head');
    const currentYear = options.academic_years.find(year => year.is_current)?.id || options.academic_years[0]?.id;
    setForm(current => ({ ...current, department_head_user_id: current.department_head_user_id || requestedHead || String(options.heads[0]?.user_id || ''), academic_year_id: current.academic_year_id || String(currentYear || '') }));
  }, [options, searchParams]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      department_head_user_id: String(selected.department_head_user_id), academic_year_id: String(selected.academic_year_id), evaluation_purpose: selected.evaluation_purpose,
      domains: Object.fromEntries(selected.domains.map(domain => [domain.code, { score: domain.score, comment: domain.comment || '' }])),
      major_achievements: selected.major_achievements.length ? selected.major_achievements : [''], development_areas: selected.development_areas.length ? selected.development_areas : [''],
      recommendation: selected.recommendation || 'renew', recommendation_notes: selected.recommendation_notes || '',
    });
  }, [selected]);

  const payload = () => ({ ...form, department_head_user_id: Number(form.department_head_user_id), academic_year_id: Number(form.academic_year_id) });
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['department-head-evaluations'] }), queryClient.invalidateQueries({ queryKey: ['department-head-evaluation'] })]); };
  const saveMutation = useMutation({
    mutationFn: () => selectedId ? apiFetch<Evaluation>(`/department-head-evaluations/${selectedId}`, { method: 'PUT', body: payload() }) : apiFetch<Evaluation>('/department-head-evaluations', { method: 'POST', body: payload() }),
    onSuccess: async (evaluation) => { setSelectedId(evaluation.id); setSearchParams({ evaluation: String(evaluation.id) }); await invalidate(); setNotice(tr('تم حفظ مسودة التقييم.', 'Evaluation draft saved.')); },
  });
  const actionMutation = useMutation({
    mutationFn: ({ action }: { action: 'submit' | 'approve' | 'reopen' }) => apiFetch<Evaluation>(`/department-head-evaluations/${selectedId}/${action}`, { method: 'POST' }),
    onSuccess: async (evaluation, variables) => { await invalidate(); queryClient.setQueryData(['department-head-evaluation', evaluation.id], evaluation); setNotice(variables.action === 'approve' ? tr('تم اعتماد التقييم رسميًا.', 'Evaluation approved officially.') : variables.action === 'submit' ? tr('تم توقيع التقييم وإرساله للاعتماد.', 'Evaluation signed and submitted for approval.') : tr('أعيد التقييم إلى مسودة للمراجعة.', 'Evaluation returned to draft for review.')); },
  });
  const computedScore = useMemo(() => domains.reduce((total, domain) => total + ((Number(form.domains[domain.code]?.score || 0) / 5) * domain.weight), 0), [form.domains]);
  const formComplete = domains.every(domain => Number(form.domains[domain.code]?.score) >= 1);
  const errorText = (error: unknown) => error instanceof ApiError ? error.message : tr('تعذر حفظ التقييم. حاول مرة أخرى.', 'The evaluation could not be saved. Try again.');

  useEffect(() => { const param = Number(searchParams.get('evaluation')); if (param) setSelectedId(param); }, [searchParams]);
  if (optionsQuery.isLoading || evaluationsQuery.isLoading) return <LoadingState />;
  if (optionsQuery.isError || evaluationsQuery.isError) return <ErrorState title={tr('تعذر تحميل تقييمات رؤساء الأقسام', 'Department-head evaluations could not be loaded')} message={tr('تحقق من الصلاحيات أو أعد المحاولة.', 'Check your permissions or try again.')} onRetry={() => { optionsQuery.refetch(); evaluationsQuery.refetch(); }} />;

  const canEditCurrent = canCreate && (!selected || selected.status === 'draft');
  const startNew = () => { setSelectedId(null); setSearchParams({}); setForm(newForm(String(options?.heads[0]?.user_id || ''), String(options?.academic_years.find(year => year.is_current)?.id || options?.academic_years[0]?.id || ''))); };
  const updateList = (field: 'major_achievements' | 'development_areas', index: number, value: string) => setForm(current => ({ ...current, [field]: current[field].map((item, itemIndex) => itemIndex === index ? value : item) }));
  const printEvaluation = () => window.print();
  const downloadWord = () => {
    if (!selected) return;
    const html = `<!doctype html><html dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#172033;margin:38px;line-height:1.6}h1{text-align:center;font-size:19px;margin:0 0 6px}h2{font-size:14px;margin:24px 0 8px;color:#0f766e}.sub{text-align:center;color:#526176;font-size:12px;margin-bottom:22px}table{width:100%;border-collapse:collapse;margin:10px 0 18px;font-size:11px}th{background:#e7f7f5}th,td{border:1px solid #b8c8d0;padding:7px;text-align:${ar ? 'right' : 'left'};vertical-align:top}.sign{margin-top:35px;display:flex;gap:45px}.sign div{width:45%;border-top:1px solid #64748b;padding-top:7px;font-size:11px}.muted{color:#64748b}</style></head><body><h1>${tr('جامعة الخليل - كلية الطب البشري', 'Hebron University - Faculty of Medicine')}</h1><h1>${tr('نموذج تقييم أداء رئيس القسم وإعادة التكليف', 'Department Head Performance Evaluation and Reappointment Form')}</h1><table><tr><th>${tr('العام الأكاديمي', 'Academic year')}</th><td>${escapeHtml(selected.academic_year_name || '')}</td><th>${tr('القسم', 'Department')}</th><td>${escapeHtml(selected.department_name || '')}</td></tr><tr><th>${tr('رئيس القسم', 'Department head')}</th><td>${escapeHtml(selected.department_head_name || '')}</td><th>${tr('الغرض', 'Purpose')}</th><td>${escapeHtml(purposeText(selected.evaluation_purpose))}</td></tr></table><p class="muted">${tr('سلم التقدير: 5 ممتاز | 4 جيد جدًا | 3 جيد | 2 مقبول | 1 غير مرضٍ. النتيجة الموزونة = (الدرجة ÷ 5) × وزن المحور.', 'Scale: 5 Excellent | 4 Very Good | 3 Good | 2 Acceptable | 1 Unsatisfactory. Weighted score = (score ÷ 5) × domain weight.')}</p><table><tr><th>${tr('المحور', 'Domain')}</th><th>${tr('الوزن', 'Weight')}</th><th>${tr('الدرجة', 'Score')}</th><th>${tr('الموزون', 'Weighted')}</th><th>${tr('الملاحظات', 'Comments')}</th></tr>${selected.domains.map(domain => `<tr><td>${escapeHtml(ar ? domain.name_ar : domain.name_en)}</td><td>${domain.weight}%</td><td>${domain.score} / 5</td><td>${domain.weighted_score || ((domain.score / 5) * domain.weight).toFixed(1)} / ${domain.weight}</td><td>${escapeHtml(domain.comment || '—')}</td></tr>`).join('')}<tr><th colspan="3">${tr('المجموع الكلي', 'Overall total')}</th><th colspan="2">${selected.overall_score} / 100 - ${escapeHtml(selected.overall_rating || '')}</th></tr></table><h2>${tr('أهم الإنجازات خلال العام الأكاديمي', 'Major achievements during the academic year')}</h2><ul>${selected.major_achievements.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><h2>${tr('مجالات التطوير المستقبلية', 'Future development areas')}</h2><ul>${selected.development_areas.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul><h2>${tr('التوصية بشأن التجديد', 'Renewal recommendation')}</h2><p><strong>${escapeHtml(recommendationText(selected.recommendation || ''))}</strong></p><p>${escapeHtml(selected.recommendation_notes || '')}</p><div class="sign"><div>${tr('المقيّم:', 'Evaluator:')} ${escapeHtml(selected.evaluator_name || '____________________')}<br>${escapeHtml(selected.evaluator_role || '')}<br>${tr('التوقيع والتاريخ:', 'Signature and date:')} ${formatDate(selected.evaluator_signed_at, locale)}</div><div>${tr('العميد:', 'Dean:')} ${escapeHtml(selected.dean_name || '____________________')}<br>${escapeHtml(selected.dean_role || '')}<br>${tr('التوقيع والتاريخ:', 'Signature and date:')} ${formatDate(selected.dean_signed_at, locale)}</div></div></body></html>`;
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([html], { type: 'application/msword;charset=utf-8' })); link.download = `department-head-evaluation-${selected.id}.doc`; link.click(); URL.revokeObjectURL(link.href);
  };

  return <div className="mx-auto max-w-7xl space-y-5 pb-12">
    <style>{`@media print { body * { visibility: hidden !important; } .evaluation-print, .evaluation-print * { visibility: visible !important; } .evaluation-print { display:block !important; position:absolute; inset:0; width:100%; padding:18mm; color:#172033; background:white; } }`}</style>
    <PageHeader title={tr('تقييم رؤساء الأقسام وإعادة التكليف', 'Department head evaluations and reappointment')} description={tr('نموذج رسمي موزون وموقّع، مبني على معايير تقييم القيادة الأكاديمية والتجديد السنوي.', 'A formal weighted and signed form based on academic leadership and annual renewal criteria.')}>
      {canCreate && <Button onClick={startNew}><Plus className="me-2 h-4 w-4" />{tr('تقييم جديد', 'New evaluation')}</Button>}
      {selected && canExport && <><Button variant="outline" onClick={downloadWord}><FileDown className="me-2 h-4 w-4" />{tr('تصدير Word', 'Export Word')}</Button><Button variant="outline" onClick={printEvaluation}><Printer className="me-2 h-4 w-4" />{tr('طباعة / حفظ PDF', 'Print / save PDF')}</Button></>}
    </PageHeader>
    {notice && <div className="flex items-center justify-between rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800"><span>{notice}</span><button onClick={() => setNotice('')} className="text-xs underline">{tr('إخفاء', 'Dismiss')}</button></div>}

    <div className="grid gap-5 lg:grid-cols-[19rem_1fr]">
      <Card className="h-fit rounded-3xl border-slate-200 p-4"><div className="mb-3 flex items-center gap-2"><History className="h-4 w-4 text-teal-600" /><h2 className="text-sm font-black text-slate-800">السجل الرسمي</h2></div><div className="space-y-2">{(evaluationsQuery.data || []).length ? (evaluationsQuery.data || []).map(evaluation => <button key={evaluation.id} onClick={() => { setSelectedId(evaluation.id); setSearchParams({ evaluation: String(evaluation.id) }); }} className={`w-full rounded-2xl border p-3 text-right transition ${selectedId === evaluation.id ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white hover:border-teal-200'}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-black text-slate-800">{evaluation.department_head_name}</p><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${evaluation.status === 'approved' ? 'bg-teal-100 text-teal-800' : evaluation.status === 'submitted' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{statusText(evaluation.status)}</span></div><p className="mt-1 text-[11px] text-slate-500">{evaluation.department_name} · {evaluation.academic_year_name}</p><p className="mt-2 text-xs font-bold text-teal-700">{evaluation.overall_score} / 100 · {evaluation.overall_rating || 'غير مكتمل'}</p></button>) : <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">لا توجد تقييمات موثقة بعد.</p>}</div></Card>

      <Card className="rounded-3xl border-slate-200 p-4 sm:p-6">
        {!canCreate && !selected ? <div className="py-16 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-teal-600" /><h2 className="mt-3 font-black text-slate-800">اختر تقييمًا من السجل</h2><p className="mt-1 text-sm text-slate-500">لديك صلاحية الاطلاع والتصدير فقط.</p></div> : <>
          <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-800">{selected ? 'التقييم الرسمي' : 'مسودة تقييم جديدة'}</h2><p className="mt-1 text-xs text-slate-500">المجموع يُحتسب آليًا من الدرجات والأوزان ولا يمكن إدخاله يدويًا.</p></div>{selected && <span className={`w-fit rounded-xl px-3 py-1.5 text-xs font-bold ${selected.status === 'approved' ? 'bg-teal-100 text-teal-800' : selected.status === 'submitted' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{statusText(selected.status)}</span>}</div>
          <div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1.5 block text-xs font-bold text-slate-600">رئيس القسم</span><select disabled={!canEditCurrent} value={form.department_head_user_id} onChange={event => setForm(current => ({ ...current, department_head_user_id: event.target.value }))} className={inputClass}><option value="">اختر رئيس القسم</option>{options?.heads.map(head => <option key={head.user_id} value={head.user_id}>{head.name} - {head.department_name}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold text-slate-600">العام الأكاديمي</span><select disabled={!canEditCurrent} value={form.academic_year_id} onChange={event => setForm(current => ({ ...current, academic_year_id: event.target.value }))} className={inputClass}><option value="">اختر العام</option>{options?.academic_years.map(year => <option key={year.id} value={year.id}>{year.code}{year.is_current ? ' - الحالي' : ''}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold text-slate-600">الغرض من التقييم</span><select disabled={!canEditCurrent} value={form.evaluation_purpose} onChange={event => setForm(current => ({ ...current, evaluation_purpose: event.target.value }))} className={inputClass}><option value="annual_performance">تقييم أداء سنوي</option><option value="renewal">تجديد التكليف</option><option value="reappointment">إعادة تكليف</option></select></label></div>
          <div className="mt-5 rounded-2xl border border-teal-100 bg-teal-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-teal-800">سلم التقدير: 5 ممتاز · 4 جيد جدًا · 3 جيد · 2 مقبول · 1 غير مرضٍ</p><p className="mt-1 text-[11px] text-teal-700">النتيجة الموزونة = (الدرجة ÷ 5) × وزن المحور.</p></div><div className="rounded-xl bg-white px-4 py-2 text-center shadow-sm"><p className="text-xl font-black text-teal-800">{computedScore.toFixed(1)} / 100</p><p className="text-[10px] font-bold text-teal-700">النتيجة الحالية</p></div></div></div>
          <div className="mt-5 space-y-3">{domains.map((domain, index) => { const value = form.domains[domain.code] || { score: 0, comment: '' }; const weighted = (Number(value.score || 0) / 5) * domain.weight; return <section key={domain.code} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-black text-slate-800">{index + 1}. {domain.name_ar} <span className="mr-1 text-xs font-bold text-teal-700">({domain.weight}%)</span></p><p className="mt-1 text-[11px] text-slate-500">{domain.name_en}</p></div><div className="rounded-xl bg-slate-50 px-3 py-2 text-center"><p className="text-sm font-black text-slate-800">{weighted.toFixed(1)} / {domain.weight}</p><p className="text-[10px] text-slate-500">الدرجة الموزونة</p></div></div><div className="mt-3 flex flex-wrap gap-1.5">{scoreOptions.map(score => <button key={score} disabled={!canEditCurrent} onClick={() => setForm(current => ({ ...current, domains: { ...current.domains, [domain.code]: { ...current.domains[domain.code], score } } }))} className={`h-8 min-w-10 rounded-lg border px-2 text-xs font-bold transition ${Number(value.score) === score ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300'} disabled:cursor-not-allowed disabled:opacity-70`}>{score}</button>)}</div><textarea disabled={!canEditCurrent} rows={3} value={value.comment} onChange={event => setForm(current => ({ ...current, domains: { ...current.domains, [domain.code]: { ...current.domains[domain.code], comment: event.target.value } } }))} className={`${inputClass} mt-3 resize-y`} placeholder="الملاحظات والمبررات المهنية لهذا المحور..." /></section>; })}</div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">{(['major_achievements', 'development_areas'] as const).map(field => <section key={field} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-800">{field === 'major_achievements' ? 'أهم الإنجازات خلال العام الأكاديمي' : 'مجالات التطوير المستقبلية'}</h3>{canEditCurrent && <button onClick={() => setForm(current => ({ ...current, [field]: [...current[field], ''] }))} className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold text-teal-700">إضافة بند</button>}</div><div className="mt-3 space-y-2">{form[field].map((item, index) => <div key={`${field}-${index}`} className="flex gap-2"><span className="pt-2 text-xs font-black text-teal-600">{index + 1}</span><input disabled={!canEditCurrent} value={item} onChange={event => updateList(field, index, event.target.value)} className={inputClass} placeholder={field === 'major_achievements' ? 'اكتب إنجازًا واضحًا وقابلًا للتوثيق...' : 'اكتب مجال تطوير أو إجراءً مستقبليًا...'} />{canEditCurrent && form[field].length > 1 && <button onClick={() => setForm(current => ({ ...current, [field]: current[field].filter((_, itemIndex) => itemIndex !== index) }))} className="px-2 text-xs font-bold text-slate-400 hover:text-red-600">حذف</button>}</div>)}</div></section>)}</div>
          <section className="mt-5 rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-black text-slate-800">التوصية بشأن التجديد أو إعادة التكليف</h3><div className="mt-3 grid gap-3 sm:grid-cols-[14rem_1fr]"><select disabled={!canEditCurrent} value={form.recommendation} onChange={event => setForm(current => ({ ...current, recommendation: event.target.value }))} className={inputClass}><option value="renew">يوصى بالتجديد</option><option value="renew_with_conditions">يوصى بالتجديد بشروط</option><option value="not_recommend">لا يوصى بالتجديد</option></select><textarea disabled={!canEditCurrent} rows={3} value={form.recommendation_notes} onChange={event => setForm(current => ({ ...current, recommendation_notes: event.target.value }))} className={`${inputClass} resize-y`} placeholder="الخلاصة المهنية والتوصية الرسمية..." /></div></section>
          {canEditCurrent && <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}><Save className="ml-2 h-4 w-4" />حفظ مسودة</Button>{selected && <Button onClick={() => actionMutation.mutate({ action: 'submit' })} disabled={!formComplete || actionMutation.isPending}><Send className="ml-2 h-4 w-4" />توقيع وإرسال للاعتماد</Button>}</div>}
          {selected?.status === 'submitted' && canApprove && <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><Button variant="outline" onClick={() => actionMutation.mutate({ action: 'reopen' })} isLoading={actionMutation.isPending}><Undo2 className="ml-2 h-4 w-4" />إعادة إلى مسودة</Button><Button onClick={() => actionMutation.mutate({ action: 'approve' })} isLoading={actionMutation.isPending}><CheckCircle2 className="ml-2 h-4 w-4" />اعتماد وتوقيع العميد</Button></div>}
          {selected?.status === 'approved' && canApprove && <div className="mt-5 flex justify-end border-t border-slate-100 pt-4"><Button variant="outline" onClick={() => actionMutation.mutate({ action: 'reopen' })} isLoading={actionMutation.isPending}><Undo2 className="ml-2 h-4 w-4" />إعادة فتح للتعديل</Button></div>}
          {(saveMutation.isError || actionMutation.isError) && <p className="mt-3 text-sm font-bold text-red-600">{errorText(saveMutation.error || actionMutation.error)}</p>}
          {selected?.activity_log?.length ? <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-xs font-black text-slate-700">سجل الاعتماد</h3><div className="mt-2 flex flex-wrap gap-2">{selected.activity_log.map((event, index) => <span key={`${event.at}-${index}`} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">{event.user_name} · {formatDate(event.at, locale)} · {event.action}</span>)}</div></div> : null}
        </>}
      </Card>
    </div>
    {selected && <PrintableEvaluation evaluation={selected} locale={locale} />}
  </div>;
}

function PrintableEvaluation({ evaluation, locale }: { evaluation: Evaluation; locale: 'ar' | 'en' }) {
  return <article className="evaluation-print hidden" dir="rtl"><header className="text-center"><h1 className="text-xl font-black">جامعة الخليل - كلية الطب البشري</h1><h2 className="mt-1 text-lg font-black">نموذج تقييم أداء رئيس القسم وإعادة التكليف</h2><p className="mt-1 text-xs text-slate-500">Annual Performance Evaluation & Renewal Assessment</p></header><table className="mt-6 w-full border-collapse text-xs"><tbody><tr><th className="border border-slate-400 bg-teal-50 p-2">العام الأكاديمي</th><td className="border border-slate-400 p-2">{evaluation.academic_year_name}</td><th className="border border-slate-400 bg-teal-50 p-2">القسم</th><td className="border border-slate-400 p-2">{evaluation.department_name}</td></tr><tr><th className="border border-slate-400 bg-teal-50 p-2">رئيس القسم</th><td className="border border-slate-400 p-2">{evaluation.department_head_name}</td><th className="border border-slate-400 bg-teal-50 p-2">الغرض</th><td className="border border-slate-400 p-2">{purposeLabel[evaluation.evaluation_purpose]?.[locale] || evaluation.evaluation_purpose}</td></tr></tbody></table><p className="mt-4 text-[11px]">سلم التقدير: 5 ممتاز | 4 جيد جدًا | 3 جيد | 2 مقبول | 1 غير مرضٍ. النتيجة الموزونة = (الدرجة ÷ 5) × وزن المحور.</p><table className="mt-3 w-full border-collapse text-[11px]"><thead><tr className="bg-teal-50"><th className="border border-slate-400 p-2">المحور</th><th className="border border-slate-400 p-2">الوزن</th><th className="border border-slate-400 p-2">الدرجة</th><th className="border border-slate-400 p-2">الموزون</th><th className="border border-slate-400 p-2">الملاحظات</th></tr></thead><tbody>{evaluation.domains.map(domain => <tr key={domain.code}><td className="border border-slate-400 p-2">{domain.name_ar}</td><td className="border border-slate-400 p-2">{domain.weight}%</td><td className="border border-slate-400 p-2">{domain.score} / 5</td><td className="border border-slate-400 p-2">{domain.weighted_score} / {domain.weight}</td><td className="border border-slate-400 p-2">{domain.comment || '—'}</td></tr>)}<tr><th colSpan={3} className="border border-slate-400 bg-teal-50 p-2">المجموع الكلي</th><th colSpan={2} className="border border-slate-400 p-2">{evaluation.overall_score} / 100 - {evaluation.overall_rating}</th></tr></tbody></table><section className="mt-5"><h3 className="font-black">أهم الإنجازات خلال العام الأكاديمي</h3><ul className="mt-2 list-disc space-y-1 pr-5 text-xs">{evaluation.major_achievements.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section className="mt-5"><h3 className="font-black">مجالات التطوير المستقبلية</h3><ul className="mt-2 list-disc space-y-1 pr-5 text-xs">{evaluation.development_areas.map((item, index) => <li key={index}>{item}</li>)}</ul></section><section className="mt-5"><h3 className="font-black">التوصية بشأن التجديد</h3><p className="mt-2 text-sm font-bold">{recommendationLabel[evaluation.recommendation || '']?.[locale] || '—'}</p><p className="mt-1 whitespace-pre-line text-xs">{evaluation.recommendation_notes}</p></section><div className="mt-12 grid grid-cols-2 gap-14 text-xs"><div className="border-t border-slate-500 pt-2">المقيّم: {evaluation.evaluator_name || '____________________'}<br />{evaluation.evaluator_role || ''}<br />التوقيع والتاريخ: {formatDate(evaluation.evaluator_signed_at, locale)}</div><div className="border-t border-slate-500 pt-2">العميد: {evaluation.dean_name || '____________________'}<br />{evaluation.dean_role || ''}<br />التوقيع والتاريخ: {formatDate(evaluation.dean_signed_at, locale)}</div></div></article>;
}
