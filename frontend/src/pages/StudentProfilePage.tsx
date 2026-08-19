import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { 
  ChevronRight, Camera, GraduationCap, 
  Building2, Clock, 
  User, CheckCircle2, XCircle, FolderOpen,
  UploadCloud, FileText, Download, Trash2, Plus, X, Eye
} from 'lucide-react';

type ProfileTab = 'overview' | 'academic' | 'clinical' | 'attendance' | 'documents';

interface StudentDoc {
  id: string;
  title: string;
  category: string;
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  uploadedBy: string;
  dataUrl?: string;
  fileType?: string;
}

export function StudentProfilePage() {
  const navigate = useNavigate();
  const { id: studentId } = useParams<{ id: string }>();
  const { locale, t } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<StudentDoc | null>(null);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('clinical_pledge');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);

  // Documents state loaded from storage for this student only (empty by default if none uploaded)
  const [documents, setDocuments] = useState<StudentDoc[]>(() => {
    if (!studentId) return [];
    const saved = localStorage.getItem(`student_docs_${studentId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Re-sync documents when studentId changes
  useEffect(() => {
    if (studentId) {
      const saved = localStorage.getItem(`student_docs_${studentId}`);
      if (saved) {
        try {
          setDocuments(JSON.parse(saved));
        } catch (e) {
          setDocuments([]);
        }
      } else {
        setDocuments([]);
      }
    }
  }, [studentId]);

  // Save documents whenever updated
  useEffect(() => {
    if (studentId) {
      localStorage.setItem(`student_docs_${studentId}`, JSON.stringify(documents));
    }
  }, [documents, studentId]);

  // Main student data
  const { data: student_data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => apiFetch(`/students/${studentId}`),
    enabled: Boolean(studentId)
  });

  // Enrollments & Grades
  const { data: enrollments = [] } = useQuery({
    queryKey: ['student-enrollments', studentId],
    queryFn: () => apiFetch<any[]>(`/student-course-enrollments?student_id=${studentId}`),
    enabled: Boolean(studentId)
  });

  // Clinical Schedule / Rotations
  const { data: clinicalSchedule = [] } = useQuery({
    queryKey: ['student-clinical-schedule', studentId],
    queryFn: () => apiFetch<any[]>(`/students/${studentId}/current-clinical-schedule`),
    enabled: Boolean(studentId)
  });

  // Advising Records
  const { data: advisingRecords = [] } = useQuery({
    queryKey: ['student-advising-records', studentId],
    queryFn: () => apiFetch<any[]>(`/advising-records?student_id=${studentId}`),
    enabled: Boolean(studentId)
  });

  // Attendance Records
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['student-attendance-records', studentId],
    queryFn: () => apiFetch<any[]>(`/attendance-records?student_id=${studentId}`),
    enabled: Boolean(studentId)
  });

  // Local optimistic student photo state
  const [localPhoto, setLocalPhoto] = useState<string | null>(() => {
    return studentId ? localStorage.getItem(`student_photo_${studentId}`) : null;
  });

  useEffect(() => {
    if (studentId) {
      const cached = localStorage.getItem(`student_photo_${studentId}`);
      if (cached) setLocalPhoto(cached);
    }
  }, [studentId]);

  // Upload Photo Mutation
  const updatePhotoMutation = useMutation({
    mutationFn: (photoUrl: string) => apiFetch(`/students/${studentId}`, { 
      method: 'PUT', 
      body: { photo_url: photoUrl } 
    }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
      if (res?.data?.photo_url) {
        setLocalPhoto(res.data.photo_url);
        if (studentId) localStorage.setItem(`student_photo_${studentId}`, res.data.photo_url);
      }
    },
    onError: (err: any) => {
      console.error('Photo upload failed:', err);
    }
  });

  const compressImage = (file: File, maxSize: number = 400): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !studentId) return;

    try {
      const compressed = await compressImage(file, 400);
      setLocalPhoto(compressed);
      localStorage.setItem(`student_photo_${studentId}`, compressed);
      updatePhotoMutation.mutate(compressed);
    } catch (err) {
      console.error('Error compressing image:', err);
    }
  };

  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocFile && !newDocTitle) return;

    const fileName = selectedDocFile?.name || `${newDocTitle}.pdf`;
    const fileSize = selectedDocFile ? `${Math.round(selectedDocFile.size / 1024)} KB` : '350 KB';
    const fileType = selectedDocFile?.type || 'application/pdf';
    
    if (selectedDocFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newDoc: StudentDoc = {
          id: Date.now().toString(),
          title: newDocTitle || selectedDocFile.name,
          category: newDocCategory,
          fileName: fileName,
          fileSize: fileSize,
          uploadedAt: new Date().toISOString().split('T')[0],
          uploadedBy: locale === 'ar' ? 'المساعد الإداري' : 'Admin Assistant',
          dataUrl: event.target?.result as string,
          fileType: fileType,
        };
        setDocuments(prev => [newDoc, ...prev]);
        setIsDocModalOpen(false);
        setNewDocTitle('');
        setSelectedDocFile(null);
      };
      reader.readAsDataURL(selectedDocFile);
    } else {
      const newDoc: StudentDoc = {
        id: Date.now().toString(),
        title: newDocTitle,
        category: newDocCategory,
        fileName: fileName,
        fileSize: fileSize,
        uploadedAt: new Date().toISOString().split('T')[0],
        uploadedBy: locale === 'ar' ? 'المساعد الإداري' : 'Admin Assistant',
        fileType: 'application/pdf',
      };
      setDocuments(prev => [newDoc, ...prev]);
      setIsDocModalOpen(false);
      setNewDocTitle('');
      setSelectedDocFile(null);
    }
  };

  const handleDeleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من حذف هذه الوثيقة نهائياً؟' : 'Are you sure you want to delete this document?')) {
      setDocuments(prev => prev.filter(d => d.id !== id));
      if (previewDoc?.id === id) setPreviewDoc(null);
    }
  };

  const handleDownloadDoc = (doc: StudentDoc, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (doc.dataUrl) {
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = doc.fileName;
      a.click();
    } else {
      alert(locale === 'ar' ? `جاري تحميل ${doc.fileName}...` : `Downloading ${doc.fileName}...`);
    }
  };

  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      clinical_pledge: locale === 'ar' ? 'تعهد تدريب سريري' : 'Clinical Ethics Pledge',
      medical_report: locale === 'ar' ? 'فحص طبي وتطعيمات' : 'Medical Report',
      id_copy: locale === 'ar' ? 'بطاقة هوية / جواز سفر' : 'ID / Passport',
      tawjihi: locale === 'ar' ? 'كشف علامات توجيهي' : 'Tawjihi Certificate',
      other: locale === 'ar' ? 'وثيقة رسمية' : 'Document',
    };
    return map[cat] || (locale === 'ar' ? 'وثيقة رسمية' : 'Document');
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const student: any = student_data;
  if (!student) return <EmptyState title={t('state.not_found.title')} message={t('state.not_found.message')} />;
  
  const name = locale === 'ar' ? student.full_name_ar : (student.full_name_en || student.full_name_ar);
  const advisor = student.academic_advisor ? (locale === 'ar' ? student.academic_advisor.full_name_ar : (student.academic_advisor.full_name_en || student.academic_advisor.full_name_ar)) : null;

  const clinicalItems = Array.isArray(clinicalSchedule) ? clinicalSchedule : (clinicalSchedule as any)?.items || [];
  const advisingItems = Array.isArray(advisingRecords) ? advisingRecords : (advisingRecords as any)?.items || [];
  const attendanceItems = Array.isArray(attendanceRecords) ? attendanceRecords : (attendanceRecords as any)?.items || [];

  const stats = {
    present: attendanceItems.filter((r: any) => r.status === 'present').length,
    absent: attendanceItems.filter((r: any) => r.status === 'absent').length,
  };
  const totalSessions = attendanceItems.length;
  const attendanceRate = totalSessions > 0 ? Math.round((stats.present / totalSessions) * 100) : 100;

  const getLevelName = (lvl: string) => {
    if (lvl === 'fourth') return locale === 'ar' ? 'سنة رابعة' : '4th Year';
    if (lvl === 'fifth') return locale === 'ar' ? 'سنة خامسة' : '5th Year';
    if (lvl === 'sixth') return locale === 'ar' ? 'سنة سادسة' : '6th Year';
    return lvl;
  };

  const getBatchName = () => {
    if (student.batch_year) return `دفعة ${student.batch_year}`;
    if (student.academic_level === 'fourth') return 'دفعة 2022';
    if (student.academic_level === 'fifth') return 'دفعة 2021';
    return 'دفعة 2020';
  };

  const TABS = [
    { key: 'overview', label: locale === 'ar' ? 'البيانات الشخصية والإرشاد' : 'Overview & Info', icon: User },
    { key: 'academic', label: locale === 'ar' ? 'المساقات والعلامات' : 'Courses & Grades', icon: GraduationCap, count: enrollments.length },
    { key: 'clinical', label: locale === 'ar' ? 'التدريب والمستشفيات' : 'Clinical Training', icon: Building2, count: clinicalItems.length },
    { key: 'attendance', label: locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance', icon: Clock, count: attendanceItems.length },
    { key: 'documents', label: locale === 'ar' ? 'وثائق وملفات الطالب' : 'Documents', icon: FolderOpen, count: documents.length },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      
      {/* 1. Simple Top Back Link */}
      <div>
        <Link 
          to="/directory" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          <span>{locale === 'ar' ? 'العودة لدليل الطلاب' : 'Back to Students'}</span>
        </Link>
      </div>

      {/* 2. Pristine, Uncluttered Profile Header Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 text-center sm:text-start">
          
          {/* Clean Circular Photo with Upload Button */}
          <div className="relative shrink-0">
            <input 
              type="file" 
              ref={photoInputRef} 
              accept="image/*" 
              onChange={handlePhotoUpload} 
              className="hidden" 
            />

            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-2 border-slate-100 bg-teal-50 text-teal-700 shadow-sm flex items-center justify-center overflow-hidden">
              {(localPhoto || student.photo_url) ? (
                <img 
                  src={localPhoto || student.photo_url} 
                  alt={name} 
                  className="h-full w-full object-cover rounded-full" 
                />
              ) : (
                <span className="text-3xl font-black">
                  {name.substring(0, 1)}
                </span>
              )}
            </div>

            {can('students.update') && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                title={locale === 'ar' ? 'رفع / تغيير صورة الطالب' : 'Change photo'}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-teal-600 text-white shadow-md hover:bg-teal-700 transition-transform active:scale-95 border-2 border-white"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Student Core Info */}
          <div className="space-y-2 flex-1">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {name}
              </h1>
              {student.full_name_en && locale === 'ar' && (
                <p className="text-xs text-slate-400 mt-0.5">{student.full_name_en}</p>
              )}
            </div>

            {/* Badges Row */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-xl">
                {student.university_number}
              </span>

              <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-xl border border-teal-100">
                {getBatchName()}
              </span>

              <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-xl">
                {getLevelName(student.academic_level)}
              </span>

              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                {student.registration_status === 'active' ? (locale === 'ar' ? 'منتظم' : 'Active') : student.registration_status}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* 3. Clean Modern Tabs */}
      <div className="flex bg-slate-100/70 p-1.5 rounded-2xl gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ProfileTab)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-white text-slate-900 shadow-sm font-bold' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className={`px-1.5 py-0.2 rounded-md text-[11px] ${
                  isActive ? 'bg-slate-100 text-slate-800 font-bold' : 'bg-slate-200/60 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Tab Content Area */}
      
      {/* TAB 1: Overview & Personal Info */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          
          {/* Key Metrics in 1 neat card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              {locale === 'ar' ? 'المؤشرات الأكاديمية والسريرية' : 'Academic Summary'}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-3 rounded-2xl bg-slate-50/70">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'المعدل التراكمي' : 'GPA'}</span>
                <span className="text-base font-bold text-slate-800">{student.gpa || '—'} / 4.0</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'الساعات المقطوعة' : 'Passed Hours'}</span>
                <span className="text-base font-bold text-slate-800">{student.credit_hours_passed || 0} {locale === 'ar' ? 'ساعة' : 'Hrs'}</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'نسبة الحضور' : 'Attendance'}</span>
                <span className="text-base font-bold text-teal-700">{attendanceRate}%</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'المرشد الأكاديمي' : 'Advisor'}</span>
                <span className="text-xs font-bold text-slate-800 truncate block">{advisor || (locale === 'ar' ? 'لم يُعيّن' : '—')}</span>
              </div>
            </div>
          </div>

          {/* Contact Details in 1 neat card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              {locale === 'ar' ? 'بيانات الاتصال والهوية' : 'Contact & Personal Details'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'البريد الجامعي' : 'Email'}</span>
                <span className="font-semibold text-slate-800">{student.university_email || `${student.university_number}@hebron.edu`}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'رقم الهاتف' : 'Phone'}</span>
                <span className="font-semibold text-slate-800">{student.phone || '—'}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'المدينة / السكن' : 'City'}</span>
                <span className="font-semibold text-slate-800">{student.city || 'الخليل'}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'رقم الهوية' : 'National ID'}</span>
                <span className="font-semibold text-slate-800">{student.national_id || '—'}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'تاريخ الميلاد' : 'Birth Date'}</span>
                <span className="font-semibold text-slate-800">{student.date_of_birth || '—'}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'الجنس' : 'Gender'}</span>
                <span className="font-semibold text-slate-800">{student.gender === 'female' ? (locale === 'ar' ? 'أنثى' : 'Female') : (locale === 'ar' ? 'ذكر' : 'Male')}</span>
              </div>
            </div>
          </div>

          {/* Advising Sessions in simple list */}
          {advisingItems.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {locale === 'ar' ? 'آخر جلسات الإرشاد والمتابعة' : 'Advising Notes'}
              </h3>

              <div className="space-y-2.5">
                {advisingItems.slice(0, 3).map((log: any) => (
                  <div key={log.id} className="p-3.5 rounded-2xl bg-slate-50/70 text-xs space-y-1.5">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>{log.session_type || (locale === 'ar' ? 'جلسة إرشاد' : 'Session')}</span>
                      <span className="text-slate-400 font-normal">{log.meeting_date || log.created_at?.split('T')[0]}</span>
                    </div>
                    {log.notes && <p className="text-slate-600 leading-relaxed">{log.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: Courses & Grades */}
      {activeTab === 'academic' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          {enrollments.length === 0 ? (
            <EmptyState message={locale === 'ar' ? 'لا توجد مساقات مسجلة لهذا الطالب' : 'No courses found'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="pb-3 text-start font-bold">{locale === 'ar' ? 'رمز واسم المساق' : 'Course'}</th>
                    <th className="pb-3 text-start font-bold">{locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}</th>
                    <th className="pb-3 text-end font-bold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollments.map((enrollment: any) => (
                    <tr 
                      key={enrollment.id} 
                      onClick={() => enrollment.course?.id && navigate(`/courses/${enrollment.course.id}`)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5">
                        <span className="font-bold text-teal-700 hover:underline">{enrollment.course?.code}</span>
                        <span className="font-medium text-slate-700 mr-2 ml-2">
                          — {locale === 'ar' ? enrollment.course?.name_ar : (enrollment.course?.name_en || enrollment.course?.name_ar)}
                        </span>
                      </td>
                      <td className="py-3.5 text-slate-500">{enrollment.semester || 'الفصل الأول 2025/2026'}</td>
                      <td className="py-3.5 text-end">
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                          {enrollment.status || 'مسجل'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Clinical Placements */}
      {activeTab === 'clinical' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          {clinicalItems.length === 0 ? (
            <EmptyState message={locale === 'ar' ? 'لم يتم تعيين جدول تدريب سريري للطالب حتى الآن' : 'No clinical assignments'} />
          ) : (
            <div className="space-y-3">
              {clinicalItems.map((item: any, idx: number) => (
                <div key={item.id ?? idx} className="p-4 rounded-2xl bg-slate-50/70 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">
                      {locale === 'ar' ? item.training_site?.name_ar : (item.training_site?.name_en || item.training_site?.name_ar)}
                    </h4>
                    <p className="text-slate-500 mt-1">
                      {locale === 'ar' ? 'المشرف المسؤول: ' : 'Supervisor: '}
                      <span className="font-semibold text-slate-700">
                        {item.supervisor ? (locale === 'ar' ? item.supervisor?.full_name_ar : (item.supervisor?.full_name_en || item.supervisor?.full_name_ar)) : '—'}
                      </span>
                    </p>
                  </div>

                  <span className="px-3 py-1 rounded-xl font-bold bg-teal-50 text-teal-800 border border-teal-100">
                    {item.rotation_block?.block_code || 'دورة سريرية'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Attendance Log */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-100">
            <span className="text-slate-500 font-medium">{locale === 'ar' ? 'إجمالي الجلسات المسجلة' : 'Total Sessions'}: <strong>{attendanceItems.length}</strong></span>
            <div className="flex gap-2">
              <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg font-bold">{stats.present} حاضر</span>
              <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-lg font-bold">{stats.absent} غائب</span>
            </div>
          </div>

          {attendanceItems.length === 0 ? (
            <EmptyState message={locale === 'ar' ? 'لا توجد سجلات حضور مسجلة' : 'No attendance records'} />
          ) : (
            <div className="space-y-2">
              {attendanceItems.slice(0, 15).map((record: any) => (
                <div key={record.id} className="p-3 rounded-2xl bg-slate-50/70 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    {record.status === 'present' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                    <span className="font-bold text-slate-800">{record.date || record.created_at?.split('T')[0]}</span>
                    <span className="text-slate-500">{record.session_title || (locale === 'ar' ? 'تدريب سريري' : 'Clinical Shift')}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-lg font-bold ${
                    record.status === 'present' ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {record.status === 'present' ? (locale === 'ar' ? 'حاضر' : 'Present') : (locale === 'ar' ? 'غائب' : 'Absent')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Documents & Files */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
          
          {/* Documents Header & Add Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                {locale === 'ar' ? 'الوثائق والملفات الرسمية للطالب' : 'Student Documents & Attachments'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {locale === 'ar' ? 'الشهادات، التقارير الطبية، التعهدات السريرية، والوثائق الثبوتية المرفوعة' : 'Medical reports, pledges, and uploaded files'}
              </p>
            </div>

            {can('students.update') && (
              <Button 
                onClick={() => setIsDocModalOpen(true)}
                className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white text-xs font-bold shadow-md shadow-teal-500/25 flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{locale === 'ar' ? 'رفع وثيقة جديدة' : 'Upload Document'}</span>
              </Button>
            )}
          </div>

          {/* Documents List */}
          {documents.length === 0 ? (
            <div className="text-center py-10 px-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <FolderOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-xs font-bold text-slate-700">
                {locale === 'ar' ? 'لا توجد وثائق مرفوعة لهذا الطالب بعد' : 'No documents uploaded yet'}
              </h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                {locale === 'ar' ? 'يمكن للمساعد الإداري رفع الوثائق والشهادات الرسمية للطالب وحفظها ومعاينتها هنا.' : 'Admin Assistant can upload official files here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((doc) => (
                <div 
                  key={doc.id}
                  onClick={() => setPreviewDoc(doc)}
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 hover:bg-teal-50/30 hover:border-teal-200 transition-all flex items-start justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 border border-teal-100 group-hover:bg-teal-100 transition-colors">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-xs text-slate-800 truncate group-hover:text-teal-700 transition-colors" title={doc.title}>
                        {doc.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {getCategoryLabel(doc.category)} • {doc.fileSize}
                      </p>
                      <span className="text-[10px] font-medium text-slate-500 block mt-1">
                        {locale === 'ar' ? 'تاريخ الرفع: ' : 'Uploaded: '}{doc.uploadedAt}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setPreviewDoc(doc)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-white transition-colors"
                      title={locale === 'ar' ? 'معاينة الوثيقة' : 'Preview'}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDownloadDoc(doc, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-white transition-colors"
                      title={locale === 'ar' ? 'تنزيل الوثيقة' : 'Download'}
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {can('students.update') && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white transition-colors"
                        title={locale === 'ar' ? 'حذف الوثيقة' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. UPLOAD DOCUMENT MODAL */}
      {/* ========================================================================= */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'إرفاق وثيقة رسمية للطالب' : 'Upload Student Document'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {name}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  setIsDocModalOpen(false);
                  setSelectedDocFile(null);
                  setNewDocTitle('');
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddDocument} className="p-6 space-y-4">
              
              {/* Document Title */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم / عنوان الوثيقة *' : 'Document Title *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder={locale === 'ar' ? 'مثال: تقرير الفحص الطبي السريري 2025' : 'e.g. Clinical Health Report'}
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                />
              </div>

              {/* Document Category */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'نوع وتصنيف الوثيقة' : 'Category'}
                </label>
                <select
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="clinical_pledge">{locale === 'ar' ? 'تعهد تدريب سريري وأخلاقيات المهنة' : 'Clinical Ethics Pledge'}</option>
                  <option value="medical_report">{locale === 'ar' ? 'فحص طبي وتطعيمات سريرية' : 'Medical & Vaccine Report'}</option>
                  <option value="id_copy">{locale === 'ar' ? 'صورة الهوية / جواز السفر' : 'ID / Passport Copy'}</option>
                  <option value="tawjihi">{locale === 'ar' ? 'كشف علامات الثانوية العامة' : 'Tawjihi Certificate'}</option>
                  <option value="other">{locale === 'ar' ? 'وثيقة أخرى' : 'Other Document'}</option>
                </select>
              </div>

              {/* File Picker */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'الملف المرفق (PDF, صور, Word)' : 'Attach File'}
                </label>

                <input 
                  type="file" 
                  ref={docFileInputRef}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                  onChange={(e) => setSelectedDocFile(e.target.files?.[0] || null)}
                  className="hidden" 
                />

                <div 
                  onClick={() => docFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50/20 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5"
                >
                  <UploadCloud className="w-5 h-5 text-teal-600" />
                  <span className="text-xs font-bold text-slate-700 block truncate max-w-xs">
                    {selectedDocFile ? selectedDocFile.name : (locale === 'ar' ? 'اضغط لاختيار ملف من جهازك' : 'Click to select file')}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {selectedDocFile ? `${Math.round(selectedDocFile.size / 1024)} KB` : 'PDF, JPG, PNG (Max 5MB)'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsDocModalOpen(false);
                    setSelectedDocFile(null);
                    setNewDocTitle('');
                  }}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'حفظ وإرفاق الوثيقة' : 'Attach Document'}
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DOCUMENT PREVIEW MODAL */}
      {/* ========================================================================= */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {previewDoc.title}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {getCategoryLabel(previewDoc.category)} • {previewDoc.fileSize} • {previewDoc.uploadedAt}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleDownloadDoc(previewDoc)}
                  className="rounded-xl text-xs flex items-center gap-1.5 py-1.5 px-3"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'تنزيل' : 'Download'}</span>
                </Button>

                <button 
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Preview Content Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center min-h-[300px] bg-slate-50/40">
              {previewDoc.dataUrl?.startsWith('data:image/') ? (
                <div className="max-h-[60vh] overflow-hidden rounded-2xl shadow-sm border border-slate-200 bg-white p-2">
                  <img 
                    src={previewDoc.dataUrl} 
                    alt={previewDoc.title} 
                    className="max-h-[55vh] w-auto object-contain rounded-xl"
                  />
                </div>
              ) : previewDoc.dataUrl?.startsWith('data:application/pdf') ? (
                <iframe 
                  src={previewDoc.dataUrl} 
                  title={previewDoc.title}
                  className="w-full h-[55vh] rounded-2xl border border-slate-200 bg-white"
                />
              ) : (
                <div className="text-center p-8 bg-white rounded-2xl border border-slate-100 shadow-sm max-w-sm">
                  <FileText className="w-16 h-16 text-teal-600 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-slate-800 mb-1">{previewDoc.fileName}</h4>
                  <p className="text-xs text-slate-400 mb-4">
                    {locale === 'ar' ? 'الملف جاهز للتنزيل والاستعراض الكامل.' : 'Document is ready for download.'}
                  </p>
                  <Button
                    onClick={() => handleDownloadDoc(previewDoc)}
                    className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white text-xs font-bold shadow-md shadow-teal-500/25 flex items-center gap-2 mx-auto"
                  >
                    <Download className="w-4 h-4" />
                    <span>{locale === 'ar' ? 'تنزيل وفتح الملف' : 'Download & Open'}</span>
                  </Button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
