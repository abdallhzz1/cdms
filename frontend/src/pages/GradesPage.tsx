import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Filter, GraduationCap, Printer, Search, Save, Send, AlertCircle, ArrowLeftRight } from 'lucide-react';

interface StudentGradeRecord {
  studentId: number;
  universityNumber: string;
  nameAr: string;
  nameEn?: string;
  photoUrl?: string;
  clinicalScore: number | null; // 20%
  osceScore: number | null;     // 40%
  writtenScore: number | null;  // 40%
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  returnReason?: string;
}

const defaultClinicalCourses = [
  { id: 1, name_ar: 'الطب الباطني السريري 1', name_en: 'Clinical Internal Medicine 1', code: 'MED401', level: 'fourth', credits: 9 },
  { id: 2, name_ar: 'الجراحة العامة السريرية 1', name_en: 'Clinical General Surgery 1', code: 'SUR402', level: 'fourth', credits: 9 },
  { id: 3, name_ar: 'طب الأطفال السريري 1', name_en: 'Clinical Pediatrics 1', code: 'PED403', level: 'fourth', credits: 9 },
  { id: 4, name_ar: 'النسائية والتوليد السريرية 1', name_en: 'Clinical Obstetrics & Gynecology 1', code: 'OBG404', level: 'fourth', credits: 9 },
];

