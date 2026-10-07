import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Copy, Eye, Lock, MessageSquarePlus, Pencil, Plus, Send, Settings2, Trash2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

type Question={id:number;question_text:string;question_type:string;options?:string|null;is_required:boolean;axis?:string|null};
type Survey={id:number;public_id:string;title:string;target_group:string;purpose?:string;status:string;is_anonymous:boolean;response_policy:string;submissions_count?:number;questions:Question[]};
const blank={question_text:'',question_type:'rating',options:'',is_required:true,axis:''};
const field='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100';
const types:Record<string,[string,string]>={rating:['مقياس خطي 1–5','Linear scale 1–5'],single_choice:['اختيار من متعدد','Multiple choice'],multiple_choice:['مربعات اختيار','Checkboxes'],short_text:['إجابة قصيرة','Short answer'],long_text:['فقرة','Paragraph'],number:['رقم','Number']};

export function SurveyDetailsPage(){
 const{id}=useParams();const{can}=useAuth();const{locale}=useI18n();const ar=locale==='ar';const qc=useQueryClient();
 const[editor,setEditor]=useState<Question|null|undefined>();const[form,setForm]=useState(blank);const[settings,setSettings]=useState(false);const[copied,setCopied]=useState(false);const[copyFailed,setCopyFailed]=useState(false);
 const query=useQuery({queryKey:['quality-survey',id],queryFn:()=>apiFetch<Survey>(`/quality-surveys/${id}`)});const refresh=()=>qc.invalidateQueries({queryKey:['quality-survey',id]});
 const save=useMutation({mutationFn:()=>editor?apiFetch(`/quality-surveys/${id}/questions/${editor.id}`,{method:'PUT',body:form}):apiFetch(`/quality-surveys/${id}/questions`,{method:'POST',body:form}),onSuccess:async()=>{await refresh();setEditor(undefined);setForm(blank)}});
 const remove=useMutation({mutationFn:(qid:number)=>apiFetch(`/quality-surveys/${id}/questions/${qid}`,{method:'DELETE'}),onSuccess:refresh});
 const transition=useMutation({mutationFn:(status:string)=>apiFetch(`/quality-surveys/${id}/transition`,{method:'POST',body:{status}}),onSuccess:refresh});
 const updatePolicy=useMutation({mutationFn:(response_policy:string)=>{const s=query.data!;return apiFetch(`/quality-surveys/${id}`,{method:'PUT',body:{title:s.title,target_group:s.target_group,purpose:s.purpose||null,is_anonymous:s.is_anonymous,response_policy}})},onSuccess:async()=>{await refresh();setSettings(false)}});
 if(query.isLoading)return <LoadingState/>;if(query.isError||!query.data)return <ErrorState/>;const s=query.data;const url=`${window.location.origin}/survey/${s.public_id}`;const canEditQuestions=can('quality.manage')&&!s.submissions_count;
 const edit=(q:Question)=>{setForm({question_text:q.question_text,question_type:q.question_type,options:q.options||'',is_required:q.is_required,axis:q.axis||''});setEditor(q)};
 return <div className="survey-editor-shell mx-auto w-full max-w-5xl space-y-4 pb-16 sm:space-y-5">
  <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="p-4 sm:p-6">
      <Link to="/quality/surveys" className="text-xs font-bold text-teal-700">← {ar?'الاستبيانات':'Surveys'}</Link>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><h1 className="break-words text-xl font-black text-slate-900 sm:text-2xl">{s.title}</h1><p className="mt-1 text-xs text-slate-500">{s.purpose||s.target_group}</p></div>
        <div className="flex flex-wrap gap-2">
          {s.status==='open'&&<><a href={`/survey/${s.public_id}`} target="_blank" rel="noopener noreferrer"><Button variant="outline"><Eye className="ml-1 h-4 w-4"/>{ar?'عرض':'Preview'}</Button></a><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);setCopyFailed(false)}catch{setCopied(false);setCopyFailed(true)}}}><Copy className="ml-1 h-4 w-4"/>{copied?(ar?'تم النسخ':'Copied'):(ar?'نسخ الرابط':'Copy link')}</Button></>}
          {can('quality.manage')&&s.status==='draft'&&<Button onClick={()=>transition.mutate('open')} isLoading={transition.isPending}><Send className="ml-1 h-4 w-4"/>{ar?'نشر':'Publish'}</Button>}
          {can('quality.manage')&&s.status==='open'&&<Button variant="outline" onClick={()=>transition.mutate('closed')} isLoading={transition.isPending}><Lock className="ml-1 h-4 w-4"/>{ar?'إيقاف الردود':'Stop responses'}</Button>}
          {can('quality.manage')&&s.status==='closed'&&<Button variant="outline" onClick={()=>transition.mutate('open')} isLoading={transition.isPending}>{ar?'إعادة فتح':'Reopen'}</Button>}
        </div>
      </div>
      {copyFailed&&<label className="mt-3 block text-xs font-bold text-slate-600">{ar?'انسخ الرابط يدويًا':'Copy the link manually'}<input readOnly onFocus={event=>event.currentTarget.select()} value={url} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs font-normal"/></label>}
      {transition.isError&&<p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">{transition.error instanceof ApiError?transition.error.message:(ar?'تعذر تغيير حالة الاستبيان.':'Unable to change survey status.')}</p>}
    </div>
    <nav aria-label={ar?'أقسام الاستبيان':'Survey sections'} className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 sm:px-5">
      <span className="shrink-0 border-b-2 border-teal-600 px-3 py-3 text-xs font-black text-teal-700 sm:text-sm">{ar?'الأسئلة':'Questions'} ({s.questions.length})</span>
      <Link to={`/quality/surveys/${s.id}/responses`} className="shrink-0 px-3 py-3 text-xs font-bold text-slate-500 sm:text-sm">{ar?'الردود':'Responses'}</Link>
      {can('quality.manage')&&<button type="button" onClick={()=>setSettings(true)} className="shrink-0 px-3 py-3 text-xs font-bold text-slate-500 sm:text-sm"><Settings2 className="ml-1 inline h-4 w-4"/>{ar?'إعدادات الردود':'Response settings'}</button>}
    </nav>
  </header>
  <section className="space-y-3">
    {!!s.submissions_count&&<p className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">{ar?'الأسئلة مقفلة بعد أول رد حفاظًا على اتساق النتائج. أنشئ استبيانًا جديدًا لتغييرها.':'Questions are locked after the first response to preserve results. Create a new survey to change them.'}</p>}
    {!s.questions.length&&<div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><MessageSquarePlus className="mx-auto h-8 w-8 text-teal-600"/><h2 className="mt-3 text-sm font-black">{ar?'أضف أول سؤال':'Add your first question'}</h2></div>}
    {s.questions.map((q,index)=><article key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-xs font-black text-teal-700">{index+1}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words text-sm font-black text-slate-900">{q.question_text}{q.is_required&&<span className="ms-1 text-red-500">*</span>}</h2><span className="text-[10px] font-bold text-slate-500">{types[q.question_type]?.[ar?0:1]}</span></div>
          {q.axis&&<p className="mt-2 text-xs text-slate-500">{q.axis}</p>}
          {q.options&&<div className="mt-3 flex flex-wrap gap-2">{q.options.split(/[,\n]/).filter(Boolean).map(option=><span key={option} className="rounded-lg border border-slate-200 px-2 py-1 text-xs">{option}</span>)}</div>}
        </div>
        {canEditQuestions&&<div className="flex shrink-0"><button type="button" aria-label={ar?'تعديل السؤال':'Edit question'} onClick={()=>edit(q)} className="rounded-lg p-2 text-slate-500 hover:bg-teal-50 hover:text-teal-700"><Pencil className="h-4 w-4"/></button><button type="button" aria-label={ar?'حذف السؤال':'Delete question'} onClick={()=>confirm(ar?'حذف السؤال؟':'Delete question?')&&remove.mutate(q.id)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></div>}
      </div>
    </article>)}
    {remove.isError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-bold text-red-700">{remove.error instanceof ApiError?remove.error.message:(ar?'تعذر حذف السؤال.':'Unable to delete question.')}</p>}
    {canEditQuestions&&<button type="button" onClick={()=>{setForm(blank);setEditor(null)}} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-300 bg-teal-50/40 p-4 text-sm font-black text-teal-700"><Plus className="h-5 w-5"/>{ar?'إضافة سؤال':'Add question'}</button>}
  </section>
  <QuestionModal ar={ar} open={editor!==undefined} editing={Boolean(editor)} form={form} setForm={setForm} close={()=>setEditor(undefined)} save={()=>save.mutate()} loading={save.isPending} error={save.error}/>
  <Modal isOpen={settings} onClose={()=>setSettings(false)} title={ar?'إعدادات الردود':'Response settings'}>
    <div className="space-y-3">
      <label><span className="mb-1 block text-xs font-bold">{ar?'سياسة الردود':'Response policy'}</span><select value={s.response_policy||'multiple'} onChange={event=>updatePolicy.mutate(event.target.value)} disabled={updatePolicy.isPending} className={field}><option value="multiple">{ar?'السماح بأكثر من رد':'Allow multiple responses'}</option><option value="one_per_device">{ar?'رد واحد لكل جهاز/متصفح':'One response per device/browser'}</option><option value="one_per_identifier">{ar?'رد واحد لكل رقم أو معرّف':'One response per identifier'}</option></select></label>
      {updatePolicy.isPending&&<p className="text-xs text-slate-500">{ar?'جارٍ الحفظ...':'Saving...'}</p>}
      {updatePolicy.isError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{updatePolicy.error instanceof ApiError?updatePolicy.error.message:(ar?'تعذر حفظ الإعدادات.':'Unable to save settings.')}</p>}
      <p className="text-xs leading-5 text-slate-500">{ar?'تقييد الجهاز يعتمد على بيانات هذا المتصفح ويمكن تجاوزه باستخدام جهاز آخر. رقم المجيب أكثر موثوقية إذا كان متاحًا.':'Device restriction depends on this browser and can be bypassed from another device. Use an official identifier when appropriate.'}</p>
    </div>
  </Modal>
 </div>;
}

// @ts-expect-error React Query exposes mutation errors as unknown; narrowed when rendered below.

function QuestionModal({ar,open,editing,form,setForm,close,save,loading,error}:{ar:boolean;open:boolean;editing:boolean;form:typeof blank;setForm:(v:typeof blank)=>void;close:()=>void;save:()=>void;loading:boolean;error:unknown}){return <Modal isOpen={open} onClose={close} title={editing?(ar?'تعديل السؤال':'Edit question'):(ar?'إضافة سؤال':'Add question')} maxWidth="2xl"><form onSubmit={(e:FormEvent)=>{e.preventDefault();save()}} className="space-y-4"><div className="grid gap-3 sm:grid-cols-[1fr_15rem]"><input autoFocus required value={form.question_text} onChange={e=>setForm({...form,question_text:e.target.value})} className={field} placeholder={ar?'اكتب السؤال':'Question'}/><select value={form.question_type} onChange={e=>setForm({...form,question_type:e.target.value})} className={field}>{Object.entries(types).map(([k,v])=><option key={k} value={k}>{v[ar?0:1]}</option>)}</select></div>{['single_choice','multiple_choice'].includes(form.question_type)&&<textarea required rows={5} value={form.options} onChange={e=>setForm({...form,options:e.target.value})} className={field} placeholder={ar?'كل خيار في سطر':'One option per line'}/>}<input value={form.axis} onChange={e=>setForm({...form,axis:e.target.value})} className={field} placeholder={ar?'القسم أو المحور (اختياري)':'Section (optional)'}/><label className="flex justify-between rounded-xl border p-3 text-sm font-bold">{ar?'مطلوب':'Required'}<input type="checkbox" checked={form.is_required} onChange={e=>setForm({...form,is_required:e.target.checked})}/></label>{error&&<p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{(error as ApiError).message}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>{ar?'إلغاء':'Cancel'}</Button><Button type="submit" isLoading={loading}>{ar?'حفظ':'Save'}</Button></div></form></Modal>}
