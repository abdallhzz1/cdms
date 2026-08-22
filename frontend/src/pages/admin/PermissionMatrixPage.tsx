import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Check, X, Lock, CheckCircle2, Search, Filter } from 'lucide-react';

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
  People: { ar: 'الكادر والمستشفيات', en: 'People' },
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
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');

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

  const roles = data?.roles || [];
  const permissions = data?.permissions || [];
  const matrix = data?.matrix || [];

  // Extract unique modules
  const modules = useMemo<string[]>(() => {
    const mods = Array.from(new Set(permissions.map((p: any) => p.module as string))) as string[];
    return ['ALL', ...mods];
  }, [permissions]);

  // Filter permissions by search and selected module
  const filteredPermissions = useMemo(() => {
    return permissions.filter((perm: any) => {
      const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code, en: perm.code };
      const matchesSearch =
        search.trim() === '' ||
        perm.code.toLowerCase().includes(search.toLowerCase()) ||
        permLabel.ar.includes(search) ||
        permLabel.en.toLowerCase().includes(search.toLowerCase());
      const matchesModule = selectedModule === 'ALL' || perm.module === selectedModule;

      return matchesSearch && matchesModule;
    });
  }, [permissions, search, selectedModule]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="مصفوفة الأدوار والصلاحيات المعتمدة (Bilingual Permission Matrix)"
        description="عرض وتعديل مصفوفة الصلاحيات الفعلية بالنظام مع ثبات رؤوس الجدول والبحث السريع."
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Controls: Search & Module Selector Pills */}
      <Card className="p-4 border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              placeholder="ابحث عن أي صلاحية (مثال: علامات، حضور، طلاب)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden font-medium bg-slate-50/50"
            />
          </div>

          <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-600" />
            <span>عرض {filteredPermissions.length} من أصل {permissions.length} صلاحية</span>
          </div>
        </div>

        {/* Module Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {modules.map((mod: string) => {
            const isAll = mod === 'ALL';
            const modLabel = isAll ? { ar: 'جميع الوحدات', en: 'All Modules' } : (MODULE_LABELS[mod] || { ar: mod, en: mod });
            const isSelected = selectedModule === mod;

            return (
              <button
                key={mod}
                onClick={() => setSelectedModule(mod)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {modLabel.ar}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Sticky Table with Internal Vertical & Horizontal Scrollbar */}
      <Card className="border-slate-100 shadow-xs overflow-hidden">
        <div className="max-h-[68vh] overflow-auto relative rounded-2xl">
          <Table>
            <TableHeader className="sticky top-0 z-30 bg-slate-100 shadow-xs">
              <TableRow className="bg-slate-100 border-b border-slate-200">
                <TableHead className="sticky right-0 z-40 bg-slate-100 min-w-[130px] max-w-[140px] sm:min-w-[260px] sm:max-w-none text-right font-bold text-slate-900 shadow-xs p-2 sm:p-3 text-[11px] sm:text-xs">
                  الصلاحية والرمز / Permission
                </TableHead>
                {roles.map((r: any) => {
                  const label = ROLE_LABELS[r.code] || { ar: r.code, en: r.code };
                  return (
                    <TableHead key={r.id} className="text-center min-w-[90px] sm:min-w-[135px] p-2 sm:p-3 border-l border-slate-200/60">
                      <div className="font-bold text-slate-900 text-[10px] sm:text-xs leading-tight">{label.ar}</div>
                      <div className="text-[9px] sm:text-[10px] text-indigo-600 font-mono font-semibold">{label.en}</div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPermissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={roles.length + 1} className="text-center py-12 text-slate-400 text-xs">
                    لا توجد صلاحيات مطابقة للبحث المحدد.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPermissions.map((perm: any) => {
                  const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code, en: perm.code };
                  const modLabel = MODULE_LABELS[perm.module] || { ar: perm.module, en: perm.module };

                  return (
                    <TableRow key={perm.id} className="group hover:bg-teal-50/40 transition-colors border-b border-slate-100">
                      {/* Sticky Right Compact First Column for Mobile */}
                      <TableCell className="sticky right-0 z-20 bg-white group-hover:bg-teal-50/90 py-2 sm:py-3 px-2 sm:px-4 min-w-[130px] max-w-[140px] sm:min-w-[260px] sm:max-w-none shadow-xs border-l border-slate-100">
                        <div className="font-bold text-slate-900 text-[11px] sm:text-xs leading-tight line-clamp-2">{permLabel.ar}</div>
                        <div className="text-[9px] sm:text-[10px] text-slate-500 font-mono flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="px-1 py-0.2 rounded bg-teal-50 text-teal-700 border border-teal-100 font-semibold text-[8px] sm:text-[10px]">
                            {modLabel.ar}
                          </span>
                          <span className="text-slate-400 text-[8px] sm:text-[10px] truncate max-w-[85px] sm:max-w-none">{perm.code}</span>
                        </div>
                      </TableCell>

                      {roles.map((role: any) => {
                        const roleMatrix = matrix.find((m: any) => m.role_id === role.id);
                        const permState = roleMatrix?.permissions?.find((p: any) => p.permission_id === perm.id);
                        const isGranted = permState?.granted ?? false;
                        const isSysAdmin = role.code === 'SYS_ADMIN';

                        return (
                          <TableCell key={role.id} className="text-center py-2 sm:py-3 px-1 sm:px-3 border-l border-slate-100/60">
                            {isSysAdmin ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 text-slate-400" title="صلاحية مطلقة للمسؤول الفني">
                                <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </span>
                            ) : (
                              <button
                                onClick={() => toggleMutation.mutate({ role_id: role.id, permission_id: perm.id })}
                                disabled={toggleMutation.isPending}
                                title={`${role.code} -> ${perm.code}`}
                                className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl transition-all ${
                                  isGranted
                                    ? 'bg-emerald-500 text-white shadow-xs hover:bg-emerald-600 hover:scale-105'
                                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                }`}
                              >
                                {isGranted ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> : <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                              </button>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
