import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import hebronLogo from '@/assets/hebron.png';
import {
  AlertTriangle, ArrowLeftRight, Check, CheckCircle2, Clock3, GraduationCap,
  Lock, LogOut, Mail, RefreshCw, ShieldCheck, Sparkles, UserRound, Users,
} from 'lucide-react';

type CycleInfo = { public_id:string; academic_level:string; academic_year:string; status:'open'|'closed' };
type SubgroupOption = {id:number;name:string;capacity:number;occupied:number;available:number;is_full:boolean;is_selected:boolean};
type Options = {student:{name:string;university_number:string;academic_level:string};main_group:string;subgroups:SubgroupOption[]};
const levelName:Record<string,string>={fourth:'السنة الرابعة',fifth:'السنة الخامسة',sixth:'السنة السادسة'};

export function PublicStudentRegistrationPage() {
  const { publicId } = useParams();
  const [cycle,setCycle]=useState<CycleInfo|null>(null);
  const [number,setNumber]=useState(''),[challenge,setChallenge]=useState(''),[otp,setOtp]=useState(''),[emailHint,setEmailHint]=useState(''),[accessToken,setAccessToken]=useState('');
  const [options,setOptions]=useState<Options|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[otpSeconds,setOtpSeconds]=useState(0);

  useEffect(()=>{
    if(!publicId){setError('رابط التسجيل غير مكتمل. يرجى استخدام الرابط الصادر عن إدارة الدائرة السريرية.');return;}
    apiFetch<CycleInfo>(`/public/group-registration/${publicId}`).then(setCycle).catch(()=>setError('رابط التسجيل غير صالح أو لم يعد متاحاً.'));
  },[publicId]);
  useEffect(()=>{
    if(!challenge||accessToken||otpSeconds<=0)return;
    const timer=window.setInterval(()=>setOtpSeconds(value=>Math.max(0,value-1)),1000);
    return()=>window.clearInterval(timer);
  },[challenge,accessToken,otpSeconds]);

  const selected=useMemo(()=>options?.subgroups.find(group=>group.is_selected)??null,[options]);
  const fail=(e:unknown)=>{setMessage('');setError(e instanceof ApiError?e.message:'تعذر إتمام العملية. يرجى المحاولة لاحقاً.');};
  const requestOtp=async(e?:FormEvent)=>{e?.preventDefault();if(!publicId||busy)return;setBusy(true);setError('');setMessage('');try{const r=await apiFetch<{challenge_token:string;email_hint:string;expires_in_seconds:number}>(`/public/group-registration/${publicId}/request-otp`,{method:'POST',body:{university_number:number.trim()}});setChallenge(r.challenge_token);setEmailHint(r.email_hint);setOtp('');setOtpSeconds(r.expires_in_seconds);setMessage('تم إرسال رمز التحقق إلى بريدك الجامعي.');}catch(err){fail(err)}finally{setBusy(false)}};
  const verify=async(e:FormEvent)=>{e.preventDefault();if(!publicId)return;setBusy(true);setError('');setMessage('');try{const r=await apiFetch<{access_token:string}>(`/public/group-registration/${publicId}/verify-otp`,{method:'POST',body:{challenge_token:challenge,otp}});setAccessToken(r.access_token);const data=await apiFetch<Options>(`/public/group-registration/${publicId}/options`,{method:'POST',body:{access_token:r.access_token}});setOptions(data);setMessage('تم التحقق من هويتك بنجاح. يمكنك الآن اختيار مجموعتك.');}catch(err){fail(err)}finally{setBusy(false)}};
  const refresh=async()=>{if(publicId&&accessToken)setOptions(await apiFetch<Options>(`/public/group-registration/${publicId}/options`,{method:'POST',body:{access_token:accessToken}}));};
  const select=async(group:SubgroupOption)=>{if(!publicId||group.is_selected)return;const question=selected?`سيتم نقلك من ${selected.name} إلى ${group.name}. هل تريد المتابعة؟`:`هل تريد تأكيد التسجيل في المجموعة ${group.name}؟`;if(!confirm(question))return;setBusy(true);setError('');setMessage('');try{await apiFetch(`/public/group-registration/${publicId}/select`,{method:'POST',body:{access_token:accessToken,subgroup_id:group.id}});await refresh();setMessage(selected?`تم تغيير مجموعتك إلى ${group.name} بنجاح.`:`تم حجز مقعدك في ${group.name} بنجاح.`);}catch(err){fail(err)}finally{setBusy(false)}};
  const withdraw=async()=>{if(!publicId||!selected||!confirm(`هل أنت متأكد من الانسحاب من المجموعة ${selected.name}؟ سيصبح مقعدك متاحاً لطالب آخر.`))return;setBusy(true);setError('');setMessage('');try{await apiFetch(`/public/group-registration/${publicId}/withdraw`,{method:'POST',body:{access_token:accessToken}});await refresh();setMessage('تم الانسحاب من المجموعة. يمكنك اختيار مجموعة أخرى ما دامت فترة التسجيل مفتوحة.');}catch(err){fail(err)}finally{setBusy(false)}};
  const resetIdentity=()=>{setChallenge('');setOtp('');setEmailHint('');setAccessToken('');setOptions(null);setOtpSeconds(0);setError('');setMessage('');};
  const timer=`${String(Math.floor(otpSeconds/60)).padStart(2,'0')}:${String(otpSeconds%60).padStart(2,'0')}`;

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-3 py-4 text-slate-800 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-5">
      <header className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur">
        <div className="h-1.5 bg-teal-500"/>
        <div className="p-5 text-center sm:p-7">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white p-2 shadow-md"><img src={hebronLogo} alt="جامعة الخليل" className="h-full w-full object-contain"/></div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-bold text-teal-700"><ShieldCheck className="h-4 w-4"/>بوابة آمنة عبر البريد الجامعي</div>
          <h1 className="text-xl font-black sm:text-3xl">اختيار المجموعة السريرية</h1>
          {cycle&&<div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-3 py-1.5">{levelName[cycle.academic_level]}</span><span className="rounded-full bg-teal-50 px-3 py-1.5 text-teal-700">{cycle.academic_year}</span><span className={`rounded-full px-3 py-1.5 ${cycle.status==='open'?'bg-teal-50 text-teal-700':'bg-slate-50 text-slate-700'}`}>{cycle.status==='open'?'التسجيل مفتوح':'التسجيل مغلق'}</span></div>}
        </div>
      </header>

      {error&&<div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}
      {message&&<div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-bold text-teal-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/><span>{message}</span></div>}

      {cycle?.status==='closed'&&!options&&<Card className="rounded-[28px] p-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Lock/></div><h2 className="text-lg font-black">فترة التسجيل مغلقة حالياً</h2><p className="mt-2 text-sm leading-6 text-slate-500">للاستفسار أو معالجة حالة خاصة، يرجى التواصل مع إدارة الدائرة السريرية.</p></Card>}

      {cycle?.status==='open'&&!challenge&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={requestOtp} className="space-y-4"><div><div className="mb-2 flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-600"/><label className="text-sm font-black">أدخل رقمك الجامعي</label></div><p className="mb-3 text-xs leading-5 text-slate-500">سنرسل رمز تحقق من 6 أرقام إلى بريدك الجامعي المسجل.</p><input required autoFocus inputMode="numeric" pattern="[0-9]+" value={number} onChange={e=>setNumber(e.target.value.replace(/\D/g,''))} className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center font-mono text-xl font-bold tracking-wider outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="مثال: 22210466"/></div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold hover:bg-teal-700" isLoading={busy}><Mail className="ml-2 h-5 w-5"/>إرسال رمز التحقق</Button></form></Card>}

      {challenge&&!accessToken&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={verify} className="space-y-4"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Mail className="h-6 w-6"/></div><h2 className="font-black">تحقق من بريدك الجامعي</h2><p className="mt-2 text-xs leading-5 text-slate-500">أرسلنا الرمز إلى <b dir="ltr">{emailHint}</b></p></div><input required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center font-mono text-2xl font-black tracking-[.35em] outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="000000"/><div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${otpSeconds?'text-slate-500':'text-red-600'}`}><Clock3 className="h-4 w-4"/>{otpSeconds?`صلاحية الرمز: ${timer}`:'انتهت صلاحية الرمز'}</div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold" isLoading={busy} disabled={otp.length!==6||otpSeconds===0}>التحقق والمتابعة</Button><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={resetIdentity}>تغيير الرقم</Button><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={()=>requestOtp()} disabled={busy||otpSeconds>0}><RefreshCw className="ml-1 h-4 w-4"/>إرسال رمز جديد</Button></div></form></Card>}

      {options&&<section className="space-y-4">
        <Card className="rounded-[28px] border-slate-200 p-5"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white"><GraduationCap className="h-6 w-6"/></div><div className="min-w-0"><p className="truncate text-base font-black">{options.student.name}</p><p className="mt-1 text-xs text-slate-500"><span className="font-mono">{options.student.university_number}</span> · المجموعة الرئيسية <b className="text-teal-700">{options.main_group}</b></p></div></div></Card>

        {selected?<Card className="overflow-hidden rounded-[28px] border-2 border-teal-300 bg-teal-50 text-slate-800 shadow-sm"><div className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><div className="mb-2 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-1 text-[11px] font-bold"><Check className="h-3.5 w-3.5"/>مجموعتك الحالية</div><h2 className="text-3xl font-black">{selected.name}</h2><p className="mt-2 text-xs text-slate-500">تم تثبيت مقعدك بنجاح · {selected.occupied}/{selected.capacity} طلاب</p></div><Sparkles className="h-8 w-8 text-teal-500"/></div><Button variant="outline" className="mt-5 h-11 w-full rounded-xl border-teal-200 bg-white text-xs font-bold text-teal-700 hover:bg-teal-100" onClick={withdraw} disabled={busy}><LogOut className="ml-2 h-4 w-4"/>الانسحاب من المجموعة</Button></div></Card>:<div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs font-bold leading-6 text-teal-700">لم تختر مجموعة فرعية بعد. اختر مجموعة متاحة من القائمة أدناه.</div>}

        <div><div className="mb-3 flex items-center justify-between"><div><h2 className="font-black">المجموعات المتاحة</h2><p className="mt-1 text-xs text-slate-500">يمكنك تغيير مجموعتك مباشرة ما دام هناك مقعد متاح.</p></div><Users className="h-5 w-5 text-teal-600"/></div><div className="grid gap-3 sm:grid-cols-2">{options.subgroups.map(group=>{const percent=Math.min(100,(group.occupied/group.capacity)*100);return <Card key={group.id} className={`rounded-3xl p-5 transition ${group.is_selected?'border-2 border-teal-500 bg-teal-50/60':group.is_full?'border-slate-200 bg-slate-50':'border-slate-200 bg-white hover:border-teal-300'}`}><div className="flex items-start justify-between"><div><h3 className="text-2xl font-black">{group.name}</h3><p className="mt-1 text-xs text-slate-500">{group.occupied} من {group.capacity} مقاعد</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${group.is_selected?'bg-teal-600 text-white':group.is_full?'bg-red-100 text-red-700':'bg-teal-100 text-teal-700'}`}>{group.is_selected?'مجموعتك':group.is_full?'مكتملة':`${group.available} متاح`}</span></div><div className="my-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${group.is_full?'bg-red-400':'bg-teal-500'}`} style={{width:`${percent}%`}}/></div><Button className={`h-11 w-full rounded-xl text-xs font-bold ${!group.is_selected&&!group.is_full?'bg-teal-600 hover:bg-teal-700':''}`} variant={group.is_selected?'outline':'primary'} disabled={busy||group.is_full||group.is_selected} onClick={()=>select(group)}>{group.is_selected?<><Check className="ml-1 h-4 w-4"/>مجموعتك الحالية</>:group.is_full?'لا توجد مقاعد':selected?<><ArrowLeftRight className="ml-1 h-4 w-4"/>التغيير إلى {group.name}</>:'اختيار هذه المجموعة'}</Button></Card>})}</div></div>

        <Card className="rounded-2xl border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"/><p>حفاظًا على الخصوصية لا تعرض هذه الصفحة أسماء الطلبة الآخرين. تظهر الأسماء فقط لإدارة الدائرة السريرية داخل النظام.</p></div></Card>
      </section>}
    </div>
  </main>;
}
