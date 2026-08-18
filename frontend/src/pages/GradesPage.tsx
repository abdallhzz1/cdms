import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Button } from '@/components/ui/Button';
import { Check, Send, Save, ArrowLeft, CheckCircle2, AlertCircle, FileCheck, Layers } from 'lucide-react';

export function GradesPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('Fall 2026');
  const [returnModalId, setReturnModalId] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState('');

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
    mutationFn: ({ gradeId, reason }: { gradeId: number; reason: string }) => 
      apiFetch(`/grade-entries/${gradeId}/return`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments-grades'] });
      setReturnModalId(null);
      setReturnReason('');
    }
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

  const enrollmentsList = (Array.isArray(enrollments) ? enrollments : enrollments?.items || []);

  const stats = {
    total: enrollmentsList.length,
    draft: enrollmentsList.filter((e: any) => !e.grade_entry || e.grade_entry?.status === 'draft').length,
    submitted: enrollmentsList.filter((e: any) => e.grade_entry?.status === 'submitted').length,
    approved: enrollmentsList.filter((e: any) => e.grade_entry?.status === 'approved').length,
  };

  const handleBatchApprove = async () => {
    const submittedGrades = enrollmentsList
      .filter((e: any) => e.grade_entry?.status === 'submitted')
      .map((e: any) => e.grade_entry.id);
    for (const id of submittedGrades) {
      await approveGradeMutation.mutateAsync(id);
    }
  };

  const handleBatchSubmit = async () => {
    const draftGrades = enrollmentsList
      .filter((e: any) => e.grade_entry?.status === 'draft')
      .map((e: any) => e.grade_entry.id);
    for (const id of draftGrades) {
      await submitGradeMutation.mutateAsync(id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft': return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">{locale === 'ar' ? 'مسودة' : 'Draft'}</span>;
      case 'submitted': return <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-xl text-xs font-bold">{locale === 'ar' ? 'بانتظار الاعتماد' : 'Submitted'}</span>;
      case 'returned': return <span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-xl text-xs font-bold">{locale === 'ar' ? 'مُعاد للمراجعة' : 'Returned'}</span>;
      case 'approved': return <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold">{locale === 'ar' ? 'معتمد' : 'Approved'}</span>;
      case 'published': return <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-xl text-xs font-bold">{locale === 'ar' ? 'منشور' : 'Published'}</span>;
      default: return <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">{status}</span>;
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader 
        title={t('grades.title', 'العلامات ومسار الاعتماد')} 
        description={t('grades.description', 'إدارة وإدخال ومراجعة واعتماد درجات المساقات السريرية')} 
      />

      {/* Course & Semester Filters */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">{locale === 'ar' ? 'اختر المساق السريري' : 'Select Course'}</label>
          <select 
            value={selectedCourse} 
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">{locale === 'ar' ? '-- اختر مساقاً --' : '-- Select a course --'}</option>
            {(Array.isArray(courses) ? courses : courses?.items || [])?.map((c: any) => (
              <option key={c.id} value={c.id}>{c.code} - {locale === 'ar' ? c.name_ar : c.name_en || c.name_ar}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">{locale === 'ar' ? 'الفصل الدراسي' : 'Semester'}</label>
          <select 
            value={selectedSemester} 
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="Fall 2026">Fall 2026 (الفصل الأول)</option>
            <option value="Spring 2027">Spring 2027 (الفصل الثاني)</option>
          </select>
        </div>
      </div>

      {selectedCourse && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'الطلبة المسجلين' : 'Enrolled'}</div>
              <div className="text-xl font-black text-slate-800 mt-1">{stats.total}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/20 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'مسودات' : 'Drafts'}</div>
              <div className="text-xl font-black text-slate-800 mt-1">{stats.draft}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/20 shrink-0">
              <Save className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'بانتظار الاعتماد' : 'Pending'}</div>
              <div className="text-xl font-black text-slate-800 mt-1">{stats.submitted}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/20 shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-lg border border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{locale === 'ar' ? 'معتمدة نهائياً' : 'Approved'}</div>
              <div className="text-xl font-black text-slate-800 mt-1">{stats.approved}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white flex items-center justify-center font-bold shadow-md shadow-teal-500/20 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Batch Workflow Actions Bar */}
      {selectedCourse && enrollmentsList.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
          <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-indigo-600" />
            <span>{locale === 'ar' ? 'إجراءات جماعية لمسار الاعتماد:' : 'Batch Workflow Actions:'}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {stats.draft > 0 && can('grades.create') && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchSubmit}
                isLoading={submitGradeMutation.isPending}
                className="text-xs rounded-xl flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5 text-indigo-600" />
                {locale === 'ar' ? 'تقديم كافة المسودات للاعتماد' : 'Submit All Drafts'}
              </Button>
            )}

            {stats.submitted > 0 && can('grades.approve') && (
              <Button
                size="sm"
                onClick={handleBatchApprove}
                isLoading={approveGradeMutation.isPending}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {locale === 'ar' ? 'اعتماد كافة الدرجات المقدمة' : 'Approve All Submitted'}
              </Button>
            )}
          </div>
        </div>
      )}

      {!selectedCourse ? (
        <EmptyState message={locale === 'ar' ? 'الرجاء اختيار المساق لعرض الطلبة المسجلين ومسار العلامات' : 'Please select a course to view enrolled students'} />
      ) : isLoading ? (
        <LoadingState />
      ) : !enrollmentsList.length ? (
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
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'حالة الاعتماد' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollmentsList.map((enrollment: any) => {
                  const grade = enrollment.grade_entry;
                  const isDraft = !grade || grade.status === 'draft' || grade.status === 'returned';
                  const isSubmitted = grade?.status === 'submitted';
                  
                  const state = editStates[enrollment.id] || { score: grade?.score ?? '', max_score: grade?.max_score ?? 100 };

                  return (
                    <tr key={enrollment.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{locale === 'ar' ? enrollment.student?.full_name_ar : enrollment.student?.full_name_en || enrollment.student?.full_name_ar}</div>
                        <div className="text-xs font-semibold text-slate-500 mt-0.5">{enrollment.student?.university_number}</div>
                      </td>
                      
                      <td className="px-6 py-4 text-center">
                        {isDraft && can('grades.create') ? (
                          <input 
                            type="number" 
                            value={state.score} 
                            onChange={e => handleEditChange(enrollment.id, 'score', e.target.value)}
                            className="w-20 text-center rounded-xl border border-slate-200 px-2 py-1.5 text-sm font-bold text-indigo-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
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
                            className="w-20 text-center rounded-xl border border-slate-200 px-2 py-1.5 text-sm font-bold text-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" 
                          />
                        ) : (
                          <span className="font-bold text-slate-500">{grade?.max_score ?? '—'}</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {getStatusBadge(grade?.status ?? 'draft')}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {isDraft && can('grades.create') && (
                            <>
                              <button 
                                onClick={() => handleSave(enrollment.id)}
                                className="p-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                title={locale === 'ar' ? 'حفظ العلامة كمسودة' : 'Save Draft'}
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              {grade && (
                                <button 
                                  onClick={() => submitGradeMutation.mutate(grade.id)}
                                  className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
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
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {locale === 'ar' ? 'اعتماد' : 'Approve'}
                              </button>
                              <button 
                                onClick={() => { setReturnModalId(grade.id); setReturnReason(''); }}
                                className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5"
                              >
                                <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                                {locale === 'ar' ? 'إرجاع' : 'Return'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Return Reason Modal */}
      {returnModalId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إرجاع العلامة للمراجعة والتعديل' : 'Return Grade for Revision'}</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'سبب الإرجاع / الملاحظات' : 'Return Reason'}</label>
              <textarea
                rows={3}
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                placeholder={locale === 'ar' ? 'اكتب ملاحظات المراجعة المطلوبة...' : 'Specify reasons for return...'}
                className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setReturnModalId(null)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
              <Button 
                onClick={() => returnGradeMutation.mutate({ gradeId: returnModalId, reason: returnReason })}
                isLoading={returnGradeMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {locale === 'ar' ? 'تأكيد الإرجاع' : 'Confirm Return'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
