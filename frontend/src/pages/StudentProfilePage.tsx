import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import {
  buildStudentEditForm,
  buildStudentUpdatePayload,
  emptyStudentEditForm,
} from '@/features/students/studentEditModel';
import { 
  ChevronRight, Camera, GraduationCap, 
  Building2, Clock, 
  User, FolderOpen,
  FileText, Trash2, Plus, Eye, Pencil
} from 'lucide-react';

type ProfileTab = 'overview' | 'academic' | 'clinical' | 'attendance' | 'documents';

interface StudentDoc {
  id: string;
  title: string;
  category: string;
  file_name: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by?: string;
  download_url: string;
  mime_type?: string;
  is_policy_evidence?: boolean;
  policy_version?: string;
  paper_received_at?: string;
}

type RegistrationCycle = {
  id: number;
  academic_level: string;
  status: string;
  academic_year?: { code: string };
  groups?: Array<{ name: string }>;
};

function ProfileClinicalField({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-black text-slate-700">{value}</p></div>}
function attendanceStatusLabel(status:string,locale:string){const labels:Record<string,[string,string]>={present:['حاضر','Present'],absent:['غائب','Absent'],late:['متأخر','Late'],excused:['مبرر','Excused']};const value=labels[status]??[status,status];return value[locale==='ar'?0:1]}
function generalStatusLabel(status:string,locale:string){const labels:Record<string,[string,string]>={active:['منتظم','Active'],suspended:['موقوف','Suspended'],on_leave:['إجازة','On leave'],transferred:['منتقل','Transferred'],graduated:['متخرج','Graduated'],repeating:['معيد للسنة','Repeating'],deferred:['مؤجل','Deferred']};const value=labels[status]??[status,status];return value[locale==='ar'?0:1]}

export function StudentProfilePage() {
  const { id: studentId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('clinical_pledge');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [clinicalPeriodFilter,setClinicalPeriodFilter]=useState('');

  // Edit Student Modal State for Admin Assistant / Admins
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [studentForm, setStudentForm] = useState(emptyStudentEditForm);

  // Main student data query
  const { data: student_data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => apiFetch(`/students/${studentId}`),
    enabled: Boolean(studentId) && can('students.view')
  });

  // Enrollments & Grades
  const { data: enrollments = [] } = useQuery({
    queryKey: ['student-enrollments', studentId],
    queryFn: () => apiFetch<any[]>(`/student-course-enrollments?student_id=${studentId}&include_grades=1&per_page=100`),
    enabled: Boolean(studentId) && can('students.view')
  });

  // Clinical Schedule / Rotations
  const { data: clinicalSchedule = [] } = useQuery({
    queryKey: ['student-clinical-schedule', studentId],
    queryFn: () => apiFetch<any[]>(`/students/${studentId}/current-clinical-schedule`),
    enabled: Boolean(studentId) && can('distribution.view')
  });

  // Advising Records
  const { data: advisingRecords = [] } = useQuery({
    queryKey: ['student-advising-records', studentId],
    queryFn: () => apiFetch<any[]>(`/advising-records?student_id=${studentId}`),
    enabled: Boolean(studentId) && can('advising.view')
  });

  // Attendance Records
  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ['student-attendance-records', studentId],
    queryFn: () => apiFetch<any[]>(`/attendance-records?student_id=${studentId}`),
    enabled: Boolean(studentId) && can('attendance.review')
  });

  const { data: registrationCycles = [] } = useQuery({
    queryKey: ['group-registration-cycles', 'student-profile'],
    queryFn: () => apiFetch<RegistrationCycle[]>('/group-registration-cycles'),
    enabled: Boolean(studentId) && can('students.update') && can('group_registration.view'),
  });

  useEffect(() => {
    if (searchParams.get('edit') !== '1' || !student_data || !can('students.update')) return;
    const currentStudent = (student_data as any)?.data || student_data;
    setStudentForm(buildStudentEditForm(currentStudent));
    setIsEditModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('edit');
    setSearchParams(nextParams, { replace: true });
  }, [can, searchParams, setSearchParams, student_data]);

  // Upload Photo Mutation
  const updatePhotoMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('photo', file);
      return apiFetch(`/students/${studentId}/photo`, { method: 'POST', body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
    },
    onError: (err: any) => alert(err?.message || (locale === 'ar' ? 'تعذر رفع الصورة' : 'Photo upload failed')),
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: (body: FormData) => apiFetch(`/students/${studentId}/documents`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      setIsDocModalOpen(false);
      setNewDocTitle('');
      setSelectedDocFile(null);
    },
    onError: (err: any) => alert(err?.message || (locale === 'ar' ? 'تعذر رفع الوثيقة' : 'Document upload failed')),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: string) => apiFetch(`/students/${studentId}/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', studentId] }),
    onError: (err: any) => alert(err?.message || (locale === 'ar' ? 'تعذر حذف الوثيقة' : 'Document deletion failed')),
  });

  // Update Student Profile Mutation for Admin Assistant / Admins
  const updateStudentMutation = useMutation({
    mutationFn: (body: any) => apiFetch(`/students/${studentId}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['early-warning-students-list'] });
      queryClient.invalidateQueries({ queryKey: ['students-for-assignment'] });
      setIsEditModalOpen(false);
      alert(locale === 'ar' ? 'تم تحديث بيانات بروفايل الطالب بنجاح ✓' : 'Student profile updated successfully ✓');
    },
    onError: (err: any) => {
      alert(err?.message || (locale === 'ar' ? 'تعذر تحديث بيانات الطالب' : 'Failed to update student profile'));
    }
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(locale === 'ar' ? 'حجم الصورة يجب ألا يتجاوز 2MB' : 'Photo must not exceed 2MB');
      return;
    }
    updatePhotoMutation.mutate(file);
  };

  const handleOpenEditModal = () => {
    if (!student) return;
    setStudentForm(buildStudentEditForm(student));
    setIsEditModalOpen(true);
  };

  const handleEditFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStudentMutation.mutate(buildStudentUpdatePayload(studentForm));
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !selectedDocFile) return;
    if (selectedDocFile.size > 10 * 1024 * 1024) {
      alert(locale === 'ar' ? 'حجم الوثيقة يجب ألا يتجاوز 10MB' : 'Document must not exceed 10MB');
      return;
    }
    const body = new FormData();
    body.append('title', newDocTitle.trim());
    body.append('category', newDocCategory);
    body.append('file', selectedDocFile);
    uploadDocumentMutation.mutate(body);
  };

  const handleDeleteDoc = (docId: string) => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من رغبتك في حذف هذا المستند؟' : 'Are you sure you want to delete this document?')) {
      deleteDocumentMutation.mutate(docId);
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError || !student_data) return <ErrorState onRetry={() => refetch()} />;

  const student = (student_data as any)?.data || student_data;
  const documents: StudentDoc[] = Array.isArray(student.documents) ? student.documents : [];
  const name = locale === 'ar' ? student.full_name_ar : (student.full_name_en || student.full_name_ar);
  const advisor = student.academic_advisor ? (locale === 'ar' ? student.academic_advisor.full_name_ar : (student.academic_advisor.full_name_en || student.academic_advisor.full_name_ar)) : null;

  const clinicalItems = Array.isArray(clinicalSchedule) ? clinicalSchedule : (clinicalSchedule as any)?.items || [];
  const clinicalPeriods=Array.from(new Map(clinicalItems.map((item:any)=>item.clinical_period).filter(Boolean).map((period:any)=>[period.id,period])).values()).sort((a:any,b:any)=>a.sequence-b.sequence) as any[];
  const visibleClinicalItems=clinicalPeriodFilter?clinicalItems.filter((item:any)=>String(item.clinical_period?.id)===clinicalPeriodFilter):clinicalItems;
  const advisingItems = Array.isArray(advisingRecords) ? advisingRecords : (advisingRecords as any)?.items || [];
  const attendanceItems = Array.isArray(attendanceRecords) ? attendanceRecords : (attendanceRecords as any)?.items || [];
  const editableRegistrationCycles = registrationCycles.filter(
    cycle => cycle.status !== 'archived' && cycle.academic_level === studentForm.academic_level,
  );
  const selectedRegistrationCycle = editableRegistrationCycles.find(
    cycle => String(cycle.id) === studentForm.group_registration_cycle_id,
  );

  const stats = {
    present: attendanceItems.filter((r: any) => r.status === 'present').length,
    absent: attendanceItems.filter((r: any) => r.status === 'absent').length,
    late: attendanceItems.filter((r: any) => r.status === 'late').length,
    excused: attendanceItems.filter((r: any) => r.status === 'excused').length,
  };
  const totalSessions = attendanceItems.length;
  const attendanceRate = totalSessions > 0 ? Math.round(((stats.present + stats.late + stats.excused) / totalSessions) * 100) : 100;

  const getLevelName = (lvl: string) => {
    if (lvl === 'fourth') return locale === 'ar' ? 'سنة رابعة' : '4th Year';
    if (lvl === 'fifth') return locale === 'ar' ? 'سنة خامسة' : '5th Year';
    if (lvl === 'sixth') return locale === 'ar' ? 'سنة سادسة' : '6th Year';
    return lvl;
  };

  const getBatchName = () => {
    const year = student.batch_year || (student.academic_level === 'fourth' ? 2022 : student.academic_level === 'fifth' ? 2021 : 2020);
    return locale === 'ar' ? `دفعة ${year}` : `Batch ${year}`;
  };

  const TABS = [
    { key: 'overview', label: locale === 'ar' ? 'البيانات الشخصية والإرشاد' : 'Overview & Info', icon: User },
    { key: 'academic', label: locale === 'ar' ? 'المساقات والعلامات' : 'Courses & Grades', icon: GraduationCap, count: enrollments.length },
    ...(can('distribution.view') ? [{ key: 'clinical', label: locale === 'ar' ? 'التدريب والمستشفيات' : 'Clinical Training', icon: Building2, count: clinicalItems.length }] : []),
    ...(can('attendance.review') ? [{ key: 'attendance', label: locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance', icon: Clock, count: attendanceItems.length }] : []),
    { key: 'documents', label: locale === 'ar' ? 'وثائق وملفات الطالب' : 'Documents', icon: FolderOpen, count: documents.length },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-16">
      
      {/* 1. Top Back Link */}
      <div>
        <Link 
          to="/directory" 
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-600 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          <span>{locale === 'ar' ? 'العودة لدليل الطلاب' : 'Back to Students'}</span>
        </Link>
      </div>

      {/* 2. Pristine Profile Header Card */}
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-5 sm:gap-6 text-center sm:text-start">
          
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6">
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
                {student.photo_url ? (
                  <img 
                    src={student.photo_url}
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
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-teal-600 text-white shadow-md hover:bg-teal-700 transition-transform active:scale-95 border-2 border-white cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Student Core Info */}
            <div className="space-y-2 flex-1">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
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
                  {getLevelName(student.academic_level)} · {getBatchName()}
                </span>

                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-3 py-1 rounded-xl border border-teal-100">
                  {generalStatusLabel(student.registration_status, locale)}
                </span>

                <span className={`text-xs font-semibold px-3 py-1 rounded-xl border ${student.academic_registration_status === 'registered' ? 'border-teal-100 bg-teal-50 text-teal-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {student.academic_registration_status === 'registered' ? (locale === 'ar' ? 'مسجل أكاديمياً' : 'Academically registered') : (locale === 'ar' ? 'غير مسجل أكاديمياً' : 'Academically unregistered')}
                </span>

                {(student.registration_main_group || student.current_group_name) && (
                  <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-xl">
                    {locale === 'ar' ? 'المجموعة' : 'Group'}: {student.registration_main_group || student.current_group_name}{student.current_subgroup_name ? ` / ${student.current_subgroup_name}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Edit Student Profile Button for Admin Assistant / Admins */}
          {can('students.update') && (
            <button
              type="button"
              onClick={handleOpenEditModal}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer self-center sm:self-auto shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'تعديل بيانات الطالب' : 'Edit Profile'}</span>
            </button>
          )}

        </div>
      </div>

      {/* 3. Clean Modern Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ProfileTab)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                isActive 
                  ? 'bg-teal-600 text-white shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span className={`px-1.5 py-0.2 rounded-md text-[11px] ${
                  isActive ? 'bg-white/20 text-white font-bold' : 'bg-slate-200/60 text-slate-500'
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

            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-5">
              <div className="p-3 rounded-2xl bg-teal-50/70 border border-teal-100/80">
                <span className="text-[11px] text-teal-800 font-semibold block mb-1">{locale === 'ar' ? 'المعدل التراكمي' : 'GPA'}</span>
                <span className="text-base font-bold text-teal-800">{student.gpa !== null && student.gpa !== undefined ? `%${student.gpa}` : '—'}</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100/80">
                <span className="text-[11px] text-slate-800 font-semibold block mb-1">{locale === 'ar' ? 'الإنذارات الأكاديمية' : 'Warnings'}</span>
                <span className={`text-base font-bold ${student.warning_count > 0 ? 'text-red-600 font-black' : 'text-slate-800'}`}>
                  {student.warning_count || 0} {locale === 'ar' ? 'إنذارات' : 'Warnings'}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'نسبة الحضور' : 'Attendance'}</span>
                <span className="text-base font-bold text-teal-700">{attendanceRate}%</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'المرشد الأكاديمي' : 'Advisor'}</span>
                <span className="text-xs font-bold text-slate-800 truncate block">{advisor || (locale === 'ar' ? 'لم يُعيّن' : '—')}</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                <span className="text-[11px] text-slate-400 block mb-1">{locale === 'ar' ? 'الساعات المجتازة' : 'Passed hours'}</span>
                <span className="text-base font-bold text-slate-800">{student.credit_hours_passed ?? '—'}</span>
              </div>

            </div>
          </div>

          {/* Contact & Personal Details Card */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              {locale === 'ar' ? 'بيانات الاتصال والمتابعة' : 'Contact & Follow-up'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'البريد الجامعي' : 'Email'}</span>
                <span className="font-semibold text-slate-800">{student.university_email || `${student.university_number}@students.hebron.edu`}</span>
              </div>

              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">{locale === 'ar' ? 'رقم الهاتف' : 'Phone'}</span>
                <span className="font-semibold text-slate-800 font-mono">{student.phone || '—'}</span>
              </div>

            </div>
            {student.notes && <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs leading-6 text-slate-600"><span className="font-bold text-slate-700">{locale === 'ar' ? 'ملاحظات إدارية: ' : 'Administrative notes: '}</span>{student.notes}</div>}
          </div>

          {/* Advising Sessions List */}
          {advisingItems.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {locale === 'ar' ? 'آخر جلسات الإرشاد والمتابعة' : 'Advising Notes'}
              </h3>

              <div className="space-y-2.5">
                {advisingItems.slice(0, 3).map((log: any) => (
                  <div key={log.id} className="p-3.5 rounded-2xl bg-slate-50/70 text-xs space-y-1.5">
                    <div className="flex justify-between font-bold text-slate-700">
                      <span>{log.category === 'risk' ? (locale === 'ar' ? 'جلسة إنذار/تعثر' : 'Risk Session') : (locale === 'ar' ? 'جلسة إرشاد' : 'Session')}</span>
                      <span className="text-slate-400 font-normal">{log.meeting_date || log.created_at?.split('T')[0]}</span>
                    </div>
                    {log.notes && <p className="text-slate-600 leading-relaxed">{log.notes}</p>}
                    {log.action_plan && (
                      <p className="text-teal-800 font-semibold bg-teal-50/80 p-2 rounded-xl border border-teal-100">
                        {locale === 'ar' ? 'خطة العمل:' : 'Action Plan:'} {log.action_plan}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Courses & Grades */}
      {activeTab === 'academic' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {locale === 'ar' ? 'المساقات الدراسية والتقييمات' : 'Enrolled Courses'}
          </h3>

          {enrollments.length === 0 ? (
            <EmptyState title={locale === 'ar' ? 'لا توجد مساقات مسجلة' : 'No Enrolled Courses'} />
          ) : (
            <div className="divide-y divide-slate-100">
              {enrollments.map((item: any) => (
                <div key={item.id} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <div className="font-bold text-slate-800">{locale==='ar'?item.course?.name_ar:item.course?.name_en||item.course?.name_ar||item.course?.code}</div>
                    <div className="text-slate-400 text-[11px]">{item.course?.code} · {item.academic_year?.code||'—'}</div>
                  </div>
                  <span className="font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg">
                    {item.grade_entry?.score!=null ? `${Number(item.grade_entry.score).toFixed(1)} / ${Number(item.grade_entry.max_score||100).toFixed(0)}` : (locale === 'ar' ? 'مسجل' : 'Enrolled')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Clinical Training & Schedule */}
      {activeTab === 'clinical' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'جدول المجموعات ومواقع التدريب السريري' : 'Clinical Rotations'}</h3>{clinicalPeriods.length>0&&<select value={clinicalPeriodFilter} onChange={event=>setClinicalPeriodFilter(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"><option value="">{locale==='ar'?'جميع الفترات':'All periods'}</option>{clinicalPeriods.map((period:any)=><option key={period.id} value={period.id}>{period.code} — {locale==='ar'?period.name_ar:period.name_en||period.name_ar}</option>)}</select>}</div>

          {visibleClinicalItems.length === 0 ? (
            <EmptyState title={locale === 'ar' ? 'لا يوجد توزيع سريري موثق حالياً' : 'No Clinical Rotations'} />
          ) : (
            <div className="space-y-3">
              {visibleClinicalItems.map((item: any) => {const block=item.block||item.rotation_block;const rotation=item.rotation||block?.rotation||item.distribution_version?.rotation;const course=item.course||rotation?.course;const supervisor=locale==='ar'?item.supervisor?.full_name_ar:item.supervisor?.full_name_en||item.supervisor?.full_name_ar;const site=locale==='ar'?item.training_site?.name_ar:item.training_site?.name_en||item.training_site?.name_ar;const department=locale==='ar'?item.department?.name_ar:item.department?.name_en||item.department?.name_ar;const group=item.group?.name||item.subgroup?.group?.name||item.student_subgroup?.group?.name;const subgroup=item.subgroup?.name||item.student_subgroup?.name;return (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-xs shadow-sm">
                  <header className="flex flex-col gap-2 border-b border-teal-100 bg-teal-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-black text-slate-900">{locale==='ar'?course?.name_ar:course?.name_en||course?.name_ar||rotation?.name||'—'}</h4><p className="mt-1 text-[11px] font-bold text-teal-700">{course?.code||rotation?.code||'—'} · {item.academic_year?.code||rotation?.academic_year?.code||'—'} · {item.clinical_period?(locale==='ar'?item.clinical_period.name_ar:item.clinical_period.name_en||item.clinical_period.name_ar):(locale==='ar'?'جدول سنوي':'Annual schedule')}</p></div><span className="w-fit rounded-xl bg-white px-3 py-1 font-black text-teal-700">{[group,subgroup].filter(Boolean).join(' / ')||(locale==='ar'?'دون مجموعة':'No group')}</span></header>
                  <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"><ProfileClinicalField label={locale==='ar'?'المستشفى':'Hospital'} value={site||'—'}/><ProfileClinicalField label={locale==='ar'?'المشرف السريري':'Clinical supervisor'} value={supervisor||'—'}/><ProfileClinicalField label={locale==='ar'?'الفترة':'Period'} value={block?.from_week&&block?.to_week?(locale==='ar'?`الأسبوع ${block.from_week}–${block.to_week}`:`Weeks ${block.from_week}–${block.to_week}`):block?.block_code||'—'}/><ProfileClinicalField label={locale==='ar'?'القسم':'Department'} value={department||'—'}/></div>
                </article>
              )})}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Clinical Attendance */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {locale === 'ar' ? 'سجل الحضور والغياب السريري' : 'Clinical Attendance'}
            </h3>
            <span className="text-xs font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-xl">
              {locale === 'ar' ? `نسبة الالتزام: ${attendanceRate}%` : `Rate: ${attendanceRate}%`}
            </span>
          </div>

          {attendanceItems.length === 0 ? (
            <EmptyState title={locale === 'ar' ? 'لا يوجد سجلات حضور مسجلة حتى الآن' : 'No Attendance Records'} />
          ) : (
            <div className="divide-y divide-slate-100">
              {attendanceItems.map((item: any) => (
                <div key={item.id} className="flex flex-col gap-3 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><span className="font-bold text-slate-800">{String(item.session?.session_date||'—').slice(0,10)} · {item.session?.title||''}</span><span className="mt-1 block text-[11px] text-slate-500">{locale==='ar'?item.session?.rotation_block?.rotation?.course?.name_ar:item.session?.rotation_block?.rotation?.course?.name_en||item.session?.rotation_block?.rotation?.course?.name_ar||'—'} · {locale==='ar'?item.session?.training_site?.name_ar:item.session?.training_site?.name_en||item.session?.training_site?.name_ar||'—'}</span>{item.excuse_note&&<span className="mt-1 block text-[10px] text-slate-400">{item.excuse_note}</span>}</div>
                  <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{item.recorder?.name||''}</span><span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${item.status==='absent'?'bg-red-50 text-red-700':'bg-teal-50 text-teal-700'}`}>{attendanceStatusLabel(item.status,locale)}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Documents */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {locale === 'ar' ? 'وثائق وتعهدات الطالب السريرية' : 'Documents'}
            </h3>
            {can('students.update') && (
              <Button size="sm" onClick={() => setIsDocModalOpen(true)} className="gap-1.5 text-xs font-bold">
                <Plus className="w-3.5 h-3.5" />
                <span>{locale === 'ar' ? 'إضافة وثيقة' : 'Upload Document'}</span>
              </Button>
            )}
          </div>

          {documents.length === 0 ? (
            <EmptyState title={locale === 'ar' ? 'لا توجد وثائق مرفقة لهذا الطالب' : 'No Documents Uploaded'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {documents.map((doc) => (
                <div key={doc.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-5 h-5 text-teal-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">{doc.title}</div>
                      {doc.is_policy_evidence && <div className="mt-1 inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-black text-teal-800">{locale === 'ar' ? `مدونة سلوك موقعة · الإصدار ${doc.policy_version}` : `Signed Code of Conduct · ${doc.policy_version}`}</div>}
                      <div className="text-[10px] text-slate-400 mt-0.5">{String(doc.uploaded_at || '').slice(0, 10)} • {(Number(doc.size_bytes || 0) / (1024 * 1024)).toFixed(1)} MB</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {doc.download_url && (
                      <a
                        href={doc.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-slate-500 hover:text-teal-600 rounded-lg hover:bg-slate-200/50"
                        title={locale === 'ar' ? 'معاينة' : 'Preview'}
                      >
                        <Eye className="w-4 h-4" />
                      </a>
                    )}
                    {can('students.update') && !doc.is_policy_evidence && (
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                        title={locale === 'ar' ? 'حذف' : 'Delete'}
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

      {/* Edit Student Modal for Admin Assistant / Admins */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
              <div>
                <h3 className="flex items-center gap-2 text-base font-black text-slate-800">
                  <Pencil className="h-4 w-4 text-teal-600" />
                  <span>{locale === 'ar' ? 'تعديل بيانات الطالب' : 'Edit Student'}</span>
                </h3>
                <p className="mt-1 text-xs text-slate-500">{name} · {student.university_number}</p>
              </div>
              <button type="button" aria-label={locale === 'ar' ? 'إغلاق' : 'Close'} onClick={() => setIsEditModalOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
            </div>

            <form onSubmit={handleEditFormSubmit} className="overflow-y-auto">
              <div className="space-y-5 p-5 sm:p-6">
                <section className="space-y-3">
                  <h4 className="text-xs font-black text-slate-500">{locale === 'ar' ? 'البيانات الأساسية' : 'Basic information'}</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'الاسم بالعربية *' : 'Arabic name *'}<input required value={studentForm.full_name_ar} onChange={e => setStudentForm({...studentForm, full_name_ar:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'الاسم بالإنجليزية' : 'English name'}<input value={studentForm.full_name_en} onChange={e => setStudentForm({...studentForm, full_name_en:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'الرقم الجامعي *' : 'University ID *'}<input required value={studentForm.university_number} onChange={e => setStudentForm({...studentForm, university_number:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm font-bold focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'البريد الجامعي' : 'University email'}<input type="email" placeholder={`${studentForm.university_number || '22011001'}@students.hebron.edu`} value={studentForm.university_email} onChange={e => setStudentForm({...studentForm, university_email:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" /></label>
                  </div>
                </section>

                <section className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-xs font-black text-slate-500">{locale === 'ar' ? 'الوضع الأكاديمي' : 'Academic status'}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'السنة السريرية' : 'Clinical year'}<select value={studentForm.academic_level} onChange={e => setStudentForm({...studentForm, academic_level:e.target.value, group_registration_cycle_id:'', main_group_code:''})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="fourth">{locale==='ar'?'الرابعة':'4th Year'}</option><option value="fifth">{locale==='ar'?'الخامسة':'5th Year'}</option><option value="sixth">{locale==='ar'?'السادسة':'6th Year'}</option></select></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'سنة الدفعة' : 'Batch year'}<input type="number" value={studentForm.batch_year} onChange={e => setStudentForm({...studentForm, batch_year:Number(e.target.value)})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'حالة الطالب' : 'Student status'}<select value={studentForm.registration_status} onChange={e => setStudentForm({...studentForm, registration_status:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="active">{locale==='ar'?'منتظم':'Active'}</option><option value="deferred">{locale==='ar'?'مؤجل':'Deferred'}</option><option value="suspended">{locale==='ar'?'موقوف':'Suspended'}</option><option value="on_leave">{locale==='ar'?'إجازة':'On leave'}</option><option value="transferred">{locale==='ar'?'منتقل':'Transferred'}</option><option value="repeating">{locale==='ar'?'معيد للسنة':'Repeating'}</option><option value="graduated">{locale==='ar'?'متخرج':'Graduated'}</option></select></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'التسجيل الأكاديمي' : 'Academic registration'}<select value={studentForm.academic_registration_status} onChange={e => setStudentForm({...studentForm, academic_registration_status:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="registered">{locale==='ar'?'مسجل':'Registered'}</option><option value="unregistered">{locale==='ar'?'غير مسجل':'Unregistered'}</option></select></label>
                  </div>

                  {can('group_registration.view') && (
                    <div className="grid gap-3 rounded-2xl border border-teal-100 bg-teal-50/50 p-3 sm:grid-cols-2">
                      <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'دورة التسجيل' : 'Registration cycle'}<select value={studentForm.group_registration_cycle_id} onChange={e => setStudentForm({...studentForm, group_registration_cycle_id:e.target.value, main_group_code:''})} className="mt-1 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-sm"><option value="">{locale==='ar'?'بدون دورة':'No cycle'}</option>{editableRegistrationCycles.map(cycle=><option key={cycle.id} value={cycle.id}>{cycle.academic_year?.code || `#${cycle.id}`}</option>)}</select></label>
                      <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'المجموعة الرئيسية' : 'Main group'}<select disabled={!studentForm.group_registration_cycle_id} value={studentForm.main_group_code} onChange={e => setStudentForm({...studentForm, main_group_code:e.target.value})} className="mt-1 w-full rounded-xl border border-teal-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100"><option value="">{locale==='ar'?'اختر المجموعة':'Select group'}</option>{selectedRegistrationCycle?.groups?.map(group=><option key={group.name} value={group.name}>{group.name}</option>)}</select></label>
                    </div>
                  )}
                </section>

                <section className="space-y-3 border-t border-slate-100 pt-5">
                  <h4 className="text-xs font-black text-slate-500">{locale === 'ar' ? 'التواصل والمتابعة' : 'Contact & follow-up'}</h4>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'رقم الهاتف' : 'Phone'}<input type="tel" value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'المعدل %' : 'GPA %'}<input type="number" min="0" max="100" step="0.01" value={studentForm.gpa} onChange={e => setStudentForm({...studentForm, gpa:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'الإنذارات' : 'Warnings'}<input type="number" min="0" max="10" value={studentForm.warning_count} onChange={e => setStudentForm({...studentForm, warning_count:Number(e.target.value)})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                    <label className="space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'الساعات المجتازة' : 'Passed hours'}<input type="number" min="0" max="500" value={studentForm.credit_hours_passed} onChange={e => setStudentForm({...studentForm, credit_hours_passed:e.target.value})} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label>
                  </div>
                  <label className="block space-y-1 text-xs font-bold text-slate-700">{locale === 'ar' ? 'ملاحظات المتابعة' : 'Follow-up notes'}<textarea rows={3} maxLength={2000} value={studentForm.notes} onChange={e => setStudentForm({...studentForm, notes:e.target.value})} className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium" /></label>
                </section>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateStudentMutation.isPending}
                  className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
                >
                  {updateStudentMutation.isPending ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-500/25 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-800">
                {locale === 'ar' ? 'إرفاق وثيقة جديدة للطالب' : 'Upload Student Document'}
              </h3>
              <button onClick={() => setIsDocModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadDocument} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'عنوان الوثيقة:' : 'Document Title:'}</label>
                <input
                  required
                  type="text"
                  placeholder={locale === 'ar' ? 'مثال: التعهد السريري / وثيقة التأمين الصحي' : 'Doc Title'}
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'تصنيف الملف:' : 'Category:'}</label>
                <select
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium bg-white cursor-pointer"
                >
                  <option value="clinical_pledge">{locale === 'ar' ? 'تعهد تدريب سريري' : 'Clinical Pledge'}</option>
                  <option value="insurance">{locale === 'ar' ? 'تأمين صحي بالمستشفى' : 'Health Insurance'}</option>
                  <option value="medical_report">{locale === 'ar' ? 'تقرير طبي' : 'Medical Report'}</option>
                  <option value="other">{locale === 'ar' ? 'وثيقة أخرى' : 'Other'}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اختر الملف (PDF / صورة):' : 'Select File:'}</label>
                <input
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => setSelectedDocFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-200 p-2 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-600"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={uploadDocumentMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 text-white font-bold"
                >
                  {uploadDocumentMutation.isPending ? (locale === 'ar' ? 'جاري الرفع...' : 'Uploading...') : (locale === 'ar' ? 'حفظ وإرفاق' : 'Save Document')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
