import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Check, Send, Save, ArrowLeft } from 'lucide-react';

export function GradesPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('Fall 2026');

  const { data: courses } = useQuery({
    queryKey: ['courses'],
    queryFn: () => apiFetch<any>('/courses?per_page=100')
  });

  const { data: enrollments, isLoading } = useQuery({
    queryKey: ['enrollments-grades', selectedCourse, selectedSemester],
    queryFn: () => apiFetch<any>(`/student-course-enrollments?course_id=${selectedCourse}&semester=${selectedSemester}&include_grades=1&per_page=100`),
    enabled: Boolean(selectedCourse)
  });

  const saveGradeMutation = useMutation({
    mutationFn: (data: { enrollment_id: number; score: number; max_score: number }) => 
      apiFetch('/grade-entries', { 
        method: 'POST', 
        body: { student_course_enrollment_id: data.enrollment_id, score: data.score, max_score: data.max_score } 
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrollments-grades'] })
  });

  const submitGradeMutation = useMutation({
    mutationFn: (gradeId: number) => apiFetch(`/grade-entries/${gradeId}/submit`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrollments-grades'] })
  });

  const approveGradeMutation = useMutation({
    mutationFn: (gradeId: number) => apiFetch(`/grade-entries/${gradeId}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrollments-grades'] })
  });

  const returnGradeMutation = useMutation({
    mutationFn: (gradeId: number) => apiFetch(`/grade-entries/${gradeId}/return`, { method: 'POST', body: { reason: 'Requires revision' } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrollments-grades'] })
  });

  const [editStates, setEditStates] = useState<Record<number, { score: string; max_score: string }>>({});

  const handleEditChange = (id: number, field: 'score' | 'max_score', value: string) => {
    setEditStates(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleSave = (enrollmentId: number) => {
    const state = editStates[enrollmentId];
    if (!state || !state.score || !state.max_score) return;
    saveGradeMutation.mutate({ enrollment_id: enrollmentId, score: parseFloat(state.score), max_score: parseFloat(state.max_score) });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{locale === 'ar' ? 'مسودة' : 'Draft'}</span>;
      case 'submitted': return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">{locale === 'ar' ? 'بانتظار الاعتماد' : 'Submitted'}</span>;
      case 'returned': return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">{locale === 'ar' ? 'مُعاد للمراجعة' : 'Returned'}</span>;
      case 'approved': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">{locale === 'ar' ? 'معتمد' : 'Approved'}</span>;
      case 'published': return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">{locale === 'ar' ? 'منشور' : 'Published'}</span>;
      default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{status}</span>;
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader 
        title={t('grades.title', 'العلامات')} 
        description={t('grades.description', 'إدارة وإدخال واعتماد علامات الطلبة للمساقات السريرية')} 
      />

      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-sm font-semibold text-slate-700 mb-2">{locale === 'ar' ? 'اختر المساق' : 'Select Course'}</label>
          <select 
            value={selectedCourse} 
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">{locale === 'ar' ? '-- اختر مساقاً --' : '-- Select a course --'}</option>
            {(Array.isArray(courses) ? courses : courses?.items || [])?.map((c: any) => (
              <option key={c.id} value={c.id}>{c.code} - {locale === 'ar' ? c.name_ar : c.name_en || c.name_ar}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-sm font-semibold text-slate-700 mb-2">{locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}</label>
          <select 
            value={selectedSemester} 
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="Fall 2026">Fall 2026</option>
            <option value="Spring 2027">Spring 2027</option>
          </select>
        </div>
      </div>

      {!selectedCourse ? (
        <EmptyState message={locale === 'ar' ? 'الرجاء اختيار المساق لعرض الطلبة المسجلين' : 'Please select a course to view enrolled students'} />
      ) : isLoading ? (
        <LoadingState />
      ) : !(Array.isArray(enrollments) ? enrollments : enrollments?.items || [])?.length ? (
        <EmptyState message={locale === 'ar' ? 'لا يوجد طلبة مسجلين في هذا المساق للفصل المحدد' : 'No enrolled students found'} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="px-6 py-4 font-semibold text-center">{locale === 'ar' ? 'العلامة' : 'Score'}</th>
                  <th className="px-6 py-4 font-semibold text-center">{locale === 'ar' ? 'العلامة القصوى' : 'Max Score'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold text-end">{locale === 'ar' ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(Array.isArray(enrollments) ? enrollments : enrollments?.items || []).map((enrollment: any) => {
                  const grade = enrollment.grade_entry;
                  const isDraft = !grade || grade.status === 'draft' || grade.status === 'returned';
                  const isSubmitted = grade?.status === 'submitted';
                  
                  const state = editStates[enrollment.id] || { score: grade?.score ?? '', max_score: grade?.max_score ?? 100 };

                  return (
                    <tr key={enrollment.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{locale === 'ar' ? enrollment.student.full_name_ar : enrollment.student.full_name_en || enrollment.student.full_name_ar}</div>
                        <div className="text-xs font-semibold text-slate-500 mt-0.5">{enrollment.student.university_number}</div>
                      </td>
                      
                      <td className="px-6 py-4 text-center">
                        {isDraft && can('grades.create') ? (
                          <input 
                            type="number" 
                            value={state.score} 
                            onChange={e => handleEditChange(enrollment.id, 'score', e.target.value)}
                            className="w-20 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-indigo-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
                          />
                        ) : (
                          <span className="font-bold text-slate-900">{grade?.score ?? '—'}</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {isDraft && can('grades.create') ? (
                          <input 
                            type="number" 
                            value={state.max_score} 
                            onChange={e => handleEditChange(enrollment.id, 'max_score', e.target.value)}
                            className="w-20 text-center rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
                          />
                        ) : (
                          <span className="font-bold text-slate-500">{grade?.max_score ?? '—'}</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {getStatusBadge(grade?.status ?? 'pending')}
                      </td>

                      <td className="px-6 py-4 flex items-center justify-end gap-2">
                        {isDraft && can('grades.create') && (
                          <>
                            <button 
                              onClick={() => handleSave(enrollment.id)}
                              className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                              title={locale === 'ar' ? 'حفظ العلامة (كمسودة)' : 'Save (Draft)'}
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            {grade && (
                              <button 
                                onClick={() => submitGradeMutation.mutate(grade.id)}
                                className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                title={locale === 'ar' ? 'تقديم للاعتماد' : 'Submit for Approval'}
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}

                        {isSubmitted && can('grades.approve') && (
                          <>
                            <button 
                              onClick={() => approveGradeMutation.mutate(grade.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {locale === 'ar' ? 'اعتماد' : 'Approve'}
                            </button>
                            <button 
                              onClick={() => returnGradeMutation.mutate(grade.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5"
                            >
                              <ArrowLeft className="w-3.5 h-3.5" />
                              {locale === 'ar' ? 'إرجاع' : 'Return'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
