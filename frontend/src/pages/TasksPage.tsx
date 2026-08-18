import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { 
  CheckCircle2, Plus, 
  Filter, RotateCcw, Calendar, UserCheck
} from 'lucide-react';

interface Task {
  id: number;
  title: string;
  due_date?: string | null;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'in_progress' | 'completed';
  assigned_to?: string | null;
}

export function TasksPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const [formData, setFormData] = useState({
    title: '',
    due_date: '',
    priority: 'normal' as Task['priority'],
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['operational-tasks'],
    queryFn: () => apiFetch<any>('/operational-tasks?per_page=100'),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/operational-tasks', { method: 'POST', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['operational-tasks'] });
      setIsModalOpen(false);
      setFormData({ title: '', due_date: '', priority: 'normal' });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Task['status'] }) => 
      apiFetch(`/operational-tasks/${id}`, { method: 'PUT', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operational-tasks'] }),
  });

  if (!can('tasks.view')) {
    return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  }

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const allTasks: Task[] = Array.isArray(data) ? data : data?.items || [];

  const filteredTasks = allTasks.filter(task => {
    if (filterStatus !== 'all' && task.status !== filterStatus) return false;
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
    return true;
  });

  const stats = {
    total: allTasks.length,
    open: allTasks.filter(t => t.status === 'open').length,
    inProgress: allTasks.filter(t => t.status === 'in_progress').length,
    completed: allTasks.filter(t => t.status === 'completed').length,
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      title: formData.title,
      due_date: formData.due_date || null,
      priority: formData.priority,
    });
  };

  const getPriorityBadge = (p: Task['priority']) => {
    switch (p) {
      case 'high': return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-red-100 text-red-700">{locale === 'ar' ? 'أولوية عالية' : 'High'}</span>;
      case 'normal': return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-700">{locale === 'ar' ? 'متوسطة' : 'Normal'}</span>;
      case 'low': return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700">{locale === 'ar' ? 'منخفضة' : 'Low'}</span>;
      default: return null;
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title={locale === 'ar' ? 'المهام والتكليفات الإدارية' : 'Operational Tasks'}
          description={locale === 'ar' ? 'متابعة وإنجاز المهام والتكليفات الصادرة من محاضر الاجتماعات والإدارة' : 'Track and execute operational tasks, decisions, and administrative assignments'}
        />

        {can('tasks.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'مهمة جديدة' : 'New Task'}
          </Button>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div 
          onClick={() => setFilterStatus('all')}
          className={`p-5 rounded-2xl cursor-pointer transition-all bg-white shadow-lg border ${
            filterStatus === 'all' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-100 hover:shadow-xl'
          }`}
        >
          <div className="text-xl sm:text-2xl font-black text-slate-800">{stats.total}</div>
          <div className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{locale === 'ar' ? 'إجمالي المهام' : 'All Tasks'}</div>
        </div>

        <div 
          onClick={() => setFilterStatus('open')}
          className={`p-5 rounded-2xl cursor-pointer transition-all bg-white shadow-lg border ${
            filterStatus === 'open' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-100 hover:shadow-xl'
          }`}
        >
          <div className="text-xl sm:text-2xl font-black text-teal-600">{stats.open}</div>
          <div className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{locale === 'ar' ? 'مهام مفتوحة' : 'Open'}</div>
        </div>

        <div 
          onClick={() => setFilterStatus('in_progress')}
          className={`p-5 rounded-2xl cursor-pointer transition-all bg-white shadow-lg border ${
            filterStatus === 'in_progress' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-100 hover:shadow-xl'
          }`}
        >
          <div className="text-xl sm:text-2xl font-black text-slate-800">{stats.inProgress}</div>
          <div className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{locale === 'ar' ? 'قيد التنفيذ' : 'In Progress'}</div>
        </div>

        <div 
          onClick={() => setFilterStatus('completed')}
          className={`p-5 rounded-2xl cursor-pointer transition-all bg-white shadow-lg border ${
            filterStatus === 'completed' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-100 hover:shadow-xl'
          }`}
        >
          <div className="text-xl sm:text-2xl font-black text-slate-800">{stats.completed}</div>
          <div className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wider">{locale === 'ar' ? 'مكتملة' : 'Completed'}</div>
        </div>
      </div>

      {/* Priority Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-600">{locale === 'ar' ? 'تصفية حسب الأولوية:' : 'Priority Filter:'}</span>
          <div className="flex gap-1.5">
            {['all', 'high', 'normal', 'low'].map(p => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filterPriority === p 
                    ? 'bg-gradient-to-tr from-teal-500 to-teal-400 text-white shadow-md shadow-teal-500/20' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p === 'all' ? (locale === 'ar' ? 'الكل' : 'All') : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {(filterStatus !== 'all' || filterPriority !== 'all') && (
          <button
            onClick={() => { setFilterStatus('all'); setFilterPriority('all'); }}
            className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'إعادة ضبط التصفية' : 'Reset'}</span>
          </button>
        )}
      </div>

      {/* Tasks List */}
      {!filteredTasks.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد مهام مطابقة للتصفية الحالية' : 'No tasks match current filters'} />
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isInProgress = task.status === 'in_progress';

            return (
              <div
                key={task.id}
                className={`bg-white rounded-3xl border p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isCompleted ? 'border-slate-100 opacity-75 bg-slate-50/50' : 'border-slate-100 shadow-sm hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-4">
                  <button
                    disabled={updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate({
                      id: task.id,
                      status: isCompleted ? 'open' : 'completed',
                    })}
                    className={`mt-0.5 w-6 h-6 rounded-xl border flex items-center justify-center transition-colors shrink-0 ${
                      isCompleted ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 hover:border-indigo-500'
                    }`}
                    title={isCompleted ? (locale === 'ar' ? 'إعادة فتح المهمة' : 'Reopen') : (locale === 'ar' ? 'تعليم كمكتملة' : 'Mark Completed')}
                  >
                    {isCompleted && <CheckCircle2 className="w-4 h-4" />}
                  </button>

                  <div className="space-y-1">
                    <h3 className={`text-sm font-bold text-slate-900 leading-snug ${isCompleted ? 'line-through text-slate-400' : ''}`}>
                      {task.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      {task.due_date && (
                        <span className="flex items-center gap-1 text-slate-500 font-semibold">
                          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                          {task.due_date}
                        </span>
                      )}
                      {task.assigned_to && (
                        <span className="flex items-center gap-1 text-slate-500 font-medium">
                          <UserCheck className="w-3.5 h-3.5" />
                          {task.assigned_to}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  {getPriorityBadge(task.priority)}

                  {!isCompleted && can('tasks.manage') && (
                    <button
                      onClick={() => updateStatusMutation.mutate({
                        id: task.id,
                        status: isInProgress ? 'open' : 'in_progress',
                      })}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        isInProgress ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {isInProgress ? (locale === 'ar' ? 'قيد التنفيذ' : 'In Progress') : (locale === 'ar' ? 'بدء التنفيذ' : 'Start')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إضافة مهمة إدارية جديدة' : 'Create New Task'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'عنوان المهمة والتكليف' : 'Task Title'}</label>
                <input
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder={locale === 'ar' ? 'اكتب نص المهمة المطلوبة...' : 'Enter task description...'}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الأولوية' : 'Priority'}</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value as Task['priority'] })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="low">{locale === 'ar' ? 'منخفضة' : 'Low'}</option>
                    <option value="normal">{locale === 'ar' ? 'متوسطة' : 'Normal'}</option>
                    <option value="high">{locale === 'ar' ? 'عالية' : 'High'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'تاريخ الاستحقاق النهائي' : 'Due Date'}</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" isLoading={createMutation.isPending}>
                  {locale === 'ar' ? 'حفظ المهمة' : 'Save Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
