import type { DistributionVersionDetail } from '@/api/distribution';
import { useI18n } from '@/i18n/I18nContext';
import { Card, CardContent } from '@/components/ui/Card';

interface WorkbenchSummaryProps {
  summary: DistributionVersionDetail['summary'];
  isCurrentPublished: boolean;
  isSuperseded: boolean;
  status: string;
}

export function WorkbenchSummary({ summary, isCurrentPublished, isSuperseded, status }: WorkbenchSummaryProps) {
  const { t } = useI18n();
  void isCurrentPublished;
  void isSuperseded;
  void status;
  
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
      <Card><CardContent className="p-3"><div className="text-xs font-medium text-slate-500">{t('distribution.summary.total_students', 'إجمالي الطلبة')}</div><div className="mt-1 text-xl font-bold text-slate-900">{summary.total_students}</div></CardContent></Card>

      <Card><CardContent className="p-3"><div className="text-xs font-medium text-slate-500">{t('distribution.summary.assigned', 'موزعون')}</div><div className="mt-1 text-xl font-bold text-emerald-600">{summary.assigned_students}</div></CardContent></Card>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow transition-shadow">
        <div className="text-xs font-medium text-slate-500">{t('distribution.summary.unassigned', 'غير موزعين')}</div>
        <div className={`mt-1 text-xl font-bold ${summary.unassigned_students > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
          {summary.unassigned_students}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow transition-shadow">
        <div className="text-xs font-medium text-slate-500">{t('distribution.summary.conflicts', 'تعارضات')}</div>
        <div className={`mt-1 text-xl font-bold ${summary.conflicts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {summary.conflicts}
        </div>
      </div>

      <Card><CardContent className="p-3"><div className="text-xs font-medium text-slate-500">{t('distribution.summary.sites_used', 'مواقع مستخدمة')}</div><div className="mt-1 text-xl font-bold text-slate-900">{summary.sites_used}</div></CardContent></Card>

      <Card><CardContent className="p-3"><div className="text-xs font-medium text-slate-500">{t('distribution.summary.blocks_used', 'فترات مستخدمة')}</div><div className="mt-1 text-xl font-bold text-slate-900">{summary.blocks_used}</div></CardContent></Card>

      <Card><CardContent className="p-3"><div className="text-xs font-medium text-slate-500">{t('distribution.summary.supervisors', 'المشرفون')}</div><div className="mt-1 text-xl font-bold text-slate-900">{summary.supervisors_assigned}</div></CardContent></Card>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow transition-shadow">
        <div className="text-xs font-medium text-slate-500">{t('distribution.summary.approval_state', 'حالة الاعتماد')}</div>
        <div className="mt-1 text-xs font-semibold">
          {summary.approval_state ? (
            <span className="text-emerald-600">{t('distribution.status.approved', 'معتمد')}</span>
          ) : (
            <span className="text-slate-400">{t('distribution.status.unapproved', 'غير معتمد')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
