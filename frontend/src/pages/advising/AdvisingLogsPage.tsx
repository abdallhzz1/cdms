import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Plus, Calendar } from 'lucide-react';

export function AdvisingLogsPage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    meeting_date: new Date().toISOString().split('T')[0],
    category: 'academic',
    notes: '',
    action_plan: '',
  });

  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['advising-records'],
    queryFn: () => apiFetch<any>('/advising-records?per_page=50')
  });

  const { data: students } = useQuery({
    queryKey: ['students-for-advising'],
    queryFn: () => apiFetch<any>(`/students?academic_advisor_id=${user?.id}&per_page=100`),
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
    }
  });

  if (!can('advising.view')) return <ErrorState title="Access Denied" />;
  if (recordsLoading) return <LoadingState />;

  const recordsList = Array.isArray(records) ? records : records?.items || [];
  const studentsList = Array.isArray(students) ? students : students?.items || [];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      student_id: Number(formData.student_id),
      meeting_date: formData.meeting_date,
      category: formData.category,
      notes: formData.notes,
      action_plan: formData.action_plan || null,
      advisor_person_id: (user as any)?.person?.id
    });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title={locale === 'ar' ? 'سجل الإرشاد' : 'Advising Logs'} 
          description={locale === 'ar' ? 'توثيق الجلسات الإرشادية والملاحظات للطلاب' : 'Document advising sessions and notes'} 
        />
        {can('advising.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'تسجيل جلسة' : 'New Session'}
          </Button>
        )}
      </div>

      {!recordsList.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد جلسات مسجلة بعد.' : 'No sessions logged yet.'} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'التصنيف' : 'Category'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الملاحظات' : 'Notes'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recordsList.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {r.meeting_date}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? r.student?.full_name_ar : r.student?.full_name_en || r.student?.full_name_ar}</div>
                      <div className="text-xs text-slate-500">{r.student?.university_number}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs font-bold">{r.category}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                      {r.notes}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${r.status === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'توثيق جلسة إرشاد' : 'Log Advising Session'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الطالب' : 'Student'}</label>
                <select required value={formData.student_id} onChange={e => setFormData({ ...formData, student_id: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500">
                  <option value="">{locale === 'ar' ? '-- اختر الطالب --' : '-- Select Student --'}</option>
                  {studentsList.map((s: any) => (
                    <option key={s.id} value={s.id}>{locale === 'ar' ? s.full_name_ar : s.full_name_en || s.full_name_ar}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                  <input required type="date" value={formData.meeting_date} onChange={e => setFormData({ ...formData, meeting_date: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'التصنيف' : 'Category'}</label>
                  <select required value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500">
                    <option value="academic">{locale === 'ar' ? 'أكاديمي' : 'Academic'}</option>
                    <option value="general">{locale === 'ar' ? 'عام' : 'General'}</option>
                    <option value="risk">{locale === 'ar' ? 'تعثر / إنذار' : 'At-Risk'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الملاحظات' : 'Notes'}</label>
                <textarea required rows={4} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'اكتب ملاحظات الجلسة هنا...' : 'Session notes...'}></textarea>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'خطة العمل (اختياري)' : 'Action Plan (Optional)'}</label>
                <textarea rows={2} value={formData.action_plan} onChange={e => setFormData({ ...formData, action_plan: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'الخطوات المطلوبة من الطالب...' : 'Required actions from student...'}></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
                <Button type="submit" isLoading={createMutation.isPending}>{locale === 'ar' ? 'حفظ الجلسة' : 'Save Session'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
