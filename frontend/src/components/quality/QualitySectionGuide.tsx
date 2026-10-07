import { Link } from 'react-router-dom';
import { ArrowRight, CircleHelp } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

export function QualitySectionGuide({ titleAr, titleEn, stepsAr, stepsEn }: { titleAr: string; titleEn: string; stepsAr: string[]; stepsEn: string[] }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const steps = ar ? stepsAr : stepsEn;
  return <div className="flex flex-wrap items-start justify-between gap-2">
    <Link to="/quality" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-teal-700"><ArrowRight className="h-4 w-4" />{ar ? 'مركز الجودة' : 'Quality center'}</Link>
    <details className="group max-w-full text-xs text-slate-700">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 font-bold text-teal-700 hover:bg-white [&::-webkit-details-marker]:hidden"><CircleHelp className="h-4 w-4" />{ar ? 'إرشادات الشاشة' : 'Screen guide'}</summary>
      <div className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:w-96">
        <h2 className="font-black text-slate-900">{ar ? titleAr : titleEn}</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 leading-5 text-slate-600">{steps.map(step => <li key={step}>{step}</li>)}</ol>
      </div>
    </details>
  </div>;
}
