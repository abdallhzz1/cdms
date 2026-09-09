import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, CircleHelp } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

export function QualitySectionGuide({ titleAr, titleEn, stepsAr, stepsEn }: { titleAr:string; titleEn:string; stepsAr:string[]; stepsEn:string[] }) {
  const { locale }=useI18n(); const ar=locale==='ar'; const[open,setOpen]=useState(false); const steps=ar?stepsAr:stepsEn;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><Link to="/quality" className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-600 transition hover:border-teal-200 hover:text-teal-700"><ArrowRight className="h-4 w-4"/>{ar?'الرجوع لمركز الجودة':'Back to quality center'}</Link><button type="button" onClick={()=>setOpen(v=>!v)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-teal-50 px-3 text-xs font-black text-teal-800"><CircleHelp className="h-4 w-4"/>{ar?'كيف تعمل هذه الشاشة؟':'How does this screen work?'}<ChevronDown className={`h-4 w-4 transition ${open?'rotate-180':''}`}/></button></div>{open&&<div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4"><h2 className="text-sm font-black text-slate-800">{ar?titleAr:titleEn}</h2><ol className="mt-3 grid gap-2 md:grid-cols-2">{steps.map((step,index)=><li key={step} className="flex gap-2 rounded-xl bg-white p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-100"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-black text-teal-700">{index+1}</span>{step}</li>)}</ol></div>}</section>;
}
