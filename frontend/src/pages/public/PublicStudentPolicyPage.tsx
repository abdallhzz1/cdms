import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileSignature, Loader2 } from 'lucide-react';
import { apiFetch, apiUrl } from '@/api/client';
import hebronLogo from '@/assets/hebron.png';

type Meta = {
  public_id: string;
  status: string;
  deadline: string;
  title_ar: string;
  title_en: string;
  version_label: string;
  has_english_document: boolean;
};

export function PublicStudentPolicyPage() {
  const { publicId = '' } = useParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setMeta(null);
    setError('');
    apiFetch<Meta>(`/public/student-policies/${publicId}`)
      .then(result => { if (active) setMeta(result); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [publicId]);

  if (!meta) return <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center text-red-700">{error || <Loader2 aria-label="جارٍ التحميل" className="h-7 w-7 animate-spin text-teal-700" />}</main>;

  const documentUrl = (language: 'ar' | 'en') => apiUrl(`/public/student-policies/${publicId}/document?language=${language}`);

  return <main dir="rtl" className="min-h-screen bg-gradient-to-b from-teal-50/70 to-slate-50 px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-xl">
      <header className="mb-6 flex items-center gap-3"><img src={hebronLogo} className="h-12 w-12 object-contain" alt="جامعة الخليل" /><div><p className="text-sm font-black text-teal-800">كلية الطب · جامعة الخليل</p><p className="text-xs text-slate-500">سياسات وتعهدات الطلبة</p></div></header>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-teal-700" />
        <div className="space-y-6 p-6 sm:p-8">
          <div><h1 className="text-xl font-black text-slate-900">{meta.title_ar}</h1><p className="mt-1 text-sm text-slate-500">{meta.title_en}</p><p className="mt-2 text-xs font-bold text-teal-700">الإصدار {meta.version_label} · آخر موعد للتسليم {meta.deadline}</p></div>
          {meta.status !== 'published' ? <p role="status" className="rounded-2xl bg-slate-100 p-5 text-center font-bold text-slate-700">الوثيقة غير متاحة للتنزيل حالياً.</p> : <>
            <p className="text-sm leading-7 text-slate-700">اختر النسخة التي تفضلها، ثم نزّلها واطبعها ووقّعها بخط اليد وسلّمها إلى الكلية. لا تحتاج إلى إدخال رقمك الجامعي أو رمز تحقق.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <a href={documentUrl('ar')} className="flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-center text-sm font-bold text-white hover:bg-teal-800"><Download className="h-5 w-5" />تنزيل النسخة العربية PDF</a>
              {meta.has_english_document && <a href={documentUrl('en')} className="flex items-center justify-center gap-2 rounded-xl border-2 border-teal-700 px-4 py-3 text-center text-sm font-bold text-teal-800 hover:bg-teal-50"><Download className="h-5 w-5" />Download English PDF</a>}
            </div>
            <p className="flex gap-2 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950"><FileSignature className="mt-0.5 h-5 w-5 shrink-0" />التوثيق يتم عند تسليم الورقة الموقّعة للكلية؛ سيُسجّل الموظف استلامها ويرفع نسختها الموقّعة على النظام.</p>
          </>}
        </div>
      </section>
      <p className="mt-5 text-center text-xs text-slate-400">الدائرة السريرية · كلية الطب · جامعة الخليل</p>
    </div>
  </main>;
}
