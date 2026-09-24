import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { clinicalAttendanceIdentity, rememberClinicalAttendanceBrowser, scanClinicalQr } from '@/api/clinicalQrAttendance';
import { LiveQrScanner } from '@/components/clinical/LiveQrScanner';

export function PublicClinicalAttendancePage() {
  const [params] = useSearchParams(); const qr = params.get('qr') ?? '';
  const isCheckout = params.get('phase') === 'check_out';
  const [number, setNumber] = useState(''); const [challenge, setChallenge] = useState(''); const [otp, setOtp] = useState(''); const [token, setToken] = useState(''); const [intent, setIntent] = useState('');
  const [student, setStudent] = useState<{name:string;university_number:string}|null>(null); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [checkingIdentity, setCheckingIdentity] = useState(Boolean(qr));
  const begunCode = useRef('');
  const scannedCodes = useRef(new Set<string>());
  const submit = useCallback(async (accessToken?: string, code = qr) => {
    if (!code || scannedCodes.current.has(code)) return;
    scannedCodes.current.add(code);
    setError('');
    try {
      const result = await scanClinicalQr(code, accessToken);
      setMessage(`تم تسجيل ${result.operation === 'check_in' ? 'الدخول' : 'الخروج'} بنجاح الساعة ${new Date(result.recorded_at).toLocaleTimeString('ar-PS',{hour:'2-digit',minute:'2-digit'})}.`);
      setError('');
    } catch (exception) {
      scannedCodes.current.delete(code);
      setError(exception instanceof Error ? exception.message : 'تعذر تسجيل الحضور. امسح الرمز الحالي مرة أخرى.');
    }
  }, [qr]);
  useEffect(() => {
    if (!qr || begunCode.current === qr) return;
    begunCode.current = qr;
    void clinicalAttendanceIdentity().then(identity => {
      setStudent(identity.student);
      void submit();
    }).catch(() => undefined).finally(() => setCheckingIdentity(false));
    void apiFetch<{attendance_intent:string}>('/public/clinical-attendance/begin',{method:'POST',body:{qr_token:qr}})
      .then(result => setIntent(result.attendance_intent))
      .catch(exception => {
        if (!scannedCodes.current.has(qr)) setError(exception instanceof Error ? exception.message : 'انتهت صلاحية الرمز. امسح رمز المشرف الحالي مرة أخرى.');
      });
  }, [qr, submit]);
  const request = async () => { setLoading(true); setError(''); try { const result = await apiFetch<{otp_required:boolean;challenge_token?:string;access_token?:string}>('/public/clinical-attendance/request-otp',{method:'POST',body:{university_number:number,qr_token:qr || undefined,attendance_intent:intent || undefined}}); if (result.access_token) { setToken(result.access_token); const identity = await clinicalAttendanceIdentity(result.access_token); setStudent(identity.student); await rememberClinicalAttendanceBrowser(result.access_token); await submit(result.access_token); } else { setChallenge(result.challenge_token ?? ''); setMessage('تم إرسال رمز التحقق إلى بريدك الجامعي.'); } } catch (exception) { setError(exception instanceof Error ? exception.message : 'تعذر إرسال الرمز.'); } finally { setLoading(false); } };
  const verify = async () => { setLoading(true); setError(''); try { const result = await apiFetch<{access_token:string}>('/public/clinical-attendance/verify-otp',{method:'POST',body:{challenge_token:challenge,otp}}); setToken(result.access_token); const identity = await clinicalAttendanceIdentity(result.access_token); setStudent(identity.student); await rememberClinicalAttendanceBrowser(result.access_token); await submit(result.access_token); } catch (exception) { setError(exception instanceof Error ? exception.message : 'رمز التحقق غير صحيح.'); } finally { setLoading(false); } };
  const decoded = useCallback(async (value:string) => { await submit(token || undefined, value); }, [submit, token]);
  const scannerError = useCallback((value:string) => setError(value), []);

  return <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-900"><div className="mx-auto max-w-md space-y-5 py-5"><Link to="/portal/clinical-schedule" className="text-xs font-bold text-teal-700">← العودة للجدول السريري</Link><section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><ShieldCheck/></span><div><h1 className="font-black">تسجيل {isCheckout ? 'الخروج' : 'الحضور'} السريري</h1><p className="mt-1 text-xs text-slate-500">تم فتح تسجيل {isCheckout ? 'الخروج' : 'الحضور'} من رمز المشرف.</p></div></div>{!student ? checkingIdentity ? <p className="rounded-xl bg-teal-50 p-3 text-xs text-teal-800">جارٍ التحقق من هذا الجهاز...</p> : <div className="space-y-3">{isCheckout && <p className="rounded-xl bg-teal-50 p-3 text-xs text-teal-800">إذا طُلب منك التحقق، افتح الرابط بالمتصفح نفسه الذي استخدمته عند تسجيل الدخول.</p>}{!challenge ? <><label className="block text-xs font-bold">الرقم الجامعي<input dir="ltr" value={number} onChange={event => setNumber(event.target.value.replace(/\D/g,''))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-right outline-none focus:border-teal-500" placeholder="مثال: 22130000"/></label><button disabled={loading || !number || (!!qr && !intent)} onClick={request} className="h-11 w-full rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-50">{qr && !intent ? 'جارٍ تجهيز الحضور...' : 'إرسال رمز التحقق'}</button></> : <><label className="block text-xs font-bold">رمز التحقق من البريد الجامعي<input dir="ltr" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g,'').slice(0,6))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-center tracking-[0.45em] outline-none focus:border-teal-500" inputMode="numeric"/></label><p className="rounded-xl bg-teal-50 p-3 text-xs text-teal-800">بعد التحقق سيتم حفظ هذا الهاتف لمدة 30 يوماً وتسجيل {isCheckout ? 'خروجك' : 'حضورك'} تلقائياً.</p><button disabled={loading || otp.length !== 6} onClick={verify} className="h-11 w-full rounded-xl bg-teal-700 text-sm font-black text-white disabled:opacity-50">تحقق وسجل {isCheckout ? 'الخروج' : 'الحضور'}</button></>}</div> : <><div className="mb-4 rounded-2xl bg-teal-50 p-3 text-xs text-teal-900"><b>{student.name}</b><span dir="ltr" className="mr-2">{student.university_number}</span>{qr && !message && <p className="mt-2">جارٍ تسجيل {isCheckout ? 'الخروج' : 'الحضور'}...</p>}</div>{!qr && <LiveQrScanner onDecoded={decoded} onError={scannerError}/>}</>}{message && <p className="mt-4 flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0"/>{message}</p>}{error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}</section><p className="px-3 text-center text-[11px] leading-5 text-slate-500">الرمز مؤقت ويتغير تلقائياً. لا تشارك الشاشة أو الرابط مع أي شخص.</p></div></main>;
}
