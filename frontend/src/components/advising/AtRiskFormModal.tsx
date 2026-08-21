import React, { useState } from 'react';
import { X, FileText, Upload, Paperclip, Printer, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';

interface AtRiskStudentRow {
  name: string;
  university_number: string;
  level: string;
  gpa: string;
  issue: string;
  warning_count: number;
  failed_courses: string;
}

interface AtRiskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (formData: any) => void;
  onPreviewPrint: (formData: any) => void;
}

export function AtRiskFormModal({ isOpen, onClose, onSave, onPreviewPrint }: AtRiskFormModalProps) {
  const { locale } = useI18n();
  const { user } = useAuth();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [advisorName, setAdvisorName] = useState(user?.name || 'د. رامي القواسمة');
  const [students, setStudents] = useState<AtRiskStudentRow[]>([
    { name: '', university_number: '', level: 'السنة الرابعة', gpa: '62.5', issue: 'انخفاض المعدل عن 65%', warning_count: 1, failed_courses: 'M1460' }
  ]);
  const [attachments, setAttachments] = useState<{ name: string; url: string; size?: string }[]>([]);

  // Query live students for auto-fill
  const { data: rawStudentsList } = useQuery({
    queryKey: ['students-at-risk-dropdown'],
    queryFn: () => apiFetch<any>('/students?per_page=300'),
    enabled: isOpen
  });

  const availableStudents = Array.isArray(rawStudentsList) 
    ? rawStudentsList 
    : rawStudentsList?.data || rawStudentsList?.items || [];

  if (!isOpen) return null;

  const handleAddRow = () => {
    setStudents(prev => [
      ...prev, 
      { name: '', university_number: '', level: 'السنة الخامسة', gpa: '58.0', issue: 'انخفاض المعدل التراكمي', warning_count: 1, failed_courses: 'M1582' }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setStudents(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateRow = (index: number, field: keyof AtRiskStudentRow, value: any) => {
    setStudents(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleSelectDropdownStudent = (index: number, stId: string) => {
    const found = availableStudents.find((s: any) => String(s.id) === stId || s.university_number === stId);
    if (found) {
      setStudents(prev => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          name: found.full_name_ar || found.full_name_en,
          university_number: found.university_number,
          level: found.academic_level === 'fourth' ? 'السنة الرابعة' : found.academic_level === 'fifth' ? 'السنة الخامسة' : 'السنة السادسة',
          gpa: found.gpa ? String(found.gpa) : '62.0',
          warning_count: found.warning_count || 0
        };
        return updated;
      });
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

  const getConstructedPayload = () => {
    return {
      id: Date.now().toString(),
      form_type: 'at_risk',
      date,
      advisor_name: advisorName.trim(),
      students,
      attachments
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (students.length === 0 || !students.some(s => s.name.trim())) {
      alert(locale === 'ar' ? 'يرجى إدخال بيانات طالب متعثر واحد على الأقل' : 'Please add at least one student');
      return;
    }
    onSave(getConstructedPayload());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">استمارة/نموذج الطلبة المتعثرين أكاديمياً</h3>
              <p className="text-xs text-slate-400">تعبأ من قبل المرشد الأكاديمي فصلياً ومتابعتها مع لجنة الإرشاد</p>
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block font-bold text-slate-700">تاريخ إعداد الاستمارة *</label>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-slate-700">اسم المرشد الأكاديمي</label>
              <input
                type="text"
                value={advisorName}
                onChange={(e) => setAdvisorName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold focus:border-amber-500"
              />
            </div>
          </div>

          {/* Table Header & Add Row Button */}
          <div className="flex items-center justify-between pt-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>جدول رصد الطلبة المتعثرين (الإنذارات والمعدل أقل من 65%):</span>
              <span className="bg-amber-100 text-amber-800 text-[11px] font-mono px-2 py-0.5 rounded-md font-bold">
                {students.length}
              </span>
            </h4>

            <button
              type="button"
              onClick={handleAddRow}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة طالب متعثر</span>
            </button>
          </div>

          {/* Dynamic Table of Struggling Students */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-2 text-center w-8">#</th>
                  <th className="p-2 text-start min-w-[160px]">اختيار / اسم الطالب</th>
                  <th className="p-2 text-center w-28">الرقم الجامعي</th>
                  <th className="p-2 text-center w-24">المستوى</th>
                  <th className="p-2 text-center w-20">المعدل %</th>
                  <th className="p-2 text-start min-w-[150px]">المشكلة الأكاديمية</th>
                  <th className="p-2 text-center w-16">الإنذارات</th>
                  <th className="p-2 text-start min-w-[140px]">المساقات غير المجتازة</th>
                  <th className="p-2 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {students.map((st, idx) => (
                  <tr key={idx}>
                    <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                    
                    <td className="p-1.5 space-y-1">
                      <select
                        onChange={(e) => handleSelectDropdownStudent(idx, e.target.value)}
                        className="w-full text-[11px] p-1 rounded-lg border border-slate-200 bg-slate-50 font-bold"
                      >
                        <option value="">-- تفريغ / اختار طالباً --</option>
                        {availableStudents.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.full_name_ar} ({s.gpa}%)</option>
                        ))}
                      </select>
                      <input
                        required
                        type="text"
                        value={st.name}
                        onChange={(e) => handleUpdateRow(idx, 'name', e.target.value)}
                        placeholder="اسم الطالب"
                        className="w-full text-xs p-1.5 rounded-lg border border-slate-200 font-bold"
                      />
                    </td>

                    <td className="p-1.5">
                      <input
                        required
                        type="text"
                        value={st.university_number}
                        onChange={(e) => handleUpdateRow(idx, 'university_number', e.target.value)}
                        placeholder="2110xxxx"
                        className="w-full text-xs text-center font-mono p-1.5 rounded-lg border border-slate-200 font-bold"
                      />
                    </td>

                    <td className="p-1.5">
                      <input
                        type="text"
                        value={st.level}
                        onChange={(e) => handleUpdateRow(idx, 'level', e.target.value)}
                        className="w-full text-xs text-center p-1.5 rounded-lg border border-slate-200"
                      />
                    </td>

                    <td className="p-1.5">
                      <input
                        type="text"
                        value={st.gpa}
                        onChange={(e) => handleUpdateRow(idx, 'gpa', e.target.value)}
                        className="w-full text-xs text-center font-bold text-amber-700 p-1.5 rounded-lg border border-slate-200"
                      />
                    </td>

                    <td className="p-1.5">
                      <input
                        type="text"
                        value={st.issue}
                        onChange={(e) => handleUpdateRow(idx, 'issue', e.target.value)}
                        placeholder="سبب التعثر"
                        className="w-full text-xs p-1.5 rounded-lg border border-slate-200"
                      />
                    </td>

                    <td className="p-1.5">
                      <input
                        type="number"
                        min={0}
                        value={st.warning_count}
                        onChange={(e) => handleUpdateRow(idx, 'warning_count', Number(e.target.value))}
                        className="w-full text-xs text-center font-bold p-1.5 rounded-lg border border-slate-200"
                      />
                    </td>

                    <td className="p-1.5">
                      <input
                        type="text"
                        value={st.failed_courses}
                        onChange={(e) => handleUpdateRow(idx, 'failed_courses', e.target.value)}
                        placeholder="رمز المساقات"
                        className="w-full text-xs p-1.5 rounded-lg border border-slate-200"
                      />
                    </td>

                    <td className="p-1.5 text-center">
                      {students.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="p-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* File Attachments Section */}
          <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-amber-600" />
                <span>إرفاق خطط تحسين أداء أو ملفات داعمة للمتعثرين:</span>
              </label>

              <label className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs">
                <Upload className="w-3.5 h-3.5" />
                <span>رفع ملف</span>
                <input type="file" multiple onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {attachments.map((file, idx) => (
                  <div key={idx} className="bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-bold text-slate-800 truncate">{file.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({file.size})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onPreviewPrint(getConstructedPayload())}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 border border-slate-200"
            >
              <Printer className="w-4 h-4 text-amber-600" />
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
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20"
              >
                حفظ استمارة المتعثرين
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
