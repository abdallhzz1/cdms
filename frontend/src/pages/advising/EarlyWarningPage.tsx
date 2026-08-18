import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function EarlyWarningPage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();

  const { data: students, isLoading } = useQuery({
    queryKey: ['early-warning-students'],
    // Filter students where warning_count > 0 or GPA is very low (backend might need custom param, doing simple fetch for now)
    queryFn: () => apiFetch<any>(`/students?academic_advisor_id=${user?.id}&per_page=100`)
  });

  if (!can('advising.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;

  const studentsList = Array.isArray(students) ? students : students?.items || [];
  const atRiskStudents = studentsList.filter((s: any) => s.warning_count > 0 || Number(s.gpa) < 2.0);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader 
        title={locale === 'ar' ? 'الإنذار المبكر' : 'Early Warning'} 
        description={locale === 'ar' ? 'الطلاب الذين بحاجة لتدخل إرشادي عاجل بناءً على معدلاتهم وإنذاراتهم' : 'Students requiring immediate intervention'} 
      />

      {atRiskStudents.length === 0 ? (
        <div className="bg-emerald-50 rounded-3xl border border-emerald-100 p-8 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-emerald-500 mb-4 shadow-sm">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-emerald-800 mb-1">{locale === 'ar' ? 'لا يوجد طلاب بحالة تعثر' : 'No at-risk students'}</h3>
          <p className="text-emerald-600">{locale === 'ar' ? 'جميع طلابك في وضع أكاديمي سليم حالياً.' : 'All your students are in good academic standing.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {atRiskStudents.map((s: any) => (
            <div key={s.id} className="bg-white rounded-3xl border border-red-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg">
                    {locale === 'ar' ? 'خطر أكاديمي' : 'Academic Risk'}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{locale === 'ar' ? s.full_name_ar : s.full_name_en || s.full_name_ar}</h3>
                <div className="text-sm text-slate-500 mb-4">{s.university_number}</div>
                
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500 font-semibold mb-1">{locale === 'ar' ? 'المعدل التراكمي' : 'GPA'}</div>
                    <div className={`text-lg font-black ${Number(s.gpa) < 2.0 ? 'text-red-600' : 'text-slate-700'}`}>{s.gpa ?? 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-semibold mb-1">{locale === 'ar' ? 'الإنذارات' : 'Warnings'}</div>
                    <div className={`text-lg font-black ${s.warning_count > 0 ? 'text-red-600' : 'text-slate-700'}`}>{s.warning_count}</div>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                <Link to={`/advising/logs?student=${s.id}`} className="flex items-center justify-between text-sm font-bold text-indigo-600 hover:text-indigo-700">
                  <span>{locale === 'ar' ? 'جدولة جلسة إرشاد' : 'Schedule Session'}</span>
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
