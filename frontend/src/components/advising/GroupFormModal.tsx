import { useState } from 'react';
import { X, FileText, Upload, Paperclip, Printer, Users, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';

interface GroupFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: any) => void;
  onPreviewPrint: (formData: any) => void;
}

export function GroupFormModal({ isOpen, onClose, onSave, onPreviewPrint }: GroupFormModalProps) {
  const { locale } = useI18n();
  const { user } = useAuth();

  const [meetingNumber, setMeetingNumber] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendeesCount, setAttendeesCount] = useState<number>(12);
  const [absentCount, setAbsentCount] = useState<number>(0);
  const [topicsDiscussed, setTopicsDiscussed] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [advisorName, setAdvisorName] = useState(user?.name || 'د. رامي القواسمة');
  const [attachments, setAttachments] = useState<{ name: string; url: string; size?: string }[]>([]);

  if (!isOpen) return null;

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
      form_type: 'group',
      meeting_number: meetingNumber,
      date,
      attendees_count: Number(attendeesCount),
      absent_count: Number(absentCount),
      topics_discussed: topicsDiscussed.trim(),
      recommendations: recommendations.trim(),
      advisor_name: advisorName.trim(),
      attachments
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicsDiscussed.trim()) {
      alert(locale === 'ar' ? 'يرجى إدخال محاور الاجتماع الجماعي' : 'Please enter meeting topics');
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
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">تعبئة نموذج محضر اجتماع إرشادي (جماعي)</h3>
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
          
          {/* Meeting General Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">رقم اللقاء الإرشادي *</label>
              <input
                required
                type="text"
                value={meetingNumber}
                onChange={(e) => setMeetingNumber(e.target.value)}
                placeholder="مثال: 1 (اللقاء الأول)"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-bold focus:border-teal-500 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">تاريخ اللقاء *</label>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">عدد الطلاب الحاضرين *</label>
              <input
                required
                type="number"
                min={0}
                value={attendeesCount}
                onChange={(e) => setAttendeesCount(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-bold focus:border-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">عدد الطلاب الغائبين *</label>
              <input
                required
                type="number"
                min={0}
                value={absentCount}
                onChange={(e) => setAbsentCount(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs font-bold focus:border-teal-500"
              />
            </div>
          </div>

          {/* Agenda & Topics */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">محاور الاجتماع الجماعي *</label>
            <textarea
              required
              rows={3}
              value={topicsDiscussed}
              onChange={(e) => setTopicsDiscussed(e.target.value)}
              placeholder="اكتب النقاشات العامة، التوجيهات الأكاديمية، الخطة الدراسية، أو التجهيز للامتحانات السريرية..."
              className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed font-serif focus:border-teal-500"
            />
          </div>

          {/* Recommendations */}
          <div className="space-y-1">
            <label className="block font-bold text-slate-700">التوصيات والقرارات الجماعية *</label>
            <textarea
              required
              rows={3}
              value={recommendations}
              onChange={(e) => setRecommendations(e.target.value)}
              placeholder="اكتب التوصيات الجماعية المتفق عليها وساعات الإرشاد الإضافية والمتابعات..."
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
                <span>إرفاق كشوفات الحضور أو المحاضر المصورة (اختياري):</span>
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
              <p className="text-[11px] text-slate-400">يمكنك إرفاق صور محضر الاجتماع، كشوف التوقيع، أو العرض التقديمي.</p>
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
