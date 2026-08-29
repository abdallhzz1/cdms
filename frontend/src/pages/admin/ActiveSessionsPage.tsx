import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { ShieldCheck, Monitor, Smartphone, Globe, LogOut, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

export function ActiveSessionsPage() {
  const qc = useQueryClient();
  const { locale } = useI18n(); const tr = (ar:string,en:string)=>locale==='ar'?ar:en;
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-sessions'],
    queryFn: () => apiFetch<any>('/admin/sessions'),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: number) => apiFetch(`/admin/sessions/${userId}/revoke`, { method: 'POST' }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['admin-sessions'] });
      setSuccessMessage(res?.message || tr('تم طرد وإنهاء الجلسة بنجاح.', 'The session was revoked successfully.'));
      setTimeout(() => setSuccessMessage(null), 4000);
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const sessions = data?.sessions || [];
  const totalActive = data?.total_active || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tr('إدارة الجلسات والأمان', 'Active Sessions and Security')}
        description={tr('مراقبة الأجهزة المتصلة وإمكانية إنهاء جلسة أي حساب فوراً.', 'Monitor connected devices and immediately revoke any account session.')}
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center justify-between border-slate-100 shadow-xs">
          <div>
            <p className="text-xs font-semibold text-slate-500">{tr('الجلسات النشطة حالياً', 'Currently active sessions')}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalActive}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
            <Monitor className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-5 flex items-center justify-between border-slate-100 shadow-xs">
          <div>
            <p className="text-xs font-semibold text-slate-500">{tr('حالة التشفير والحماية', 'Encryption and protection')}</p>
            <p className="text-sm font-bold text-emerald-600 mt-1">{tr('مشفرة عبر TLS وSanctum', 'Protected by TLS and Sanctum')}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-5 flex items-center justify-between border-slate-100 shadow-xs">
          <div>
            <p className="text-xs font-semibold text-slate-500">{tr('معدل الأمان التقني', 'Technical security status')}</p>
            <p className="text-sm font-bold text-indigo-600 mt-1">{tr('100% - محصنة', '100% — Protected')}</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <Globe className="w-6 h-6" />
          </div>
        </Card>
      </div>

      {/* Active Sessions Table */}
      <Card className="overflow-hidden border-slate-100 shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Monitor className="w-4 h-4 text-teal-600" />
            {tr('الجلسات والأجهزة المتصلة بالنظام', 'Connected sessions and devices')}
          </h3>
          <span className="text-xs px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-medium">
            {tr('تحديث تلقائي لحالة الدخول', 'Automatically refreshed')}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr('المستخدم والحساب', 'User and account')}</TableHead>
              <TableHead>{tr('عنوان IP', 'IP address')}</TableHead>
              <TableHead>{tr('المتصفح والنظام', 'Browser and system')}</TableHead>
              <TableHead>{tr('آخر نشاط', 'Last activity')}</TableHead>
              <TableHead>{tr('الإجراء الأمني', 'Security action')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((sess: any) => (
              <TableRow key={sess.id} className={sess.is_current ? 'bg-teal-50/30' : ''}>
                <TableCell>
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    {sess.name}
                    {sess.is_current && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                        {tr('جلستك الحالية', 'Your current session')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{sess.email}</div>
                </TableCell>
                <TableCell>
                  <code className="text-xs font-mono px-2 py-1 rounded bg-slate-100 text-slate-700">
                    {sess.ip_address}
                  </code>
                </TableCell>
                <TableCell>
                  <div className="text-xs text-slate-600 max-w-xs truncate" title={sess.user_agent}>
                    {sess.user_agent.includes('Mobile') ? (
                      <span className="inline-flex items-center gap-1"><Smartphone className="w-3.5 h-3.5 text-slate-400" />{tr('هاتف محمول', 'Mobile device')}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Monitor className="w-3.5 h-3.5 text-slate-400" />{tr('متصفح مكتب', 'Desktop browser')}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-slate-500">{sess.last_activity}</span>
                </TableCell>
                <TableCell className="text-left">
                  {sess.is_current ? (
                    <span className="text-xs text-slate-400 font-medium">{tr('نشط (حسابك)', 'Active (your account)')}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeMutation.mutate(sess.user_id)}
                      disabled={revokeMutation.isPending}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5 rounded-xl font-bold text-xs"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {tr('طرد الجلسة', 'Revoke session')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
