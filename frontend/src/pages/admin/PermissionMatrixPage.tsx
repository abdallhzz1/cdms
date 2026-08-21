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

const MODULE_LABELS: Record<string, { ar: string; en: string }> = {
  Students: { ar: 'شؤون الطلبة', en: 'Students' },
  Grades: { ar: 'العلامات والتقييم الأكاديمي', en: 'Grades' },
  Distribution: { ar: 'التوزيع والتدريب السريري', en: 'Distribution' },
  Rotations: { ar: 'الدورات السريرية', en: 'Rotations' },
  Courses: { ar: 'المساقات والخطط الدراسية', en: 'Courses' },
  Attendance: { ar: 'حضور وغياب التدريب', en: 'Attendance' },
  Assessment: { ar: 'التقييم السريري', en: 'Assessment' },
  Correspondence: { ar: 'المراسلات والطلبات', en: 'Correspondence' },
  Meetings: { ar: 'الاجتماعات والمحاضر', en: 'Meetings' },
  Tasks: { ar: 'المهام والتكليفات', en: 'Tasks' },
  Reports: { ar: 'التقارير والإحصائيات', en: 'Reports' },
  Quality: { ar: 'الجودة والاعتماد', en: 'Quality' },
  Advising: { ar: 'الإرشاد الأكاديمي', en: 'Advising' },
  Security: { ar: 'الأمان والمستخدمين', en: 'Security' },
  AcademicYears: { ar: 'التقويم والأعوام', en: 'Academic Years' },
  Departments: { ar: 'الأقسام الأكاديمية', en: 'Departments' },
  People: { ar: 'الكادر والموظفون', en: 'People' },
  Groups: { ar: 'المجموعات والشعب', en: 'Groups' },
  KPIs: { ar: 'مؤشرات الأداء', en: 'KPIs' },
  Performance: { ar: 'مراقبة الأداء', en: 'Performance' },
};

