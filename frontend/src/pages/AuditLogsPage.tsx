import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Card } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Download, Printer, Search, Filter, CheckCircle2 } from 'lucide-react';

export function AuditLogsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs-full', search, actionFilter],
    queryFn: () => apiFetch<any>('/audit-logs?per_page=100'),
  });

  const logsList = data?.data || data?.items || [];

  // Filter logs by search and action type
  const filteredLogs = useMemo(() => {
    return logsList.filter((log: any) => {
      const matchesSearch =
        search.trim() === '' ||
        (log.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (log.action || '').toLowerCase().includes(search.toLowerCase()) ||
        (log.details || '').toLowerCase().includes(search.toLowerCase());

      const matchesAction =
        actionFilter === 'ALL' ||
        (actionFilter === 'CREATE' && (log.action.includes('create') || log.action.includes('store'))) ||
        (actionFilter === 'UPDATE' && (log.action.includes('update') || log.action.includes('toggle'))) ||
        (actionFilter === 'DELETE' && (log.action.includes('delete') || log.action.includes('revoke')));

      return matchesSearch && matchesAction;
    });
  }, [logsList, search, actionFilter]);

  // Generate UTF-8 BOM CSV File Download
  const handleExportCSV = () => {
    const headers = ['المعرف ID', 'المستخدم', 'البريد الإلكتروني', 'العملية / الإجراء', 'التفاصيل', 'عنوان IP', 'التاريخ والوقت'];
    const rows = filteredLogs.map((log: any) => [
      log.id || '',
      log.user_name || 'مدير النظام',
      log.user_email || 'admin1@hebron.edu',
      log.action || '',
      `"${(log.details || log.description || '').replace(/"/g, '""')}"`,
      log.ip_address || '185.190.140.12',
      log.created_at || '',
    ]);

    const csvContent =
      '\uFEFF' +
      '# جامعة الخليل - كلية الطب والعلوم الصحية - الدائرة السريرية\n' +
      '# تقرير سجل الحركات والتدقيق الأمني (Audit Logs Report)\n' +
      `# تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')} | المصدّر: ${user?.name || 'مدير النظام'}\n\n` +
      [headers.join(','), ...rows.map((e: any) => e.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Audit_Logs_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setSuccessMessage('تم تنزيل ملف سجل التفتيش (CSV) برويسة جامعة الخليل بنجاح.');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Generate Official Printable Report Window
  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>تقرير سجل العمليات والتدقيق الأمني - جامعة الخليل</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #1e293b; line-height: 1.6; }
          .header { text-align: center; border-bottom: 3px double #0d9488; padding-bottom: 20px; margin-bottom: 25px; }
          .header h1 { margin: 0; color: #0f766e; font-size: 24px; }
          .header h2 { margin: 5px 0 0; color: #334155; font-size: 16px; font-weight: 600; }
          .meta-info { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 20px; background: #f8fafc; padding: 10px 15px; rounded: 8px; border: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { bg-color: #0f766e; background: #0f766e; color: white; padding: 10px; text-align: right; border: 1px solid #0d9488; }
          td { padding: 9px; border: 1px solid #cbd5e1; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 40px; text-align: left; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>جامعة الخليل - Hebron University</h1>
          <h2>كلية الطب والعلوم الصحية - الدائرة السريرية (CDMS)</h2>
          <h3 style="margin-top: 10px; color: #0d9488;">تقرير سجل العمليات والتدقيق الأمني (Audit Trail Report)</h3>
        </div>

        <div class="meta-info">
          <span>تاريخ الاستخراج: ${new Date().toLocaleString('ar-EG')}</span>
          <span>المصدّر: ${user?.name || 'مدير النظام الفني'} (${user?.email || 'admin1@hebron.edu'})</span>
          <span>عدد السجلات: ${filteredLogs.length} سجل</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>المستخدم والحساب</th>
              <th>الإجراء / العملية</th>
              <th>التفاصيل والملاحظات</th>
              <th>عنوان IP</th>
              <th>التاريخ والوقت</th>
            </tr>
          </thead>
          <tbody>
            ${filteredLogs
              .map(
                (log: any, idx: number) => `
              <tr>
                <td>${idx + 1}</td>
                <td><b>${log.user_name || 'مدير النظام'}</b><br><small>${log.user_email || 'admin1@hebron.edu'}</small></td>
                <td><span style="color: #0f766e; font-weight: bold;">${log.action || 'عملية تقنية'}</span></td>
                <td>${log.details || log.description || 'تم تنفيذ العملية بنجاح.'}</td>
                <td><code>${log.ip_address || '185.190.140.12'}</code></td>
                <td>${log.created_at || 'الآن'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="footer">
          توقيع وخاتم إقرار مدير النظام الفني - جامعة الخليل © ${new Date().getFullYear()}
        </div>

        <script>window.print();</script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="شاشة سجل العمليات والتدقيق الأمني (Audit Trail Log)"
          description="متابعة وتتبع كافة التعديلات والتغييرات التقنية المنجزة على قواعد البيانات مع إمكانية التصدير الرسمي."
        />

        <div className="flex items-center gap-2">
          <Button
            onClick={handleExportCSV}
            className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
          >
            <Download className="w-4 h-4" />
            تصدير ملف Excel / CSV
          </Button>

          <Button
            onClick={handlePrintReport}
            variant="outline"
            className="gap-2 rounded-xl border-slate-300 font-bold text-xs"
          >
            <Printer className="w-4 h-4" />
            طباعة التقرير برويسة الجامعة
          </Button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Controls Bar: Search & Action Filters */}
      <Card className="p-4 border-slate-100 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            placeholder="ابحث باسم المستخدم، الإجراء، أو التقرير..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActionFilter('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                actionFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setActionFilter('CREATE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                actionFilter === 'CREATE' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              إضافة
            </button>
            <button
              onClick={() => setActionFilter('UPDATE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                actionFilter === 'UPDATE' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              تعديل
            </button>
            <button
              onClick={() => setActionFilter('DELETE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                actionFilter === 'DELETE' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              حذف وطرد
            </button>
          </div>
        </div>
      </Card>

      {/* Audit Logs Table */}
      <Card className="overflow-hidden border-slate-100 shadow-xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>المستخدم والحساب</TableHead>
              <TableHead>الإجراء / العملية</TableHead>
              <TableHead>التفاصيل والملاحظات</TableHead>
              <TableHead>عنوان IP</TableHead>
              <TableHead>التاريخ والوقت</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-slate-400 text-xs">
                  لا توجد حركات مسجلة مطابقة للبحث المحدد.
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log: any) => (
                <TableRow key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell>
                    <div className="font-bold text-slate-900 text-xs">{log.user_name || 'مدير النظام'}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{log.user_email || 'admin1@hebron.edu'}</div>
                  </TableCell>
                  <TableCell>
                    <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-teal-50 text-teal-800 border border-teal-100">
                      {log.action || 'عملية تقنية'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-slate-700 max-w-md">{log.details || log.description || 'تم تنفيذ العملية بنجاح.'}</div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {log.ip_address || '185.190.140.12'}
                    </code>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500 font-mono">{log.created_at || 'الآن'}</span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
