import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { BookOpen, Plus, Search, Edit, Trash2, Map } from 'lucide-react';

interface Plan { 
  id: number; 
  code: string; 
  name_ar: string; 
  name_en: string | null; 
  is_active: boolean;
  courses?: Array<{id:number; code:string; name_ar:string; name_en:string|null; pivot:{academic_level:string|null;sequence:number;is_required:boolean}}> 
}

export function StudyPlansPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  const [formData, setFormData] = useState({ code: '', name_ar: '', name_en: '', is_active: true });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['study-plans'],
    queryFn: () => apiFetch<Plan[]>('/study-plans?per_page=100')
  });

  const createMutation = useMutation({
    mutationFn: (newPlan: any) => apiFetch('/study-plans', { method: 'POST', body: newPlan }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-plans'] });
      setIsModalOpen(false);
      setFormData({ code: '', name_ar: '', name_en: '', is_active: true });
      alert(locale === 'ar' ? 'تم إنشاء الخطة بنجاح' : 'Study plan created');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (updatedPlan: any) => apiFetch(`/study-plans/${updatedPlan.id}`, { method: 'PUT', body: updatedPlan }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-plans'] });
      setIsModalOpen(false);
      setEditingPlan(null);
      setFormData({ code: '', name_ar: '', name_en: '', is_active: true });
      alert(locale === 'ar' ? 'تم تحديث الخطة بنجاح' : 'Study plan updated');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/study-plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-plans'] });
      alert(locale === 'ar' ? 'تم حذف الخطة بنجاح' : 'Study plan deleted');
    }
  });

  if (!can('courses.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const filteredPlans = data?.filter(plan => 
    plan.name_ar.includes(search) || (plan.name_en && plan.name_en.includes(search)) || plan.code.includes(search)
  ) || [];

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData({ code: plan.code, name_ar: plan.name_ar, name_en: plan.name_en || '', is_active: plan.is_active });
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm(locale === 'ar' ? 'هل أنت متأكد من حذف هذه الخطة؟' : 'Are you sure you want to delete this plan?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader 
          title={t('studyPlans.title', 'الخطط الدراسية')} 
          description={t('studyPlans.description', 'إدارة الخطط الدراسية وتوزيع المساقات')} 
        />
        {can('courses.manage') && (
          <Button onClick={() => {
            setEditingPlan(null);
            setFormData({ code: '', name_ar: '', name_en: '', is_active: true });
            setIsModalOpen(true);
          }} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'إضافة خطة' : 'Add Plan'}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={locale === 'ar' ? 'ابحث برمز أو اسم الخطة...' : 'Search by code or name...'} 
            className="block w-full rounded-xl border-none bg-slate-50 py-2.5 pr-10 pl-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-600 transition-shadow" 
          />
        </div>
      </div>

      {!filteredPlans.length ? (
        <EmptyState message={t('studyPlans.noPlans', 'لا توجد خطط دراسية مطابقة')} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredPlans.map((plan) => (
            <div key={plan.id} className="group flex flex-col bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-all">
              <div className="p-6 pb-5 border-b border-slate-50 relative">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <Map className="w-6 h-6" />
                  </div>
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                    plan.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {plan.is_active ? (locale === 'ar' ? 'فعالة' : 'Active') : (locale === 'ar' ? 'غير فعالة' : 'Inactive')}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-1">{locale === 'ar' ? plan.name_ar : plan.name_en || plan.name_ar}</h3>
                <p className="font-medium text-sm text-slate-500">{plan.code}</p>
              </div>
              <div className="px-6 py-4 bg-slate-50/50 flex-1 flex flex-col justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-600 font-medium mb-4">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  {plan.courses?.length || 0} {locale === 'ar' ? 'مساقات مدرجة' : 'Courses included'}
                </div>
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={`/study-plans/${plan.id}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-all">
                    {locale === 'ar' ? 'عرض المساقات' : 'View Courses'}
                  </a>
                  {can('courses.manage') && (
                    <>
                      <button onClick={(e) => { e.preventDefault(); handleEdit(plan); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm transition-all">
                        <Edit className="w-3.5 h-3.5" />
                        {locale === 'ar' ? 'تعديل' : 'Edit'}
                      </button>
                      <button onClick={(e) => { e.preventDefault(); handleDelete(plan.id); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                        {locale === 'ar' ? 'حذف' : 'Delete'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-lg text-slate-800">
                {editingPlan ? (locale === 'ar' ? 'تعديل خطة دراسية' : 'Edit Study Plan') : (locale === 'ar' ? 'إضافة خطة دراسية جديدة' : 'Add New Study Plan')}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'رمز الخطة' : 'Plan Code'}</label>
                <input required value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" placeholder="e.g. SP-2023" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                <input required value={formData.name_ar} onChange={e => setFormData({ ...formData, name_ar: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                <input value={formData.name_en} onChange={e => setFormData({ ...formData, name_en: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="isActive" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                <label htmlFor="isActive" className="text-sm font-medium text-slate-700">{locale === 'ar' ? 'خطة فعالة' : 'Active Plan'}</label>
              </div>
              
              <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
                  {locale === 'ar' ? 'حفظ الخطة' : 'Save Plan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