const PERMISSION_LABELS: Record<string, { ar: string; en: string }> = {
  // Students
  'students.view': { ar: 'عرض بيانات وسجلات الطلبة', en: 'View Students' },
  'students.create': { ar: 'إضافة طالب جديد / استيراد', en: 'Create Student' },
  'students.update': { ar: 'تعديل بيانات طالب', en: 'Update Student' },
  'students.delete': { ar: 'حذف سجل طالب', en: 'Delete Student' },
  'students.export': { ar: 'تصدير كشوفات الطلبة', en: 'Export Students' },

  // Grades
  'grades.view': { ar: 'عرض سجلات ومسودات العلامات', en: 'View Grades' },
  'grades.create': { ar: 'رصد وإدخال العلامات', en: 'Create Grades' },
  'grades.update': { ar: 'تعديل وتحديث العلامات', en: 'Update Grades' },
  'grades.approve': { ar: 'اعتماد العلامات رسمياً', en: 'Approve Grades' },

  // Distribution & Rotations
  'distribution.view': { ar: 'عرض التوزيع والمخطط السريري', en: 'View Distribution' },
  'distribution.create': { ar: 'إنشاء توزيع سريري جديد', en: 'Create Distribution' },
  'distribution.update': { ar: 'تعديل وتحديث التوزيع السريري', en: 'Update Distribution' },
  'distribution.publish': { ar: 'نشر الجدول والتوزيع السريري', en: 'Publish Distribution' },
  'rotations.view': { ar: 'عرض الدورات السريرية', en: 'View Rotations' },
  'rotations.create': { ar: 'إضافة دورة سريرية جديدة', en: 'Create Rotation' },
  'rotations.update': { ar: 'تعديل بيانات الدورة السريرية', en: 'Update Rotation' },
  'rotations.delete': { ar: 'حذف دورة سريرية', en: 'Delete Rotation' },

  // Courses
  'courses.view': { ar: 'عرض المساقات والخطط الدراسية', en: 'View Courses' },
  'courses.manage': { ar: 'إدارة وتعديل المساقات والخطط', en: 'Manage Courses' },

  // Attendance & Assessment
  'attendance.view': { ar: 'عرض سجلات الحضور والغياب', en: 'View Attendance' },
  'attendance.record': { ar: 'تسجيل وتأكيد حضور الطلبة', en: 'Record Attendance' },
  'attendance.excuse': { ar: 'قبول وتوثيق الأعذار', en: 'Excuse Attendance' },
  'assessment.view': { ar: 'عرض تقييمات التناوب السريري', en: 'View Assessments' },
  'assessment.create': { ar: 'إدخال تقييم سريري جديد', en: 'Create Assessment' },
  'assessment.submit': { ar: 'رفع وتسليم التقييم السريري', en: 'Submit Assessment' },
  'assessment.approve': { ar: 'اعتماد التقييمات السريرية', en: 'Approve Assessment' },

  // Correspondence, Meetings & Tasks
  'correspondence.view': { ar: 'عرض المراسلات والمعاملات', en: 'View Correspondence' },
  'correspondence.create': { ar: 'إنشاء معاملة جديدة', en: 'Create Correspondence' },
  'correspondence.update': { ar: 'تعديل بيانات المعاملة', en: 'Update Correspondence' },
  'correspondence.submit': { ar: 'إرسال المعاملة للموافقة', en: 'Submit Correspondence' },
  'correspondence.forward': { ar: 'تحويل وتوجيه المعاملة', en: 'Forward Correspondence' },
  'correspondence.approve': { ar: 'الموافقة على المعاملة', en: 'Approve Correspondence' },
  'correspondence.close': { ar: 'إغلاق وأرشفة المعاملة', en: 'Close Correspondence' },
  'meetings.manage': { ar: 'إدارة وتنسيق الاجتماعات', en: 'Manage Meetings' },
  'meetings.approve_minutes': { ar: 'اعتماد محاضر الاجتماعات', en: 'Approve Meeting Minutes' },
  'tasks.view': { ar: 'عرض المهام والتكليفات', en: 'View Tasks' },
  'tasks.manage': { ar: 'إشهار وإسناد المهام', en: 'Manage Tasks' },

  // Security, Audit & Settings
  'users.view': { ar: 'عرض قائمة المستخدمين والحسابات', en: 'View Users' },
  'users.manage': { ar: 'إدارة المستخدمين والأدوار', en: 'Manage Users & Roles' },
  'roles.manage': { ar: 'إدارة مصفوفة الأدوار', en: 'Manage Roles' },
  'audit.view': { ar: 'عرض سجل التدقيق والتفتيش', en: 'View Audit Logs' },
  'settings.manage': { ar: 'إدارة إعدادات النظام والسيرفر', en: 'Manage System Settings' },

  // Reports, Quality & Advising
  'reports.view': { ar: 'عرض التقارير التشغيلية والسنوية', en: 'View Reports' },
  'reports.export': { ar: 'تصدير التقارير والإحصائيات', en: 'Export Reports' },
  'quality.view': { ar: 'عرض مؤشرات الجودة والاعتماد', en: 'View Quality' },
  'quality.manage': { ar: 'إدارة الاستبيانات وخطط التحسين', en: 'Manage Quality' },
  'kpi.manage': { ar: 'إدارة مؤشرات الأداء الرئيسية', en: 'Manage KPIs' },
  'performance.view': { ar: 'مراقبة تقارير الأداء الأكاديمي', en: 'View Performance' },
  'advising.view': { ar: 'عرض الإرشاد والتنبيه المبكر', en: 'View Advising' },
  'advising.manage': { ar: 'إدارة جلسات وسجلات الإرشاد', en: 'Manage Advising' },

  // Infrastructure
  'academic_years.view': { ar: 'عرض الأعوام والتقويم الأكاديمي', en: 'View Academic Years' },
  'academic_years.manage': { ar: 'إدارة الأعوام والتقويم الأكاديمي', en: 'Manage Academic Years' },
  'departments.view': { ar: 'عرض دليل الأقسام الأكاديمية', en: 'View Departments' },
  'departments.manage': { ar: 'إدارة الهيكل التنظيمي للأقسام', en: 'Manage Departments' },
  'people.view': { ar: 'عرض الكادر والمستشفيات', en: 'View Staff & Sites' },
  'people.manage': { ar: 'إدارة وتكليف الكادر السريري', en: 'Manage Staff' },
  'groups.view': { ar: 'عرض المجموعات والشعب الطلابية', en: 'View Groups' },
  'groups.manage': { ar: 'إدارة وتشكيل المجموعات والشعب', en: 'Manage Groups' },
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
        title="مصفوفة الأدوار والصلاحيات المعتمدة (Bilingual Permission Matrix)"
        description="عرض وتحديد الصلاحيات الفعلية الممنوحة لكل دور تقني بالنظام باللغتين العربية والإنجليزية في الوقت الفعلي."
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
            جدول توزيع الصلاحيات الفعلي للنظام (Real System Permission Grants)
          </h3>
          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            تعديل وتحديث فوري ومباشر على قاعدة البيانات
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px] text-right">الصلاحية والرمز / Permission</TableHead>
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
              const modLabel = MODULE_LABELS[perm.module] || { ar: perm.module, en: perm.module };

              return (
                <TableRow key={perm.id} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="py-3">
                    <div className="font-bold text-slate-900 text-xs">{permLabel.ar}</div>
                    <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-100 font-semibold">
                        {modLabel.ar} ({modLabel.en})
                      </span>
                      <span className="text-slate-400">{perm.code}</span>
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
