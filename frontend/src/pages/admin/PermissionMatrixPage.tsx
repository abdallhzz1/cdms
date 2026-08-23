import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Check, X, Lock, CheckCircle2, Search, Filter, LayoutGrid } from 'lucide-react';

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام التقني', en: 'System Admin' },
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
  People: { ar: 'الكادر ورؤساء الأقسام والمشرفين', en: 'Staff & Supervisors' },
  Students: { ar: 'شؤون الطلبة والدليل', en: 'Students' },
  Grades: { ar: 'العلامات والتقييم الأكاديمي', en: 'Grades' },
  Distribution: { ar: 'التوزيع والتدريب السريري', en: 'Distribution' },
  Rotations: { ar: 'الدورات السريرية', en: 'Rotations' },
  Courses: { ar: 'المساقات والخطط الدراسية', en: 'Courses' },
  Attendance: { ar: 'حضور وغياب التدريب', en: 'Attendance' },
  Assessment: { ar: 'التقييم السريري والإشراف', en: 'Assessment' },
  Correspondence: { ar: 'المراسلات وصندوق الوارد/الصادر', en: 'Correspondence' },
  Meetings: { ar: 'الاجتماعات ومحاضر الجلسات', en: 'Meetings' },
  Tasks: { ar: 'المهام والتكليفات', en: 'Tasks' },
  Reports: { ar: 'التقارير السنوية والإحصائيات', en: 'Reports' },
  Quality: { ar: 'الجودة والاعتماد الأكاديمي', en: 'Quality' },
  Advising: { ar: 'الإرشاد الأكاديمي والإنذار', en: 'Advising' },
  Security: { ar: 'الأمان والمستخدمين والجلسات', en: 'Security' },
  AcademicYears: { ar: 'التقويم والأعوام الأكاديمية', en: 'Academic Years' },
  Departments: { ar: 'الأقسام الأكاديمية', en: 'Departments' },
  Groups: { ar: 'المجموعات والشعب', en: 'Groups' },
};

