import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, apiFetch } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import hebronLogo from '@/assets/hebron.png';
import {
  AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock3, GraduationCap,
  LockKeyhole, Mail, MapPin, RefreshCw, ShieldCheck, Stethoscope, UserRound,
  UsersRound,
} from 'lucide-react';

type ScheduleItem = {
  course: { code:string|null; name_ar:string|null; name_en:string|null } | null;
  academic_year:string|null;
  block:{block_code:string;from_week:number;to_week:number;start_date:string|null;end_date:string|null}|null;
  training_site:{name:string;name_ar:string|null;name_en:string|null}|null;
  department:{name:string;name_ar:string|null;name_en:string|null}|null;
  supervisor:{name:string;full_name_ar:string|null;full_name_en:string|null}|null;
};
type StudentSchedule = {
  student:{name:string;name_en:string|null;university_number:string;academic_level:string};
  group:{name:string}|null;
  subgroup:{name:string}|null;
  members:{name:string;name_en:string|null;is_current_student:boolean}[];
  schedule:ScheduleItem[];
};

const levelNames:Record<string,string>={fourth:'السنة الرابعة',fifth:'السنة الخامسة',sixth:'السنة السادسة'};
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat('ar-PS',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T00:00:00`)):'—';

export function PublicClinicalSchedulePage() {
  const [number,setNumber]=useState('');
  const [challenge,setChallenge]=useState('');
  const [otp,setOtp]=useState('');
  const [emailHint,setEmailHint]=useState('');
  const [accessToken,setAccessToken]=useState('');
  const [data,setData]=useState<StudentSchedule|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [otpSeconds,setOtpSeconds]=useState(0);

  useEffect(()=>{
    if(!challenge||accessToken||otpSeconds<=0)return;
    const timer=window.setInterval(()=>setOtpSeconds(value=>Math.max(0,value-1)),1000);
    return()=>window.clearInterval(timer);
  },[challenge,accessToken,otpSeconds]);

  const fail=(exception:unknown)=>{
    setMessage('');
    setError(exception instanceof ApiError?exception.message:'تعذر إتمام العملية. يرجى المحاولة لاحقاً.');
  };
  const requestOtp=async(event?:FormEvent)=>{
    event?.preventDefault();
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      const response=await apiFetch<{challenge_token:string;email_hint:string;expires_in_seconds:number}>('/public/student-schedule/request-otp',{method:'POST',body:{university_number:number.trim()}});
      setChallenge(response.challenge_token);setEmailHint(response.email_hint);setOtp('');setOtpSeconds(response.expires_in_seconds);
      setMessage('تم إرسال رمز التحقق إلى بريدك الجامعي.');
    }catch(exception){fail(exception)}finally{setBusy(false)}
  };
  const verify=async(event:FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      const verified=await apiFetch<{access_token:string}>('/public/student-schedule/verify-otp',{method:'POST',body:{challenge_token:challenge,otp}});
      setAccessToken(verified.access_token);
      const schedule=await apiFetch<StudentSchedule>('/public/student-schedule',{method:'POST',body:{access_token:verified.access_token}});
      setData(schedule);setMessage('تم التحقق من هويتك وتحميل جدولك المنشور.');
    }catch(exception){fail(exception)}finally{setBusy(false)}
  };
  const reset=()=>{setNumber('');setChallenge('');setOtp('');setEmailHint('');setAccessToken('');setData(null);setError('');setMessage('');setOtpSeconds(0)};
  const timer=`${String(Math.floor(otpSeconds/60)).padStart(2,'0')}:${String(otpSeconds%60).padStart(2,'0')}`;

  return <main dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top,_#dff7f3_0,_#f8fafc_40%,_#f8fafc_100%)] px-3 py-4 text-slate-900 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-4xl space-y-4 sm:space-y-5">
      <header className="overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-xl shadow-slate-200/50 backdrop-blur">
        <div className="h-1.5 bg-gradient-to-l from-[#1f6f78] via-teal-500 to-[#2f5a86]"/>
        <div className="p-5 text-center sm:p-7">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white p-2 shadow-md"><img src={hebronLogo} alt="جامعة الخليل" className="h-full w-full object-contain"/></div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-bold text-teal-700"><ShieldCheck className="h-4 w-4"/>بوابة آمنة عبر البريد الجامعي</div>
          <h1 className="text-xl font-black sm:text-3xl">جدولي السريري</h1>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-6 text-slate-500 sm:text-sm">تحقق من موقع دوامك، المساق، الفترة، مجموعتك، زملائك والمشرف السريري من آخر جدول منشور.</p>
        </div>
      </header>

      {error&&<div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}
      {message&&<div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/><span>{message}</span></div>}

      {!challenge&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={requestOtp} className="space-y-4"><div><div className="mb-2 flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-600"/><label className="text-sm font-black">أدخل رقمك الجامعي</label></div><p className="mb-3 text-xs leading-5 text-slate-500">لن تظهر أي بيانات قبل التحقق. سنرسل رمزًا من 6 أرقام إلى بريدك الجامعي.</p><input required autoFocus inputMode="numeric" pattern="[0-9]+" value={number} onChange={event=>setNumber(event.target.value.replace(/\D/g,''))} className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center font-mono text-xl font-bold tracking-wider outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="مثال: 22210466"/></div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold hover:bg-teal-700" isLoading={busy}><Mail className="ml-2 h-5 w-5"/>إرسال رمز التحقق</Button></form></Card>}

      {challenge&&!accessToken&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={verify} className="space-y-4"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Mail className="h-6 w-6"/></div><h2 className="font-black">تحقق من بريدك الجامعي</h2><p className="mt-2 text-xs leading-5 text-slate-500">أرسلنا الرمز إلى <b dir="ltr">{emailHint}</b></p></div><input required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,''))} className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center font-mono text-2xl font-black tracking-[.35em] outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="000000"/><div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${otpSeconds?'text-slate-500':'text-red-600'}`}><Clock3 className="h-4 w-4"/>{otpSeconds?`صلاحية الرمز: ${timer}`:'انتهت صلاحية الرمز'}</div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold" isLoading={busy} disabled={otp.length!==6||otpSeconds===0}><LockKeyhole className="ml-2 h-5 w-5"/>التحقق وعرض الجدول</Button><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={reset}>تغيير الرقم</Button><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={()=>requestOtp()} disabled={busy||otpSeconds>0}><RefreshCw className="ml-1 h-4 w-4"/>إرسال رمز جديد</Button></div></form></Card>}

      {data&&<section className="space-y-4">
        <Card className="rounded-[28px] border border-slate-200 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#2f5a86] text-white"><GraduationCap className="h-6 w-6"/></div><div><h2 className="text-lg font-black">{data.student.name}</h2><p className="mt-1 text-xs text-slate-500"><span className="font-mono">{data.student.university_number}</span> · {levelNames[data.student.academic_level]||data.student.academic_level}</p></div></div><Button variant="outline" className="rounded-xl text-xs" onClick={reset}>استعلام لطالب آخر</Button></div></Card>

        <div className="grid gap-4 md:grid-cols-[.8fr_1.2fr]">
          <Card className="rounded-[28px] border border-slate-200 p-5"><div className="mb-4 flex items-center gap-2"><UsersRound className="h-5 w-5 text-teal-600"/><h2 className="font-black">المجموعة والزملاء</h2></div>{data.subgroup?<><div className="mb-4 rounded-2xl bg-gradient-to-l from-teal-600 to-[#1f6f78] p-4 text-white"><p className="text-xs text-teal-50">المجموعة الرئيسية</p><p className="mt-1 text-2xl font-black">{data.group?.name||'—'} <span className="text-base font-bold text-teal-100">/ {data.subgroup.name}</span></p></div><div className="space-y-2">{data.members.map((member,index)=><div key={`${member.name}-${index}`} className={`flex items-center gap-3 rounded-xl border p-3 ${member.is_current_student?'border-teal-200 bg-teal-50':'border-slate-100 bg-slate-50'}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${member.is_current_student?'bg-teal-600 text-white':'bg-white text-slate-500'}`}>{index+1}</div><span className="text-sm font-bold text-slate-700">{member.name}</span>{member.is_current_student&&<span className="mr-auto rounded-full bg-white px-2 py-1 text-[10px] font-black text-teal-700">أنت</span>}</div>)}</div></>:<p className="rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-6 text-amber-800">لا توجد مجموعة مثبتة لك ضمن الجدول المنشور حالياً.</p>}</Card>

          <div className="space-y-3"><div className="flex items-center gap-2 px-1"><CalendarDays className="h-5 w-5 text-[#2f5a86]"/><h2 className="font-black">فترات الدوام المنشورة</h2><span className="mr-auto rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#2f5a86]">{data.schedule.length}</span></div>{data.schedule.length===0?<Card className="rounded-[28px] border border-dashed border-slate-300 p-8 text-center"><CalendarDays className="mx-auto h-10 w-10 text-slate-300"/><h3 className="mt-3 font-black">لا يوجد جدول منشور لك حالياً</h3><p className="mt-2 text-xs leading-6 text-slate-500">قد تكون الدائرة السريرية ما زالت تعمل على التوزيع. يرجى المراجعة لاحقاً أو التواصل مع الإدارة.</p></Card>:data.schedule.map((item,index)=><Card key={`${item.block?.block_code}-${index}`} className="rounded-[26px] border border-slate-200 p-5"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold text-teal-600">{item.course?.code||'مساق سريري'} · {item.academic_year||''}</p><h3 className="mt-1 text-lg font-black">{item.course?.name_ar||item.course?.name_en||'الدورة السريرية'}</h3></div><span className="shrink-0 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-[#2f5a86]">{item.block?.block_code||'—'}</span></div><div className="grid gap-2 text-xs sm:grid-cols-2"><div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"/><div><p className="text-slate-400">المستشفى / الموقع</p><p className="mt-1 font-black text-slate-700">{item.training_site?.name_ar||item.training_site?.name||'—'}</p></div></div><div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3"><Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"/><div><p className="text-slate-400">المشرف السريري</p><p className="mt-1 font-black text-slate-700">{item.supervisor?.full_name_ar||item.supervisor?.name||'شاغر'}</p></div></div><div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 sm:col-span-2"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"/><div><p className="text-slate-400">الفترة</p><p className="mt-1 font-black text-slate-700">الأسبوع {item.block?.from_week||'—'} إلى {item.block?.to_week||'—'} · {formatDate(item.block?.start_date||null)} — {formatDate(item.block?.end_date||null)}</p></div></div></div></Card>)}</div>
        </div>
        <div className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-[11px] leading-5 text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600"/><p>هذه البيانات خاصة بالطالب صاحب البريد الجامعي. تنتهي جلسة العرض تلقائياً، ولا يتم تخزين رمز الدخول في المتصفح.</p></div>
      </section>}

      <footer className="py-3 text-center text-[11px] text-slate-400">جامعة الخليل — كلية الطب — الدائرة السريرية</footer>
    </div>
  </main>;
}
