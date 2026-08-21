import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Shield, Check, X, Lock, CheckCircle2, Sparkles } from 'lucide-react';

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام الفني', en: 'System Admin' },
  DEAN: { ar: 'عميد الكلية', en: 'Dean' },
  VICE_DEAN: { ar: 'نائب العميد', en: 'Vice Dean' },
  CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', en: 'Clinical Director' },
  ADMIN_ASSISTANT: { ar: 'مساعد إداري', en: 'Admin Assistant' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم الأكاديمي', en: 'Department Head' },
  RTA: { ar: 'مساعد التدريب السريري', en: 'RTA' },
  CLINICAL_SUPERVISOR: { ar: 'المشرف السريري', en: 'Clinical Supervisor' },
  ACADEMIC_ADVISOR: { ar: 'المرشد الأكاديمي', en: 'Academic Advisor' },
  QUALITY: { ar: 'مسؤول الجودة والاعتماد', en: 'Quality Officer' },
};

const PERMISSION_LABELS: Record<string, { ar: string; en: string }> = {
  'students.view': { ar: 'عرض بيانات وسجلات الطلبة', en: 'View Students' },
  'students.create': { ar: 'إضافة طالب جديد / استيراد', en: 'Create Student' },
  'students.update': { ar: 'تعديل بيانات طالب', en: 'Update Student' },
  'students.delete': { ar: 'حذف سجل طالب', en: 'Delete Student' },
  'students.export': { ar: 'تصدير كشوفات الطلبة', en: 'Export Students' },
  'grades.view': { ar: 'عرض سجلات ومسودات العلامات', en: 'View Grades' },
  'grades.create': { ar: 'رصد وإدخال العلامات', en: 'Create Grades' },
  'grades.update': { ar: 'تعديل وتحديث العلامات', en: 'Update Grades' },
  'grades.approve': { ar: 'اعتماد العلامات رسمياً', en: 'Approve Grades' },
  'distribution.view': { ar: 'عرض التوزيع والمخطط السريري', en: 'View Distribution' },
  'distribution.create': { ar: 'إنشاء توزيع سريري جديد', en: 'Create Distribution' },
  'distribution.update': { ar: 'تعديل وتحديث التوزيع السريري', en: 'Update Distribution' },
  'distribution.publish': { ar: 'نشر الجدول والتوزيع السريري', en: 'Publish Distribution' },
  'courses.view': { ar: 'عرض المساقات والخطط الدراسية', en: 'View Courses' },
  'courses.manage': { ar: 'إدارة وتعديل المساقات والخطط', en: 'Manage Courses' },
  'users.view': { ar: 'عرض قائمة المستخدمين', en: 'View Users' },
  'users.manage': { ar: 'إدارة المستخدمين والأدوار', en: 'Manage Users' },
  'audit.view': { ar: 'عرض سجل الحركات والتدقيق', en: 'View Audit Logs' },
  'settings.manage': { ar: 'إدارة إعدادات النظام والسيرفر', en: 'Manage Settings' },
  'quality.view': { ar: 'عرض مؤشرات الجودة والتقييمات', en: 'View Quality' },
  'quality.manage': { ar: 'إدارة الاستبيانات وخطط التحسين', en: 'Manage Quality' },
  'advising.view': { ar: 'عرض الإرشاد والتنبيه المبكر', en: 'View Advising' },
  'advising.manage': { ar: 'إدارة جلسات وتوصيات الإرشاد', en: 'Manage Advising' },
  'correspondence.view': { ar: 'عرض المراسلات والطلبات', en: 'View Correspondence' },
  'correspondence.manage': { ar: 'إدارة وتصدير المعاملات', en: 'Manage Correspondence' },
};

export function PermissionMatrixPage() {
  const qc = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-permission-matrix'],
    queryFn: () => apiFetch<any>('/admin/permissions/matrix'),
  });

  const toggleMutation = useMutation({
    mutationFn: (body: { role_id: number; permission_id: number }) =>
      apiFetch('/admin/permissions/toggle', { method: 'POST', body }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['admin-permission-matrix'] });
      setSuccessMessage(res?.message || 'تم تحديث مصفوفة الصلاحيات بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const roles = data?.roles || [];
  const permissions = data?.permissions || [];
  const matrix = data?.matrix || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مصفوفة الأدوار والصلاحيات التفصيلية (Role & Permission Matrix)"
        description="عرض وتعديل مصفوفة الصلاحيات باللغتين العربية والإنجليزية في الوقت الفعلي لكل دور تقني بالنظام."
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <Card className="overflow-x-auto border-slate-100 shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            جدول توزيع الصلاحيات باللغتين (Bilingual Permission Matrix)
          </h3>
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            تحديث فوري ومباشر على قاعدة البيانات
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px] text-right">الصلاحية والرمز / Permission</TableHead>
              {roles.map((r: any) => {
                const label = ROLE_LABELS[r.code] || { ar: r.code, en: r.code };
                return (
                  <TableHead key={r.id} className="text-center min-w-[130px] p-3">
                    <div className="font-bold text-slate-900 text-xs">{label.ar}</div>
                    <div className="text-[10px] text-indigo-600 font-mono font-semibold">{label.en}</div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((perm: any) => {
              const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code, en: perm.code };
              return (
                <TableRow key={perm.id} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="py-3">
                    <div className="font-bold text-slate-900 text-xs">{permLabel.ar}</div>
                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">{perm.module}</span>
                      <span>{perm.code}</span>
                    </div>
                  </TableCell>

                  {roles.map((role: any) => {
                    const roleMatrix = matrix.find((m: any) => m.role_id === role.id);
                    const permState = roleMatrix?.permissions?.find((p: any) => p.permission_id === perm.id);
                    const isGranted = permState?.granted ?? false;
                    const isSysAdmin = role.code === 'SYS_ADMIN';

                    return (
                      <TableCell key={role.id} className="text-center py-3">
                        {isSysAdmin ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-400" title="صلاحية مطلقة للمسؤول الفني">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <button
                            onClick={() => toggleMutation.mutate({ role_id: role.id, permission_id: perm.id })}
                            disabled={toggleMutation.isPending}
                            title={`${role.code} -> ${perm.code}`}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-xl transition-all ${
                              isGranted
                                ? 'bg-emerald-500 text-white shadow-xs hover:bg-emerald-600 hover:scale-105'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {isGranted ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
