import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpenCheck, CalendarDays, ChevronDown, FileCheck2, Plus, Settings2, ShieldCheck } from 'lucide-react';
import { createPolicyCampaign, getPolicyCampaignOptions, listPolicyCampaigns, uploadPolicyDocument } from '@/api/studentPolicies';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';

const levels = [{ value: 'fourth', label: 'السنة الرابعة' }, { value: 'fifth', label: 'السنة الخامسة' }, { value: 'sixth', label: 'السنة السادسة' }];
const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const nextVersion = (campaigns: Awaited<ReturnType<typeof listPolicyCampaigns>> = []) => {
  const year = String(new Date().getFullYear());
  const revisions = campaigns
    .map(campaign => campaign.document.version_label.match(new RegExp(`^${year}\\.(\\d+)$`)))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map(match => Number(match[1]));
  return `${year}.${Math.max(0, ...revisions) + 1}`;
};

export function StudentPoliciesPage() {
  const { can } = useAuth(); const queryClient = useQueryClient(); const [open, setOpen] = useState(false); const [advanced, setAdvanced] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState({ title_ar: 'مدونة سلوك طلبة الطب', title_en: 'Medical Students’ Code of Conduct', version_label: '', effective_date: today(), academic_year_id: '', deadline: '', target_levels: ['fourth', 'fifth', 'sixth'] });
  const [fileAr, setFileAr] = useState<File | null>(null); const [fileEn, setFileEn] = useState<File | null>(null);
  const campaigns = useQuery({ queryKey: ['student-policies'], queryFn: listPolicyCampaigns });
  const options = useQuery({ queryKey: ['student-policy-options'], queryFn: getPolicyCampaignOptions });
  const yearRows = useMemo(() => options.data?.academic_years ?? [], [options.data]);
  const generatedVersion = useMemo(() => nextVersion(campaigns.data), [campaigns.data]);
  useEffect(() => {
    if (!open) return;
    setForm(current => ({
      ...current,
      academic_year_id: current.academic_year_id || String(yearRows.find((year: any) => year.is_current)?.id ?? yearRows[0]?.id ?? ''),
      version_label: current.version_label || generatedVersion,
      effective_date: current.effective_date || today(),
    }));
  }, [open, yearRows, generatedVersion]);
  const create = useMutation({ mutationFn: async () => {
    if (!fileAr || !fileEn) throw new Error('اختر النسختين العربية والإنجليزية بصيغة PDF.');
    if (!form.academic_year_id || !form.effective_date || !form.deadline || !form.version_label.trim()) throw new Error('أكمل بيانات الإصدار والحملة المطلوبة.');
    if (form.target_levels.length === 0) throw new Error('اختر سنة دراسية واحدة على الأقل.');
    const payload = new FormData(); ['title_ar', 'title_en', 'version_label', 'effective_date'].forEach(key => payload.append(key, (form as any)[key])); payload.append('file_ar', fileAr); payload.append('file_en', fileEn);
    const document = await uploadPolicyDocument(payload);
    return createPolicyCampaign({ student_policy_document_id: document.id, academic_year_id: Number(form.academic_year_id), target_levels: form.target_levels, deadline: form.deadline });
  }, onSuccess: () => { setOpen(false); setError(''); setFileAr(null); setFileEn(null); setForm(current => ({ ...current, version_label: '', effective_date: today(), deadline: '' })); queryClient.invalidateQueries({ queryKey: ['student-policies'] }); }, onError: (e: Error) => setError(e.message) });

  return <div className="space-y-5" dir="rtl">
    <PageHeader title="سياسات وتعهدات الطلبة" description="نشر النسخة الرسمية، توثيق القراءة، ومتابعة النسخ الورقية الموقعة.">
      {can('student_policies.manage') && <button onClick={() => { setAdvanced(false); setError(''); setOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800"><Plus className="h-4 w-4" />إنشاء حملة</button>}
    </PageHeader>
    <div className="grid gap-3 sm:grid-cols-3">
      {[['الحملات', campaigns.data?.length ?? 0, CalendarDays], ['المنشورة', campaigns.data?.filter(x => x.status === 'published').length ?? 0, BookOpenCheck], ['نسخ مستلمة', campaigns.data?.reduce((n, x) => n + (x.counts?.paper_received ?? 0), 0) ?? 0, FileCheck2]].map(([label, value, Icon]: any) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><Icon className="mb-3 h-5 w-5 text-teal-700"/><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>)}
    </div>
    {campaigns.isLoading ? <LoadingState /> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{['الوثيقة والإصدار','العام والفئات','المهلة','الإنجاز','الحالة',''].map(x=><th key={x} className="px-4 py-3 text-right">{x}</th>)}</tr></thead><tbody>{(campaigns.data ?? []).map(c => <tr key={c.id} className="border-t border-slate-100"><td className="px-4 py-4"><b>{c.document.title_ar}</b><span className="block text-xs text-slate-500">الإصدار {c.document.version_label}</span></td><td className="px-4 py-4">{c.academic_year?.code}<span className="block text-xs text-slate-500">{c.target_levels.map(l => levels.find(x=>x.value===l)?.label).join('، ')}</span></td><td className="px-4 py-4">{c.deadline}</td><td className="px-4 py-4">{c.counts?.paper_received ?? 0} / {c.counts?.total ?? 0}</td><td className="px-4 py-4"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">{{draft:'مسودة',published:'منشورة',closed:'مغلقة'}[c.status]}</span></td><td className="px-4 py-4"><Link className="font-bold text-teal-700" to={`/student-policies/${c.id}`}>فتح المتابعة</Link></td></tr>)}</tbody></table></div>{!campaigns.data?.length && <div className="p-10 text-center text-sm text-slate-500"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-teal-600"/>لا توجد حملات بعد. ابدأ فقط بعد اعتماد النسخة الرسمية ثنائية اللغة.</div>}</div>}
    <Modal isOpen={open} onClose={() => setOpen(false)} title="إنشاء حملة مدونة السلوك" maxWidth="2xl" backdropTone="light">
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
        <div className="rounded-xl bg-teal-50 p-3 text-xs font-medium leading-5 text-teal-900">ارفع النسختين النهائيتين المعتمدتين؛ سيجهّز النظام بيانات الإصدار وتاريخ النفاذ تلقائيًا.</div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-bold">النسخة العربية PDF<input aria-label="النسخة العربية PDF" required accept="application/pdf" type="file" onChange={e=>setFileAr(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full rounded-xl border border-slate-200 p-3 text-sm"/></label><label className="block text-sm font-bold">النسخة الإنجليزية PDF<input aria-label="النسخة الإنجليزية PDF" required accept="application/pdf" type="file" onChange={e=>setFileEn(e.target.files?.[0] ?? null)} className="mt-1.5 block w-full rounded-xl border border-slate-200 p-3 text-sm"/></label></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">العام الأكاديمي<select aria-label="العام الأكاديمي" required value={form.academic_year_id} onChange={e=>setForm({...form,academic_year_id:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3"><option value="">اختر العام</option>{yearRows.map((y:any)=><option key={y.id} value={y.id}>{y.code}{y.is_current?' — الحالي':''}</option>)}</select></label><label className="text-sm font-bold">آخر موعد<input aria-label="آخر موعد" required type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3"/></label></div>
        <fieldset aria-label="السنوات المستهدفة"><legend className="mb-2 text-sm font-bold">السنوات المستهدفة</legend><div className="flex flex-wrap gap-2">{levels.map(l=><label key={l.value} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={form.target_levels.includes(l.value)} onChange={e=>setForm({...form,target_levels:e.target.checked?[...form.target_levels,l.value]:form.target_levels.filter(x=>x!==l.value)})}/>{l.label}</label>)}</div></fieldset>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <button type="button" onClick={() => setAdvanced(value => !value)} aria-expanded={advanced} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4 text-teal-700"/>إعدادات متقدمة</span><ChevronDown className={`h-4 w-4 transition-transform ${advanced?'rotate-180':''}`}/></button>
          {advanced && <div className="grid gap-3 border-t border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2"><label className="text-sm font-bold">العنوان العربي<input aria-label="العنوان العربي" required value={form.title_ar} onChange={e=>setForm({...form,title_ar:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3"/></label><label className="text-sm font-bold">العنوان الإنجليزي<input aria-label="العنوان الإنجليزي" required value={form.title_en} onChange={e=>setForm({...form,title_en:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3"/></label><label className="text-sm font-bold">رقم الإصدار<input aria-label="رقم الإصدار" required placeholder="مثال: 2026.1" value={form.version_label} onChange={e=>setForm({...form,version_label:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3"/></label><label className="text-sm font-bold">تاريخ النفاذ<input aria-label="تاريخ النفاذ" required type="date" value={form.effective_date} onChange={e=>setForm({...form,effective_date:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3"/></label></div>}
        </div>
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2"><button disabled={create.isPending} className="rounded-xl bg-teal-700 px-5 py-2.5 font-bold text-white">{create.isPending?'جارٍ الحفظ...':'حفظ كمسودة'}</button><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border px-5 py-2.5 font-bold">إلغاء</button></div>
      </form>
    </Modal>
  </div>;
}
