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
  Activity, Hash, AlertCircle, BookOpen, ChevronRight, UserCircle
} from 'lucide-react';

const DetailItem = ({ icon: Icon, label, value }: { icon: any, label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-4 py-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-indigo-600">
      <Icon className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 truncate">{value ?? '—'}</dd>
    </div>
  </div>
);

export function StudentProfilePage() {
  const navigate = useNavigate();
  const { id: studentId } = useParams<{ id: string }>();
  const { locale, t } = useI18n();
  const { data: student_data, isLoading, isError, refetch } = useQuery({ queryKey: ['student', studentId], queryFn: () => apiFetch(`/students/${studentId}`), enabled: Boolean(studentId) });
  const { data: enrollments = [] } = useQuery({ queryKey: ['student-enrollments', studentId], queryFn: () => apiFetch<Array<{ id: number; semester: string; status: string; course?: { id: number; code: string; name_ar: string; name_en?: string } }>>(`/student-course-enrollments?student_id=${studentId}`), enabled: Boolean(studentId) });
  
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const student: any = student_data;
  if (!student) return <EmptyState title={t('state.not_found.title')} message={t('state.not_found.message')} />;
  
  const name = locale === 'ar' ? student.full_name_ar : student.full_name_en || student.full_name_ar;
  const advisor = student.academic_advisor ? (locale === 'ar' ? student.academic_advisor.full_name_ar : student.academic_advisor.full_name_en || student.academic_advisor.full_name_ar) : null;
  const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <Link to="/students" className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
            <ChevronRight className="w-4 h-4" />
            {t('nav.students', 'الطلبة')}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">{student.university_number}</span>
        </div>
        
        <div className="flex items-center gap-2">
           <Link to={`/attendance?student_id=${studentId}`} className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all">
             {locale === 'ar' ? 'تسجيل حضور' : 'Record Attendance'}
           </Link>
           <Link to={`/assessments?student_id=${studentId}`} className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all">
             {locale === 'ar' ? 'إضافة تقييم' : 'Add Assessment'}
           </Link>
           <Link to={`/grades?student_id=${studentId}`} className="text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-xl shadow-sm transition-all">
             {locale === 'ar' ? 'إدخال علامة' : 'Enter Grade'}
           </Link>
        </div>
      </div>

      {/* Profile Header */}
      <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden shadow-sm relative">
        <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 w-full opacity-90" />
        <div className="px-6 sm:px-8 pb-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-6 -mt-14 mb-4">
            <div className="h-28 w-28 rounded-full border-4 border-white bg-white shadow-md flex items-center justify-center shrink-0 overflow-hidden">
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f0efff&color=5c59e8&size=150`} alt={name} className="h-full w-full object-cover" />
            </div>
            <div className="pb-2">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{name}</h1>
              <p className="text-sm font-medium text-slate-500 flex items-center gap-2 mt-1">
                <Hash className="w-4 h-4" /> {student.university_number}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              <Activity className="w-3.5 h-3.5" />
              {student.registration_status}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
              <GraduationCap className="w-3.5 h-3.5" />
              Level {student.academic_level}
            </span>
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><UserCircle className="w-5 h-5 text-indigo-500"/> {t('studentProfile.personal', 'المعلومات الشخصية')}</CardTitle></CardHeader>
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
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="w-5 h-5 text-indigo-500"/> {t('studentProfile.academic', 'الشؤون الأكاديمية')}</CardTitle></CardHeader>
            <CardContent className="px-6 py-2">
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <DetailItem icon={Activity} label={t('studentProfile.gpa', 'المعدل')} value={student.gpa} />
                <DetailItem icon={BookOpen} label={t('studentProfile.credits', 'الساعات المقطوعة')} value={student.credit_hours_passed} />
                <DetailItem icon={UserCircle} label={t('studentProfile.advisor', 'المرشد')} value={advisor} />
                <DetailItem icon={AlertCircle} label={t('studentProfile.warnings', 'الإنذارات')} value={student.warning_count} />
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5 text-indigo-500"/> {t('nav.courses', 'المساقات')}</CardTitle></CardHeader>
            <div className="px-6 pb-6 pt-2">
              {enrollments.length === 0 ? (
                <EmptyState message={t('studentProfile.noCourses', 'لا توجد مساقات مسجلة')} />
              ) : (
                <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">Course</th>
                        <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">Semester</th>
                        <th className="px-5 py-4 text-end text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {enrollments.map((enrollment) => (
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
        </div>
      </div>
    </div>
  );
}
