import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import {
  Check, X, CheckCircle2, Search, Filter, LayoutGrid,
  ShieldCheck, Users, Monitor, BookOpen, ClipboardCheck,
  GraduationCap, Calendar, FolderGit2, BarChart3,
  Sliders, Eye, Shield
} from 'lucide-react';

const ROLE_LABELS: Record<string, { ar: string; en: string; icon?: any; color?: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام التقني', en: 'System Admin', icon: Monitor, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', en: 'Clinical Director', icon: ShieldCheck, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم الأكاديمي', en: 'Department Head', icon: GraduationCap, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  CLINICAL_SUPERVISOR: { ar: 'المشرف السريري', en: 'Clinical Supervisor', icon: Users, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  DEAN: { ar: 'عميد الكلية', en: 'Dean', icon: Shield, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  VICE_DEAN: { ar: 'نائب العميد', en: 'Vice Dean', icon: Shield, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  RTA: { ar: 'مساعد التدريب السريري', en: 'RTA', icon: ClipboardCheck, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ACADEMIC_ADVISOR: { ar: 'المرشد الأكاديمي', en: 'Academic Advisor', icon: BookOpen, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  QUALITY: { ar: 'مسؤول الجودة والاعتماد', en: 'Quality Officer', icon: BarChart3, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  ADMIN_ASSISTANT: { ar: 'مساعد إداري', en: 'Admin Assistant', icon: FolderGit2, color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

const MODULE_LABELS: Record<string, { ar: string; en: string; icon: any }> = {
  People: { ar: 'الكادر ورؤساء الأقسام والمشرفين', en: 'Staff & Supervisors', icon: Users },
  Students: { ar: 'شؤون الطلبة والدليل السريري', en: 'Students Directory', icon: GraduationCap },
  Grades: { ar: 'العلامات والتقييم الأكاديمي', en: 'Grades & Approvals', icon: ClipboardCheck },
  Distribution: { ar: 'التوزيع والجدول السريري', en: 'Distribution & Schedule', icon: Calendar },
  Rotations: { ar: 'الدورات والتناوب السريري', en: 'Clinical Rotations', icon: Sliders },
  Courses: { ar: 'المساقات والخطط الدراسية', en: 'Courses & Curriculum', icon: BookOpen },
  Attendance: { ar: 'سجل حضور وغياب التدريب', en: 'Attendance & Excuses', icon: ClipboardCheck },
  Assessment: { ar: 'بوابة التقييم السريري والإشراف', en: 'Clinical Assessments', icon: ShieldCheck },
  Correspondence: { ar: 'المراسلات (صندوق الوارد والصادر)', en: 'Inbox & Outbox', icon: FolderGit2 },
  Meetings: { ar: 'الاجتماعات ومحاضر الجلسات', en: 'Meetings & Minutes', icon: Calendar },
  Tasks: { ar: 'المهام والتكليفات والمتابعة', en: 'Tasks & Operations', icon: FolderGit2 },
  Reports: { ar: 'التقارير السنوية والإحصائيات', en: 'Reports Hub', icon: BarChart3 },
  Quality: { ar: 'الجودة والاعتماد الأكاديمي', en: 'Quality & Surveys', icon: BarChart3 },
  Advising: { ar: 'الإرشاد الأكاديمي والإنذار المبكر', en: 'Academic Advising', icon: BookOpen },
  Security: { ar: 'الأمان والمستخدمين والجلسات', en: 'Security & Users', icon: Monitor },
  AcademicYears: { ar: 'التقويم والأعوام الأكاديمية', en: 'Academic Calendar', icon: Calendar },
  Departments: { ar: 'الهيكل التنظيمي للأقسام', en: 'Departments Org', icon: LayoutGrid },
  Groups: { ar: 'المجموعات والشعب الطلابية', en: 'Student Cohorts', icon: Users },
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
  const [viewMode, setViewMode] = useState<'role_cards' | 'matrix_table'>('role_cards');
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [screensOnlyFilter, setScreensOnlyFilter] = useState(false);

  // Local optimistic state for immediate 0ms UI feedback
  const [localMatrix, setLocalMatrix] = useState<any[]>([]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-permission-matrix'],
    queryFn: () => apiFetch<any>('/admin/permissions/matrix'),
  });

  useEffect(() => {
    if (data?.matrix) {
      setLocalMatrix(data.matrix);
      if (!selectedRoleId && data.roles?.length > 0) {
        setSelectedRoleId(data.roles[0].id);
      }
    }
  }, [data, selectedRoleId]);

  const toggleMutation = useMutation({
    mutationFn: (body: { role_id: number; permission_id: number }) =>
      apiFetch('/admin/permissions/toggle', { method: 'POST', body }),
    onSuccess: (res: any) => {
      setToastMessage(res?.message || 'تم تحديث الصلاحية بنجاح.');
      setTimeout(() => setToastMessage(null), 2500);
    },
  });

  const handleToggle = (roleId: number, permId: number) => {
    // 1. Instant Optimistic Local Update (0ms delay, zero scroll jump)
    setLocalMatrix((prev) =>
      prev.map((roleEntry) => {
        if (roleEntry.role_id !== roleId) return roleEntry;
        return {
          ...roleEntry,
          permissions: roleEntry.permissions.map((p: any) => {
            if (p.permission_id !== permId) return p;
            return { ...p, granted: !p.granted };
          }),
        };
      })
    );

    // 2. Silent backend sync
    toggleMutation.mutate({ role_id: roleId, permission_id: permId });
  };

  const roles = data?.roles || [];
  const permissions = data?.permissions || [];

  // Group permissions by module
  const modules = useMemo<string[]>(() => {
    const mods = Array.from(new Set(permissions.map((p: any) => p.module as string))) as string[];
    return ['ALL', ...mods];
  }, [permissions]);

  // Filter permissions
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

  // Group filtered permissions by module for the Card view
  const permissionsByModule = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of filteredPermissions) {
      const mod = p.module || 'Other';
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return map;
  }, [filteredPermissions]);

  const selectedRole = roles.find((r: any) => r.id === selectedRoleId) || roles[0];
  const selectedRoleMatrix = localMatrix.find((m: any) => m.role_id === selectedRole?.id);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Page Header with Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="مصفوفة الصلاحيات والشاشات"
          description="تحديد الشاشات والصلاحيات المتاحة لكل مستخدم ودور في النظام مع حفظ مباشر وفوري."
        />

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('role_cards')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'role_cards'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>عرض حسب الدور (موصى به)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('matrix_table')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              viewMode === 'matrix_table'
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>الجدول الشامل (مصفوفة)</span>
          </button>
        </div>
      </div>

      {/* Floating Non-Intrusive Toast (Never shifts the page) */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Search & Filters */}
      <Card className="p-4 border-slate-200 shadow-xs space-y-3 rounded-3xl bg-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              placeholder="بحث سريع عن شاشة أو صلاحية (مثال: رؤساء الأقسام، المشرفين، علامات)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-hidden bg-slate-50/60"
            />
          </div>

          {/* Screens-only button */}
          <button
            type="button"
            onClick={() => setScreensOnlyFilter(!screensOnlyFilter)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all border ${
              screensOnlyFilter
                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>شاشات القائمة فقط</span>
          </button>
        </div>

        {/* Module Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
            <Filter className="w-3 h-3" /> الأقسام:
          </span>
          {modules.map((mod) => {
            const modLabel = mod === 'ALL' ? 'الكل' : MODULE_LABELS[mod]?.ar || mod;
            const isSelected = selectedModule === mod;
            return (
              <button
                key={mod}
                type="button"
                onClick={() => setSelectedModule(mod)}
                className={`px-3 py-1 rounded-xl text-[11.5px] font-bold whitespace-nowrap transition-all ${
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

      {/* VIEW 1: Role-Centric Cards View (Smooth, Stable, Zero-lag) */}
      {viewMode === 'role_cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Role Selector Tabs */}
          <div className="lg:col-span-4 space-y-2 sticky top-4">
            <div className="bg-slate-50 p-2.5 rounded-3xl border border-slate-200 space-y-1.5">
              <span className="px-3 text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                اختر الدور لتحديد صلاحياته وشاشاته:
              </span>
              {roles.map((role: any) => {
                const rInfo = ROLE_LABELS[role.code] || { ar: role.name || role.code, en: role.code };
                const Icon = rInfo.icon || Users;
                const isSelected = selectedRole?.id === role.id;

                // Count granted permissions for this role
                const rMatrix = localMatrix.find((m: any) => m.role_id === role.id);
                const grantedCount = rMatrix?.permissions?.filter((p: any) => p.granted)?.length || 0;

                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full text-right p-3 rounded-2xl font-bold transition-all flex items-center justify-between gap-3 border ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-600/20'
                        : 'bg-white text-slate-700 border-slate-200/80 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="truncate text-right">
                        <div className="text-xs font-black truncate">{rInfo.ar}</div>
                        <div className={`text-[10px] font-mono ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                          {role.code}
                        </div>
                      </div>
                    </div>

                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-mono font-bold shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {grantedCount} مفعلة
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Permission Groups for the Selected Role */}
          <div className="lg:col-span-8 space-y-5">
            {selectedRole && (
              <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 flex items-center justify-center font-black">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      صلاحيات دور: {ROLE_LABELS[selectedRole.code]?.ar || selectedRole.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      تفعيل أو إلغاء ظهور الشاشات والعمليات لهذا الدور مباشرة وبدون تأخير.
                    </p>
                  </div>
                </div>

                <span className="text-xs font-mono font-bold bg-slate-100 px-3 py-1.5 rounded-xl text-slate-700 border border-slate-200">
                  {selectedRole.code}
                </span>
              </div>
            )}

            {/* Permission Cards by Module */}
            {Array.from(permissionsByModule.entries()).map(([moduleName, perms]) => {
              const modInfo = MODULE_LABELS[moduleName] || { ar: moduleName, en: moduleName, icon: LayoutGrid };
              const ModIcon = modInfo.icon;

              return (
                <Card key={moduleName} className="rounded-3xl border-slate-200 shadow-xs overflow-hidden bg-white">
                  {/* Module Header */}
                  <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-teal-600 flex items-center justify-center shadow-2xs">
                        <ModIcon className="w-3.5 h-3.5" />
                      </div>
                      <h4 className="text-xs font-black text-slate-800">{modInfo.ar}</h4>
                      <span className="text-[10.5px] font-mono text-slate-400 font-semibold">({perms.length})</span>
                    </div>
                  </div>

                  {/* List of Permissions in Module */}
                  <div className="divide-y divide-slate-100 p-2">
                    {perms.map((perm: any) => {
                      const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code, en: perm.code };
                      const isScreen = permLabel.isScreen;
                      const permEntry = selectedRoleMatrix?.permissions?.find((p: any) => p.permission_id === perm.id);
                      const isGranted = permEntry?.granted ?? false;

                      return (
                        <div
                          key={perm.id}
                          onClick={() => selectedRole && handleToggle(selectedRole.id, perm.id)}
                          className={`p-3 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all duration-150 select-none ${
                            isGranted
                              ? 'bg-teal-50/40 hover:bg-teal-50/80 border border-teal-100/60'
                              : 'hover:bg-slate-50 border border-transparent'
                          }`}
                        >
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isGranted ? 'text-teal-950 font-black' : 'text-slate-700'}`}>
                                {permLabel.ar}
                              </span>
                              {isScreen && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-bold">
                                  <LayoutGrid className="w-2.5 h-2.5" /> شاشة
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 font-medium">
                              {perm.code}
                            </div>
                          </div>

                          {/* Toggle Button Switch */}
                          <div className="shrink-0 flex items-center">
                            <div
                              className={`w-12 h-6.5 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                                isGranted ? 'bg-teal-600' : 'bg-slate-200'
                              }`}
                            >
                              <div
                                className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out flex items-center justify-center ${
                                  isGranted ? 'translate-x-[-22px]' : 'translate-x-0'
                                }`}
                              >
                                {isGranted ? (
                                  <Check className="w-3 h-3 text-teal-600 stroke-[3]" />
                                ) : (
                                  <X className="w-2.5 h-2.5 text-slate-400 stroke-[3]" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: Full Matrix Table View (With Frozen Columns & Zero-Lag Local Updates) */}
      {viewMode === 'matrix_table' && (
        <Card className="border-slate-200 shadow-xs overflow-hidden rounded-3xl bg-white">
          <div className="overflow-x-auto max-h-[70vh]">
            <Table className="relative w-full border-collapse">
              <TableHeader className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 shadow-xs">
                <TableRow>
                  <TableHead className="w-72 min-w-[280px] p-4 text-right text-xs font-bold text-slate-700 bg-slate-50">
                    الصلاحية / الشاشة
                  </TableHead>
                  {roles.map((role: any) => {
                    const rLabel = ROLE_LABELS[role.code]?.ar || role.name || role.code;
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

                        {/* Checkboxes for each Role with zero-lag optimistic updates */}
                        {roles.map((role: any) => {
                          const roleEntry = localMatrix.find((m: any) => m.role_id === role.id);
                          const permEntry = roleEntry?.permissions?.find((p: any) => p.permission_id === perm.id);
                          const isGranted = permEntry?.granted ?? false;

                          return (
                            <TableCell
                              key={role.id}
                              className="p-3 text-center border-s border-slate-100"
                            >
                              <div className="flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggle(role.id, perm.id)}
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
      )}
    </div>
  );
}
