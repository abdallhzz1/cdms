import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { CheckCircle, XCircle, Clock, AlertCircle, Mail, Send, ShieldAlert } from 'lucide-react';

type AttendanceWarning = {
  student: { id: number; university_number: string; full_name_ar: string; full_name_en?: string | null; email: string };
  rotation_id: number;
  course: { id: number; code: string; name_ar: string; name_en?: string | null; credit_hours: number };
  academic_year?: { id: number; name: string } | null;
  total_required_days: number;
  recorded_days: number;
  present_days: number;
  absent_days: number;
  late_days: number;
  excused_days: number;
  absence_percentage: number;
  current_threshold: 10 | 20;
  last_sent: Record<'10' | '20', { id: number; sent_at: string } | null>;
};

const STATUS_CONFIG: Record<string, { icon: any; label_ar: string; label_en: string; bg: string; text: string }> = {
  present: { icon: CheckCircle, label_ar: 'حاضر', label_en: 'Present', bg: 'bg-teal-50', text: 'text-teal-700' },
  absent: { icon: XCircle, label_ar: 'غائب', label_en: 'Absent', bg: 'bg-teal-50', text: 'text-teal-700' },
  late: { icon: Clock, label_ar: 'متأخر', label_en: 'Late', bg: 'bg-teal-50', text: 'text-teal-700' },
  excused: { icon: AlertCircle, label_ar: 'مبرر', label_en: 'Excused', bg: 'bg-teal-50', text: 'text-teal-700' },
};

