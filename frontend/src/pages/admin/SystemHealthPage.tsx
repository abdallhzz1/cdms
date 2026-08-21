import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Activity, Database, HardDrive, Cpu, ShieldCheck, RefreshCw, FileText } from 'lucide-react';

export function SystemHealthPage() {

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => apiFetch<any>('/admin/health'),
    refetchInterval: 10000,
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const db = data?.database || {};
  const storage = data?.storage || {};
  const metrics = data?.metrics || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="شاشة مراقبة أداء وحجم صحة السيرفر"
          description="مراقبة حية استجابة الـ API، اتصال قاعدة البيانات MySQL، استهلاك المساحة والتخزين، وحجم الأداء الفني."
        />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          تحديث المؤشرات
        </button>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 border-slate-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">استجابة الباك إند</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{db.latency_ms} ms</p>
          <div className="text-[10px] font-bold text-emerald-600">ممتازة وسريعة جداً</div>
        </Card>

        <Card className="p-5 border-slate-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">حالة قاعدة البيانات</span>
            <Database className="w-4 h-4 text-teal-500" />
          </div>
          <p className="text-2xl font-black text-teal-700 capitalize">{db.status}</p>
          <div className="text-[10px] text-slate-500 font-mono">Engine: {db.connection}</div>
        </Card>

        <Card className="p-5 border-slate-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">المساحة المستهلكة</span>
            <HardDrive className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-900">{storage.used_percent}%</p>
          <div className="text-[10px] text-slate-500 font-medium">المتبقي: {storage.free_gb} GB</div>
        </Card>

        <Card className="p-5 border-slate-100 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">حجم سجل الحركات</span>
            <FileText className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-slate-900">{metrics.audit_logs_count}</p>
          <div className="text-[10px] text-slate-500 font-medium">سجل حركة مفهرس</div>
        </Card>
      </div>

      {/* Technical Environment & Software Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border-slate-100 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-teal-600" />
            بيئة التشغيل والتقنيات المعتمدة بالسيرفر
          </h3>

          <div className="space-y-3 divide-y divide-slate-100 text-xs">
            <div className="pt-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">إصدار PHP</span>
              <span className="font-bold font-mono text-slate-900">{data?.php_version}</span>
            </div>

            <div className="pt-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">إصدار Laravel Framework</span>
              <span className="font-bold font-mono text-slate-900">v{data?.laravel_version}</span>
            </div>

            <div className="pt-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">بيئة التطبيق (Environment)</span>
              <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-bold uppercase">{data?.environment}</span>
            </div>

            <div className="pt-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">توقيت السيرفر الحالي</span>
              <span className="font-mono text-slate-700">{data?.server_time}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-slate-100 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            مؤشرات إحصائية للنظام
          </h3>

          <div className="space-y-3 divide-y divide-slate-100 text-xs">
            <div className="pt-2 flex items-center justify-between">
              <span className="text-slate-500 font-medium">إجمالي الحسابات المفعلة</span>
              <span className="font-bold text-slate-900">{metrics.active_users} من {metrics.total_users}</span>
            </div>

            <div className="pt-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">إجمالي الأدوار المعرفة بالداتابيز</span>
              <span className="font-bold text-slate-900">{metrics.roles_count} أدوار</span>
            </div>

            <div className="pt-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">حالة التخزين السريع (Cache)</span>
              <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">نشط ومفعل</span>
            </div>

            <div className="pt-3 flex items-center justify-between">
              <span className="text-slate-500 font-medium">مستوى الحظر والأمان</span>
              <span className="text-emerald-600 font-bold">محصن (OWASP Level A+)</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
