import { useState } from 'react';
import { X, FileText, Upload, Paperclip, Printer, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';

interface IndividualFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: any) => void;
  onPreviewPrint: (formData: any) => void;
}

export function IndividualFormModal({ isOpen, onClose, onSave, onPreviewPrint }: IndividualFormModalProps) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const { user } = useAuth();

  const [studentId, setStudentId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [universityNumber, setUniversityNumber] = useState('');
  const [semester, setSemester] = useState('الفصل الأول');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [topicsDiscussed, setTopicsDiscussed] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [advisorName, setAdvisorName] = useState(user?.name || 'د. رامي القواسمة');
  const [attachments, setAttachments] = useState<{ name: string; url: string; size?: string }[]>([]);

  // Query live students for dropdown selection
  const { data: studentsResponse } = useQuery({
    queryKey: ['students-dropdown-advising'],
    queryFn: () => apiFetch<any>('/students?per_page=300'),
    enabled: isOpen
  });

  const studentsList = Array.isArray(studentsResponse) 
    ? studentsResponse 
    : studentsResponse?.data || studentsResponse?.items || [];

  if (!isOpen) return null;

  const handleSelectStudent = (stId: string) => {
    setStudentId(stId);
    const found = studentsList.find((s: any) => String(s.id) === stId || s.university_number === stId);
    if (found) {
      setStudentName(ar ? found.full_name_ar || found.full_name_en : found.full_name_en || found.full_name_ar);
      setUniversityNumber(found.university_number);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileUrl = event.target?.result as string;
        setAttachments(prev => [
          ...prev, 
          { 
            name: file.name, 
            url: fileUrl, 
            size: `${(file.size / 1024).toFixed(1)} KB` 
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
  };

  const getConstructedPayload = () => {
    return {
      id: Date.now().toString(),
      form_type: 'individual',
      student_id: studentId,
      student_name: studentName.trim(),
      university_number: universityNumber.trim(),
      semester,
      academic_year: academicYear,
      topics_discussed: topicsDiscussed.trim(),
      recommendations: recommendations.trim(),
      advisor_name: advisorName.trim(),
      date: new Date().toISOString().slice(0, 10),
      attachments
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !universityNumber.trim()) {
      alert(locale === 'ar' ? 'يرجى اختيار أو إدخال بيانات الطالب والرقم الجامعي' : 'Please select student');
      return;
    }
    onSave(getConstructedPayload());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" dir={ar ? 'rtl' : 'ltr'}>
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">{tr('تعبئة نموذج محضر اجتماع إرشادي (فردي)', 'Complete individual advising meeting form')}</h3>
              <p className="text-xs text-slate-400">{tr('جامعة الخليل — كلية الطب البشري — دائرة ضمان الجودة والتطوير', 'Hebron University — Faculty of Medicine — Quality Assurance and Development Unit')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto text-xs">
          
          {/* Select Student Quick Dropdown or Direct Write */}
          <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
            <label className="block font-bold text-slate-700">{tr('اختر الطالب من القائمة الأكاديمية (أو أدخل يدوياً):', 'Select a student from the academic directory (or enter manually):')}</label>
            <select
              value={studentId}
              onChange={(e) => handleSelectStudent(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white focus:border-teal-500"
            >
              <option value="">{tr('-- اختر طالباً من دليل الكلية --', '-- Select a student from the Faculty directory --')}</option>
              {studentsList.map((st: any) => (
                <option key={st.id} value={st.id}>
                  {ar ? st.full_name_ar || st.full_name_en : st.full_name_en || st.full_name_ar} ({st.university_number}) — {st.academic_level || tr('السنة السريرية', 'Clinical year')}
                </option>
              ))}
            </select>
          </div>

          {/* Student Info Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">{tr('اسم الطالب الثلاثي / الرباعي *', 'Student full name *')}</label>
              <input
                required
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder={tr('مثال: أحمد إسماعيل عيسى غانم', 'e.g. Ahmad Ismail Issa Ghanem')}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">{tr('الرقم الجامعي *', 'University number *')}</label>
              <input
                required
                type="text"
                value={universityNumber}
                onChange={(e) => setUniversityNumber(e.target.value)}
                placeholder="e.g. 21105432"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-bold focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">{tr('الفصل الدراسي *', 'Semester *')}</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white focus:border-teal-500"
              >
                <option value="الفصل الأول">{tr('الفصل الأول', 'First semester')}</option>
                <option value="الفصل الثاني">{tr('الفصل الثاني', 'Second semester')}</option>
                <option value="الفصل الصيفي">{tr('الفصل الصيفي', 'Summer semester')}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">{tr('العام الدراسي *', 'Academic year *')}</label>
              <input
                required
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500"
              />
            </div>
          </div>

          {/* Topics Discussed */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">{tr('المواضيع التي تم مناقشتها *', 'Topics discussed *')}</label>
            <textarea
              required
              rows={3}
              value={topicsDiscussed}
              onChange={(e) => setTopicsDiscussed(e.target.value)}
              placeholder={tr('اكتب النقاشات والمحاور الأكاديمية والمهنية التي تمت خلال الجلسة الإرشادية...', 'Describe the academic and professional topics discussed during the advising session...')}
              className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed font-serif focus:border-teal-500"
            />
          </div>

          {/* Recommendations */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">{tr('التوصيات وخطط المتابعة *', 'Recommendations and follow-up plan *')}</label>
            <textarea
              required
              rows={3}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder={tr('اكتب التوصيات المقترحة، وخطط تحسين الأداء الأكاديمي، أو المتابعات القادمة...', 'Write recommendations, academic improvement plans, or next follow-up steps...')}
              className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed font-serif focus:border-teal-500"
            />
          </div>

          {/* Advisor Name */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">{tr('اسم المرشد الأكاديمي', 'Academic adviser name')}</label>
            <input
              type="text"
              value={advisorName}
              onChange={(e) => setAdvisorName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500"
            />
          </div>

          {/* File Attachments Section */}
          <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-teal-600" />
                <span>{tr('إرفاق ملفات ومستندات مساندة (اختياري):', 'Supporting files and documents (optional):')}</span>
              </label>

              <label className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs">
                <Upload className="w-3.5 h-3.5" />
                <span>{tr('رفع ملف', 'Upload file')}</span>
                <input type="file" multiple onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {attachments.length > 0 ? (
              <div className="space-y-1.5 pt-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-bold text-slate-800 truncate">{file.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({file.size})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="p-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">{tr('يمكنك إرفاق تقارير، وثائق إثبات، كشوف درجات أو عذريات رسمية.', 'You can attach reports, supporting documents, grade reports, or official excuse letters.')}</p>
            )}
          </div>

          {/* Footer Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onPreviewPrint(getConstructedPayload())}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 border border-slate-200"
            >
              <Printer className="w-4 h-4 text-teal-600" />
              <span>{tr('معاينة للطباعة والـ PDF', 'Preview for print and PDF')}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-600/20"
              >
                {tr('حفظ النموذج في السجل', 'Save form to records')}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
