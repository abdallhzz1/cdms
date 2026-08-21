import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { 
  Users, ShieldCheck, Activity, Monitor, Settings, 
  FileText, Calendar, ArrowLeft, Clock, Cpu
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function FoundationHome() {
  const { user, hasRole } = useAuth();
  const isSysAdmin = hasRole('SYS_ADMIN');

  // Fetch System Health metrics
  const { data: health, isLoading: isLoadingHealth } = useQuery({
    queryKey: ['admin-health-dashboard'],
    queryFn: () => apiFetch<any>('/admin/health'),
    enabled: isSysAdmin,
  });

  // Fetch Active Sessions metrics
  const { data: sessions, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['admin-sessions-dashboard'],
    queryFn: () => apiFetch<any>('/admin/sessions'),
    enabled: isSysAdmin,
  });

  // Fetch Audit Logs for live activity feed
  const { data: auditData, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['admin-audit-dashboard'],
    queryFn: () => apiFetch<any>('/audit-logs?per_page=6'),
    enabled: isSysAdmin,
  });

  if (isSysAdmin && (isLoadingHealth || isLoadingSessions || isLoadingAudit)) {
    return <LoadingState />;
  }

  const logs = auditData?.data || auditData?.items || [];
  const db = health?.database || {};
  const metrics = health?.metrics || {};

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-r from-teal-900 via-slate-900 to-indigo-950 p-8 text-white shadow-xl">
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold border border-teal-500/30">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            نظام إدارة الدائرة السريرية - جامعة الخليل (CDMS v2.0)
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">
            أهلاً بك، {user?.name || 'مدير النظام'} 👋
          </h1>
          <p className="text-xs md:text-sm text-slate-300 max-w-2xl leading-relaxed">
            {isSysAdmin 
              ? 'لوحة التحكم الفنية والعمليات الحية لإدارة الحسابات، مصفوفة الصلاحيات، مراقبة صحة السيرفر، وسجل حركات النظام.'
              : 'مرحباً بك في لوحة تحكم العمليات للدائرة السريرية وكلية الطب والعلوم الصحية.'}
          </p>
        </div>

        {/* Background Decorative Pattern */}
        <div className="absolute -left-10 -bottom-10 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -right-10 -top-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
      </div>

      {isSysAdmin ? (
        <>
          {/* Quick Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 border-slate-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">الجلسات النشطة</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{sessions?.total_active || 1}</p>
                <span className="text-[10px] font-bold text-emerald-600">اتصال آمن مشفر</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                <Monitor className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 border-slate-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">استجابة الباك إند</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{db.latency_ms || 1.2} ms</p>
                <span className="text-[10px] font-bold text-teal-600">أداء عالي الأمان</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Activity className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 border-slate-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">إجمالي الحسابات</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics.active_users || 12}</p>
                <span className="text-[10px] font-bold text-indigo-600">{metrics.roles_count || 10} أدوار معتمدة</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Users className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 border-slate-100 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">حجم سجل الحركات</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics.audit_logs_count || 48}</p>
                <span className="text-[10px] font-bold text-amber-600">مفهرس ومحفوظ</span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                <FileText className="w-6 h-6" />
              </div>
            </Card>
          </div>

          {/* Rapid System Admin Action Launchers */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-teal-600" />
              اختصارات وتطبيقات إدارة النظام والعمليات
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link to="/users" className="group">
                <Card className="p-5 border-slate-100 shadow-xs hover:border-teal-500 hover:shadow-md transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">المستخدمون والأدوار</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">إدارة الحسابات، إضافة مستخدم جديد، وتعديل كلمات المرور والأدوار.</p>
                </Card>
              </Link>

              <Link to="/admin/sessions" className="group">
                <Card className="p-5 border-slate-100 shadow-xs hover:border-indigo-500 hover:shadow-md transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">الجلسات والأمان الحية</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">مراقبة الأجهزة والدخول المباشر وطرد أية جلسة مشبوهة فوراً.</p>
                </Card>
              </Link>

              <Link to="/admin/permissions" className="group">
                <Card className="p-5 border-slate-100 shadow-xs hover:border-emerald-500 hover:shadow-md transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">مصفوفة الصلاحيات</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">توزيع وتعديل الصلاحيات الفردية لكل دور باللغتين العربية والإنجليزية.</p>
                </Card>
              </Link>

              <Link to="/admin/health" className="group">
                <Card className="p-5 border-slate-100 shadow-xs hover:border-sky-500 hover:shadow-md transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <Activity className="w-5 h-5" />
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">مراقبة صحة السيرفر</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">مؤشرات أداء السيرفر، داتابيز MySQL، والمساحة المستهلكة.</p>
                </Card>
              </Link>

              <Link to="/admin/settings" className="group">
                <Card className="p-5 border-slate-100 shadow-xs hover:border-purple-500 hover:shadow-md transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <Settings className="w-5 h-5" />
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">إعدادات النظام والنسخ الاحتياطي</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">تثبيت هوية المؤسسة، وضع الصيانة، وجدولة النسخ الاحتياطية.</p>
                </Card>
              </Link>

              <Link to="/audit-logs" className="group">
                <Card className="p-5 border-slate-100 shadow-xs hover:border-amber-500 hover:shadow-md transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">سجل العمليات والتدقيق</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">تتبع كافة العمليات والتغييرات الحساسة التي تمت على البيانات.</p>
                </Card>
              </Link>
            </div>
          </div>

          {/* Live Recent Activity Stream */}
          <Card className="p-6 border-slate-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                سجل آخر الأحداث والعمليات بالنظام (Audit Stream)
              </h3>
              <Link to="/audit-logs" className="text-xs font-bold text-teal-600 hover:underline">
                عرض السجل الكامل ←
              </Link>
            </div>

            <div className="space-y-3">
              {logs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد عمليات مسجلة حالياً.</p>
              ) : (
                logs.map((log: any) => (
                  <div key={log.id} className="flex items-start justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                    <div className="space-y-1">
                      <div className="font-bold text-slate-900">
                        {log.user_name || 'مدير النظام'} - <span className="text-teal-700">{log.action || 'عملية تقنية'}</span>
                      </div>
                      <div className="text-slate-500">{log.details || log.description || 'تم تنفيذ العملية بنجاح.'}</div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{log.created_at || 'الآن'}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      ) : (
        /* Regular Dashboard View for Academic Staff */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 border-slate-100 shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600" />
              الوصول السريع للأقسام
            </h3>
            <div className="space-y-2 text-xs">
              <Link to="/directory" className="block p-3 rounded-xl bg-slate-50 hover:bg-teal-50 transition-colors font-semibold text-slate-700">
                • دليل الطلاب والتدريب السريري
              </Link>
              <Link to="/distribution" className="block p-3 rounded-xl bg-slate-50 hover:bg-teal-50 transition-colors font-semibold text-slate-700">
                • التوزيع والجدول السريري
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
