import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AdvisingNavTabs } from '@/components/advising/AdvisingNavTabs';
import { Plus, Calendar, FileText } from 'lucide-react';

export function AdvisingLogsPage() {
  const { can, user } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const studentParam = searchParams.get('student');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    meeting_date: new Date().toISOString().split('T')[0],
    category: 'academic',
    notes: '',
    action_plan: '',
  });

  // Auto-open modal and preselect student if student URL parameter is present
  useEffect(() => {
    if (studentParam) {
      setIsModalOpen(true);
      setFormData(prev => ({ ...prev, student_id: studentParam }));
    }
  }, [studentParam]);

  // Check if current user is an Administrator / Department Head / Dean
  const isAdminOrHead = useMemo(() => {
    if (!user?.roles) return false;
    const roles = user.roles.map(r => (typeof r === 'string' ? r : (r as any).name || '').toUpperCase());
    return roles.some(r => ['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN'].includes(r));
  }, [user]);

  const hasAccess = useMemo(() => {
    if (!user) return false;
    const roles = user.roles ? user.roles.map(r => (typeof r === 'string' ? r : (r as any).name || '').toUpperCase()) : [];
    const isAcademicUser = roles.some(r => [
      'RTA', 
      'CLINICAL_SUPERVISOR', 
      'ACADEMIC_ADVISOR', 
      'DEPARTMENT_HEAD', 
      'CLINICAL_DIRECTOR', 
      'ADMIN_ASSISTANT', 
      'SYS_ADMIN', 
      'DEAN', 
      'VICE_DEAN'
    ].includes(r));
    return can('advising.view') || can('advising.manage') || can('students.view') || can('students.manage') || isAcademicUser;
  }, [user, can]);

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['advising-records'],
    queryFn: () => apiFetch<any>('/advising-records?per_page=100')
  });

  // Students dropdown for session modal: load all accessible students
  const studentsEndpoint = useMemo(() => {
    if (isAdminOrHead) return `/students?per_page=1000`;
    return `/students?academic_advisor_id=${user?.id}&per_page=1000`;
  }, [isAdminOrHead, user?.id]);

  const { data: students } = useQuery({
    queryKey: ['students-for-advising-modal', studentsEndpoint],
    queryFn: () => apiFetch<any>(studentsEndpoint),
    enabled: isModalOpen
  });

  const createMutation = useMutation({
    mutationFn: (newRecord: any) => apiFetch('/advising-records', { method: 'POST', body: newRecord }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advising-records'] });
      setIsModalOpen(false);
      setFormData({
        student_id: '',
        meeting_date: new Date().toISOString().split('T')[0],
        category: 'academic',
        notes: '',
        action_plan: '',
      });
      alert(locale === 'ar' ? 'تم توثيق وتوجيه الجلسة الإرشادية بنجاح ✓' : 'Advising session documented successfully ✓');
    },
    onError: (err: any) => {
      alert(err?.message || (locale === 'ar' ? 'فشل حفظ الجلسة الإرشادية، يرجى التحقق من البيانات' : 'Failed to save advising session'));
    }
  });

  if (!hasAccess) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (recordsLoading) return <LoadingState />;

  const recordsList: any[] = Array.isArray(records) ? records : (records?.data || records?.items || []);
  const studentsList: any[] = Array.isArray(students) ? students : (students?.data || students?.items || []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.student_id) {
      alert(locale === 'ar' ? 'يرجى اختيار الطالب أولاً' : 'Please select a student');
      return;
    }
    createMutation.mutate({
      student_id: Number(formData.student_id),
      advisor_person_id: (user as any)?.person_id || user?.id || null,
      meeting_date: formData.meeting_date,
      category: formData.category,
      notes: formData.notes,
      action_plan: formData.action_plan,
    });
  };

  return (
    <div className="space-y-4 pb-16 px-1 sm:px-0">
      {/* Header Banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-800">
              {locale === 'ar' ? 'سجل الجلسات الإرشادية' : 'Advising Session Logs'}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              {locale === 'ar' ? 'أرشيف الجلسات الإرشادية الفردية وتوثيق الملاحظات وخطط العمل للطلاب.' : 'Archive of individual advising meetings, notes, and student action plans.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{locale === 'ar' ? 'تسجيل جلسة إرشاد' : 'New Advising Log'}</span>
        </button>
      </div>

      {/* Advising Sub-Navigation Tabs */}
      <AdvisingNavTabs />

      {/* Records Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
          <span>{locale === 'ar' ? 'سجل الجلسات الموثقة' : 'Documented Advising Logs'}</span>
          <span className="text-teal-700">{recordsList.length} {locale === 'ar' ? 'جلسة' : 'Sessions'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-xs min-w-[600px] ${locale === 'ar' ? 'text-right' : 'text-left'}`}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold text-[11px]">
                <th className="p-2.5 text-center w-28">{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th className="p-2.5">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                <th className="p-2.5 text-center w-28">{locale === 'ar' ? 'التصنيف' : 'Category'}</th>
                <th className="p-2.5">{locale === 'ar' ? 'ملاحظات الجلسة' : 'Meeting Notes'}</th>
                <th className="p-2.5">{locale === 'ar' ? 'خطة العمل (Action Plan)' : 'Action Plan'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {recordsList.map((r: any) => {
                const formattedDate = typeof r.meeting_date === 'string' ? r.meeting_date.split('T')[0] : (r.meeting_date || '');
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2.5 text-center font-mono text-slate-600 text-[11px] whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formattedDate}</span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-semibold text-slate-800 text-xs">
                        {locale === 'ar' ? r.student?.full_name_ar : (r.student?.full_name_en || r.student?.full_name_ar)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{r.student?.university_number}</div>
                    </td>
                    <td className="p-2.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10.5px] font-bold border ${
                        r.category === 'academic' 
                          ? 'bg-sky-50 text-sky-700 border-sky-100' 
                          : r.category === 'risk' 
                            ? 'bg-red-50 text-red-700 border-red-100' 
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {r.category === 'academic' ? (locale === 'ar' ? 'أكاديمي' : 'Academic') : r.category === 'risk' ? (locale === 'ar' ? 'تعثر/إنذار' : 'Risk/Warning') : (locale === 'ar' ? 'عام' : 'General')}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700 max-w-xs text-xs">
                      <div className="whitespace-pre-line leading-relaxed">{r.notes}</div>
                    </td>
                    <td className="p-2.5 text-slate-700 max-w-xs text-xs">
                      {r.action_plan ? (
                        <div className="whitespace-pre-line bg-teal-50/80 p-2 rounded-xl border border-teal-100 text-teal-900 font-medium">
                          {r.action_plan}
                        </div>
                      ) : (
                        <span className="text-slate-300 font-semibold text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!recordsList.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-slate-400">
                    {locale === 'ar' ? 'لا توجد جلسات إرشادية موثقة بعد' : 'No advising logs documented yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Log New Advising Session */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-800">
                {locale === 'ar' ? 'تسجيل وثيقة جلسة إرشادية جديدة' : 'Log New Advising Session'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {locale === 'ar' ? 'اختر الطالب:' : 'Select Student:'}
                </label>
                <select
                  required
                  value={formData.student_id}
                  onChange={e => setFormData({ ...formData, student_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer"
                >
                  <option value="">{locale === 'ar' ? '-- اختر الطالب --' : '-- Select Student --'}</option>
                  {studentsList.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {locale === 'ar' ? s.full_name_ar : (s.full_name_en || s.full_name_ar)} ({s.university_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {locale === 'ar' ? 'تاريخ الجلسة:' : 'Meeting Date:'}
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.meeting_date}
                    onChange={e => setFormData({ ...formData, meeting_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {locale === 'ar' ? 'التصنيف:' : 'Category:'}
                  </label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer"
                  >
                    <option value="academic">{locale === 'ar' ? 'أكاديمي' : 'Academic'}</option>
                    <option value="risk">{locale === 'ar' ? 'تعثر / إنذار' : 'Risk/Warning'}</option>
                    <option value="general">{locale === 'ar' ? 'عام' : 'General'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {locale === 'ar' ? 'ملاحظات وتفاصيل الجلسة:' : 'Meeting Notes:'}
                </label>
                <textarea
                  required
                  rows={3}
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={locale === 'ar' ? 'ادخل ما تم مناقشته خلال الجلسة...' : 'Enter meeting notes...'}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {locale === 'ar' ? 'خطة العمل والتوصيات (Action Plan):' : 'Action Plan:'}
                </label>
                <textarea
                  rows={2}
                  value={formData.action_plan}
                  onChange={e => setFormData({ ...formData, action_plan: e.target.value })}
                  placeholder={locale === 'ar' ? 'الخطوات والتوصيات المتفق عليها مع الطالب...' : 'Agreed action plan...'}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-medium focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                >
                  {createMutation.isPending ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ الجلسة' : 'Save Log')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
