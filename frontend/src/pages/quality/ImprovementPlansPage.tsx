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
import { Plus, Calendar, ArrowRight } from 'lucide-react';

const PRIORITY_STYLE: Record<string, { label_ar: string; label_en: string; classes: string }> = {
  high:   { label_ar: 'عالية',    label_en: 'High',   classes: 'bg-red-100 text-red-700' },
  normal: { label_ar: 'متوسطة',   label_en: 'Normal', classes: 'bg-amber-100 text-amber-700' },
  low:    { label_ar: 'منخفضة',   label_en: 'Low',    classes: 'bg-slate-100 text-slate-600' },
};

const STATUS_STYLE: Record<string, { label_ar: string; label_en: string; classes: string }> = {
  draft:       { label_ar: 'مسودة',       label_en: 'Draft',       classes: 'bg-slate-100 text-slate-600' },
  in_progress: { label_ar: 'قيد التنفيذ', label_en: 'In Progress', classes: 'bg-blue-100 text-blue-700' },
  under_review:{ label_ar: 'مراجعة',      label_en: 'Review',      classes: 'bg-amber-100 text-amber-700' },
  approved:    { label_ar: 'معتمدة',      label_en: 'Approved',    classes: 'bg-emerald-100 text-emerald-700' },
  closed:      { label_ar: 'مغلقة',       label_en: 'Closed',      classes: 'bg-slate-200 text-slate-500' },
};

export function ImprovementPlansPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ observation: '', improvement_action: '', priority: 'normal', due_date: '', responsible: '', academic_year: '', source: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quality-plans'],
    queryFn: () => apiFetch<any>('/quality-improvement-plans?per_page=50'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/quality-improvement-plans', { method: 'POST', body: payload }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quality-plans'] }); setIsModalOpen(false); setForm({ observation: '', improvement_action: '', priority: 'normal', due_date: '', responsible: '', academic_year: '', source: '' }); },
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
          title={locale === 'ar' ? 'خطط التحسين' : 'Improvement Plans'}
          description={locale === 'ar' ? 'تتبع ملاحظات الجودة وإجراءات التحسين المستمر' : 'Track quality observations and continuous improvement actions'}
        />
        {can('quality.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'خطة جديدة' : 'New Plan'}
          </Button>
        )}
      </div>

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد خطط تحسين بعد' : 'No improvement plans yet'} />
      ) : (
        <div className="space-y-4">
          {items.map((p: any) => {
            const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== 'closed' && p.status !== 'approved';
            const priority = PRIORITY_STYLE[p.priority] ?? PRIORITY_STYLE.normal;
            const status = STATUS_STYLE[p.status] ?? STATUS_STYLE.draft;
            return (
              <div key={p.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden ${isOverdue ? 'border-red-200' : 'border-slate-100'}`}>
                <div className="p-6">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${priority.classes}`}>
                      {locale === 'ar' ? priority.label_ar : priority.label_en}
                    </span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${status.classes}`}>
                      {locale === 'ar' ? status.label_ar : status.label_en}
                    </span>
                    {isOverdue && <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-red-100 text-red-700">{locale === 'ar' ? 'متأخر' : 'Overdue'}</span>}
                    {p.academic_year && <span className="text-xs text-slate-400">{p.academic_year}</span>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{locale === 'ar' ? 'الملاحظة' : 'Observation'}</p>
                      <p className="text-sm text-slate-800 leading-relaxed">{p.observation}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0 rtl:rotate-180" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{locale === 'ar' ? 'إجراء التحسين' : 'Improvement Action'}</p>
                        <p className="text-sm text-slate-800 leading-relaxed">{p.improvement_action}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
                    {p.due_date && (
                      <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-bold' : ''}`}>
                        <Calendar className="w-3.5 h-3.5" />
                        {locale === 'ar' ? 'الموعد النهائي:' : 'Due:'} {p.due_date}
                      </span>
                    )}
                    {p.responsible && <span>{locale === 'ar' ? 'المسؤول:' : 'Responsible:'} {p.responsible}</span>}
                    {p.source && <span>{locale === 'ar' ? 'المصدر:' : 'Source:'} {p.source}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'خطة تحسين جديدة' : 'New Improvement Plan'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الملاحظة / المشكلة' : 'Observation / Issue'}</label>
                <textarea required rows={3} value={form.observation} onChange={e => setForm({ ...form, observation: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'صف الملاحظة أو المشكلة...' : 'Describe the observation or issue...'} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'إجراء التحسين' : 'Improvement Action'}</label>
                <textarea required rows={3} value={form.improvement_action} onChange={e => setForm({ ...form, improvement_action: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'صف الإجراء المطلوب...' : 'Describe the required action...'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الأولوية' : 'Priority'}</label>
                  <select required value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500">
                    <option value="low">{locale === 'ar' ? 'منخفضة' : 'Low'}</option>
                    <option value="normal">{locale === 'ar' ? 'متوسطة' : 'Normal'}</option>
                    <option value="high">{locale === 'ar' ? 'عالية' : 'High'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الموعد النهائي' : 'Due Date'}</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'المسؤول' : 'Responsible'}</label>
                  <input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'السنة الأكاديمية' : 'Academic Year'}</label>
                  <input value={form.academic_year} onChange={e => setForm({ ...form, academic_year: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="2025-2026" />
                </div>
              </div>
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
