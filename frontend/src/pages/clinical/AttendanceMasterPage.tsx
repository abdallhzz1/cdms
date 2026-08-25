import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

const STATUS_CONFIG: Record<string, { icon: any; label_ar: string; label_en: string; bg: string; text: string }> = {
  present: { icon: CheckCircle, label_ar: 'حاضر', label_en: 'Present', bg: 'bg-teal-50', text: 'text-teal-700' },
  absent: { icon: XCircle, label_ar: 'غائب', label_en: 'Absent', bg: 'bg-teal-50', text: 'text-teal-700' },
  late: { icon: Clock, label_ar: 'متأخر', label_en: 'Late', bg: 'bg-teal-50', text: 'text-teal-700' },
  excused: { icon: AlertCircle, label_ar: 'مبرر', label_en: 'Excused', bg: 'bg-teal-50', text: 'text-teal-700' },
};

export function AttendanceMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const [sessionFilter, setSessionFilter] = useState('');

  const { data: records, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance-records', sessionFilter],
    queryFn: () => apiFetch<any>(
      `/attendance-records?per_page=50${sessionFilter ? `&clinical_session_id=${sessionFilter}` : ''}`
    ),
  });

  const { data: sessions } = useQuery({
    queryKey: ['clinical-sessions-filter'],
    queryFn: () => apiFetch<any>('/clinical-sessions?per_page=100'),
  });

  if (!can('attendance.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const items = Array.isArray(records) ? records : records?.items || [];
  const sessionsList = Array.isArray(sessions) ? sessions : sessions?.items || [];

  const stats = {
    present: items.filter((r: any) => r.status === 'present').length,
    absent: items.filter((r: any) => r.status === 'absent').length,
    late: items.filter((r: any) => r.status === 'late').length,
    excused: items.filter((r: any) => r.status === 'excused').length,
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader
        title={locale === 'ar' ? 'سجل الحضور والغياب' : 'Attendance Records'}
        description={locale === 'ar' ? 'متابعة حضور وغياب الطلاب في جلسات التدريب السريري' : 'Track student attendance in clinical training sessions'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(stats).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          const Icon = cfg.icon;
          return (
            <div key={status} className={`${cfg.bg} rounded-3xl p-5 flex items-center gap-4`}>
              <Icon className={`w-6 h-6 ${cfg.text} shrink-0`} />
              <div>
                <div className={`text-2xl font-black ${cfg.text}`}>{count}</div>
                <div className={`text-xs font-semibold ${cfg.text} opacity-80`}>
                  {locale === 'ar' ? cfg.label_ar : cfg.label_en}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={sessionFilter}
          onChange={e => setSessionFilter(e.target.value)}
          className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-1 focus:ring-teal-500 bg-white"
        >
          <option value="">{locale === 'ar' ? 'كل الجلسات' : 'All Sessions'}</option>
          {sessionsList.map((s: any) => (
            <option key={s.id} value={s.id}>{s.session_date} — {s.title}</option>
          ))}
        </select>
      </div>

      {!items.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد سجلات حضور' : 'No attendance records found'} />
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الطالب' : 'Student'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الجلسة' : 'Session'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المستشفى' : 'Site'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'ملاحظة' : 'Note'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((r: any, i: number) => {
                  const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.present;
                  const Icon = cfg.icon;
                  return (
                    <tr key={r.id ?? i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900">{locale === 'ar' ? r.student?.full_name_ar : r.student?.full_name_en || r.student?.full_name_ar}</div>
                        <div className="text-xs text-slate-500">{r.student?.university_number}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{r.session?.title}<div className="text-xs text-slate-400">{r.session?.session_date}</div></td>
                      <td className="px-6 py-4 text-sm text-slate-600">{locale === 'ar' ? r.session?.training_site?.name_ar : r.session?.training_site?.name_en || r.session?.training_site?.name_ar}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {locale === 'ar' ? cfg.label_ar : cfg.label_en}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">{r.excuse_note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
