import { X, ShieldCheck, FileText, CheckCircle2, Users, BookOpen } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

interface AdvisingPolicyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdvisingPolicyDrawer({ isOpen, onClose }: AdvisingPolicyDrawerProps) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" dir={ar ? 'rtl' : 'ltr'}>
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800">{tr('سياسة وتعليمات لجنة الإرشاد الأكاديمي', 'Academic Advising Committee Policy')}</h3>
                <span className="bg-teal-100 text-teal-800 font-mono text-[10.5px] font-bold px-2 py-0.5 rounded-md border border-teal-200">
                  AQC-8
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {tr('جامعة الخليل — كلية الطب البشري — دائرة ضمان الجودة والتطوير', 'Hebron University — Faculty of Medicine — Quality Assurance and Development Unit')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-slate-800 text-xs leading-relaxed">
          
          {/* Policy Metadata Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-teal-50/60 p-3.5 rounded-2xl border border-teal-100 text-center">
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">{tr('رقم السياسة', 'Policy number')}</span>
              <span className="font-mono font-bold text-teal-900 text-xs">AQC-8</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">{tr('تاريخ الإصدار', 'Issue date')}</span>
              <span className="font-bold text-teal-900 text-xs">2026/2027</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">{tr('الجهة المعتمدة', 'Approving body')}</span>
              <span className="font-bold text-teal-900 text-xs">{tr('مجلس الكلية', 'Faculty Council')}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">{tr('الجهة المنفذة', 'Implementing body')}</span>
              <span className="font-bold text-teal-900 text-xs">{tr('لجنة الإرشاد والدائرة السريرية', 'Advising Committee and Clinical Department')}</span>
            </div>
          </div>

          {/* 1. التعريف والأهداف */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <BookOpen className="w-4 h-4 text-teal-600" />
              <span>{tr('1. التعريف والأهداف العامة:', '1. Definition and general objectives')}</span>
            </h4>
            <p className="text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              {tr('هي لجنة يتم تشكيلها بقرار من عميد الكلية في بداية العام الأكاديمي برئاسة أحد أعضاء الهيئة التدريسية في الكلية من ذوي الخبرة الأكاديمية المتميزة، وعضوية كل من المرشدين الأكاديميين المكلفين من الكلية بالإرشاد للسنوات المختلفة. وتعتبر اللجنة مسؤولة أمام عميد الكلية بما يخص مراقبة وتقييم وإعداد خطط عمل، وتوصيات فصيلية لعمل اللجنة، وكذلك إدارة مهام لجنة الإرشاد الأكاديمي وتنفيذ واجباتها؛ تحقيقاً للأهداف المحددة والغايات السامية للكلية.', 'The committee is formed by a decision of the Dean at the beginning of the academic year and is chaired by an experienced faculty member. It includes the academic advisers assigned across the different years and is accountable to the Dean for monitoring, evaluation, work plans, detailed recommendations, and the implementation of the committee’s duties in support of the Faculty’s objectives.')}
            </p>
          </div>

          {/* 2. مسؤول التنفيذ والتشكيل */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <Users className="w-4 h-4 text-teal-600" />
              <span>{tr('2. مسؤول التنفيذ وتشكيل اللجنة:', '2. Implementation responsibility and committee formation')}</span>
            </h4>
            <ul className="space-y-1.5 text-slate-700 list-disc list-inside bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <li>{tr('رئيس لجنة الإرشاد الأكاديمي في كلية الطب البشري.', 'Chair of the Academic Advising Committee at the Faculty of Medicine.')}</li>
              <li>{tr('مدير الدائرة السريرية ومدير الدائرة الأساسية.', 'Clinical Department Director and Basic Sciences Department Director.')}</li>
              <li>{tr('يصدر عميد الكلية قراراً بتشكيل لجنة الإرشاد في بداية كل عام أكاديمي.', 'The Dean issues the decision forming the Advising Committee at the start of each academic year.')}</li>
              <li>{tr('تضم اللجنة في عضويتها جميع المرشدين الأكاديميين المكلفين بالإرشاد في مختلف السنوات.', 'The committee includes all academic advisers assigned across the different academic years.')}</li>
            </ul>
          </div>

          {/* 3. اجتماعات اللجنة ومهام رئيس اللجنة */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>{tr('3. اجتماعات اللجنة ومهام رئيس اللجنة:', '3. Committee meetings and chair responsibilities')}</span>
            </h4>
            <ul className="space-y-1.5 text-slate-700 list-disc list-inside bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <li>{tr('تعقد اللجنة اجتماعاً دورياً مرة واحدة على الأقل في كل فصل دراسي، ويجوز عقد اجتماعات طارئة عند الحاجة.', 'The committee meets at least once each semester and may hold emergency meetings when needed.')}</li>
              <li>{tr('الإشراف على أعمال اللجنة ومتابعة تنفيذ مهامها بشكل مستمر.', 'Oversee the committee’s work and follow up on implementing its duties.')}</li>
              <li>{tr('رفع خطط العمل والتقارير والتوصيات الفصلية إلى عميد الكلية.', 'Submit work plans, reports, and semester recommendations to the Dean.')}</li>
              <li>{tr('تنسيق الجهود بين المرشدين الأكاديميين وتوزيع المهام بما يحقق أهداف الكلية.', 'Coordinate the academic advisers’ efforts and distribute tasks to achieve Faculty goals.')}</li>
            </ul>
          </div>

          {/* 4. مهام المرشدين والآليات */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              <span>{tr('4. مهام المرشد الأكاديمي وآليات الإرشاد:', '4. Academic adviser duties and advising mechanisms')}</span>
            </h4>
            <ul className="space-y-1.5 text-slate-700 list-disc list-inside bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <li>{tr('متابعة الأداء الأكاديمي للطلبة وتقديم الدعم الفردي والجماعي.', 'Monitor students’ academic performance and provide individual and group support.')}</li>
              <li>{tr('مساعدة الطلبة في اختيار المقررات الدراسية وفق الخطط الأكاديمية.', 'Help students select courses according to their academic plans.')}</li>
              <li>{tr('توعية الطلبة باللوائح والأحكام والأنظمة الأكاديمية وشرحها عند الحاجة.', 'Explain academic regulations, rules, and policies to students as needed.')}</li>
              <li>{tr('رصد الصعوبات التي يواجهها الطلبة واقتراح الحلول المناسبة.', 'Identify students’ difficulties and propose appropriate solutions.')}</li>
              <li>{tr('إعداد تقارير دورية عن حالات الطلبة ورفعها إلى رئيس اللجنة.', 'Prepare periodic reports on student cases and submit them to the committee chair.')}</li>
            </ul>
          </div>

          {/* 5. النماذج الرسمية المعتمدة */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              <span>{tr('5. النماذج الرسمية المعتمدة في الكلية:', '5. Official Faculty forms')}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-bold text-slate-700">
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">1</span>
                <span>{tr('نموذج ملخص محضر اجتماع إرشادي (فردي)', 'Individual advising meeting summary form')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">2</span>
                <span>{tr('نموذج ملخص محضر اجتماع إرشادي (جماعي)', 'Group advising meeting summary form')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">3</span>
                <span>{tr('استمارة/نموذج الطلبة المتعثرين أكاديمياً', 'Academically at-risk student form')}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">4</span>
                <span>{tr('نموذج إرشاد (قيد الإعداد والاعتماد)', 'Advising form (pending preparation and approval)')}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors"
          >
            {tr('إغلاق النافذة', 'Close')}
          </button>
        </div>

      </div>
    </div>
  );
}
