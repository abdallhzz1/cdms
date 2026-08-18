import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Calendar, Plus, CheckSquare, ChevronRight } from 'lucide-react';

interface Meeting {
  id: number;
  minutes_number: string;
  meeting_type: string;
  meeting_date: string;
  location?: string | null;
  chairperson?: string | null;
  action_items_count: number;
}

export function MeetingsPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    minutes_number: '',
    meeting_type: 'مجلس الدائرة السريرية',
    meeting_date: '',
    location: '',
    chairperson: '',
    agenda: '',
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['meetings'],
    queryFn: () => apiFetch<any>('/meetings?per_page=50'),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/meetings', { method: 'POST', body }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['meetings'] });
      setIsModalOpen(false);
      setFormData({
        minutes_number: '',
        meeting_type: 'مجلس الدائرة السريرية',
        meeting_date: '',
        location: '',
        chairperson: '',
        agenda: '',
      });
    },
  });

  if (!can('meetings.manage')) {
    return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  }

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const meetings: Meeting[] = Array.isArray(data) ? data : data?.items || [];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      location: formData.location || null,
      chairperson: formData.chairperson || null,
      agenda: formData.agenda || null,
    });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title={locale === 'ar' ? 'الاجتماعات ومحاضر الجلسات' : 'Meetings & Minutes'}
          description={locale === 'ar' ? 'توثيق اجتماعات الدائرة السريرية ومتابعة القرارات والتكليفات الصادرة' : 'Record clinical department meetings, minutes, and track resulting decisions'}
        />

        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          {locale === 'ar' ? 'تسجيل اجتماع جديد' : 'New Meeting'}
        </Button>
      </div>

      {!meetings.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد اجتماعات مسجلة' : 'No meetings found'} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{locale === 'ar' ? 'رقم المحضر' : 'Minutes #'}</TableHead>
                <TableHead>{locale === 'ar' ? 'نوع الاجتماع' : 'Meeting Type'}</TableHead>
                <TableHead>{locale === 'ar' ? 'تاريخ الاجتماع' : 'Date'}</TableHead>
                <TableHead>{locale === 'ar' ? 'المكان ورئيس الجلسة' : 'Location & Chair'}</TableHead>
                <TableHead className="text-center">{locale === 'ar' ? 'القرارات والمهام' : 'Action Items'}</TableHead>
                <TableHead className="text-end">{locale === 'ar' ? 'التفاصيل' : 'Details'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((m) => (
                <TableRow key={m.id} className="hover:bg-slate-50 transition-colors">
                  <TableCell>
                    <Link to={`/meetings/${m.id}`} className="font-bold text-indigo-600 hover:underline flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0"></span>
                      <span>{m.minutes_number}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-800">{m.meeting_type}</TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {m.meeting_date}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">
                    <div>{m.location || '—'}</div>
                    {m.chairperson && <div className="text-slate-400 font-medium mt-0.5">{m.chairperson}</div>}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700">
                      <CheckSquare className="w-3 h-3" />
                      {m.action_items_count ?? 0}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <Link
                      to={`/meetings/${m.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50/50 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      <span>{locale === 'ar' ? 'عرض المحضر' : 'View Minutes'}</span>
                      <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-lg text-slate-800">{locale === 'ar' ? 'تسجيل محضر اجتماع جديد' : 'New Meeting Minutes'}</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'رقم المحضر المرجعي' : 'Minutes Reference Number'}</label>
                <input
                  required
                  value={formData.minutes_number}
                  onChange={e => setFormData({ ...formData, minutes_number: e.target.value })}
                  placeholder={locale === 'ar' ? 'مثال: MTG-2026-08' : 'e.g. MTG-2026-08'}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'نوع الاجتماع' : 'Meeting Type'}</label>
                  <input
                    required
                    value={formData.meeting_type}
                    onChange={e => setFormData({ ...formData, meeting_type: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'تاريخ الاجتماع' : 'Date'}</label>
                  <input
                    required
                    type="date"
                    value={formData.meeting_date}
                    onChange={e => setFormData({ ...formData, meeting_date: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'مكان الاجتماع' : 'Location'}</label>
                  <input
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                    placeholder={locale === 'ar' ? 'قاعة مجلس الكلية' : 'Dean Meeting Room'}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'رئيس الجلسة' : 'Chairperson'}</label>
                  <input
                    value={formData.chairperson}
                    onChange={e => setFormData({ ...formData, chairperson: e.target.value })}
                    placeholder={locale === 'ar' ? 'د. مدير الدائرة' : 'Dr. Director'}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{locale === 'ar' ? 'جدول الأعمال (Agenda)' : 'Agenda'}</label>
                <textarea
                  rows={3}
                  value={formData.agenda}
                  onChange={e => setFormData({ ...formData, agenda: e.target.value })}
                  placeholder={locale === 'ar' ? 'بنود جدول الأعمال...' : 'Meeting agenda items...'}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" isLoading={createMutation.isPending}>
                  {locale === 'ar' ? 'حفظ الاجتماع' : 'Save Meeting'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
