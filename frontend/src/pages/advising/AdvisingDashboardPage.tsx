import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Users, AlertTriangle, FileText, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AdvisingDashboardPage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['my-advised-students'],
    queryFn: () => apiFetch<any>(`/students?academic_advisor_id=${user?.id}&per_page=100`),
    enabled: Boolean(user?.id)
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['my-advising-records'],
    queryFn: () => apiFetch<any>(`/advising-records?per_page=10`),
    enabled: Boolean(user?.id)
  });

  if (!can('advising.view')) return <ErrorState title="Access Denied" />;
  if (studentsLoading || recordsLoading) return <LoadingState />;

  const studentsList = Array.isArray(students) ? students : students?.items || [];
  const recordsList = Array.isArray(records) ? records : records?.items || [];
  const atRiskCount = studentsList.filter((s: any) => s.warning_count > 0 || Number(s.gpa) < 2.0).length;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader 
        title={locale === 'ar' ? 'لوحة تحكم الإرشاد الأكاديمي' : 'Advising Dashboard'} 
        description={locale === 'ar' ? 'متابعة طلابك وحالة جلسات الإرشاد الخاصة بهم' : 'Track your students and their advising sessions'} 
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-800">{studentsList.length}</div>
            <div className="text-sm font-semibold text-slate-500">{locale === 'ar' ? 'الطلاب المعينين' : 'Assigned Students'}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-800">{recordsList.length}</div>
            <div className="text-sm font-semibold text-slate-500">{locale === 'ar' ? 'الجلسات المسجلة' : 'Logged Sessions'}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-800">{atRiskCount}</div>
            <div className="text-sm font-semibold text-slate-500">{locale === 'ar' ? 'طلاب متعثرين' : 'At-Risk Students'}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-800">{studentsList.length - atRiskCount}</div>
            <div className="text-sm font-semibold text-slate-500">{locale === 'ar' ? 'طلاب بحالة جيدة' : 'On-Track Students'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{locale === 'ar' ? 'الطلبة المعينين لك' : 'Your Assigned Students'}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-3 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="py-3 font-semibold">{locale === 'ar' ? 'المعدل (GPA)' : 'GPA'}</th>
                  <th className="py-3 font-semibold">{locale === 'ar' ? 'الإنذارات' : 'Warnings'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentsList.map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-3">
                      <div className="font-bold text-slate-800">{locale === 'ar' ? s.full_name_ar : s.full_name_en || s.full_name_ar}</div>
                      <div className="text-xs text-slate-500">{s.university_number}</div>
                    </td>
                    <td className="py-3 font-semibold text-slate-700">{s.gpa ?? 'N/A'}</td>
                    <td className="py-3">
                      {s.warning_count > 0 ? (
                        <span className="px-2 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-lg">{s.warning_count}</span>
                      ) : (
                        <span className="text-slate-400 text-sm font-medium">0</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!studentsList.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-slate-500">{locale === 'ar' ? 'لا يوجد طلاب معينين لك حالياً' : 'No students assigned to you.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4">{locale === 'ar' ? 'آخر الجلسات' : 'Recent Sessions'}</h2>
          <div className="space-y-4">
            {recordsList.slice(0, 5).map((r: any) => (
              <Link to={`/advising/logs`} key={r.id} className="block p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="font-bold text-sm text-slate-800 mb-1">{locale === 'ar' ? r.student?.full_name_ar : r.student?.full_name_en || r.student?.full_name_ar}</div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{r.meeting_date}</span>
                  <span className="font-medium px-2 bg-slate-100 rounded text-slate-600">{r.category}</span>
                </div>
              </Link>
            ))}
            {!recordsList.length && (
              <div className="text-sm text-slate-500 text-center py-4">{locale === 'ar' ? 'لا توجد جلسات مسجلة' : 'No sessions logged.'}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
