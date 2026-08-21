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
      setStudentName(found.full_name_ar || found.full_name_en);
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
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">تعبئة نموذج محضر اجتماع إرشادي (فردي)</h3>
              <p className="text-xs text-slate-400">جامعة الخليل — كلية الطب البشري — دائرة ضمان الجودة والتطوير</p>
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
            <label className="block font-bold text-slate-700">اختر الطالب من القائمة الأكاديمية (أو أدخل يدوياً):</label>
            <select
              value={studentId}
              onChange={(e) => handleSelectStudent(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white focus:border-teal-500"
            >
              <option value="">-- اختر طالباً من دليل الكلية --</option>
              {studentsList.map((st: any) => (
                <option key={st.id} value={st.id}>
                  {st.full_name_ar} ({st.university_number}) — {st.academic_level || 'السنة السريرية'}
                </option>
              ))}
            </select>
          </div>

          {/* Student Info Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">اسم الطالب الثلاثي / الرباعي *</label>
              <input
                required
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="مثال: احمد اسماعيل عيسى غانم"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">الرقم الجامعي *</label>
              <input
                required
                type="text"
                value={universityNumber}
                onChange={(e) => setUniversityNumber(e.target.value)}
                placeholder="مثال: 21105432"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-bold focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">الفصل الدراسي *</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-white focus:border-teal-500"
              >
                <option value="الفصل الأول">الفصل الأول</option>
                <option value="الفصل الثاني">الفصل الثاني</option>
                <option value="الفصل الصيفي">الفصل الصيفي</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">العام الدراسي *</label>
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
            <label className="block font-bold text-slate-700">المواضيع التي تم مناقشتها *</label>
            <textarea
              required
              rows={3}
              value={topicsDiscussed}
              onChange={(e) => setTopicsDiscussed(e.target.value)}
              placeholder="اكتب النقاشات والمحاور الأكاديمية والمهنية التي تمت خلال الجلسة الإرشادية..."
              className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed font-serif focus:border-teal-500"
            />
          </div>

          {/* Recommendations */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">التوصيات والخطط العلاجية *</label>
            <textarea
              required
              rows={3}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="اكتب التوصيات المقترحة، خطط تحسين الأداء الأكاديمي، أو المتابعات القادمة..."
              className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed font-serif focus:border-teal-500"
            />
          </div>

          {/* Advisor Name */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">اسم المرشد الأكاديمي</label>
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
                <span>إرفاق ملفات ومستندات مساندة (اختياري):</span>
              </label>

              <label className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs">
                <Upload className="w-3.5 h-3.5" />
                <span>رفع ملف</span>
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
              <p className="text-[11px] text-slate-400">يمكنك إرفاق تقارير، وثائق إثبات، كشوف درجات أو عذريات رسمية.</p>
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
              <span>معاينة للطباعة والـ PDF</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-600/20"
              >
                حفظ النموذج السجل
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
