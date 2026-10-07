import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckCircle2, Plus, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { apiFetch, apiFetchEnvelope, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { QualitySectionGuide } from '@/components/quality/QualitySectionGuide';
import { dateOnly, localDate } from './dateOnly';

type Measurement={id:number;measured_at:string;display_value:string;numeric_value?:string|number|null;achievement_status:string;review_status:string;evidence?:string|null;notes?:string|null};
type Kpi={id:number;code:string;name:string;category?:string;target_value?:string;measurement_frequency?:string;responsible?:string;latest_measurement?:Measurement|null;measurements?:Measurement[]};
const field='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';
const achievement:Record<string,[string,string]>={achieved:['متحقق','Achieved'],partially_achieved:['متحقق جزئيًا','Partially achieved'],not_achieved:['غير متحقق','Not achieved'],not_assessed:['غير مقاس','Not assessed']};
const reviewText:Record<string,[string,string]>={draft:['مسودة','Draft'],submitted:['بانتظار المراجعة','Pending review'],approved:['معتمد','Approved'],returned:['معاد للتعديل','Returned']};
const emptyKpi={code:'',name:'',category:'',target_value:'',target_numeric:'',warning_numeric:'',comparison_operator:'gte',value_type:'percentage',measurement_frequency:'',responsible:'',weight:'',measurement_method:'',data_source:'',is_active:true};
const newMeasurement=()=>({academic_year:'',measured_at:localDate(),numeric_value:'',display_value:'',evidence:'',notes:'',submit_for_review:true});

export function KpiPage(){
 const{can}=useAuth();const{locale}=useI18n();const ar=locale==='ar';const client=useQueryClient();
 const[createOpen,setCreateOpen]=useState(false),[measuring,setMeasuring]=useState<Kpi|null>(null),[search,setSearch]=useState(''),[debouncedSearch,setDebouncedSearch]=useState(''),[page,setPage]=useState(1);
 const[reviewing,setReviewing]=useState<{kpi:Kpi;decision:'approved'|'returned'}|null>(null),[reviewNotes,setReviewNotes]=useState('');
 const[form,setForm]=useState(emptyKpi),[measurement,setMeasurement]=useState(newMeasurement());
 useEffect(()=>{const timer=window.setTimeout(()=>setDebouncedSearch(search.trim()),300);return()=>window.clearTimeout(timer)},[search]);
 const params=new URLSearchParams({per_page:'20',page:String(page)});if(debouncedSearch)params.set('search',debouncedSearch);
 const query=useQuery({queryKey:['quality-kpis',page,debouncedSearch],queryFn:()=>apiFetchEnvelope<Kpi[]>(`/quality-kpis?${params}`),enabled:can('quality.view')});
 const options=useQuery({queryKey:['quality-options'],queryFn:()=>apiFetch<{academic_years:Array<{code:string;is_current:boolean}>}>('/quality-options'),enabled:can('kpi.manage')});
 const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['quality-kpis']}),client.invalidateQueries({queryKey:['quality-overview']})]);};
 const create=useMutation({mutationFn:()=>apiFetch('/quality-kpis',{method:'POST',body:{...form,weight:form.weight?Number(form.weight):null,target_numeric:Number(form.target_numeric),warning_numeric:form.warning_numeric===''?null:Number(form.warning_numeric)}}),onSuccess:async()=>{await refresh();setCreateOpen(false);setForm(emptyKpi);}});
 const record=useMutation({mutationFn:()=>apiFetch(`/quality-kpis/${measuring!.id}/measurements`,{method:'POST',body:{...measurement,numeric_value:Number(measurement.numeric_value)}}),onSuccess:async()=>{await refresh();setMeasuring(null);setMeasurement(newMeasurement());}});
 const review=useMutation({mutationFn:()=>apiFetch(`/quality-kpi-measurements/${reviewing!.kpi.latest_measurement!.id}/review`,{method:'POST',body:{decision:reviewing!.decision,review_notes:reviewNotes||null}}),onSuccess:async()=>{await refresh();setReviewing(null);setReviewNotes('');}});
 const items=query.data?.data||[];const total=Number(query.data?.meta.total||0);const lastPage=Math.max(1,Math.ceil(total/20));
 const err=create.error||record.error||review.error,error=err instanceof ApiError?err.message:(ar?'تعذر حفظ البيانات.':'Unable to save data.');
 if(!can('quality.view'))return <ErrorState title={ar?'غير مصرح':'Access denied'}/>;if(query.isLoading)return <LoadingState/>;if(query.isError)return <ErrorState onRetry={()=>query.refetch()}/>;
 return <div className="mx-auto max-w-7xl space-y-5 pb-14">
  <PageHeader title={ar?'مؤشرات الجودة':'Quality indicators'} description={ar?'عرّف المستهدف وسجل القياس ثم راجع الدليل قبل الاعتماد.':'Set targets, record measures, and review evidence before approval.'}>{can('kpi.manage')&&<Button onClick={()=>setCreateOpen(true)}><Plus className="ml-2 h-4 w-4"/>{ar?'مؤشر جديد':'New indicator'}</Button>}</PageHeader>
  <QualitySectionGuide titleAr="كيف تدير مؤشر الجودة؟" titleEn="How to manage an indicator" stepsAr={['عرّف المؤشر ومستهدفه؛ ينشئ النظام الرمز تلقائيًا.','سجل النتيجة واختر العام المعتمد وأرفق الدليل.','يحسب النظام الإنجاز ويرسل القياس للمراجعة.','اعتمد القياس أو أعده للتصحيح، وأنشئ خطة تحسين عند الحاجة.']} stepsEn={['Define the indicator and target; its code is automatic.','Record a result for an approved year with evidence.','Achievement is calculated and sent for review.','Approve or return it and create an improvement plan when needed.']}/>
  <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search className="h-4 w-4 shrink-0 text-slate-400"/><input aria-label={ar?'بحث في المؤشرات':'Search indicators'} value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder={ar?'الاسم أو الرمز أو المحور':'Name, code, or category'}/><span className="shrink-0 text-xs text-slate-500">{total}</span></label>
  {!items.length?<EmptyState message={ar?'لا توجد مؤشرات مطابقة.':'No matching indicators.'}/>:<section className="grid gap-3 lg:grid-cols-2">{items.map(kpi=><KpiCard key={kpi.id} kpi={kpi} ar={ar} manage={can('kpi.manage')} measuring={()=>{setMeasurement({...newMeasurement(),academic_year:options.data?.academic_years.find(year=>year.is_current)?.code||''});setMeasuring(kpi);}} review={(decision)=>{setReviewNotes('');setReviewing({kpi,decision});}}/>)}</section>}
  {lastPage>1&&<nav aria-label={ar?'صفحات المؤشرات':'Indicator pages'} className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(value=>value-1)}>{ar?'السابق':'Previous'}</Button><span className="text-xs text-slate-600">{page} / {lastPage}</span><Button variant="outline" disabled={page>=lastPage} onClick={()=>setPage(value=>value+1)}>{ar?'التالي':'Next'}</Button></nav>}
  <Modal isOpen={createOpen} onClose={()=>setCreateOpen(false)} title={ar?'مؤشر جودة جديد':'New quality indicator'} maxWidth="2xl">
    <form onSubmit={(event:FormEvent)=>{event.preventDefault();create.mutate();}} className="space-y-4">
      <Label text={ar?'اسم المؤشر':'Indicator name'}><input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})} className={field}/></Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text={ar?'المحور':'Category'}><input value={form.category} onChange={event=>setForm({...form,category:event.target.value})} className={field}/></Label>
        <Label text={ar?'رمز اختياري':'Optional code'}><input value={form.code} onChange={event=>setForm({...form,code:event.target.value})} placeholder={ar?'اتركه فارغًا للترقيم التلقائي':'Leave blank to generate'} className={field}/></Label>
        <Label text={ar?'نوع القيمة':'Value type'}><select value={form.value_type} onChange={event=>setForm({...form,value_type:event.target.value})} className={field}><option value="percentage">{ar?'نسبة مئوية':'Percentage'}</option><option value="number">{ar?'عدد':'Number'}</option><option value="score">{ar?'درجة':'Score'}</option><option value="days">{ar?'أيام':'Days'}</option></select></Label>
        <Label text={ar?'المستهدف الرقمي':'Numeric target'}><input required type="number" step="any" value={form.target_numeric} onChange={event=>setForm({...form,target_numeric:event.target.value})} className={field}/></Label>
        <Label text={ar?'صيغة عرض المستهدف':'Target display'}><input required value={form.target_value} onChange={event=>setForm({...form,target_value:event.target.value})} className={field} placeholder={form.value_type==='percentage'?'80%':'80'}/></Label>
        <Label text={ar?'اتجاه النجاح':'Success direction'}><select value={form.comparison_operator} onChange={event=>setForm({...form,comparison_operator:event.target.value})} className={field}><option value="gte">{ar?'أعلى أو يساوي المستهدف':'At least target'}</option><option value="lte">{ar?'أقل أو يساوي المستهدف':'At most target'}</option></select></Label>
        <Label text={ar?'دورية القياس':'Frequency'}><input required value={form.measurement_frequency} onChange={event=>setForm({...form,measurement_frequency:event.target.value})} className={field}/></Label>
        <Label text={ar?'المسؤول':'Owner'}><input required value={form.responsible} onChange={event=>setForm({...form,responsible:event.target.value})} className={field}/></Label>
      </div>
      <Label text={ar?'مصدر البيانات':'Data source'}><input value={form.data_source} onChange={event=>setForm({...form,data_source:event.target.value})} className={field}/></Label>
      <Label text={ar?'طريقة القياس':'Measurement method'}><textarea rows={2} value={form.measurement_method} onChange={event=>setForm({...form,measurement_method:event.target.value})} className={field}/></Label>
      {create.isError&&<p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
      <Actions ar={ar} loading={create.isPending} close={()=>setCreateOpen(false)}/>
    </form>
  </Modal>
  <Modal isOpen={Boolean(measuring)} onClose={()=>setMeasuring(null)} title={`${ar?'تسجيل قياس':'Record measurement'} — ${measuring?.code||''}`}>
    <form onSubmit={(event:FormEvent)=>{event.preventDefault();record.mutate();}} className="space-y-4">
      <p className="rounded-xl bg-teal-50 px-3 py-2 text-xs text-teal-800">{ar?'المستهدف':'Target'}: <strong>{measuring?.target_value}</strong></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text={ar?'تاريخ القياس':'Measurement date'}><input required type="date" value={measurement.measured_at} onChange={event=>setMeasurement({...measurement,measured_at:event.target.value})} className={field}/></Label>
        <Label text={ar?'العام الأكاديمي':'Academic year'}><select required value={measurement.academic_year} onChange={event=>setMeasurement({...measurement,academic_year:event.target.value})} className={field}><option value="">{ar?'اختر العام':'Select year'}</option>{options.data?.academic_years.map(year=><option key={year.code} value={year.code}>{year.code}{year.is_current?(ar?' — الحالي':' — Current'):''}</option>)}</select></Label>
        <Label text={ar?'النتيجة الرقمية':'Numeric result'}><input required type="number" step="any" value={measurement.numeric_value} onChange={event=>setMeasurement({...measurement,numeric_value:event.target.value})} className={field}/></Label>
        <Label text={ar?'النتيجة المعروضة':'Display result'}><input required value={measurement.display_value} onChange={event=>setMeasurement({...measurement,display_value:event.target.value})} className={field}/></Label>
      </div>
      <Label text={ar?'الدليل أو مرجع البيانات':'Evidence or data reference'}><textarea required rows={3} value={measurement.evidence} onChange={event=>setMeasurement({...measurement,evidence:event.target.value})} className={field}/></Label>
      {record.isError&&<p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
      <Actions ar={ar} loading={record.isPending} close={()=>setMeasuring(null)}/>
    </form>
  </Modal>
  <Modal isOpen={Boolean(reviewing)} onClose={()=>setReviewing(null)} title={reviewing?.decision==='approved'?(ar?'اعتماد القياس':'Approve measurement'):(ar?'إعادة القياس للتصحيح':'Return measurement')}>
    <form onSubmit={(event:FormEvent)=>{event.preventDefault();review.mutate();}} className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-3 text-sm"><strong>{reviewing?.kpi.name}</strong><p className="mt-1">{ar?'النتيجة':'Result'}: {reviewing?.kpi.latest_measurement?.display_value}</p><p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{reviewing?.kpi.latest_measurement?.evidence || (ar?'لم يُسجل دليل.':'No evidence recorded.')}</p></div>
      <Label text={ar?'ملاحظة المراجعة':'Review note'}><textarea required={reviewing?.decision==='returned'} rows={3} value={reviewNotes} onChange={event=>setReviewNotes(event.target.value)} className={field}/></Label>
      {review.isError&&<p role="alert" className="text-sm font-bold text-red-600">{error}</p>}
      <Actions ar={ar} loading={review.isPending} close={()=>setReviewing(null)}/>
    </form>
  </Modal>
 </div>;
}

function KpiCard({kpi,ar,manage,measuring,review}:{kpi:Kpi;ar:boolean;manage:boolean;measuring:()=>void;review:(decision:'approved'|'returned')=>void}) {
 const latest=kpi.latest_measurement;
 const status=latest?.achievement_status||'not_assessed';
 const primaryStatus=latest?.review_status==='approved' ? achievement[status]?.[ar?0:1] : latest ? reviewText[latest.review_status]?.[ar?0:1] : achievement.not_assessed[ar?0:1];
 const history=(kpi.measurements||[]).filter(item=>item.review_status==='approved'&&item.numeric_value!==null&&item.numeric_value!==undefined).reverse();
 return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-teal-700">{kpi.code}{kpi.category?` · ${kpi.category}`:''}</p><h2 className="mt-1 break-words text-sm font-black text-slate-900">{kpi.name}</h2></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">{primaryStatus||status}</span></div>
  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs"><span className="text-slate-500">{ar?'المستهدف':'Target'}: <strong className="text-slate-900">{kpi.target_value||'—'}</strong></span><span className="text-slate-500">{ar?'آخر نتيجة':'Latest'}: <strong className="text-teal-800">{latest?.display_value||'—'}</strong></span></div>
  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">{latest?.measured_at&&<span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3"/>{dateOnly(latest.measured_at)}</span>}{kpi.responsible&&<span>{ar?'المسؤول':'Owner'}: {kpi.responsible}</span>}</div>
  {latest?.evidence&&<details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-bold text-teal-700">{ar?'عرض دليل القياس':'View measurement evidence'}</summary><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3">{latest.evidence}</p></details>}
  {history.length>=2&&<details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-bold text-teal-700">{ar?'اتجاه القياسات المعتمدة':'Approved measurement trend'}</summary><KpiTrend items={history} ar={ar}/></details>}
  {manage&&<div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{latest?.review_status==='submitted'&&<><Button size="sm" variant="outline" onClick={()=>review('returned')}><RotateCcw className="ms-1 h-4 w-4"/>{ar?'إعادة':'Return'}</Button><Button size="sm" onClick={()=>review('approved')}><ShieldCheck className="ms-1 h-4 w-4"/>{ar?'اعتماد':'Approve'}</Button></>}<Button size="sm" variant="outline" onClick={measuring}><CheckCircle2 className="ms-1 h-4 w-4"/>{ar?'تسجيل قياس':'Record'}</Button></div>}
 </article>;
}
function KpiTrend({items,ar}:{items:Measurement[];ar:boolean}) {
 const values=items.map(item=>Number(item.numeric_value));const min=Math.min(...values),max=Math.max(...values),range=max-min||1;
 const points=values.map((value,index)=>`${12+(index/(values.length-1))*236},${68-((value-min)/range)*52}`).join(' ');
 return <div className="mt-2 rounded-xl bg-slate-50 p-3"><svg role="img" aria-label={ar?'اتجاه القياسات المعتمدة':'Approved measurement trend'} viewBox="0 0 260 80" className="h-20 w-full" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>{values.map((value,index)=><circle key={items[index].id} cx={12+(index/(values.length-1))*236} cy={68-((value-min)/range)*52} r="3" fill="#0f766e"/>)}</svg><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">{items.map(item=><span key={item.id}>{dateOnly(item.measured_at)}: {item.display_value}</span>)}</div></div>;
}
function Label({text,children}:{text:string;children:ReactNode}){return <label><span className="mb-1 block text-xs font-bold">{text}</span>{children}</label>}
function Actions({ar,loading,close}:{ar:boolean;loading:boolean;close:()=>void}){return <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={close}>{ar?'إلغاء':'Cancel'}</Button><Button type="submit" isLoading={loading}>{ar?'حفظ':'Save'}</Button></div>}
