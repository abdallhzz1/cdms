import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, GraduationCap, UserRound } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

type RecordDetails = {
  id: number; meeting_number?: string | null; meeting_date: string; category: string; notes: string;
  action_plan?: string | null; status: 'open' | 'closed'; follow_up_status?: string | null;
  student?: { university_number: string; full_name_ar: string; full_name_en?: string | null; academic_level?: string };
  advisor?: { full_name_ar: string; full_name_en?: string | null } | null;
  participants?: Array<{ id: number; attendance_status?: string | null; required_action?: string | null; student?: { full_name_ar: string; full_name_en?: string | null } }>;
};

export function AdvisingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const ar = locale === 'ar';
  const recordQuery = useQuery({ queryKey: ['advising-record', id], queryFn: () => apiFetch<RecordDetails>(`/advising-records/${id}`), enabled: Boolean(id) });
  const statusMutation = useMutation({
    mutationFn: (status: 'open' | 'closed') => apiFetch(`/advising-records/${id}`, { method: 'PUT', body: { status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['advising-record', id] });
      await queryClient.invalidateQueries({ queryKey: ['advising-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['advising-records'] });
    },
  });

  if (recordQuery.isLoading) return <LoadingState />;
  if (recordQuery.isError || !recordQuery.data) return <ErrorState onRetry={() => recordQuery.refetch()} />;
  const record = recordQuery.data;
  const studentName = ar ? record.student?.full_name_ar : record.student?.full_name_en || record.student?.full_name_ar;
  const advisorName = record.advisor ? (ar ? record.advisor.full_name_ar : record.advisor.full_name_en || record.advisor.full_name_ar) : '—';

  return <div className="mx-auto max-w-5xl space-y-4 pb-14">
    <div className="flex items-center justify-between"><Link to="/advising/logs" className="flex items-center gap-2 text-[10px] font-bold text-slate-500 hover:text-teal-700"><ArrowLeft className="h-4 w-4 rtl:rotate-180" />{ar ? 'العودة إلى سجل الجلسات' : 'Back to session log'}</Link>{can('advising.manage') && <button disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(record.status === 'open' ? 'closed' : 'open')} className="flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-[10px] font-black text-white transition hover:bg-teal-700 disabled:opacity-60"><CheckCircle2 className="h-4 w-4" />{record.status === 'open' ? (ar ? 'إغلاق ملف المتابعة' : 'Close follow-up case') : (ar ? 'إعادة فتح الملف' : 'Reopen case')}</button>}</div>

    <header className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100"><GraduationCap className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-black text-slate-950">{studentName}</h1><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${record.status === 'open' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>{record.status === 'open' ? (ar ? 'ملف مفتوح' : 'Open case') : (ar ? 'ملف مغلق' : 'Closed case')}</span></div><p className="mt-1 text-[10px] text-slate-400">{record.student?.university_number} · {record.meeting_number || `#${record.id}`}</p></div></div><div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-[10px] font-bold text-slate-600"><CalendarDays className="h-4 w-4 text-teal-600" />{String(record.meeting_date).slice(0, 10)}</div></div></header>

    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-4"><article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-teal-600" /><h2 className="text-xs font-black text-slate-900">{ar ? 'ملاحظات ومحاور الجلسة' : 'Session notes and discussion'}</h2></div><p className="mt-4 whitespace-pre-line text-xs leading-7 text-slate-600">{record.notes}</p></article><article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xs font-black text-slate-900">{ar ? 'خطة العمل والتوصيات' : 'Action plan and recommendations'}</h2><p className="mt-4 whitespace-pre-line rounded-2xl bg-teal-50/60 p-4 text-xs leading-7 text-teal-950">{record.action_plan || (ar ? 'لم تسجل خطة عمل لهذه الجلسة.' : 'No action plan was recorded for this session.')}</p></article></div><aside className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-xs font-black text-slate-900">{ar ? 'بيانات الجلسة' : 'Session information'}</h2><Info label={ar ? 'المرشد الأكاديمي' : 'Academic advisor'} value={advisorName} icon={UserRound} /><Info label={ar ? 'التصنيف' : 'Category'} value={categoryLabel(record.category, ar)} icon={ClipboardList} /><Info label={ar ? 'حالة المتابعة' : 'Follow-up status'} value={record.follow_up_status || (record.status === 'closed' ? (ar ? 'مكتملة' : 'Completed') : (ar ? 'قيد المتابعة' : 'In follow-up'))} icon={CheckCircle2} />{Boolean(record.participants?.length) && <div className="border-t border-slate-100 pt-3"><p className="mb-2 text-[9px] font-black text-slate-500">{ar ? 'المشاركون' : 'Participants'}</p>{record.participants?.map((participant) => <div key={participant.id} className="py-2 text-[10px] text-slate-600">{ar ? participant.student?.full_name_ar : participant.student?.full_name_en || participant.student?.full_name_ar}</div>)}</div>}</aside></section>
  </div>;
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) {
  return <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /><div><p className="text-[8px] font-bold text-slate-400">{label}</p><p className="mt-1 text-[10px] font-black text-slate-700">{value}</p></div></div>;
}

function categoryLabel(category: string, ar: boolean) {
  return ({ academic: ar ? 'أكاديمي' : 'Academic', risk: ar ? 'تعثر وإنذار' : 'Risk and warning', general: ar ? 'عام' : 'General' }[category] ?? category);
}