const PERMISSION_LABELS: Record<string, { ar: string; en: string; isScreen?: boolean }> = {
  // People & Staff Screens
  'people.view': { ar: 'دخول شاشة المشرفين السريريين والكادر', en: 'View Clinical Supervisors & Staff', isScreen: true },
  'people.manage': { ar: 'دخول وإدارة شاشة دليل رؤساء الأقسام', en: 'Manage & View Dept Heads Directory', isScreen: true },
  'departments.view': { ar: 'عرض دليل الأقسام الأكاديمية', en: 'View Departments Directory', isScreen: true },
  'departments.manage': { ar: 'إدارة الهيكل التنظيمي للأقسام', en: 'Manage Departments' },

  // Students
  'students.view': { ar: 'دخول شاشة دليل الطلبة', en: 'View Students Directory', isScreen: true },
  'students.create': { ar: 'إضافة طالب جديد / استيراد كشوفات', en: 'Create / Import Students' },
  'students.update': { ar: 'تعديل وتحديث بيانات الطلبة', en: 'Update Student Profile' },
  'students.delete': { ar: 'حذف سجلات الطلبة', en: 'Delete Students' },
  'students.export': { ar: 'تصدير كشوفات الطلبة (Excel/PDF)', en: 'Export Students' },

  // Grades
  'grades.view': { ar: 'دخول شاشة سجل العلامات والاعتماد', en: 'View Grades Log', isScreen: true },
  'grades.create': { ar: 'رصد وإدخال العلامات للمساقات', en: 'Enter Grades' },
  'grades.update': { ar: 'تعديل وتحديث مسودات العلامات', en: 'Update Grades' },
  'grades.approve': { ar: 'اعتماد ونشر العلامات رسمياً', en: 'Approve & Publish Grades' },

  // Distribution & Rotations
  'distribution.view': { ar: 'دخول شاشات التوزيع والجدول السريري', en: 'View Distribution & Schedule', isScreen: true },
  'distribution.create': { ar: 'إنشاء وتوليد توزيع سريري جديد', en: 'Create / Generate Distribution' },
  'distribution.update': { ar: 'تعديل وتحديث التوزيع السريري', en: 'Update Distribution' },
  'distribution.publish': { ar: 'نشر الجدول والتوزيع للطلبة', en: 'Publish Distribution' },
  'rotations.view': { ar: 'عرض الدورات والتناوب السريري', en: 'View Clinical Rotations' },
  'rotations.create': { ar: 'إضافة دورة سريرية جديدة', en: 'Create Clinical Rotation' },
  'rotations.update': { ar: 'تعديل بيانات الدورة السريرية', en: 'Update Clinical Rotation' },
  'rotations.delete': { ar: 'حذف دورة سريرية', en: 'Delete Clinical Rotation' },

  // Courses
  'courses.view': { ar: 'دخول شاشة مساقات الدائرة السريرية', en: 'View Clinical Courses', isScreen: true },
  'courses.manage': { ar: 'إدارة وتعديل المساقات والخطط الدراسية', en: 'Manage Courses & Syllabi' },

  // Attendance & Assessment
  'attendance.view': { ar: 'دخول شاشة سجل الحضور والغياب', en: 'View Attendance Log', isScreen: true },
  'attendance.record': { ar: 'تسجيل وتأكيد حضور الطلبة', en: 'Record Attendance' },
  'attendance.excuse': { ar: 'قبول وتوثيق الأعذار الطبية', en: 'Process Attendance Excuses' },
  'assessment.view': { ar: 'دخول بوابة التقييم والإشراف السريري', en: 'View Clinical Assessments Portal', isScreen: true },
  'assessment.create': { ar: 'إدخال تقييم سريري جديد', en: 'Create Clinical Assessment' },
  'assessment.submit': { ar: 'رفع وتسليم التقييم السريري', en: 'Submit Clinical Assessment' },
  'assessment.approve': { ar: 'اعتماد التقييمات السريرية (20)', en: 'Approve Clinical Assessments' },

  // Correspondence, Meetings & Tasks
  'correspondence.view': { ar: 'دخول شاشات المراسلات (الوارد والصادر)', en: 'View Inbox & Outbox', isScreen: true },
  'correspondence.create': { ar: 'إنشاء وإرسال معاملة جديدة', en: 'Create Correspondence' },
  'correspondence.update': { ar: 'تعديل بيانات المعاملة', en: 'Update Correspondence' },
  'correspondence.submit': { ar: 'إرسال المعاملة للموافقة', en: 'Submit Correspondence' },
  'correspondence.forward': { ar: 'تحويل وتوجيه المعاملات', en: 'Forward Correspondence' },
  'correspondence.approve': { ar: 'الموافقة على الطلبات والمعاملات', en: 'Approve Correspondence' },
  'correspondence.close': { ar: 'إغلاق وأرشفة المعاملات', en: 'Close Correspondence' },
  'meetings.manage': { ar: 'دخول وإدارة شاشة محاضر الاجتماعات', en: 'Manage Meetings & Minutes', isScreen: true },
  'meetings.approve_minutes': { ar: 'اعتماد محاضر الاجتماعات رسمياً', en: 'Approve Meeting Minutes' },
  'tasks.view': { ar: 'دخول شاشة المهام والتكليفات', en: 'View Tasks Screen', isScreen: true },
  'tasks.manage': { ar: 'إشهار وإسناد المهام والمتابعة', en: 'Manage & Assign Tasks' },

  // Quality, Reports & Advising
  'quality.view': { ar: 'دخول شاشة الجودة والاعتماد', en: 'View Quality & Accreditation', isScreen: true },
  'quality.manage': { ar: 'إدارة الاستبيانات وخطط التحسين', en: 'Manage Surveys & Improvements' },
  'reports.view': { ar: 'دخول شاشة التقارير السنوية والإحصائيات', en: 'View Reports Hub', isScreen: true },
  'reports.export': { ar: 'تصدير التقارير والإحصائيات', en: 'Export Reports' },
  'advising.view': { ar: 'دخول شاشة الإرشاد الأكاديمي والإنذار', en: 'View Academic Advising', isScreen: true },
  'advising.manage': { ar: 'إدارة جلسات وسجلات الإرشاد', en: 'Manage Advising Records' },

  // System & Security
  'users.view': { ar: 'عرض قائمة المستخدمين والحسابات', en: 'View Users' },
  'users.manage': { ar: 'دخول وإدارة شاشات المستخدمين والجلسات', en: 'Manage Users & Active Sessions', isScreen: true },
  'roles.manage': { ar: 'دخول وإدارة شاشة مصفوفة الصلاحيات', en: 'Manage Permission Matrix', isScreen: true },
  'audit.view': { ar: 'دخول شاشة سجل العمليات والتدقيق', en: 'View Audit Logs', isScreen: true },
  'settings.manage': { ar: 'دخول شاشات صحة السيرفر والإعدادات', en: 'Manage Health Monitor & Settings', isScreen: true },
  'academic_years.view': { ar: 'عرض الأعوام والتقويم الأكاديمي', en: 'View Academic Years' },
  'academic_years.manage': { ar: 'دخول وإدارة شاشة التقويم الأكاديمي', en: 'Manage Academic Calendar', isScreen: true },
  'groups.view': { ar: 'عرض المجموعات والشعب الطلابية', en: 'View Groups' },
  'groups.manage': { ar: 'إدارة وتشكيل المجموعات والشعب', en: 'Manage Groups' },
};

