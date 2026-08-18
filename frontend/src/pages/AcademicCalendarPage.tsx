import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Plus, AlertCircle, Clock } from 'lucide-react';

interface CalendarEvent {
  id: number;
  name: string;
  event_type: string;
  start_date: string;
  end_date: string;
  affected_levels?: string | null;
  suspends_clinical_training: boolean;
}

export function AcademicCalendarPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    event_type: 'exam',
    start_date: '',
    end_date: '',
    affected_levels: '',
    suspends_clinical_training: false,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['academic-calendar'],
    queryFn: () => apiFetch<any>('/academic-calendar-events?per_page=50'),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/academic-calendar-events', { method: 'POST', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['academic-calendar'] });
      setIsModalOpen(false);
      setFormData({
        name: '',
        event_type: 'exam',
        start_date: '',
        end_date: '',
        affected_levels: '',
        suspends_clinical_training: false,
      });
    },
  });

  if (!can('academic_years.view')) {
    return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  }

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const events: CalendarEvent[] = Array.isArray(data) ? data : data?.items || [];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      affected_levels: formData.affected_levels || null,
    });
  };

  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case 'exam':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-700">{locale === 'ar' ? 'امتحانات' : 'Exams'}</span>;
      case 'holiday':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-700">{locale === 'ar' ? 'عطلة رسمية' : 'Holiday'}</span>;
      case 'clinical':
        return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-100 text-indigo-700">{locale === 'ar' ? 'تدريب سريري' : 'Clinical'}</span>;
      default:
        return <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700">{type}</span>;
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title={locale === 'ar' ? 'التقويم الأكاديمي' : 'Academic Calendar'}
          description={locale === 'ar' ? 'متابعة الفصول والامتحانات والعطل الرسمية ومواعيد التدريب' : 'Track semesters, exam periods, official holidays, and clinical schedules'}
        />

        {can('academic_years.manage') && (
          <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            {locale === 'ar' ? 'إضافة حدث' : 'Add Event'}
          </Button>
        )}
      </div>

      {!events.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد أحداث مجدولة في التقويم' : 'No calendar events scheduled'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  {getEventTypeBadge(event.event_type)}
                  {event.suspends_clinical_training && (
                    <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-50 text-red-600 border border-red-100">
                      <AlertCircle className="w-3 h-3" />
                      {locale === 'ar' ? 'يوقف التدريب السريري' : 'Suspends Clinical Training'}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-2">{event.name}</h3>

                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-3">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{event.start_date}</span>
                  <span className="text-slate-300">←</span>
                  <span>{event.end_date}</span>
                </div>
              </div>

              {event.affected_levels && (
                <div className="pt-3 border-t border-slate-50 text-xs font-medium text-slate-500 flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">{locale === 'ar' ? 'المستويات المتأثرة:' : 'Levels:'}</span>
                  <span>{event.affected_levels}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 shrink-0 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'إضافة حدث أكاديمي جديد' : 'New Calendar Event'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'اسم الحدث' : 'Event Name'}</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  placeholder={locale === 'ar' ? 'مثال: بداية امتحانات نصف الفصل' : 'e.g. Midterm Exams'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'نوع الحدث' : 'Event Type'}</label>
                  <select
                    value={formData.event_type}
                    onChange={e => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="exam">{locale === 'ar' ? 'امتحانات' : 'Exam'}</option>
                    <option value="holiday">{locale === 'ar' ? 'عطلة رسمية' : 'Holiday'}</option>
                    <option value="clinical">{locale === 'ar' ? 'تدريب سريري' : 'Clinical'}</option>
                    <option value="other">{locale === 'ar' ? 'أخرى' : 'Other'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'المستويات المستهدفة' : 'Levels'}</label>
                  <input
                    value={formData.affected_levels}
                    onChange={e => setFormData({ ...formData, affected_levels: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                    placeholder="4, 5, 6"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'تاريخ البدء' : 'Start Date'}</label>
                  <input
                    required
                    type="date"
                    value={formData.start_date}
                    onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</label>
                  <input
                    required
                    type="date"
                    value={formData.end_date}
                    onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={formData.suspends_clinical_training}
                  onChange={e => setFormData({ ...formData, suspends_clinical_training: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-slate-700">
                  {locale === 'ar' ? 'يوقف التدريب السريري خلال هذه الفترة' : 'Suspends Clinical Training'}
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" isLoading={createMutation.isPending}>
                  {locale === 'ar' ? 'حفظ الحدث' : 'Save Event'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
