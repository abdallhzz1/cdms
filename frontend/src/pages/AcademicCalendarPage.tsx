import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Plus, Clock, CheckCircle2, Trash2 } from 'lucide-react';

interface CalendarEvent {
  id: number;
  title: string;
  category: string;
  start_date: string;
  end_date: string;
  semester: string;
  notes?: string;
}

const getCategoryBadge = (category: string) => {
  switch (category) {
    case 'SEMESTER_START':
      return <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold">بداية الفصل</span>;
    case 'ROTATION':
      return <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">تدوير سريري</span>;
    case 'EXAM':
      return <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">امتحانات وتقييم</span>;
    case 'HOLIDAY':
      return <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">عطلة رسمية</span>;
    default:
      return <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">حدث عام</span>;
  }
};

export function AcademicCalendarPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canManage = can('academic_years.manage');

  const [selectedSemester, setSelectedSemester] = useState('FIRST');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [eventForm, setEventForm] = useState({
    title: '',
    category: 'ROTATION',
    start_date: '',
    end_date: '',
    semester: 'FIRST',
    notes: '',
  });

  // Fetch from DB
  const { data: eventsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['academic-calendar-events'],
    queryFn: () => apiFetch<any>('/academic-calendar-events?per_page=200'),
  });

  const events: CalendarEvent[] = useMemo(() => {
    const raw = Array.isArray(eventsData) ? eventsData : eventsData?.data || eventsData?.items || [];
    return raw as CalendarEvent[];
  }, [eventsData]);

  const filteredEvents = useMemo(() =>
    events.filter((e) => e.semester === selectedSemester),
    [events, selectedSemester]
  );

  // Add event mutation
  const addMutation = useMutation({
    mutationFn: (data: typeof eventForm) => apiFetch('/academic-calendar-events', { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic-calendar-events'] });
      setIsModalOpen(false);
      setEventForm({ title: '', category: 'ROTATION', start_date: '', end_date: '', semester: selectedSemester, notes: '' });
      setSuccessMessage('تم إضافة الفعالية إلى التقويم الأكاديمي بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/academic-calendar-events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academic-calendar-events'] });
      setSuccessMessage('تم حذف الفعالية من التقويم الأكاديمي.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const handleAddEvent = (e: React.FormEvent) => {
    e.preventDefault();
    addMutation.mutate({ ...eventForm, semester: selectedSemester });
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="شاشة التقويم الأكاديمي والسريري"
          description="جدول الفعاليات الأكاديمية، مواعيد التدوير السريري، والامتحانات الرسمية لجامعة الخليل."
        />
        {canManage && (
          <Button
            onClick={() => setIsModalOpen(true)}
            className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
          >
            <Plus className="w-4 h-4" />
            إضافة حدث أكاديمي جديد
          </Button>
        )}
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Semester Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        {(['FIRST', 'SECOND', 'SUMMER'] as const).map((sem) => (
          <button
            key={sem}
            onClick={() => setSelectedSemester(sem)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedSemester === sem ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {sem === 'FIRST' ? 'الفصل الدراسي الأول 2026/2027' : sem === 'SECOND' ? 'الفصل الدراسي الثاني 2026/2027' : 'الفصل الصيفي السريري'}
          </button>
        ))}
      </div>

      {/* Events */}
      <div className="space-y-4">
        {filteredEvents.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 text-xs">لا توجد أحداث مسجلة لهذا الفصل حتى الآن.</Card>
        ) : (
          filteredEvents.map((evt) => (
            <Card key={evt.id} className="p-5 border-slate-100 shadow-xs hover:border-slate-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {getCategoryBadge(evt.category)}
                  <h3 className="font-bold text-slate-900 text-sm">{evt.title}</h3>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    من {evt.start_date} إلى {evt.end_date}
                  </span>
                </div>
                {evt.notes && <p className="text-xs text-slate-600">{evt.notes}</p>}
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(evt.id)}
                  disabled={deleteMutation.isPending}
                  className="text-red-500 hover:bg-red-50 hover:text-red-700 self-start sm:self-center"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Add Event Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="إضافة حدث أكاديمي/سريري جديد">
        <form onSubmit={handleAddEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الفعالية / الحدث</label>
            <input
              type="text"
              required
              placeholder="مثال: التدوير السريري الثاني (Rotation B)"
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع الفعالية</label>
              <select
                value={eventForm.category}
                onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-white"
              >
                <option value="SEMESTER_START">بداية الفصل</option>
                <option value="ROTATION">تدوير سريري</option>
                <option value="EXAM">امتحانات وتقييم</option>
                <option value="HOLIDAY">عطلة رسمية</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الفصل الدراسي</label>
              <select
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-white"
              >
                <option value="FIRST">الفصل الأول</option>
                <option value="SECOND">الفصل الثاني</option>
                <option value="SUMMER">الصيفي</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ البداية</label>
              <input type="date" required value={eventForm.start_date}
                onChange={(e) => setEventForm({ ...eventForm, start_date: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ النهاية</label>
              <input type="date" required value={eventForm.end_date}
                onChange={(e) => setEventForm({ ...eventForm, end_date: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات والتفاصيل</label>
            <textarea rows={3} placeholder="تفاصيل إضافية..."
              value={eventForm.notes}
              onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium resize-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
            <Button type="submit" disabled={addMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs">
              {addMutation.isPending ? 'جارٍ الحفظ...' : 'إضافة للتقويم'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
