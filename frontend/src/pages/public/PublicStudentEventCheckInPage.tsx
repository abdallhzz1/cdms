import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';

type PublicEvent = { type: 'conference' | 'seminar' | 'lecture'; title_ar: string; title_en: string;
  location_ar: string; location_en: string; starts_at: string; ends_at: string; eligible_levels: string[];
  presenters?: Array<{ name_ar: string; name_en: string; role_ar?: string; role_en?: string }>;
  poster_url?: string | null };
type BeginResult = { intent: string; event: PublicEvent };
type CheckInResult = { student_name: string; checked_in_at: string; already_recorded: boolean };

export function PublicStudentEventCheckInPage() {
  const [params] = useSearchParams(); const qr = params.get('qr') || '';
  const { locale, setLocale } = useI18n(); const ar = locale === 'ar'; const tr = (a: string, e: string) => ar ? a : e;
  const [event, setEvent] = useState<PublicEvent | null>(null); const [intent, setIntent] = useState('');
  const [number, setNumber] = useState(''); const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState(''); const [result, setResult] = useState<CheckInResult | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(Boolean(qr)); const [error, setError] = useState(''); const [message, setMessage] = useState('');

  useEffect(() => {
    if (!qr) { setError(tr('امسح رمز الحضور المعروض في مكان الفعالية.', 'Scan the check-in code displayed at the event.')); setLoading(false); return; }
    let active = true;
    void apiFetch<BeginResult>('/public/student-events/begin', { method: 'POST', body: { qr_token: qr } })
      .then(async data => {
        if (!active) return;
        setEvent(data.event); setIntent(data.intent);
        let identified = false;
        try {
          await apiFetch('/public/student-events/identity', { method: 'POST', body: {} });
          identified = true;
          const recorded = await apiFetch<CheckInResult>('/public/student-events/check-in', { method: 'POST', body: { intent: data.intent } });
          if (active) setResult(recorded);
        } catch (exception) {
          if (identified && active) {
            setBlocked(true);
            setError(exception instanceof Error ? exception.message : tr('تعذر تسجيل الحضور.', 'Could not record attendance.'));
          }
          // Otherwise this browser has not been verified; show the one-time email flow.
        }
      })
      .catch(exception => { if (active) setError(exception instanceof Error ? exception.message : tr('انتهى الرمز، امسح الرمز الجديد.', 'Code expired. Scan the new code.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [qr]);

  const requestCode = async () => {
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await apiFetch<{ challenge_token: string }>('/public/student-events/request-otp',
        { method: 'POST', body: { intent, university_number: number } });
      setChallenge(response.challenge_token); setMessage(tr('أرسلنا رمزًا إلى بريدك الجامعي.', 'We sent a code to your university email.'));
    } catch (exception) { setError(exception instanceof Error ? exception.message : tr('تعذر إرسال الرمز.', 'Could not send the code.')); }
    finally { setLoading(false); }
  };
  const verify = async () => {
    setLoading(true); setError('');
    try {
      const verified = await apiFetch<{ access_token: string }>('/public/student-events/verify-otp',
        { method: 'POST', body: { challenge_token: challenge, otp: code } });
      const recorded = await apiFetch<CheckInResult>('/public/student-events/check-in',
        { method: 'POST', body: { intent, access_token: verified.access_token } });
      setResult(recorded);
    } catch (exception) { setError(exception instanceof Error ? exception.message : tr('تعذر تسجيل الحضور.', 'Could not record attendance.')); }
    finally { setLoading(false); }
  };
  const field = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
  return <main dir={ar ? 'rtl' : 'ltr'} className="min-h-screen bg-[#f5f7f7] px-4 py-8 text-slate-900 sm:py-14">
    <div className="mx-auto max-w-md space-y-5"><div className="flex items-center justify-between px-1"><span className="text-xs font-black tracking-wide text-teal-800">{tr('كلية الطب · جامعة الخليل', 'FACULTY OF MEDICINE · HEBRON UNIVERSITY')}</span><button onClick={() => setLocale(ar ? 'en' : 'ar')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">{ar ? 'English' : 'العربية'}</button></div>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="h-1.5 bg-teal-700"/><div className="p-6 sm:p-8">
        <div className="flex items-start gap-3"><span className="rounded-2xl bg-teal-50 p-3 text-teal-700"><ShieldCheck className="h-6 w-6"/></span><div><p className="text-xs font-bold text-teal-700">{tr('حضور الفعاليات','Event attendance')}</p><h1 className="mt-1 text-xl font-black leading-8">{event ? (ar ? event.title_ar : event.title_en) : tr('تسجيل الحضور','Check in')}</h1></div></div>
        {event?.poster_url && <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2"><img src={event.poster_url} alt={tr('بوستر الفعالية','Event poster')} className="mx-auto max-h-[42vh] w-full object-contain"/></div>}
        {event && <div className="mt-5 space-y-2 border-b border-slate-100 pb-5 text-xs text-slate-600"><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4"/>{new Intl.DateTimeFormat(ar ? 'ar-PS' : 'en-GB', { timeZone: 'Asia/Hebron', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.starts_at))}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4"/>{ar ? event.location_ar : event.location_en}</p>
          {Boolean(event.presenters?.length) && <p>{tr('المحاضرون والمقدّمون', 'Speakers & presenters')}: {event.presenters!.map(person => ar ? person.name_ar : person.name_en).join(ar ? '، ' : ', ')}</p>}</div>}
        {loading && !challenge && <p className="mt-6 text-sm text-slate-500">{tr('جارٍ التحقق من الرمز والجهاز…','Checking the code and this device…')}</p>}
        {result ? <div className="mt-6 rounded-2xl bg-emerald-50 p-5 text-center text-emerald-900"><CheckCircle2 className="mx-auto h-9 w-9"/><h2 className="mt-3 text-lg font-black">{result.already_recorded ? tr('حضورك مسجل مسبقًا','Already checked in') : tr('تم تسجيل حضورك','Check-in complete')}</h2><p className="mt-2 text-sm">{result.student_name}</p><p className="mt-1 text-xs">{new Date(result.checked_in_at).toLocaleTimeString(ar ? 'ar-PS' : 'en-GB')}</p></div> : intent && !loading && !blocked && <div className="mt-6 space-y-4">
          {!challenge ? <><p className="text-sm leading-6 text-slate-600">{tr('للتحقق أول مرة، أدخل رقمك الجامعي وسنرسل رمزًا إلى بريدك. بعد ذلك سيتذكر النظام هذا الجهاز لمدة 30 يومًا.', 'For your first check-in, enter your university number. We will email a code and remember this device for 30 days.')}</p><label className="block text-sm font-bold">{tr('الرقم الجامعي','University number')}<input required inputMode="numeric" autoComplete="off" dir="ltr" value={number} onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0,20))} className={field}/></label><button disabled={!number || loading} onClick={() => void requestCode()} className="min-h-12 w-full rounded-xl bg-teal-700 text-sm font-bold text-white disabled:opacity-50">{tr('إرسال رمز التحقق','Send verification code')}</button></> : <><p className="text-sm leading-6 text-slate-600">{tr('اكتب الرمز المرسل إلى بريدك الجامعي لتأكيد حضورك.', 'Enter the code sent to your university email to confirm your attendance.')}</p><label className="block text-sm font-bold">{tr('رمز التحقق','Verification code')}<input inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0,6))} className={`${field} text-center tracking-[0.4em]`}/></label><button disabled={code.length !== 6 || loading} onClick={() => void verify()} className="min-h-12 w-full rounded-xl bg-teal-700 text-sm font-bold text-white disabled:opacity-50">{tr('تحقق وسجل الحضور','Verify and check in')}</button></>}
        </div>}
        {message && !result && <p role="status" className="mt-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p>}
      </div></section><p className="px-4 text-center text-xs leading-5 text-slate-500">{tr('الرمز قصير الصلاحية ويُعرض في مكان الفعالية. لا تشارك رابطه.', 'The short-lived code is displayed at the event. Do not share its link.')}</p></div>
  </main>;
}