export function AttendanceMasterPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();
  const [sessionFilter, setSessionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: records, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance-records', sessionFilter, statusFilter, dateFilter],
    queryFn: () => apiFetch<any>(
      `/attendance-records?per_page=100${sessionFilter ? `&clinical_session_id=${sessionFilter}` : ''}${statusFilter?`&status=${statusFilter}`:''}${dateFilter?`&date=${dateFilter}`:''}`
    ),
  });

  const { data: sessions } = useQuery({
    queryKey: ['clinical-sessions-filter'],
    queryFn: () => apiFetch<any>('/clinical-sessions?per_page=100'),
  });

  const { data: warnings = [], isLoading: warningsLoading, isError: warningsError, refetch: refetchWarnings } = useQuery({
    queryKey: ['attendance-warnings'],
    queryFn: () => apiFetch<AttendanceWarning[]>('/attendance-warnings'),
    enabled: can('attendance.view'),
  });

  const sendWarning = useMutation({
    mutationFn: (payload: { student_id: number; rotation_id: number; threshold_percent: 10 | 20; resend?: boolean }) =>
      apiFetch('/attendance-warnings/send', { method: 'POST', body: payload }),
    onSuccess: () => {
      setNotice({
        type: 'success',
        text: locale === 'ar' ? 'تم إرسال الإنذار إلى البريد الجامعي وتوثيقه بنجاح.' : 'The warning was emailed and logged successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['attendance-warnings'] });
    },
    onError: (error) => setNotice({
      type: 'error',
      text: error instanceof ApiError ? error.message : (locale === 'ar' ? 'تعذر إرسال الإنذار.' : 'Could not send the warning.'),
    }),
  });

  const handleSend = (warning: AttendanceWarning) => {
    const lastSent = warning.last_sent[String(warning.current_threshold) as '10' | '20'];
    if (lastSent && !window.confirm(locale === 'ar' ? 'سبق إرسال هذا المستوى من الإنذار. هل تريد إعادة إرساله؟' : 'This warning level was already sent. Send it again?')) return;

    setNotice(null);
    sendWarning.mutate({
      student_id: warning.student.id,
      rotation_id: warning.rotation_id,
      threshold_percent: warning.current_threshold,
      resend: Boolean(lastSent),
    });
  };

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

      <section className="overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-teal-100 bg-teal-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-white p-2.5 text-teal-700 shadow-sm"><ShieldAlert className="h-5 w-5" /></span>
            <div>
              <h2 className="font-black text-slate-900">{locale === 'ar' ? 'تنبيهات تجاوز الغياب' : 'Absence threshold alerts'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {locale === 'ar'
                  ? 'يحتسب النظام أيام الغياب الفعلية لكل مساق من إجمالي الساعات المعتمدة × 5 أيام. الغياب بعذر والتأخير لا يدخلان في نسبة الإنذار.'
                  : 'Actual absence days are compared with course credit hours × 5 days. Excused absences and lateness are shown but excluded from the alert percentage.'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2 text-xs font-bold">
            <span className="rounded-full bg-white px-3 py-1.5 text-teal-700">{locale === 'ar' ? `تنبيه أولي: ${warnings.filter(w => w.current_threshold === 10).length}` : `Initial: ${warnings.filter(w => w.current_threshold === 10).length}`}</span>
            <span className="rounded-full bg-teal-700 px-3 py-1.5 text-white">{locale === 'ar' ? `إنذار عاجل: ${warnings.filter(w => w.current_threshold === 20).length}` : `Urgent: ${warnings.filter(w => w.current_threshold === 20).length}`}</span>
          </div>
        </div>

        {notice && (
          <div className={`mx-5 mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${notice.type === 'success' ? 'bg-teal-50 text-teal-800' : 'bg-red-50 text-red-700'}`}>
            {notice.text}
          </div>
        )}

        {warningsLoading ? (
          <div className="p-6 text-center text-sm text-slate-500">{locale === 'ar' ? 'جاري احتساب نسب الغياب...' : 'Calculating absence rates...'}</div>
        ) : warningsError ? (
          <div className="p-6 text-center">
            <p className="text-sm text-red-600">{locale === 'ar' ? 'تعذر تحميل تنبيهات الغياب.' : 'Could not load absence alerts.'}</p>
            <button type="button" onClick={() => refetchWarnings()} className="mt-3 rounded-xl border border-teal-200 px-4 py-2 text-xs font-bold text-teal-700">{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>
          </div>
        ) : warnings.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-7 text-sm font-semibold text-teal-700"><CheckCircle className="h-5 w-5" />{locale === 'ar' ? 'لا يوجد طلبة تجاوزوا حدود الغياب حالياً.' : 'No students currently exceed an absence threshold.'}</div>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {warnings.map((warning) => {
              const isUrgent = warning.current_threshold === 20;
              const lastSent = warning.last_sent[String(warning.current_threshold) as '10' | '20'];
              return (
                <article key={`${warning.student.id}-${warning.rotation_id}`} className="rounded-2xl border border-slate-200 p-4 transition hover:border-teal-200">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${isUrgent ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-700'}`}>
                          {locale === 'ar' ? (isUrgent ? 'تجاوز 20% — عاجل' : 'تجاوز 10%') : (isUrgent ? 'Over 20% — urgent' : 'Over 10%')}
                        </span>
                        {lastSent && <span className="text-[11px] font-semibold text-slate-400">{locale === 'ar' ? `أرسل ${new Date(lastSent.sent_at).toLocaleDateString('ar-PS')}` : `Sent ${new Date(lastSent.sent_at).toLocaleDateString('en-GB')}`}</span>}
                      </div>
                      <h3 className="mt-3 truncate text-sm font-black text-slate-900">{locale === 'ar' ? warning.student.full_name_ar : warning.student.full_name_en || warning.student.full_name_ar}</h3>
                      <p className="mt-1 text-xs text-slate-500">{warning.student.university_number} · {warning.student.email}</p>
                      <p className="mt-2 text-xs font-bold text-slate-700">{locale === 'ar' ? warning.course.name_ar : warning.course.name_en || warning.course.name_ar} <span className="font-normal text-slate-400">({warning.course.code})</span></p>
                    </div>
                    <div className="shrink-0 text-start sm:text-center">
                      <div className="text-2xl font-black text-teal-700">{Number(warning.absence_percentage).toFixed(1)}%</div>
                      <div className="text-[11px] text-slate-500">{locale === 'ar' ? `${warning.absent_days} غياب / ${warning.total_required_days} يوم` : `${warning.absent_days} absent / ${warning.total_required_days} days`}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div className="rounded-xl bg-teal-50 px-2 py-2 text-teal-700">{locale === 'ar' ? 'تأخير' : 'Late'} <b>{warning.late_days}</b></div>
                    <div className="rounded-xl bg-teal-50 px-2 py-2 text-teal-700">{locale === 'ar' ? 'بعذر' : 'Excused'} <b>{warning.excused_days}</b></div>
                    <div className="rounded-xl bg-teal-50 px-2 py-2 text-teal-700">{locale === 'ar' ? 'مرصود' : 'Recorded'} <b>{warning.recorded_days}</b></div>
                  </div>
                  {can('attendance.notify') ? (
                    <button
                      type="button"
                      disabled={sendWarning.isPending}
                      onClick={() => handleSend(warning)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {lastSent ? <Mail className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      {locale === 'ar' ? (lastSent ? 'إعادة إرسال الإنذار' : 'إرسال الإنذار للطالب') : (lastSent ? 'Resend warning' : 'Email student warning')}
                    </button>
                  ) : (
                    <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500">{locale === 'ar' ? 'عرض فقط — يلزم منح صلاحية إرسال إنذارات الغياب.' : 'View only — absence notification permission is required.'}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

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
      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
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
        <select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="input"><option value="">{locale==='ar'?'كل الحالات':'All statuses'}</option>{Object.entries(STATUS_CONFIG).map(([value,cfg])=><option key={value} value={value}>{locale==='ar'?cfg.label_ar:cfg.label_en}</option>)}</select>
        <input type="date" value={dateFilter} onChange={event=>setDateFilter(event.target.value)} className="input"/>
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
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'المساق' : 'Course'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                  <th className="px-6 py-4 font-semibold">{locale === 'ar' ? 'سجله' : 'Recorded by'}</th>
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
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">{locale==='ar'?r.session?.rotation_block?.rotation?.course?.name_ar:r.session?.rotation_block?.rotation?.course?.name_en||r.session?.rotation_block?.rotation?.course?.name_ar||'—'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${cfg.bg} ${cfg.text}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {locale === 'ar' ? cfg.label_ar : cfg.label_en}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">{r.recorder?.name||'—'}</td>
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
