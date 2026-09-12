import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import hebronLogo from '@/assets/hebron.png';
import { useI18n } from '@/i18n/I18nContext';
import {
  AlertTriangle, Check, CheckCircle2, Clock3, GraduationCap,
  Lock, LogOut, Mail, RefreshCw, UserRound,
} from 'lucide-react';

type CycleInfo = { public_id:string; academic_level:string; academic_year:string; status:'open'|'closed'; otp_required:boolean };
type SubgroupOption = {id:number;name:string;capacity:number;occupied:number;available:number;is_full:boolean;is_selected:boolean};
type Options = {student:{name:string;university_number:string;academic_level:string};main_group:string;subgroups:SubgroupOption[]};
const levelName:Record<string,{ar:string;en:string}>={fourth:{ar:'السنة الرابعة',en:'Fourth year'},fifth:{ar:'السنة الخامسة',en:'Fifth year'},sixth:{ar:'السنة السادسة',en:'Sixth year'}};

export function PublicStudentRegistrationPage() {
  const {locale}=useI18n();const ar=locale==='ar';const tr=(arabic:string,english:string)=>ar?arabic:english;
  const { publicId } = useParams();
  const [cycle,setCycle]=useState<CycleInfo|null>(null);
  const [number,setNumber]=useState(''),[challenge,setChallenge]=useState(''),[otp,setOtp]=useState(''),[emailHint,setEmailHint]=useState(''),[accessToken,setAccessToken]=useState('');
  const [options,setOptions]=useState<Options|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[otpSeconds,setOtpSeconds]=useState(0);

  useEffect(()=>{
    if(!publicId){setError(tr('رابط التسجيل غير مكتمل. يرجى استخدام الرابط الصادر عن إدارة الدائرة السريرية.','The registration link is incomplete. Please use the link issued by the Clinical Department.'));return;}
    apiFetch<CycleInfo>(`/public/group-registration/${publicId}`).then(setCycle).catch(()=>setError(tr('رابط التسجيل غير صالح أو لم يعد متاحاً.','The registration link is invalid or no longer available.')));
  },[publicId,locale]);
  useEffect(()=>{
    if(!challenge||accessToken||otpSeconds<=0)return;
    const timer=window.setInterval(()=>setOtpSeconds(value=>Math.max(0,value-1)),1000);
    return()=>window.clearInterval(timer);
  },[challenge,accessToken,otpSeconds]);

  const selected=useMemo(()=>options?.subgroups.find(group=>group.is_selected)??null,[options]);
  const fail=(e:unknown)=>{
    setMessage('');
    if (!(e instanceof ApiError)) {
      setError(tr('تعذر إتمام العملية. يرجى المحاولة لاحقاً.','The operation could not be completed. Please try again later.'));
      return;
    }
    if (e.status === 0) {
      setError(tr('تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حاول مرة أخرى.','Could not connect to the server. Check your internet connection and try again.'));
      return;
    }
    if (e.status === 429) {
      setError(tr('تم إرسال طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم حاول مرة أخرى.','Too many requests were sent. Wait a moment and try again.'));
      return;
    }
    const englishFallback = /^[\x00-\x7F\s.,'!?():-]+$/.test(e.message);
    setError(englishFallback && ar ? 'تعذر إتمام العملية حالياً. يرجى المحاولة مرة أخرى.' : e.message);
  };
  const requestOtp=async(e?:FormEvent)=>{e?.preventDefault();if(!publicId||busy)return;setBusy(true);setError('');setMessage('');try{const r=await apiFetch<{otp_required:boolean;challenge_token?:string;email_hint?:string;expires_in_seconds:number;access_token?:string}>(`/public/group-registration/${publicId}/request-otp`,{method:'POST',body:{university_number:number.trim()}});if(r.otp_required===false&&r.access_token){setAccessToken(r.access_token);const data=await apiFetch<Options>(`/public/group-registration/${publicId}/options`,{method:'POST',body:{access_token:r.access_token}});setOptions(data);setMessage(tr('وضع الفحص المؤقت فعال: تم الدخول دون إرسال رمز بريدي.','Temporary test mode is active: access granted without sending an email code.'));return;}setChallenge(r.challenge_token??'');setEmailHint(r.email_hint??'');setOtp('');setOtpSeconds(r.expires_in_seconds);setMessage(tr('تم إرسال رمز التحقق إلى بريدك الجامعي.','A verification code was sent to your university email.'));}catch(err){fail(err)}finally{setBusy(false)}};
  const verify=async(e:FormEvent)=>{e.preventDefault();if(!publicId)return;setBusy(true);setError('');setMessage('');try{const r=await apiFetch<{access_token:string}>(`/public/group-registration/${publicId}/verify-otp`,{method:'POST',body:{challenge_token:challenge,otp}});setAccessToken(r.access_token);const data=await apiFetch<Options>(`/public/group-registration/${publicId}/options`,{method:'POST',body:{access_token:r.access_token}});setOptions(data);setMessage(tr('تم التحقق من هويتك بنجاح. يمكنك الآن اختيار مجموعتك.','Identity verified. You can now choose your group.'));}catch(err){fail(err)}finally{setBusy(false)}};
  const refresh=async()=>{if(publicId&&accessToken)setOptions(await apiFetch<Options>(`/public/group-registration/${publicId}/options`,{method:'POST',body:{access_token:accessToken}}));};
  const select=async(group:SubgroupOption)=>{if(!publicId||group.is_selected)return;const question=selected?tr(`سيتم نقلك من ${selected.name} إلى ${group.name}. هل تريد المتابعة؟`,`You will be moved from ${selected.name} to ${group.name}. Continue?`):tr(`هل تريد تأكيد التسجيل في المجموعة ${group.name}؟`,`Confirm registration in group ${group.name}?`);if(!confirm(question))return;setBusy(true);setError('');setMessage('');try{await apiFetch(`/public/group-registration/${publicId}/select`,{method:'POST',body:{access_token:accessToken,subgroup_id:group.id}});await refresh();setMessage(selected?tr(`تم تغيير مجموعتك إلى ${group.name} بنجاح.`,`Your group was changed to ${group.name}.`):tr(`تم حجز مقعدك في ${group.name} بنجاح.`,`Your place in ${group.name} has been reserved.`));}catch(err){fail(err)}finally{setBusy(false)}};
  const withdraw=async()=>{if(!publicId||!selected||!confirm(tr(`هل أنت متأكد من الانسحاب من المجموعة ${selected.name}؟ سيصبح مقعدك متاحاً لطالب آخر.`,`Withdraw from ${selected.name}? Your place will become available to another student.`)))return;setBusy(true);setError('');setMessage('');try{await apiFetch(`/public/group-registration/${publicId}/withdraw`,{method:'POST',body:{access_token:accessToken}});await refresh();setMessage(tr('تم الانسحاب من المجموعة. يمكنك اختيار مجموعة أخرى ما دامت فترة التسجيل مفتوحة.','You have withdrawn from the group. You may choose another group while registration remains open.'));}catch(err){fail(err)}finally{setBusy(false)}};
  const resetIdentity=()=>{setChallenge('');setOtp('');setEmailHint('');setAccessToken('');setOptions(null);setOtpSeconds(0);setError('');setMessage('');};
  const timer=`${String(Math.floor(otpSeconds/60)).padStart(2,'0')}:${String(otpSeconds%60).padStart(2,'0')}`;

  return <main className="min-h-screen bg-slate-100 px-3 py-3 text-slate-800 sm:px-6 sm:py-6">
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5"><img src={hebronLogo} alt={tr('جامعة الخليل','Hebron University')} className="h-full w-full object-contain"/></div>
          <div className="min-w-0 flex-1"><h1 className="text-base font-black sm:text-lg">{tr('اختيار المجموعة السريرية','Clinical Group Selection')}</h1>{cycle&&<p className="mt-1 text-[11px] text-slate-500">{levelName[cycle.academic_level]?.[locale]||cycle.academic_level} · {cycle.academic_year}</p>}</div>
          {cycle&&<span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${cycle.status==='open'?'bg-teal-50 text-teal-700':'bg-slate-100 text-slate-600'}`}>{cycle.status==='open'?tr('مفتوح','Open'):tr('مغلق','Closed')}</span>}
        </div>
      </header>

      {error&&<div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}
      {message&&<div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-bold text-teal-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/><span>{message}</span></div>}

      {cycle?.status==='closed'&&!options&&<Card className="rounded-[28px] p-8 text-center"><div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><Lock/></div><h2 className="text-lg font-black">{tr('فترة التسجيل مغلقة حالياً','Registration is currently closed')}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{tr('للاستفسار أو معالجة حالة خاصة، يرجى التواصل مع إدارة الدائرة السريرية.','For inquiries or special cases, please contact the Clinical Department administration.')}</p></Card>}

      {cycle?.status==='open'&&!challenge&&!accessToken&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={requestOtp} className="space-y-4"><div><div className="mb-2 flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-600"/><label className="text-sm font-black">{tr('أدخل رقمك الجامعي','Enter your university number')}</label></div><p className="mb-3 text-xs leading-5 text-slate-500">{cycle.otp_required?tr('سنرسل رمز تحقق من 6 أرقام إلى بريدك الجامعي المسجل.','We will send a six-digit verification code to your registered university email.'):tr('وضع الفحص المؤقت فعال؛ لن يتم إرسال رمز إلى البريد.','Temporary test mode is active; no email code will be sent.')}</p><input required autoFocus inputMode="numeric" pattern="[0-9]+" value={number} onChange={e=>setNumber(e.target.value.replace(/\D/g,''))} className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center font-mono text-xl font-bold tracking-wider outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder={tr('مثال: 22210466','Example: 22210466')}/></div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold hover:bg-teal-700" isLoading={busy}>{cycle.otp_required?<><Mail className="me-2 h-5 w-5"/>{tr('إرسال رمز التحقق','Send verification code')}</>:<>{tr('متابعة الفحص','Continue test')}</>}</Button></form></Card>}

      {challenge&&!accessToken&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={verify} className="space-y-4"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Mail className="h-6 w-6"/></div><h2 className="font-black">{tr('تحقق من بريدك الجامعي','Check your university email')}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{tr('أرسلنا الرمز إلى','We sent the code to')} <b dir="ltr">{emailHint}</b></p></div><input required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center font-mono text-2xl font-black tracking-[.35em] outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="000000"/><div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${otpSeconds?'text-slate-500':'text-red-600'}`}><Clock3 className="h-4 w-4"/>{otpSeconds?tr(`صلاحية الرمز: ${timer}`,`Code expires in: ${timer}`):tr('انتهت صلاحية الرمز','The code has expired')}</div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold" isLoading={busy} disabled={otp.length!==6||otpSeconds===0}>{tr('التحقق والمتابعة','Verify and continue')}</Button><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={resetIdentity}>{tr('تغيير الرقم','Change number')}</Button><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={()=>requestOtp()} disabled={busy||otpSeconds>0}><RefreshCw className="me-1 h-4 w-4"/>{tr('إرسال رمز جديد','Send new code')}</Button></div></form></Card>}

      {options&&<section className="space-y-3">
        <Card className="rounded-2xl border border-slate-200 p-3 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><GraduationCap className="h-5 w-5"/></div><div className="min-w-0"><p className="truncate text-sm font-bold">{options.student.name}</p><p className="mt-0.5 text-[11px] text-slate-500"><span className="font-mono">{options.student.university_number}</span> · {tr('المجموعة الرئيسية','Main group')} <b>{options.main_group}</b></p></div></div></Card>

        <Card className="rounded-2xl border border-slate-200 shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5"><h2 className="text-sm font-black">{tr('المجموعات','Groups')}</h2>{selected&&<span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700"><Check className="h-3.5 w-3.5"/>{tr('مسجل في','Registered in')} {selected.name}</span>}</div><div className="divide-y divide-slate-100">{options.subgroups.map(group=>{const isCurrent=group.is_selected;return <div key={group.id} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5 ${isCurrent?'bg-teal-50/70':''}`}><div className="min-w-0"><div className="flex items-center gap-2"><span className="text-base font-black">{group.name}</span>{isCurrent&&<span className="rounded-full bg-teal-600 px-2 py-0.5 text-[9px] font-bold text-white">{tr('مجموعتك','Your group')}</span>}</div><p className="mt-0.5 text-[10px] text-slate-500">{group.occupied}/{group.capacity} {tr('طلاب','students')}</p></div><span className={`whitespace-nowrap text-[10px] font-bold ${group.is_full?'text-red-600':'text-teal-700'}`}>{group.is_full?tr('مكتملة','Full'):tr(`${group.available} متاح`,`${group.available} available`)}</span><div className="w-[72px] text-start">{selected?(isCurrent?<Button variant="danger" size="sm" className="h-8 w-full rounded-lg px-2 text-[11px]" onClick={withdraw} disabled={busy}><LogOut className="me-1 h-3.5 w-3.5"/>{tr('سحب','Withdraw')}</Button>:null):<Button size="sm" className="h-8 w-full rounded-lg px-2 text-[11px]" disabled={busy||group.is_full} onClick={()=>select(group)}>{group.is_full?tr('مغلق','Closed'):tr('تسجيل','Register')}</Button>}</div></div>})}</div></Card>
      </section>}
    </div>
  </main>;
}
