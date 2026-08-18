import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { 
  Calendar, MapPin, User, CheckCircle2, 
  ArrowRight, Plus, Clock, AlertCircle, Sparkles, CheckSquare
} from 'lucide-react';

interface Item {
  id: number;
  item_type: 'decision' | 'recommendation' | 'task';
  description: string;
  responsible?: string | null;
  executing_entity?: string | null;
  priority: string;
  due_date?: string | null;
  notes?: string | null;
}

interface Meeting {
  id: number;
  minutes_number: string;
  meeting_type: string;
  meeting_date: string;
  meeting_time?: string | null;
  location?: string | null;
  chairperson?: string | null;
  agenda?: string | null;
  discussion_summary?: string | null;
  decisions_summary?: string | null;
  implementation_owner?: string | null;
  action_items: Item[];
}

export function MeetingDetailsPage() {
  const { id, meetingId: paramMeetingId } = useParams<{ id?: string; meetingId?: string }>();
  const meetingId = id || paramMeetingId;
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    item_type: 'task' as Item['item_type'],
    description: '',
    responsible: '',
    executing_entity: '',
    priority: 'normal',
    due_date: '',
    notes: '',
  });

  const { data: meeting, isLoading, isError, refetch } = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => apiFetch<Meeting>(`/meetings/${meetingId}`),
    enabled: Boolean(meetingId),
  });

  const addActionMutation = useMutation({
    mutationFn: (body: any) => apiFetch(`/meetings/${meetingId}/actions`, { method: 'POST', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['meeting', meetingId] });
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      setIsModalOpen(false);
      setFormData({
        item_type: 'task',
        description: '',
        responsible: '',
        executing_entity: '',
        priority: 'normal',
        due_date: '',
        notes: '',
      });
    },
  });

  if (!can('meetings.manage')) {
    return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  }

  if (isLoading) return <LoadingState />;
  if (isError || !meeting) return <ErrorState onRetry={() => refetch()} />;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    addActionMutation.mutate({
      ...formData,
      responsible: formData.responsible || null,
      executing_entity: formData.executing_entity || null,
      due_date: formData.due_date || null,
      notes: formData.notes || null,
    });
  };

  const actionItems = meeting.action_items || [];
  const decisions = actionItems.filter(i => i.item_type === 'decision');
  const tasks = actionItems.filter(i => i.item_type === 'task');
  const recommendations = actionItems.filter(i => i.item_type === 'recommendation');

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-red-100 text-red-700">{locale === 'ar' ? 'عالية' : 'High'}</span>;
      case 'normal': return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-700">{locale === 'ar' ? 'متوسطة' : 'Normal'}</span>;
      case 'low': return <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">{locale === 'ar' ? 'منخفضة' : 'Low'}</span>;
      default: return null;
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link to="/meetings" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            <span>{locale === 'ar' ? 'العودة لقائمة الاجتماعات' : 'Back to Meetings'}</span>
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>{meeting.minutes_number}</span>
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-100">
              {meeting.meeting_type}
            </span>
          </h1>
        </div>

        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          {locale === 'ar' ? 'إضافة قرار / تكليف مهمة' : 'Add Decision / Task'}
        </Button>
      </div>

      {/* Meeting Overview Info Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b border-slate-100 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-bold">{locale === 'ar' ? 'تاريخ الاجتماع' : 'Date'}</div>
              <div className="font-bold text-slate-800">{meeting.meeting_date} {meeting.meeting_time ? `(${meeting.meeting_time})` : ''}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-bold">{locale === 'ar' ? 'المكان' : 'Location'}</div>
              <div className="font-bold text-slate-800">{meeting.location || '—'}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-bold">{locale === 'ar' ? 'رئيس الجلسة' : 'Chairperson'}</div>
              <div className="font-bold text-slate-800">{meeting.chairperson || '—'}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-bold">{locale === 'ar' ? 'مجموع القرارات والتكليفات' : 'Action Items'}</div>
              <div className="font-bold text-slate-800">{actionItems.length}</div>
            </div>
          </div>
        </div>

        {/* Agenda & Summaries */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {meeting.agenda && (
            <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{locale === 'ar' ? 'جدول الأعمال (Agenda)' : 'Agenda'}</h3>
              <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{meeting.agenda}</p>
            </div>
          )}

          {meeting.discussion_summary && (
            <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">{locale === 'ar' ? 'ملخص النقاش والمداولات' : 'Discussion Summary'}</h3>
              <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{meeting.discussion_summary}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Items Sections */}
      <div className="space-y-6">
        <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <span>{locale === 'ar' ? 'مخرجات المحضر والقرارات والتكليفات' : 'Decisions, Recommendations & Action Items'}</span>
        </h2>

        {!actionItems.length ? (
          <EmptyState message={locale === 'ar' ? 'لم يتم تسجيل قرارات أو مهام لهذا الاجتماع بعد' : 'No action items recorded for this meeting'} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Decisions */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{locale === 'ar' ? 'القرارات المعتمدة' : 'Decisions'}</span>
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg">{decisions.length}</span>
              </div>
              <div className="space-y-3">
                {decisions.map(item => (
                  <div key={item.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{item.description}</p>
                    {item.responsible && (
                      <div className="text-xs text-slate-500 font-medium">{locale === 'ar' ? 'المسؤول:' : 'Responsible:'} {item.responsible}</div>
                    )}
                  </div>
                ))}
                {!decisions.length && <p className="text-xs text-slate-400 text-center py-4">{locale === 'ar' ? 'لا توجد قرارات' : 'No decisions'}</p>}
              </div>
            </div>

            {/* 2. Tasks & Action Items */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                  <span>{locale === 'ar' ? 'المهام والتكليفات المباشرة' : 'Action Tasks'}</span>
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg">{tasks.length}</span>
              </div>
              <div className="space-y-3">
                {tasks.map(item => (
                  <div key={item.id} className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {getPriorityBadge(item.priority)}
                      {item.due_date && (
                        <span className="text-xs text-indigo-600 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.due_date}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-900 leading-snug">{item.description}</p>
                    {item.responsible && (
                      <div className="text-xs text-slate-600 font-semibold">{locale === 'ar' ? 'المكلف بالتنفيذ:' : 'Assigned to:'} {item.responsible}</div>
                    )}
                  </div>
                ))}
                {!tasks.length && <p className="text-xs text-slate-400 text-center py-4">{locale === 'ar' ? 'لا توجد مهام' : 'No tasks'}</p>}
              </div>
            </div>

            {/* 3. Recommendations */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>{locale === 'ar' ? 'التوصيات والملاحظات' : 'Recommendations'}</span>
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded-lg">{recommendations.length}</span>
              </div>
              <div className="space-y-3">
                {recommendations.map(item => (
                  <div key={item.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{item.description}</p>
                    {item.notes && <p className="text-xs text-slate-500">{item.notes}</p>}
                  </div>
                ))}
                {!recommendations.length && <p className="text-xs text-slate-400 text-center py-4">{locale === 'ar' ? 'لا توجد توصيات' : 'No recommendations'}</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal to add action item / task */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إضافة مخرج من محضر الجلسة' : 'New Action / Decision Item'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'نوع البند' : 'Item Type'}</label>
                <select
                  value={formData.item_type}
                  onChange={e => setFormData({ ...formData, item_type: e.target.value as Item['item_type'] })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="task">{locale === 'ar' ? 'مهمة وتكليف تنفيذي (Task)' : 'Task'}</option>
                  <option value="decision">{locale === 'ar' ? 'قرار معتمد (Decision)' : 'Decision'}</option>
                  <option value="recommendation">{locale === 'ar' ? 'توصية (Recommendation)' : 'Recommendation'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'نص القرار أو المهمة' : 'Description'}</label>
                <textarea
                  required
                  rows={3}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-1 focus:ring-indigo-500"
                  placeholder={locale === 'ar' ? 'اكتب تفاصيل القرار أو المهمة المطلوبة...' : 'Enter details...'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'المسؤول عن التنفيذ' : 'Responsible Person'}</label>
                  <input
                    value={formData.responsible}
                    onChange={e => setFormData({ ...formData, responsible: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                    placeholder={locale === 'ar' ? 'اسم المكلف...' : 'Person name...'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الأولوية' : 'Priority'}</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="low">{locale === 'ar' ? 'منخفضة' : 'Low'}</option>
                    <option value="normal">{locale === 'ar' ? 'متوسطة' : 'Normal'}</option>
                    <option value="high">{locale === 'ar' ? 'عالية' : 'High'}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الموعد النهائي' : 'Due Date'}</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'الجهة المنفذة' : 'Executing Entity'}</label>
                  <input
                    value={formData.executing_entity}
                    onChange={e => setFormData({ ...formData, executing_entity: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                    placeholder={locale === 'ar' ? 'مثال: قسم الباطني' : 'e.g. Internal Medicine'}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" isLoading={addActionMutation.isPending}>
                  {locale === 'ar' ? 'حفظ وتكليف' : 'Save & Assign'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