export function GradesPage() {
  const { user, can } = useAuth();
  const { locale } = useI18n();
  const qc = useQueryClient();

  const [selectedLevel, setSelectedLevel] = useState('fourth');
  const [selectedCourseId, setSelectedCourseId] = useState(1);
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const { data: coursesData } = useQuery({
    queryKey: ['admin-courses'],
    queryFn: () => apiFetch<any>('/courses?per_page=100'),
  });

  const { data: studentsData } = useQuery({
    queryKey: ['admin-students'],
    queryFn: () => apiFetch<any>('/students?per_page=500'),
  });

  const allCoursesList = useMemo(() => Array.isArray(coursesData) ? coursesData : coursesData?.items || defaultClinicalCourses, [coursesData]);
  const liveCoursesList = allCoursesList.filter((c: any) => c.academic_level === selectedLevel || c.level === selectedLevel);
  const availableCourses = liveCoursesList.length > 0 ? liveCoursesList : defaultClinicalCourses.filter(c => c.level === selectedLevel);
  
  const activeCourse = useMemo(() => {
    return availableCourses.find((c: any) => c.id === selectedCourseId) || availableCourses[0];
  }, [selectedCourseId, availableCourses]);
  
  // Fetch real grade entries from DB
  const { data: gradesData, isLoading: isLoadingGrades } = useQuery({
    queryKey: ['grade-entries', activeCourse?.code, academicYear],
    queryFn: () => apiFetch<any>(`/grade-entries?course_code=${activeCourse?.code}&academic_year=${academicYear}&per_page=500`),
    enabled: !!activeCourse?.code
  });
  
  const allStudentsList = useMemo(() => Array.isArray(studentsData) ? studentsData : studentsData?.items || [], [studentsData]);
  const levelStudents = useMemo(() => {
    return allStudentsList.filter((s: any) => {
      const lvl = String(s.academic_level).toLowerCase();
      if (selectedLevel === 'fourth') return lvl.includes('4') || lvl.includes('fourth') || lvl.includes('رابع');
      if (selectedLevel === 'fifth') return lvl.includes('5') || lvl.includes('fifth') || lvl.includes('خامس');
      if (selectedLevel === 'sixth') return lvl.includes('6') || lvl.includes('sixth') || lvl.includes('سادس');
      return false;
    });
  }, [allStudentsList, selectedLevel]);

  const [gradeRecords, setGradeRecords] = useState<StudentGradeRecord[]>([]);

  useEffect(() => {
    const rawGrades = Array.isArray(gradesData) ? gradesData : (gradesData?.items || gradesData?.data || []);
    
    // Map DB grades by student ID
    const dbGradesMap = new Map();
    rawGrades.forEach((g: any) => {
      if (g.enrollment?.student?.id) {
        dbGradesMap.set(g.enrollment.student.id, g);
      }
    });
    
    const unified: StudentGradeRecord[] = levelStudents.map((student: any) => {
      const dbEntry = dbGradesMap.get(student.id);
      
      return {
        studentId: student.id,
        universityNumber: student.university_number,
        nameAr: student.full_name_ar,
        nameEn: student.full_name_en,
        photoUrl: student.photo_url,
        clinicalScore: dbEntry ? Number(dbEntry.clinical_score) : null,
        osceScore: dbEntry ? Number(dbEntry.osce_score) : null,
        writtenScore: dbEntry ? Number(dbEntry.written_score) : null,
        status: dbEntry ? dbEntry.status : 'draft',
        returnReason: dbEntry?.notes
      };
    });
    
    setGradeRecords(unified);
  }, [levelStudents, gradesData]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (records: StudentGradeRecord[]) => {
      const payload = records.map(r => ({
        student_id: r.studentId,
        clinical_score: r.clinicalScore,
        osce_score: r.osceScore,
        written_score: r.writtenScore,
        score: calculateTotal(r),
        max_score: 100
      }));
      return apiFetch('/grade-entries/batch', {
        method: 'POST',
        body: { course_code: activeCourse.code, academic_year: academicYear, grades: payload }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-entries'] });
      setSuccessMessage('تم حفظ العلامات بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  });
  
  const submitMutation = useMutation({
    mutationFn: () => apiFetch('/grade-entries/batch-submit', { method: 'POST', body: { course_code: activeCourse.code, academic_year: academicYear } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-entries'] });
      setIsSubmitModalOpen(false);
      setSuccessMessage('تم تسليم العلامات للاعتماد.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  });

  const approveMutation = useMutation({
    mutationFn: () => apiFetch('/grade-entries/batch-approve', { method: 'POST', body: { course_code: activeCourse.code, academic_year: academicYear } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-entries'] });
      setIsApproveModalOpen(false);
      setSuccessMessage('تم اعتماد العلامات نهائياً.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  });

  const returnMutation = useMutation({
    mutationFn: () => apiFetch('/grade-entries/batch-return', { method: 'POST', body: { course_code: activeCourse.code, academic_year: academicYear, reason: returnReason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grade-entries'] });
      setIsReturnModalOpen(false);
      setReturnReason('');
      setSuccessMessage('تم إرجاع العلامات للتعديل.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  });

  const calculateTotal = (record: StudentGradeRecord) => {
    const c = record.clinicalScore ?? 0;
    const o = record.osceScore ?? 0;
    const w = record.writtenScore ?? 0;
    const hasAny = record.clinicalScore !== null || record.osceScore !== null || record.writtenScore !== null;
    if (!hasAny) return null;
    return Math.min(100, Math.round((c + o + w) * 10) / 10);
  };

  const getLetterGrade = (total: number | null): string => {
    if (total === null) return '—';
    const rounded = Math.round(total);
    if (rounded >= 95) return 'A+';
    if (rounded >= 90) return 'A';
    if (rounded >= 87) return 'B+';
    if (rounded >= 83) return 'B';
    if (rounded >= 80) return 'B-';
    if (rounded >= 75) return 'C+';
    if (rounded >= 70) return 'C';
    if (rounded >= 67) return 'C-';
    if (rounded >= 64) return 'D+';
    if (rounded >= 60) return 'D';
    return 'E';
  };

  const handleScoreChange = (index: number, field: keyof StudentGradeRecord, value: string) => {
    const updated = [...gradeRecords];
    const numericValue = value === '' ? null : Math.max(0, parseFloat(value));
    (updated[index] as any)[field] = numericValue;
    setGradeRecords(updated);
  };
  
  const handleSaveGrades = () => {
    saveMutation.mutate(gradeRecords);
  };

  const filteredRecords = gradeRecords.filter(r => 
    r.nameAr.includes(searchTerm) || 
    r.universityNumber.includes(searchTerm) || 
    (r.nameEn && r.nameEn.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isReadOnly = gradeRecords.some(r => r.status === 'submitted' || r.status === 'approved');
  const canApprove = can('grades.approve') || user?.role === 'DEPARTMENT_HEAD' || user?.role === 'SYS_ADMIN';
  const hasSubmittedRecords = gradeRecords.some(r => r.status === 'submitted');
  const isApproved = gradeRecords.some(r => r.status === 'approved');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader title="سجل علامات التدوير السريري" description="إدخال ومراجعة العلامات السريرية، وامتحانات الأوسكي، والامتحان الكتابي للطلبة." />
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2 bg-white text-xs font-bold shadow-sm rounded-xl"><Printer className="w-4 h-4" /> طباعة الكشف</Button>
          <Button variant="outline" className="gap-2 bg-white text-xs font-bold shadow-sm rounded-xl"><Download className="w-4 h-4" /> تصدير Excel</Button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header Controls */}
      <Card className="p-5 border-slate-100 shadow-sm flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">المرحلة الدراسية</label>
          <select value={selectedLevel} onChange={(e) => { setSelectedLevel(e.target.value); setSelectedCourseId(availableCourses[0]?.id || 1); }} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold bg-slate-50 outline-none w-[180px]">
            <option value="fourth">سنة رابعة</option>
            <option value="fifth">سنة خامسة</option>
            <option value="sixth">سنة سادسة</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1">المساق السريري</label>
          <select value={selectedCourseId} onChange={(e) => setSelectedCourseId(Number(e.target.value))} className="px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold bg-slate-50 outline-none w-[250px]">
            {availableCourses.map((c: any) => (<option key={c.id} value={c.id}>{locale === 'ar' ? c.name_ar : c.name_en}</option>))}
          </select>
        </div>
        <div className="mr-auto self-end flex gap-2">
          {!isReadOnly && (
            <Button onClick={handleSaveGrades} disabled={saveMutation.isPending} className="bg-slate-900 hover:bg-slate-800 text-white gap-2 font-bold text-xs rounded-xl shadow-sm">
              <Save className="w-4 h-4" /> حفظ مسودة
            </Button>
          )}
          {!isReadOnly && gradeRecords.length > 0 && (
            <Button onClick={() => setIsSubmitModalOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white gap-2 font-bold text-xs rounded-xl shadow-sm">
              <Send className="w-4 h-4" /> تسليم الاعتماد
            </Button>
          )}
          {hasSubmittedRecords && canApprove && !isApproved && (
            <div className="flex gap-2">
               <Button onClick={() => setIsReturnModalOpen(true)} className="bg-amber-100 text-amber-700 hover:bg-amber-200 gap-2 font-bold text-xs rounded-xl shadow-sm">
                 <ArrowLeftRight className="w-4 h-4" /> إرجاع للتعديل
               </Button>
               <Button onClick={() => setIsApproveModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-bold text-xs rounded-xl shadow-sm">
                 <CheckCircle2 className="w-4 h-4" /> اعتماد نهائي
               </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Main Table */}
      <Card className="border-slate-100 shadow-sm overflow-hidden">
        {isLoadingGrades ? (
           <div className="p-12"><LoadingState /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                <tr>
                  <th className="p-4">الرقم الجامعي</th>
                  <th className="p-4">اسم الطالب</th>
                  <th className="p-4 w-[120px] text-center">التقييم السريري<br/><span className="text-[10px] text-teal-600">20%</span></th>
                  <th className="p-4 w-[120px] text-center">الأوسكي<br/><span className="text-[10px] text-indigo-600">40%</span></th>
                  <th className="p-4 w-[120px] text-center">الكتابي<br/><span className="text-[10px] text-emerald-600">40%</span></th>
                  <th className="p-4 w-[100px] text-center bg-slate-100">المجموع</th>
                  <th className="p-4 w-[80px] text-center">الرمز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r, idx) => {
                  const originalIndex = gradeRecords.findIndex(gr => gr.studentId === r.studentId);
                  const total = calculateTotal(r);
                  const letter = getLetterGrade(total);
                  return (
                    <tr key={r.studentId} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-4 font-mono font-bold text-slate-600">{r.universityNumber}</td>
                      <td className="p-4 font-bold text-slate-900">{r.nameAr}</td>
                      <td className="p-4">
                        <input
                          type="number"
                          max={20} min={0} step={0.5}
                          value={r.clinicalScore ?? ''}
                          disabled={isReadOnly}
                          onChange={(e) => handleScoreChange(originalIndex, 'clinicalScore', e.target.value)}
                          className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none font-bold text-teal-700 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          max={40} min={0} step={0.5}
                          value={r.osceScore ?? ''}
                          disabled={isReadOnly}
                          onChange={(e) => handleScoreChange(originalIndex, 'osceScore', e.target.value)}
                          className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-bold text-indigo-700 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-4">
                        <input
                          type="number"
                          max={40} min={0} step={0.5}
                          value={r.writtenScore ?? ''}
                          disabled={isReadOnly}
                          onChange={(e) => handleScoreChange(originalIndex, 'writtenScore', e.target.value)}
                          className="w-full text-center px-2 py-1.5 rounded-lg border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-bold text-emerald-700 disabled:bg-slate-50"
                        />
                      </td>
                      <td className="p-4 text-center bg-slate-50 font-black text-lg text-slate-800">
                        {total !== null ? total : '-'}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-black ${
                          letter === 'A+' || letter === 'A' ? 'bg-emerald-100 text-emerald-700' :
                          letter.startsWith('B') ? 'bg-teal-100 text-teal-700' :
                          letter.startsWith('C') ? 'bg-indigo-100 text-indigo-700' :
                          letter === '—' ? 'bg-slate-100 text-slate-400' : 'bg-red-100 text-red-700'
                        }`}>{letter}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      
      {/* Modals */}
      <Modal isOpen={isSubmitModalOpen} onClose={() => setIsSubmitModalOpen(false)} title="تأكيد تسليم العلامات">
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-xl text-amber-800 flex gap-3 text-sm font-semibold border border-amber-100">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p>هل أنت متأكد من تسليم الكشف؟ لن تتمكن من التعديل عليه بعد التسليم إلا إذا قام رئيس القسم بإرجاعه.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsSubmitModalOpen(false)}>إلغاء</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white font-bold">تأكيد التسليم</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isApproveModalOpen} onClose={() => setIsApproveModalOpen(false)} title="الاعتماد النهائي للعلامات">
        <div className="space-y-4">
          <div className="p-4 bg-indigo-50 rounded-xl text-indigo-800 flex gap-3 text-sm font-semibold border border-indigo-100">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <p>اعتماد الكشف نهائياً يعني إغلاقه وإرسال العلامات إلى السجل الأكاديمي للطلبة بشكل رسمي.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsApproveModalOpen(false)}>إلغاء</Button>
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">اعتماد نهائي</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isReturnModalOpen} onClose={() => setIsReturnModalOpen(false)} title="إرجاع الكشف للتعديل">
        <div className="space-y-4">
          <div className="p-4 bg-red-50 rounded-xl text-red-800 flex gap-3 text-sm font-semibold border border-red-100">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>سيتم إرجاع الكشف إلى مساعد البحث والتدريس (RTA) للتعديل وإعادة التسليم.</p>
          </div>
          <div>
             <label className="block text-xs font-bold text-slate-700 mb-2">سبب الإرجاع وملاحظات التعديل</label>
             <textarea 
               value={returnReason} 
               onChange={(e) => setReturnReason(e.target.value)}
               className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-amber-500"
               rows={4} 
               placeholder="يرجى توضيح التعديلات المطلوبة بوضوح..."
             />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsReturnModalOpen(false)}>إلغاء</Button>
            <Button onClick={() => returnMutation.mutate()} disabled={returnMutation.isPending} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">إرجاع للتعديل</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
