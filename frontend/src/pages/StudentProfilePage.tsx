import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { 
  Mail, Phone, MapPin, CreditCard, Calendar, GraduationCap, 
  Activity, Hash, AlertCircle, BookOpen, ChevronRight, UserCircle,
  Building2, Clock, Sparkles
} from 'lucide-react';

const DetailItem = ({ icon: Icon, label, value }: { icon: any, label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-4 py-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50/70 text-indigo-600">
      <Icon className="h-4 w-4" />
    </div>
    <div className="flex-1 min-w-0">
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-slate-900 truncate">{value ?? '—'}</dd>
    </div>
  </div>
);

type ProfileTab = 'academic' | 'clinical' | 'advising' | 'attendance';

export function StudentProfilePage() {
  const navigate = useNavigate();
  const { id: studentId } = useParams<{ id: string }>();
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState<ProfileTab>('academic');

  // Main student data
  const { data: student_data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student', studentId],
    queryFn: () => apiFetch(`/students/${studentId}`),
    enabled: Boolean(studentId)
  });

  // Enrollments
  const { data: enrollments = [] } = useQuery({
    queryKey: ['student-enrollments', studentId],
    queryFn: () => apiFetch<any[]>(`/student-course-enrollments?student_id=${studentId}`),
    enabled: Boolean(studentId)
  });

  // Clinical Schedule
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

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const student: any = student_data;
  if (!student) return <EmptyState title={t('state.not_found.title')} message={t('state.not_found.message')} />;
  
  const name = locale === 'ar' ? student.full_name_ar : student.full_name_en || student.full_name_ar;
  const advisor = student.academic_advisor ? (locale === 'ar' ? student.academic_advisor.full_name_ar : student.academic_advisor.full_name_en || student.academic_advisor.full_name_ar) : null;

  const clinicalItems = Array.isArray(clinicalSchedule) ? clinicalSchedule : (clinicalSchedule as any)?.items || [];
  const advisingItems = Array.isArray(advisingRecords) ? advisingRecords : (advisingRecords as any)?.items || [];
  const attendanceItems = Array.isArray(attendanceRecords) ? attendanceRecords : (attendanceRecords as any)?.items || [];

  const stats = {
    present: attendanceItems.filter((r: any) => r.status === 'present').length,
    absent: attendanceItems.filter((r: any) => r.status === 'absent').length,
    late: attendanceItems.filter((r: any) => r.status === 'late').length,
    excused: attendanceItems.filter((r: any) => r.status === 'excused').length,
  };

  const TABS = [
    { key: 'academic', label_ar: 'المساقات والأكاديمي', label_en: 'Academic & Courses', icon: GraduationCap, count: enrollments.length },
    { key: 'clinical', label_ar: 'التدريب السريري', label_en: 'Clinical Training', icon: Building2, count: clinicalItems.length },
    { key: 'advising', label_ar: 'جلسات الإرشاد', label_en: 'Advising History', icon: UserCircle, count: advisingItems.length },
    { key: 'attendance', label_ar: 'سجل الحضور', label_en: 'Attendance', icon: Clock, count: attendanceItems.length },
  ];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link to="/students" className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
            {t('nav.students', 'الطلبة')}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">{student.university_number}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/advising/logs?student_id=${studentId}`} className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            {locale === 'ar' ? 'جلسة إرشاد' : 'Advising Session'}
          </Link>
          <Link to={`/attendance?student_id=${studentId}`} className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all">
            {locale === 'ar' ? 'تسجيل حضور' : 'Record Attendance'}
          </Link>
          <Link to={`/assessments?student_id=${studentId}`} className="text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-xl shadow-sm transition-all">
            {locale === 'ar' ? 'إضافة تقييم' : 'Add Assessment'}
          </Link>
        </div>
      </div>

      {/* Profile Header */}
      <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden shadow-sm relative">
        <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 w-full opacity-90" />
        <div className="px-6 sm:px-8 pb-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-6 -mt-14 mb-4">
            <div className="h-28 w-28 rounded-3xl border-4 border-white bg-white shadow-md flex items-center justify-center shrink-0 overflow-hidden">
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f0efff&color=5c59e8&size=150`} alt={name} className="h-full w-full object-cover" />
            </div>
            <div className="pb-2">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">{name}</h1>
              <p className="text-sm font-bold text-slate-500 flex items-center gap-2 mt-1">
                <Hash className="w-4 h-4" /> {student.university_number}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <Activity className="w-3.5 h-3.5" />
              {student.registration_status}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
              <GraduationCap className="w-3.5 h-3.5" />
              Level {student.academic_level}
            </span>
            {student.gpa && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700 border border-purple-200">
                GPA: {student.gpa}
              </span>
            )}
            {student.warning_count > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-1 text-xs font-bold text-red-700 border border-red-200">
                <AlertCircle className="w-3.5 h-3.5" />
                {student.warning_count} {locale === 'ar' ? 'إنذارات' : 'Warnings'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Personal Information */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-3xl border-slate-100">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><UserCircle className="w-5 h-5 text-indigo-500"/> {t('studentProfile.personal', 'المعلومات الشخصية')}</CardTitle></CardHeader>
            <CardContent className="px-6 py-2">
              <dl className="divide-y divide-slate-100">
                <DetailItem icon={Mail} label={t('studentProfile.email', 'البريد')} value={student.university_email} />
                <DetailItem icon={Phone} label={t('studentProfile.phone', 'الهاتف')} value={student.phone} />
                <DetailItem icon={CreditCard} label={t('studentProfile.nationalId', 'الهوية')} value={student.national_id} />
                <DetailItem icon={Calendar} label={t('studentProfile.birthDate', 'تاريخ الميلاد')} value={student.date_of_birth} />
                <DetailItem icon={MapPin} label={t('studentProfile.city', 'المدينة')} value={student.city} />
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-100">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><GraduationCap className="w-5 h-5 text-indigo-500"/> {t('studentProfile.academic', 'الشؤون الأكاديمية')}</CardTitle></CardHeader>
            <CardContent className="px-6 py-2">
              <dl className="divide-y divide-slate-100">
                <DetailItem icon={Activity} label={t('studentProfile.gpa', 'المعدل')} value={student.gpa} />
                <DetailItem icon={BookOpen} label={t('studentProfile.credits', 'الساعات المقطوعة')} value={student.credit_hours_passed} />
                <DetailItem icon={UserCircle} label={t('studentProfile.advisor', 'المرشد')} value={advisor} />
                <DetailItem icon={AlertCircle} label={t('studentProfile.warnings', 'الإنذارات')} value={student.warning_count} />
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Tabbed Detailed Views */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab Navigation */}
          <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as ProfileTab)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{locale === 'ar' ? tab.label_ar : tab.label_en}</span>
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: Academic Courses */}
          {activeTab === 'academic' && (
            <Card className="rounded-3xl border-slate-100">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><BookOpen className="w-5 h-5 text-indigo-500"/> {t('nav.courses', 'المساقات المسجلة')}</CardTitle></CardHeader>
              <div className="px-6 pb-6 pt-2">
                {enrollments.length === 0 ? (
                  <EmptyState message={t('studentProfile.noCourses', 'لا توجد مساقات مسجلة')} />
                ) : (
                  <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'المساق' : 'Course'}</th>
                          <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'الفصل' : 'Semester'}</th>
                          <th className="px-5 py-4 text-end text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {enrollments.map((enrollment: any) => (
                          <tr 
                            key={enrollment.id} 
                            onClick={() => enrollment.course?.id && navigate(`/courses/${enrollment.course.id}`)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <td className="px-5 py-4 text-sm font-bold text-slate-900">
                              <span className="text-indigo-600 hover:underline">{enrollment.course?.code}</span> 
                              <span className="text-slate-500 font-medium ml-2">— {locale === 'ar' ? enrollment.course?.name_ar : enrollment.course?.name_en || enrollment.course?.name_ar}</span>
                            </td>
                            <td className="px-5 py-4 text-sm font-medium text-slate-600">{enrollment.semester}</td>
                            <td className="px-5 py-4 text-sm font-bold text-end text-emerald-600">{enrollment.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* TAB 2: Clinical Training */}
          {activeTab === 'clinical' && (
            <Card className="rounded-3xl border-slate-100">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><Building2 className="w-5 h-5 text-indigo-500"/> {locale === 'ar' ? 'جدول التدريب السريري' : 'Clinical Placements'}</CardTitle></CardHeader>
              <div className="px-6 pb-6 pt-2">
                {clinicalItems.length === 0 ? (
                  <EmptyState message={locale === 'ar' ? 'لا يوجد جدول سريري مسجل للطالب حالياً' : 'No clinical assignments found'} />
                ) : (
                  <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'موقع التدريب' : 'Training Site'}</th>
                          <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'الكتلة' : 'Block'}</th>
                          <th className="px-5 py-4 text-end text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'المشرف' : 'Supervisor'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {clinicalItems.map((item: any, idx: number) => (
                          <tr key={item.id ?? idx} className="hover:bg-slate-50">
                            <td className="px-5 py-4 text-sm font-bold text-slate-900">
                              {locale === 'ar' ? item.training_site?.name_ar : item.training_site?.name_en || item.training_site?.name_ar}
                            </td>
                            <td className="px-5 py-4">
                              <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700">
                                {item.rotation_block?.block_code || '—'}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-end text-sm text-slate-600">
                              {item.supervisor ? (locale === 'ar' ? item.supervisor?.full_name_ar : item.supervisor?.full_name_en || item.supervisor?.full_name_ar) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* TAB 3: Advising History */}
          {activeTab === 'advising' && (
            <Card className="rounded-3xl border-slate-100">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base font-bold"><UserCircle className="w-5 h-5 text-indigo-500"/> {locale === 'ar' ? 'سجل جلسات الإرشاد' : 'Advising History'}</CardTitle></CardHeader>
              <div className="px-6 pb-6 pt-2">
                {advisingItems.length === 0 ? (
                  <EmptyState message={locale === 'ar' ? 'لا توجد جلسات إرشاد مسجلة لهذا الطالب' : 'No advising sessions recorded for this student'} />
                ) : (
                  <div className="space-y-3">
                    {advisingItems.map((log: any) => (
                      <div key={log.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700">
                            {log.session_type || 'جلسة إرشاد'}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {log.meeting_date || log.created_at?.split('T')[0]}
                          </span>
                        </div>
                        {log.notes && <p className="text-sm text-slate-700 font-medium">{log.notes}</p>}
                        {log.action_plan && (
                          <div className="text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100">
                            <strong>{locale === 'ar' ? 'خطة العمل: ' : 'Action Plan: '}</strong>{log.action_plan}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* TAB 4: Attendance Records */}
          {activeTab === 'attendance' && (
            <Card className="rounded-3xl border-slate-100">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base font-bold"><Clock className="w-5 h-5 text-indigo-500"/> {locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance Summary'}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">{stats.present} حاضر</span>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-100 text-red-700">{stats.absent} غائب</span>
                  </div>
                </div>
              </CardHeader>
              <div className="px-6 pb-6 pt-2">
                {attendanceItems.length === 0 ? (
                  <EmptyState message={locale === 'ar' ? 'لا توجد سجلات حضور' : 'No attendance records'} />
                ) : (
                  <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-slate-100">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'الجلسة' : 'Session'}</th>
                          <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                          <th className="px-5 py-4 text-end text-xs font-bold text-slate-500 uppercase tracking-wider">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {attendanceItems.map((att: any) => (
                          <tr key={att.id} className="hover:bg-slate-50">
                            <td className="px-5 py-4 text-sm font-bold text-slate-900">{att.session?.title || '—'}</td>
                            <td className="px-5 py-4 text-sm text-slate-500">{att.session?.session_date || '—'}</td>
                            <td className="px-5 py-4 text-end">
                              <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                                att.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
                                att.status === 'absent' ? 'bg-red-100 text-red-700' :
                                att.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                              }`}>{att.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
