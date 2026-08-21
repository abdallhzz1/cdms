import { X, ShieldCheck, FileText, CheckCircle2, Users, BookOpen } from 'lucide-react';

interface AdvisingPolicyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdvisingPolicyDrawer({ isOpen, onClose }: AdvisingPolicyDrawerProps) {

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-800">سياسة وتعلليمات لجنة الإرشاد الأكاديمي</h3>
                <span className="bg-teal-100 text-teal-800 font-mono text-[10.5px] font-bold px-2 py-0.5 rounded-md border border-teal-200">
                  AQC-8
                </span>
              </div>
              <p className="text-xs text-slate-400">
                جامعة الخليل — كلية الطب البشري — دائرة ضمان الجودة والتطوير
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
              <span className="text-[10px] font-bold text-teal-600 block">رقم السياسة</span>
              <span className="font-mono font-bold text-teal-900 text-xs">AQC-8</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">تاريخ الإصدار</span>
              <span className="font-bold text-teal-900 text-xs">2026/2027</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">الجهة المعتمدة</span>
              <span className="font-bold text-teal-900 text-xs">مجلس الكلية</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-teal-600 block">الجهة المنفذة</span>
              <span className="font-bold text-teal-900 text-xs">لجنة الإرشاد والدائرة السريرية</span>
            </div>
          </div>

          {/* 1. التعريف والأهداف */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <BookOpen className="w-4 h-4 text-teal-600" />
              <span>1. التعريف والأهداف العامة:</span>
            </h4>
            <p className="text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100">
              هي لجنة يتم تشكيلها بقرار من عميد الكلية في بداية العام الأكاديمي برئاسة أحد أعضاء الهيئة التدريسية في الكلية من ذوي الخبرة الأكاديمية المتميزة، وعضوية كل من المرشدين الأكاديميين المكلفين من الكلية بالإرشاد للسنوات المختلفة. وتعتبر اللجنة مسؤولة أمام عميد الكلية بما يخص مراقبة وتقييم وإعداد خطط عمل، وتوصيات فصيلية لعمل اللجنة، وكذلك إدارة مهام لجنة الإرشاد الأكاديمي وتنفيذ واجباتها؛ تحقيقاً للأهداف المحددة والغايات السامية للكلية.
            </p>
          </div>

          {/* 2. مسؤول التنفيذ والتشكيل */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <Users className="w-4 h-4 text-teal-600" />
              <span>2. مسؤول التنفيذ وتشكيل اللجنة:</span>
            </h4>
            <ul className="space-y-1.5 text-slate-700 list-disc list-inside bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <li>رئيس لجنة الإرشاد الأكاديمي في كلية الطب البشري.</li>
              <li>مدير الدائرة السريرية ومدير الدائرة الأساسية.</li>
              <li>يصدر عميد الكلية قراراً بتشكيل لجنة الإرشاد في بداية كل عام أكاديمي.</li>
              <li>تضم اللجنة في عضويتها جميع المرشدين الأكاديميين المكلفين بالإرشاد في مختلف السنوات.</li>
            </ul>
          </div>

          {/* 3. اجتماعات اللجنة ومهام رئيس اللجنة */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>3. اجتماعات اللجنة ومهام رئيس اللجنة:</span>
            </h4>
            <ul className="space-y-1.5 text-slate-700 list-disc list-inside bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <li>تعقد اللجنة اجتماعاً دورياً مرة واحدة على الأقل في كل فصل دراسي، ويجوز عقد اجتماعات طارئة عند الحاجة.</li>
              <li>الإشراف على أعمال اللجنة ومتابعة تنفيذ مهامها بشكل مستمر.</li>
              <li>رفع خطط العمل والتقارير والتوصيات الفصلية إلى عميد الكلية.</li>
              <li>تنسيق الجهود بين المرشدين الأكاديميين وتوزيع المهام بما يحقق أهداف الكلية.</li>
            </ul>
          </div>

          {/* 4. مهام المرشدين والآليات */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              <span>4. مهام المرشد الأكاديمي وآليات الإرشاد:</span>
            </h4>
            <ul className="space-y-1.5 text-slate-700 list-disc list-inside bg-slate-50 p-3 rounded-2xl border border-slate-100">
              <li>متابعة الأداء الأكاديمي للطلبة وتقديم الدعم الفردي والجماعي.</li>
              <li>مساعدة الطلبة في اختيار المقررات الدراسية وفق الخطط الأكاديمية.</li>
              <li>توعية الطلبة باللوائح والأحكام والأنظمة الأكاديمية وشرحها عند الحاجة.</li>
              <li>رصد الصعوبات التي يواجهها الطلبة واقتراح الحلول المناسبة.</li>
              <li>إعداد تقارير دورية عن حالات الطلبة ورفعها إلى رئيس اللجنة.</li>
            </ul>
          </div>

          {/* 5. النماذج الرسمية المعتمدة */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              <span>5. النماذج الرسمية المعتمدة في الكلية:</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-bold text-slate-700">
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">1</span>
                <span>نموذج ملخص محضر اجتماع إرشادي (فردي)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">2</span>
                <span>نموذج ملخص محضر اجتماع إرشادي (جماعي)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">3</span>
                <span>استمارة/نموذج الطلبة المتعثرين أكاديمياً</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold text-xs">4</span>
                <span>نموذج إرشاد (قيد الإعداد والاعتماد)</span>
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
            إغلاق النافذة
          </button>
        </div>

      </div>
    </div>
  );
}
