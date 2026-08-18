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
import { Plus, Target } from 'lucide-react';

export function KpiPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', category: '', target_value: '', measurement_frequency: '', responsible: '', weight: '' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['quality-kpis'],
    queryFn: () => apiFetch<any>('/quality-kpis?per_page=50'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/quality-kpis', { method: 'POST', body: payload }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quality-kpis'] }); setIsModalOpen(false); },
  });

  if (!can('quality.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = Array.isArray(data) ? data : data?.items || [];

  const categories = [...new Set(items.map((k: any) => k.category).filter(Boolean))];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, weight: form.weight ? Number(form.weight) : null });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <PageHeader
          title={locale === 'ar' ? 'مؤشرات الجودة (KPIs)' : 'Quality KPIs'}
          description={locale === 'ar' ? 'مؤشرات الأداء الرئيسية لقياس جودة البرنامج التعليمي' : 'Key performance indicators for measuring educational program quality'}
        />
        {can('quality.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'مؤشر جديد' : 'New KPI'}
          </Button>
        )}
      </div>

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد مؤشرات جودة بعد' : 'No KPIs defined yet'} />
      ) : (
        <div>
          {/* Group by category */}
          {categories.length > 0 ? (
            categories.map((cat: any) => (
              <div key={cat} className="mb-8">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{cat}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.filter((k: any) => k.category === cat).map((k: any) => <KpiCard key={k.id} kpi={k} locale={locale} />)}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((k: any) => <KpiCard key={k.id} kpi={k} locale={locale} />)}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'مؤشر جودة جديد' : 'New KPI'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الكود' : 'Code'}</label>
                  <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="KPI-001" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الفئة' : 'Category'}</label>
                  <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'اسم المؤشر' : 'KPI Name'}</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'القيمة المستهدفة' : 'Target Value'}</label>
                  <input value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder="≥ 80%" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'تكرار القياس' : 'Measurement Frequency'}</label>
                  <input value={form.measurement_frequency} onChange={e => setForm({ ...form, measurement_frequency: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" placeholder={locale === 'ar' ? 'سنوي' : 'Annual'} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'المسؤول' : 'Responsible'}</label>
                  <input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الوزن' : 'Weight'}</label>
                  <input type="number" min="0" step="0.1" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500" />
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

function KpiCard({ kpi, locale }: { kpi: any; locale: string }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{kpi.code}</span>
        {kpi.weight && <span className="text-xs text-slate-400">{locale === 'ar' ? 'وزن' : 'Weight'}: {kpi.weight}</span>}
      </div>
      <p className="text-sm font-bold text-slate-800 leading-snug">{kpi.name}</p>
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
        <Target className="w-4 h-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-bold text-emerald-700">{kpi.target_value || '—'}</span>
        {kpi.measurement_frequency && <span className="text-xs text-slate-400 ml-auto">{kpi.measurement_frequency}</span>}
      </div>
      {kpi.responsible && <p className="text-xs text-slate-500">{locale === 'ar' ? 'المسؤول:' : 'Responsible:'} {kpi.responsible}</p>}
    </div>
  );
}
