interface FormPrintViewProps {
  formType: 'individual' | 'group' | 'at_risk' | 'policy';
  data: any;
  onClose: () => void;
}

export function AdvisingFormPrintView({ formType, data, onClose }: FormPrintViewProps) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const handlePrint = () => {
    window.print();
  };

  const getFormTitle = () => {
    switch (formType) {
      case 'individual':
        return { ar: 'نموذج ملخص محضر اجتماع إرشادي (فردي)', en: 'Individual Advising Meeting Summary Form' };
      case 'group':
        return { ar: 'نموذج ملخص محضر اجتماع إرشادي (جماعي)', en: 'Group Advising Meeting Summary Form' };
      case 'at_risk':
        return { ar: 'نموذج/استمارة الطلبة المتعثرين أكاديمياً', en: 'Academic At-Risk Students Registry Form' };
      default:
        return { ar: 'وثيقة الإرشاد الأكاديمي الرسمية', en: 'Official Academic Advising Document' };
    }
  };

  const title = getFormTitle();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm p-4 print:p-0 print:bg-white print:static print:inset-auto">
      <style>{`
        @media print {
          header, nav, aside, sidebar, button, .print\\:hidden, .print-hidden-bar {
            display: none !important;
          }
          .fixed.inset-0 {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: auto !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            z-index: 99999 !important;
          }
          #printable-advising-document {
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 15px !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      {/* Top Action Bar (Hidden during Printing) */}
      <div className="mx-auto max-w-[850px] mb-4 flex items-center justify-between print-hidden-bar print:hidden">
        <div className="flex items-center gap-2">
          <span className="bg-teal-500 text-white text-xs font-black px-3 py-1 rounded-full">
            {tr('معاينة المستند الرسمي للطباعة والتصدير', 'Official document preview for print and export')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <span>🖨️</span>
            <span>{tr('طباعة / حفظ كـ PDF', 'Print / Save as PDF')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            {tr('إغلاق', 'Close')}
          </button>
        </div>
      </div>

      {/* Official A4 Paper Container */}
      <div id="printable-advising-document" className="mx-auto max-w-[850px] bg-white p-8 sm:p-12 shadow-2xl rounded-2xl print:shadow-none print:p-0 print:m-0 print:max-w-none text-slate-900 border border-slate-200 print:border-none font-sans" dir={ar ? 'rtl' : 'ltr'}>
        
        {/* ========================================================================= */}
        {/* OFFICIAL FACULTY OF MEDICINE HEADER (EXACT REPLICA OF THE COLLEGE FORM) */}
        {/* ========================================================================= */}
        <div className="border-2 border-slate-900 mb-6">
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-900 text-center items-center">
            
            {/* Faculty Header */}
            <div className="p-3 space-y-1">
              <h3 className="font-bold text-sm text-slate-900">{tr('جامعة الخليل', 'Hebron University')}</h3>
              <h4 className="font-semibold text-xs text-slate-800">{tr('كلية الطب البشري', 'Faculty of Medicine')}</h4>
              <p className="text-[11px] text-slate-700 font-medium">{tr('دائرة ضمان الجودة والتطوير', 'Quality Assurance & Development Dept')}</p>
              <div className="pt-2 border-t border-slate-400">
                <span className="font-bold text-xs text-slate-900">{tr('لجنة الإرشاد الأكاديمي', 'Academic Advising Committee')}</span>
              </div>
            </div>

            {/* Center: University Logo Seal */}
            <div className="p-2 flex flex-col items-center justify-center">
              <img 
                src="/assets/hebron-BZfyxO91.png" 
                alt="Hebron University Logo" 
                className="w-16 h-16 object-contain mx-auto"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <span className="text-[10px] font-bold text-slate-600 mt-1">1971</span>
            </div>

            {/* Left: English Header & Form Title */}
            <div className="p-3 space-y-1 text-center dir-ltr">
              <h3 className="font-bold text-xs text-slate-900">Hebron University</h3>
              <h4 className="font-semibold text-[11px] text-slate-800">Faculty of Medicine</h4>
              <p className="text-[10px] text-slate-700">Quality Assurance & Development Dept</p>
              <div className="pt-2 border-t border-slate-400">
                <span className="font-bold text-xs text-slate-900 block">{ar ? title.ar : title.en}</span>
              </div>
            </div>

          </div>
        </div>

        {/* ========================================================================= */}
        {/* FORM CONTENT BODY DEPENDING ON FORM TYPE */}
        {/* ========================================================================= */}

        {/* 1. INDIVIDUAL FORM (محضر اجتماع فردي) */}
        {formType === 'individual' && (
          <div className="space-y-6 text-sm">
            <div className="grid grid-cols-2 gap-4 border-b border-slate-300 pb-4">
              <div>
                <span className="font-bold text-slate-700">{tr('اسم الطالب:', 'Student name:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.student_name || '—'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{tr('الرقم الجامعي:', 'University number:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-mono font-bold text-slate-900">{data.university_number || '—'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{tr('الفصل الدراسي:', 'Semester:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.semester || '—'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{tr('العام الدراسي:', 'Academic year:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.academic_year || '—'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 underline decoration-slate-400 underline-offset-4">{tr('المواضيع التي تم مناقشتها:', 'Topics discussed:')}</h4>
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 min-h-[120px] whitespace-pre-wrap font-serif text-slate-800 leading-relaxed">
                {data.topics_discussed || tr('لم يتم تسجيل مواضيع.', 'No topics have been recorded.')}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 underline decoration-slate-400 underline-offset-4">{tr('التوصيات:', 'Recommendations:')}</h4>
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 min-h-[100px] whitespace-pre-wrap font-serif text-slate-800 leading-relaxed">
                {data.recommendations || tr('لم يتم تسجيل توصيات.', 'No recommendations have been recorded.')}
              </div>
            </div>

            {/* Attachments List if Present */}
            {Array.isArray(data.attachments) && data.attachments.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h4 className="font-bold text-slate-900 text-xs underline decoration-slate-400 underline-offset-4">{tr('المستندات والمرفقات المرفقة مع السجل:', 'Documents and attachments included with the record:')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.attachments.map((att: any, idx: number) => (
                    <div key={idx} className="p-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate">📄 {att.name}</span>
                      {att.url && (
                        <a 
                          href={att.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-teal-700 font-bold hover:underline shrink-0 text-[11px] print:hidden"
                        >
                          {tr('معاينة / تحميل', 'Preview / Download')}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signatures Block */}
            <div className="pt-8 space-y-4">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <span className="font-bold text-slate-800 block">{tr('توقيع الطالب:', 'Student signature:')} ___________________________</span>
                </div>
                <div className="space-y-2">
                  <span className="font-bold text-slate-800 block">{tr('توقيع المرشد:', 'Adviser signature:')} {data.advisor_name || '___________________'}</span>
                  <span className="font-bold text-slate-700 block text-xs">{tr('التاريخ:', 'Date:')} {data.date || new Date().toISOString().slice(0, 10)}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block">{tr('توقيع رئيس لجنة الإرشاد:', 'Academic Advising Committee Chair signature:')} ___________________</span>
                <span className="font-bold text-slate-700 block text-xs">{tr('التاريخ:', 'Date:')} ___________________________</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 font-bold pt-4 text-start">
              {tr('• يحفظ النموذج في ملف الإرشاد الأكاديمي إلكترونياً وورقياً.', '• Keep this form in the academic advising record electronically and in hard copy.')}
            </p>
          </div>
        )}

        {/* 2. GROUP FORM (محضر اجتماع جماعي) */}
        {formType === 'group' && (
          <div className="space-y-6 text-sm">
            <div className="grid grid-cols-2 gap-4 border-b border-slate-300 pb-4">
              <div>
                <span className="font-bold text-slate-700">{tr('رقم اللقاء:', 'Meeting number:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.meeting_number || '1'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{tr('التاريخ:', 'Date:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.date || new Date().toISOString().slice(0, 10)}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{tr('عدد الطلاب الحاضرين:', 'Number of students present:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.attendees_count ?? '0'}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">{tr('عدد الطلاب الغائبين:', 'Number of students absent:')} </span>
                <span className="border-b border-dotted border-slate-900 px-2 font-bold text-slate-900">{data.absent_count ?? '0'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 underline decoration-slate-400 underline-offset-4">{tr('محاور الاجتماع:', 'Meeting topics:')}</h4>
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 min-h-[120px] whitespace-pre-wrap font-serif text-slate-800 leading-relaxed">
                {data.topics_discussed || tr('لم يتم تسجيل محاور.', 'No topics have been recorded.')}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 underline decoration-slate-400 underline-offset-4">{tr('التوصيات:', 'Recommendations:')}</h4>
              <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200 min-h-[100px] whitespace-pre-wrap font-serif text-slate-800 leading-relaxed">
                {data.recommendations || tr('لم يتم تسجيل توصيات.', 'No recommendations have been recorded.')}
              </div>
            </div>

            {/* Signatures Block */}
            <div className="pt-8 space-y-4">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <span className="font-bold text-slate-800 block">{tr('توقيع المرشد:', 'Adviser signature:')} {data.advisor_name || '___________________'}</span>
                  <span className="font-bold text-slate-700 block text-xs mt-1">{tr('التاريخ:', 'Date:')} {data.date || new Date().toISOString().slice(0, 10)}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-800 block">{tr('توقيع رئيس لجنة الإرشاد:', 'Academic Advising Committee Chair signature:')} ___________________</span>
                  <span className="font-bold text-slate-700 block text-xs mt-1">{tr('التاريخ:', 'Date:')} ___________________________</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. AT-RISK STUDENTS FORM (استمارة المتعثرين أكاديمياً) */}
        {formType === 'at_risk' && (
          <div className="space-y-6 text-sm">
            <h4 className="font-bold text-slate-900 text-center text-base">
              {tr('استمارة الطلبة المتعثرين أكاديمياً، تعبأ من قبل المرشد الأكاديمي فصلياً:', 'Academic at-risk student form, completed by the academic adviser each semester:')}
            </h4>

            <div className="overflow-x-auto border-2 border-slate-900">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold border-b-2 border-slate-900">
                    <th className="p-2 border-r border-slate-700 w-8">#</th>
                    <th className="p-2 border-r border-slate-700">{tr('اسم الطالب', 'Student name')}</th>
                    <th className="p-2 border-r border-slate-700">{tr('الرقم الجامعي', 'University number')}</th>
                    <th className="p-2 border-r border-slate-700">{tr('المستوى', 'Level')}</th>
                    <th className="p-2 border-r border-slate-700">{tr('المعدل التراكمي', 'Cumulative GPA')}</th>
                    <th className="p-2 border-r border-slate-700">{tr('المشكلة الأكاديمية', 'Academic concern')}</th>
                    <th className="p-2 border-r border-slate-700 w-16">{tr('عدد الإنذارات', 'Warnings')}</th>
                    <th className="p-2">{tr('المساقات التي لم يجتازها الطالب', 'Courses not passed')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-400">
                  {Array.isArray(data.students) && data.students.length > 0 ? (
                    data.students.map((st: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 border-r border-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-2 border-r border-slate-400 font-bold text-slate-900">{st.name || '—'}</td>
                        <td className="p-2 border-r border-slate-400 font-mono font-bold">{st.university_number || '—'}</td>
                        <td className="p-2 border-r border-slate-400">{st.level || '—'}</td>
                        <td className="p-2 border-r border-slate-400 font-bold text-amber-700">%{st.gpa || '—'}</td>
                        <td className="p-2 border-r border-slate-400">{st.issue || '—'}</td>
                        <td className="p-2 border-r border-slate-400 font-bold">{st.warning_count ?? '0'}</td>
                        <td className="p-2">{st.failed_courses || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-400 font-medium">
                        {tr('لا يوجد طلبة مسجلين في هذه الاستمارة حالياً.', 'No students are listed in this form yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Signatures Block */}
            <div className="pt-8 grid grid-cols-2 gap-8 border-t border-slate-300">
              <div>
                <span className="font-bold text-slate-800 block">{tr('توقيع المرشد:', 'Adviser signature:')} {data.advisor_name || '___________________'}</span>
                <span className="font-bold text-slate-700 block text-xs mt-1">{tr('التاريخ:', 'Date:')} {data.date || new Date().toISOString().slice(0, 10)}</span>
              </div>
              <div>
                <span className="font-bold text-slate-800 block">{tr('توقيع رئيس لجنة الإرشاد:', 'Academic Advising Committee Chair signature:')} ___________________</span>
                <span className="font-bold text-slate-700 block text-xs mt-1">{tr('التاريخ:', 'Date:')} ___________________________</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
import { useI18n } from '@/i18n/I18nContext';
