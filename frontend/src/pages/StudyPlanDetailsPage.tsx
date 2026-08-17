import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Button } from '@/components/ui/Button';
import { ChevronRight, Plus, Trash2, BookOpen } from 'lucide-react';

export function StudyPlanDetailsPage() {
  const navigate = useNavigate();
  const { planId } = useParams<{ planId: string }>();
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const { data: plan, isLoading, isError, refetch } = useQuery({
    queryKey: ['study-plan', planId],
    queryFn: () => apiFetch<any>(`/study-plans/${planId}`),
    enabled: Boolean(planId)
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ mode: 'existing', course_id: '', sequence: 1, is_required: true, academic_level: '', new_code: '', new_name_ar: '', new_name_en: '', new_credits: 3 });

  const { data: allCourses } = useQuery({
    queryKey: ['courses'],
    queryFn: () => apiFetch<any>('/courses?per_page=100'),
    enabled: isModalOpen
  });

  const addCourseMutation = useMutation({
    mutationFn: (newCourse: any) => apiFetch(`/study-plans/${planId}/courses`, { method: 'POST', body: newCourse }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-plan', planId] });
      setIsModalOpen(false);
      setFormData({ mode: 'existing', course_id: '', sequence: 1, is_required: true, academic_level: '', new_code: '', new_name_ar: '', new_name_en: '', new_credits: 3 });
      alert(locale === 'ar' ? 'تم إضافة المساق للخطة' : 'Course added to plan');
    }
  });

  const removeCourseMutation = useMutation({
    mutationFn: (courseId: number) => apiFetch(`/study-plans/${planId}/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-plan', planId] });
      alert(locale === 'ar' ? 'تم إزالة المساق من الخطة' : 'Course removed from plan');
    }
  });

  if (!can('courses.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) return <LoadingState />;
  if (isError || !plan) return <ErrorState onRetry={() => refetch()} />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    let courseId = formData.course_id;

    if (formData.mode === 'new') {
      try {
        const newCourse = await apiFetch<any>('/courses', {
          method: 'POST',
          body: {
            code: formData.new_code,
            name_ar: formData.new_name_ar,
            name_en: formData.new_name_en,
            credit_hours: formData.new_credits
          }
        });
        courseId = newCourse.id;
      } catch (err) {
        alert(locale === 'ar' ? 'فشل إنشاء المساق' : 'Failed to create course');
        setIsSubmitting(false);
        return;
      }
    }

    if (!courseId) {
      setIsSubmitting(false);
      return;
    }

    addCourseMutation.mutate({
      course_id: parseInt(courseId as string),
      sequence: formData.sequence,
      is_required: formData.is_required,
      academic_level: formData.academic_level
    }, {
      onSettled: () => setIsSubmitting(false)
    });
  };

  const name = locale === 'ar' ? plan.name_ar : plan.name_en || plan.name_ar;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex items-center gap-2 mb-2">
        <Link to="/study-plans" className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
          <ChevronRight className="w-4 h-4" />
          {t('nav.studyPlans', 'الخطط الدراسية')}
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-semibold text-slate-700">{plan.code}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl opacity-50 pointer-events-none -mr-10 -mt-10"></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">{plan.code}</p>
        </div>
        {can('courses.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'إضافة مساق للخطة' : 'Add Course to Plan'}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-500" />
          <h2 className="font-bold text-slate-800">{locale === 'ar' ? 'المساقات المدرجة' : 'Included Courses'}</h2>
        </div>
        
        {!plan.courses?.length ? (
          <div className="p-6">
            <EmptyState message={locale === 'ar' ? 'لا يوجد مساقات مدرجة في هذه الخطة بعد' : 'No courses in this plan yet'} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'رمز المساق' : 'Code'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'اسم المساق' : 'Name'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'التسلسل (السنة/الفصل)' : 'Sequence'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  {can('courses.manage') && <th className="px-6 py-4 font-semibold text-end">{locale === 'ar' ? 'إجراءات' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.courses.map((course: any) => (
                  <tr key={course.id} onClick={() => navigate(`/courses/${course.id}`)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-6 py-4 text-sm font-bold text-indigo-600">{course.code}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{locale === 'ar' ? course.name_ar : course.name_en || course.name_ar}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">{course.pivot?.sequence || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold ${course.pivot?.is_required ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {course.pivot?.is_required ? (locale === 'ar' ? 'إجباري' : 'Required') : (locale === 'ar' ? 'اختياري' : 'Elective')}
                      </span>
                    </td>
                    {can('courses.manage') && (
                      <td className="px-6 py-4 text-end">
                        <button onClick={(e) => { e.stopPropagation(); if(confirm(locale === 'ar' ? 'تأكيد الحذف من الخطة؟' : 'Confirm removal?')) removeCourseMutation.mutate(course.id); }} className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50" title={locale === 'ar' ? 'إزالة من الخطة' : 'Remove from plan'}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إضافة مساق للخطة' : 'Add Course'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="flex gap-4 mb-4 border-b border-slate-100 pb-2">
                <button type="button" onClick={() => setFormData({ ...formData, mode: 'existing' })} className={`text-sm font-bold pb-2 border-b-2 transition-colors ${formData.mode === 'existing' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {locale === 'ar' ? 'مساق موجود' : 'Existing Course'}
                </button>
                <button type="button" onClick={() => setFormData({ ...formData, mode: 'new' })} className={`text-sm font-bold pb-2 border-b-2 transition-colors ${formData.mode === 'new' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                  {locale === 'ar' ? 'مساق جديد' : 'New Course'}
                </button>
              </div>

              {formData.mode === 'existing' ? (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اختر المساق' : 'Select Course'}</label>
                  <select required={formData.mode === 'existing'} value={formData.course_id} onChange={e => setFormData({ ...formData, course_id: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                    <option value="">{locale === 'ar' ? '-- اختر --' : '-- Select --'}</option>
                    {(Array.isArray(allCourses) ? allCourses : allCourses?.items || [])?.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.code} - {locale === 'ar' ? c.name_ar : c.name_en || c.name_ar}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'رمز المساق' : 'Code'}</label>
                      <input required={formData.mode === 'new'} value={formData.new_code} onChange={e => setFormData({ ...formData, new_code: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الساعات' : 'Credits'}</label>
                      <input type="number" min="1" required={formData.mode === 'new'} value={formData.new_credits} onChange={e => setFormData({ ...formData, new_credits: parseInt(e.target.value) || 3 })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اسم المساق (عربي)' : 'Name (AR)'}</label>
                    <input required={formData.mode === 'new'} value={formData.new_name_ar} onChange={e => setFormData({ ...formData, new_name_ar: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اسم المساق (إنجليزي)' : 'Name (EN)'}</label>
                    <input value={formData.new_name_en} onChange={e => setFormData({ ...formData, new_name_en: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'التسلسل الأكاديمي' : 'Sequence'}</label>
                  <input type="number" min="1" required value={formData.sequence} onChange={e => setFormData({ ...formData, sequence: parseInt(e.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'المستوى' : 'Level'}</label>
                  <input value={formData.academic_level} onChange={e => setFormData({ ...formData, academic_level: e.target.value })} placeholder="e.g. Year 4" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="isRequired" checked={formData.is_required} onChange={e => setFormData({ ...formData, is_required: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                <label htmlFor="isRequired" className="text-sm font-medium text-slate-700">{locale === 'ar' ? 'متطلب إجباري' : 'Required Course'}</label>
              </div>
              
              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
                <Button type="submit" isLoading={isSubmitting}>{locale === 'ar' ? 'إضافة المساق' : 'Add Course'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
