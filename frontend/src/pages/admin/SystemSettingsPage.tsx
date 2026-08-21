import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Settings, Save, CheckCircle2, Database } from 'lucide-react';

export function SystemSettingsPage() {
  const qc = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    institution_name: 'جامعة الخليل - كلية الطب والعلوم الصحية',
    system_title: 'نظام إدارة الدائرة السريرية (CDMS)',
    contact_email: 'admin1@hebron.edu',
    maintenance_mode: false,
    auto_backup_enabled: true,
    backup_frequency: 'daily',
    session_timeout_minutes: 120,
    max_login_attempts: 5,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiFetch<any>('/admin/settings'),
  });

  useEffect(() => {
    if (data) {
      setForm((prev) => ({ ...prev, ...data }));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/admin/settings', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      setSuccessMessage('تم حفظ إعدادات النظام بنجاح وتحديث التخزين السريع السيرفر.');
      setTimeout(() => setSuccessMessage(null), 4000);
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="شاشة إعدادات النظام والنسخ الاحتياطي"
        description="التحكم بالإعدادات العامة للكلية، وضع الصيانة، ومواعيد النسخ الاحتياطي لقواعد البيانات."
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Institution Info */}
        <Card className="p-6 border-slate-100 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
            <Settings className="w-4 h-4 text-teal-600" />
            الهوية والإعدادات العامة للمؤسسة والجامعة
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المؤسسة والجامعة</label>
              <input
                type="text"
                value={form.institution_name}
                onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الموديل المنظومي</label>
              <input
                type="text"
                value={form.system_title}
                onChange={(e) => setForm({ ...form, system_title: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني للجهات التقنية والتنبيهات</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مهلة انتهاء الجلسات (بالدقائق)</label>
              <input
                type="number"
                value={form.session_timeout_minutes}
                onChange={(e) => setForm({ ...form, session_timeout_minutes: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden font-medium"
              />
            </div>
          </div>
        </Card>

        {/* Maintenance & Backup Configuration */}
        <Card className="p-6 border-slate-100 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
            <Database className="w-4 h-4 text-indigo-600" />
            إعدادات النسخ الاحتياطي ووضع الصيانة (Maintenance & Backups)
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-900">وضع الصيانة العامة (Maintenance Mode)</p>
                <p className="text-[11px] text-slate-500 mt-0.5">عند تفعيله، سيتم منع أي مستخدم عادٍ من الدخول باستثناء مدراء النظام.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.maintenance_mode}
                  onChange={(e) => setForm({ ...form, maintenance_mode: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <p className="text-xs font-bold text-slate-900">جدولة النسخ الاحتياطي الآلي لقواعد البيانات</p>
                <p className="text-[11px] text-slate-500 mt-0.5">حفظ النسخ الاحتياطية تلقائياً في السيرفر مع التشفير الكامل.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_backup_enabled}
                  onChange={(e) => setForm({ ...form, auto_backup_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              </label>
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-6 py-3 shadow-xs"
          >
            <Save className="w-4 h-4" />
            حفظ إعدادات النظام وتثبيتها
          </Button>
        </div>
      </form>
    </div>
  );
}
