import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, apiFetch } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import hebronLogo from '@/assets/hebron.png';
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, GraduationCap,
  LockKeyhole, Mail, RefreshCw, ShieldCheck, UserRound,
  UsersRound,
} from 'lucide-react';

type ScheduleItem = {
  item_type?:'clinical'|'activity';
  activity?:{type:'lectures'|'break'|'exam';label:string|null}|null;
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

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-3 py-4 text-slate-800 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-4xl space-y-3 sm:space-y-5">
      <header className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-sm backdrop-blur sm:rounded-[28px] sm:shadow-xl sm:shadow-slate-200/50">
        <div className="h-1 bg-teal-500 sm:h-1.5"/>
        <div className="p-4 text-center sm:p-7">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm sm:mb-3 sm:h-16 sm:w-16 sm:rounded-2xl sm:p-2 sm:shadow-md"><img src={hebronLogo} alt="جامعة الخليل" className="h-full w-full object-contain"/></div>
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 sm:mb-2 sm:px-3 sm:py-1.5 sm:text-[11px]"><ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4"/>بوابة آمنة عبر البريد الجامعي</div>
          <h1 className="text-lg font-black sm:text-3xl">جدولي السريري</h1>
          <p className="mx-auto mt-1 max-w-xl text-[11px] leading-5 text-slate-500 sm:mt-2 sm:text-sm sm:leading-6">جدولك الأسبوعي المعتمد ومعلومات مجموعتك السريرية.</p>
        </div>
      </header>

      {error&&<div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}
      {message&&<div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-bold text-teal-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/><span>{message}</span></div>}

      {!challenge&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={requestOtp} className="space-y-4"><div><div className="mb-2 flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-600"/><label className="text-sm font-black">أدخل رقمك الجامعي</label></div><p className="mb-3 text-xs leading-5 text-slate-500">لن تظهر أي بيانات قبل التحقق. سنرسل رمزًا من 6 أرقام إلى بريدك الجامعي.</p><input required autoFocus inputMode="numeric" pattern="[0-9]+" value={number} onChange={event=>setNumber(event.target.value.replace(/\D/g,''))} className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center font-mono text-xl font-bold tracking-wider outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="مثال: 22210466"/></div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold hover:bg-teal-700" isLoading={busy}><Mail className="ml-2 h-5 w-5"/>إرسال رمز التحقق</Button></form></Card>}

      {challenge&&!accessToken&&<Card className="rounded-[28px] p-5 sm:p-7"><form onSubmit={verify} className="space-y-4"><div className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Mail className="h-6 w-6"/></div><h2 className="font-black">تحقق من بريدك الجامعي</h2><p className="mt-2 text-xs leading-5 text-slate-500">أرسلنا الرمز إلى <b dir="ltr">{emailHint}</b></p></div><input required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,''))} className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center font-mono text-2xl font-black tracking-[.35em] outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10" placeholder="000000"/><div className={`flex items-center justify-center gap-1.5 text-xs font-bold ${otpSeconds?'text-slate-500':'text-red-600'}`}><Clock3 className="h-4 w-4"/>{otpSeconds?`صلاحية الرمز: ${timer}`:'انتهت صلاحية الرمز'}</div><Button className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold" isLoading={busy} disabled={otp.length!==6||otpSeconds===0}><LockKeyhole className="ml-2 h-5 w-5"/>التحقق وعرض الجدول</Button><div className="grid grid-cols-2 gap-2"><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={reset}>تغيير الرقم</Button><Button type="button" variant="outline" className="rounded-xl text-xs" onClick={()=>requestOtp()} disabled={busy||otpSeconds>0}><RefreshCw className="ml-1 h-4 w-4"/>إرسال رمز جديد</Button></div></form></Card>}

      {data&&<section className="space-y-3 sm:space-y-4">
        <Card className="rounded-2xl border border-slate-200 p-3 sm:rounded-[28px] sm:p-5"><div className="flex items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white sm:h-11 sm:w-11"><GraduationCap className="h-4.5 w-4.5 sm:h-5 sm:w-5"/></div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black sm:text-base">{data.student.name}</h2><p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs"><span className="font-mono">{data.student.university_number}</span> · {levelNames[data.student.academic_level]||data.student.academic_level} · المجموعة <b className="text-teal-700">{data.group?.name||'—'} / {data.subgroup?.name||'—'}</b></p></div><button type="button" onClick={reset} className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">استعلام آخر</button></div></Card>

        <div className="flex items-center gap-2 px-1"><CalendarDays className="h-4.5 w-4.5 text-teal-700"/><h2 className="text-sm font-black sm:text-base">الجدول الأسبوعي</h2><span className="mr-auto rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700">{data.schedule.length} أسابيع</span></div>
        {data.schedule.length===0?<Card className="rounded-2xl border border-dashed border-slate-300 p-6 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300"/><h3 className="mt-2 text-sm font-black">لا يوجد جدول منشور لك حالياً</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">يرجى المراجعة لاحقاً أو التواصل مع إدارة الدائرة السريرية.</p></Card>:<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[690px] table-fixed border-collapse text-right text-[10px] sm:text-xs"><colgroup><col className="w-[72px]"/><col className="w-[145px]"/><col className="w-[175px]"/><col className="w-[145px]"/><col className="w-[153px]"/></colgroup><thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500"><th className="p-2.5 font-black">الأسبوع</th><th className="p-2.5 font-black">التاريخ</th><th className="p-2.5 font-black">المساق / النشاط</th><th className="p-2.5 font-black">المستشفى</th><th className="p-2.5 font-black">المشرف</th></tr></thead><tbody>{data.schedule.map((item,index)=><tr key={`${item.block?.block_code}-${index}`} className={`border-b border-slate-100 last:border-0 ${item.item_type==='activity'?'bg-amber-50/70':'bg-white'}`}><td className="p-2.5 align-top"><span className={`inline-flex rounded-md px-2 py-1 font-black ${item.item_type==='activity'?'bg-amber-100 text-amber-800':'bg-teal-50 text-teal-800'}`}>{item.block?.from_week||'—'}</span></td><td className="p-2.5 align-top leading-5 text-slate-500"><span className="block">{formatDate(item.block?.start_date||null)}</span><span className="block text-[9px] text-slate-400">إلى {formatDate(item.block?.end_date||null)}</span></td><td className="p-2.5 align-top"><span className="block text-[9px] font-bold text-slate-400">{item.course?.code||'مساق سريري'}</span><span className={`mt-0.5 block font-black ${item.item_type==='activity'?'text-amber-800':'text-slate-800'}`}>{item.item_type==='activity'?(item.activity?.label||'نشاط أكاديمي'):(item.course?.name_ar||item.course?.name_en||'الدورة السريرية')}</span></td><td className="p-2.5 align-top font-bold text-slate-700">{item.item_type==='activity'?<span className="text-amber-700">لا يوجد دوام سريري</span>:(item.training_site?.name_ar||item.training_site?.name||'—')}</td><td className="p-2.5 align-top font-bold text-slate-700">{item.item_type==='activity'?<span className="text-amber-700">—</span>:(item.supervisor?.full_name_ar||item.supervisor?.name||'شاغر')}</td></tr>)}</tbody></table></div><p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[9px] text-slate-400 sm:hidden">مرّر الجدول أفقيًا لرؤية جميع الأعمدة</p></div>}

        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"><summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-black text-slate-700"><UsersRound className="h-4 w-4 text-teal-600"/>مجموعتي وزملائي<span className="mr-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{data.members.length}</span></summary><div className="border-t border-slate-100 p-3"><div className="grid gap-1.5 sm:grid-cols-2">{data.members.map((member,index)=><div key={`${member.name}-${index}`} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold ${member.is_current_student?'bg-teal-50 text-teal-800':'bg-slate-50 text-slate-600'}`}><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px]">{index+1}</span><span className="truncate">{member.name}</span>{member.is_current_student&&<span className="mr-auto text-[9px]">أنت</span>}</div>)}</div></div></details>
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[9px] leading-4 text-slate-400 sm:text-[11px]"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600"/><p>هذه البيانات خاصة بصاحب البريد الجامعي وتنتهي جلسة العرض تلقائياً.</p></div>
      </section>}

      <footer className="py-3 text-center text-[11px] text-slate-400">جامعة الخليل — كلية الطب — الدائرة السريرية</footer>
    </div>
  </main>;
}