export function PermissionMatrixPage() {
  const qc = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [screensOnlyFilter, setScreensOnlyFilter] = useState(false);

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

  // Filter permissions by search, module, and screens-only toggle
  const filteredPermissions = useMemo(() => {
    return permissions.filter((perm: any) => {
      const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code, en: perm.code };
      const matchesSearch =
        search.trim() === '' ||
        perm.code.toLowerCase().includes(search.toLowerCase()) ||
        permLabel.ar.includes(search) ||
        permLabel.en.toLowerCase().includes(search.toLowerCase());
      const matchesModule = selectedModule === 'ALL' || perm.module === selectedModule;
      const matchesScreensOnly = !screensOnlyFilter || permLabel.isScreen;

      return matchesSearch && matchesModule && matchesScreensOnly;
    });
  }, [permissions, search, selectedModule, screensOnlyFilter]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="مصفوفة الصلاحيات والتحكم بظهور الشاشات"
        description="التحكم في الشاشات والصلاحيات المتاحة لكل دور في النظام مع الحفظ المباشر."
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-3 animate-fade-in shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="p-5 border-slate-200 shadow-xs space-y-4 rounded-3xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              placeholder="بحث في الشاشات أو الصلاحيات (رؤساء أقسام، مشرفين، علامات)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden bg-slate-50/50"
            />
          </div>

          {/* Quick Toggle for Screens Only */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setScreensOnlyFilter(!screensOnlyFilter)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${
                screensOnlyFilter
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>شاشات القائمة الجانبية فقط</span>
            </button>
          </div>
        </div>

        {/* Module Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> الأقسام:
          </span>
          {modules.map((mod) => {
            const modLabel = mod === 'ALL' ? 'كافة الصلاحيات' : MODULE_LABELS[mod]?.ar || mod;
            const isSelected = selectedModule === mod;
            return (
              <button
                key={mod}
                type="button"
                onClick={() => setSelectedModule(mod)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {modLabel}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Permissions Matrix Table */}
      <Card className="border-slate-200 shadow-xs overflow-hidden rounded-3xl">
        <div className="overflow-x-auto max-h-[70vh]">
          <Table className="relative w-full border-collapse">
            <TableHeader className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-xs">
              <TableRow>
                <TableHead className="w-72 min-w-[280px] p-4 text-right text-xs font-bold text-slate-700 bg-slate-50">
                  الصلاحية / الشاشة
                </TableHead>
                {roles.map((role: any) => {
                  const rLabel = ROLE_LABELS[role.code]?.ar || role.name || role.code;
                  const isSysAdmin = role.code === 'SYS_ADMIN';
                  return (
                    <TableHead
                      key={role.id}
                      className="min-w-[120px] p-3 text-center text-xs font-bold text-slate-700 bg-slate-50 border-s border-slate-100"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-slate-800 leading-snug">{rLabel}</span>
                        <span className="text-[10px] font-mono font-medium text-slate-400">
                          {role.code}
                        </span>
                        {isSysAdmin && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-bold">
                            <Lock className="w-2.5 h-2.5" /> ثابتة
                          </span>
                        )}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-slate-100">
              {filteredPermissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={roles.length + 1} className="text-center py-12 text-slate-400 text-xs font-semibold">
                    لا توجد صلاحيات أو شاشات مطابقة لبحثك.
                  </TableCell>
                </TableRow>
              ) : (
                filteredPermissions.map((perm: any, pIdx: number) => {
                  const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code, en: perm.code };
                  const isScreen = permLabel.isScreen;
                  return (
                    <TableRow
                      key={perm.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      {/* Permission Title & Info */}
                      <TableCell className="p-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 leading-snug">
                              {permLabel.ar}
                            </span>
                            {isScreen && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold">
                                <LayoutGrid className="w-2.5 h-2.5" /> شاشة
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span>{perm.code}</span>
                            <span>•</span>
                            <span className="text-slate-500 font-sans">{MODULE_LABELS[perm.module]?.ar || perm.module}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Checkboxes for each Role */}
                      {roles.map((role: any) => {
                        const isSysAdmin = role.code === 'SYS_ADMIN';
                        const roleEntry = matrix.find((m: any) => m.role_id === role.id);
                        const permEntry = roleEntry?.permissions.find((p: any) => p.permission_id === perm.id);
                        const isGranted = isSysAdmin || (permEntry?.granted ?? false);

                        return (
                          <TableCell
                            key={role.id}
                            className="p-3 text-center border-s border-slate-100"
                          >
                            <div className="flex items-center justify-center">
                              {isSysAdmin ? (
                                <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 cursor-not-allowed">
                                  <Lock className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={toggleMutation.isPending}
                                  onClick={() =>
                                    toggleMutation.mutate({
                                      role_id: role.id,
                                      permission_id: perm.id,
                                    })
                                  }
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                    isGranted
                                      ? 'bg-teal-600 text-white shadow-xs hover:bg-teal-700'
                                      : 'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500 border border-slate-200'
                                  }`}
                                  title={isGranted ? 'انقر للتعطيل' : 'انقر للتفعيل'}
                                >
                                  {isGranted ? (
                                    <Check className="w-4 h-4 stroke-[3]" />
                                  ) : (
                                    <X className="w-3.5 h-3.5 stroke-[2]" />
                                  )}
                                </button>
                              )}
                            </div>
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
