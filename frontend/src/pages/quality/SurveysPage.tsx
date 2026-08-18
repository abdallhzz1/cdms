import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Plus, ExternalLink, MessageSquare } from 'lucide-react';

export function SurveysPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', target_group: '', purpose: '', frequency: '', is_mandatory: false, form_url: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quality-surveys'],
    queryFn: () => apiFetch<any>('/quality-surveys?per_page=50'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/quality-surveys', { method: 'POST', body: payload }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quality-surveys'] }); setIsModalOpen(false); setForm({ code: '', title: '', target_group: '', purpose: '', frequency: '', is_mandatory: false, form_url: '' }); },
  });

  if (!can('quality.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = Array.isArray(data) ? data : data?.items || [];

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); createMutation.mutate(form); };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader
          title={locale === 'ar' ? 'الاستبيانات' : 'Quality Surveys'}
          description={locale === 'ar' ? 'إدارة الاستبيانات الخاصة بتقييم جودة التدريب والتعليم' : 'Manage surveys for evaluating training and educational quality'}
        />
        {can('quality.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'استبيان جديد' : 'New Survey'}
          </Button>
        )}
      </div>

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد استبيانات بعد' : 'No surveys yet'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((s: any) => (
            <div key={s.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{s.code}</span>
                  <div className="flex items-center gap-1">
                    {s.is_mandatory && <span className="text-xs px-2 py-1 bg-red-100 text-red-700 font-bold rounded-lg">{locale === 'ar' ? 'إلزامي' : 'Mandatory'}</span>}
                  </div>
                </div>
                <h3 className="font-bold text-slate-900 leading-snug mb-2">{s.title}</h3>
                <p className="text-xs text-slate-500 mb-4">{s.target_group}</p>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    <MessageSquare className="w-4 h-4" />
                    <span>{s.questions_count ?? 0} {locale === 'ar' ? 'سؤال' : 'questions'}</span>
                  </div>
                  {s.frequency && <span className="text-xs text-slate-400">{s.frequency}</span>}
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between gap-2">
                <Link to={`/quality/surveys/${s.id}`} className="text-sm font-bold text-indigo-600 hover:underline">
                  {locale === 'ar' ? 'عرض التفاصيل' : 'View Details'}
                </Link>
                {s.form_url && (
                  <a href={s.form_url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 flex items-center gap-1 hover:text-indigo-600">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {locale === 'ar' ? 'الاستبيان' : 'Form'}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إضافة استبيان جديد' : 'New Survey'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الكود' : 'Code'}</label>
                  <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="QS-001" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الفئة المستهدفة' : 'Target Group'}</label>
                  <input required value={form.target_group} onChange={e => setForm({ ...form, target_group: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'الطلاب' : 'Students'} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'عنوان الاستبيان' : 'Survey Title'}</label>
                <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الغرض' : 'Purpose'}</label>
                <textarea rows={2} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'التكرار' : 'Frequency'}</label>
                  <input value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'فصلي' : 'Semester'} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'رابط الاستبيان' : 'Form URL'}</label>
                  <input type="url" value={form.form_url} onChange={e => setForm({ ...form, form_url: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="https://..." />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={e => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded" />
                <span className="text-sm font-semibold text-slate-700">{locale === 'ar' ? 'استبيان إلزامي' : 'Mandatory Survey'}</span>
              </label>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
                <Button type="submit" isLoading={createMutation.isPending}>{locale === 'ar' ? 'حفظ' : 'Save'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
