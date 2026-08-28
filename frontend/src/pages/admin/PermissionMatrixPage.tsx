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
  Eye, Shield, AlertTriangle, LockKeyhole
} from 'lucide-react';

const ROLE_LABELS: Record<string, { ar: string; icon?: any; color?: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام التقني', icon: Monitor, color: 'text-rose-600 bg-rose-50 border-rose-200' },
  CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', icon: ShieldCheck, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم الأكاديمي', icon: GraduationCap, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  CLINICAL_SUPERVISOR: { ar: 'المشرف السريري', icon: Users, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  DEAN: { ar: 'عميد الكلية', icon: Shield, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  VICE_DEAN: { ar: 'نائب العميد', icon: Shield, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  RTA: { ar: 'مساعد بحث وتدريس (TA)', icon: ClipboardCheck, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ACADEMIC_ADVISOR: { ar: 'المرشد الأكاديمي', icon: BookOpen, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  QUALITY: { ar: 'مسؤول الجودة والاعتماد', icon: BarChart3, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
  ADMIN_ASSISTANT: { ar: 'مساعد إداري', icon: FolderGit2, color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

const MODULE_LABELS: Record<string, { ar: string; icon: any }> = {
  People: { ar: 'الكادر ورؤساء الأقسام والمشرفين', icon: Users },
  Students: { ar: 'شؤون الطلبة والدليل السريري', icon: GraduationCap },
  Grades: { ar: 'العلامات والتقييم الأكاديمي', icon: ClipboardCheck },
  Distribution: { ar: 'التوزيع وإعداد الدورات والجدول السريري', icon: Calendar },
  Courses: { ar: 'المساقات والخطط الدراسية', icon: BookOpen },
  'Course Reports': { ar: 'تقارير المساقات السريرية', icon: BookOpen },
  Attendance: { ar: 'سجل حضور وغياب التدريب', icon: ClipboardCheck },
  Assessment: { ar: 'بوابة التقييم السريري والإشراف', icon: ShieldCheck },
  Correspondence: { ar: 'المراسلات (صندوق الوارد والصادر)', icon: FolderGit2 },
  Meetings: { ar: 'الاجتماعات ومحاضر الجلسات', icon: Calendar },
  Tasks: { ar: 'المهام والتكليفات والمتابعة', icon: FolderGit2 },
  Reports: { ar: 'التقارير السنوية والإحصائيات', icon: BarChart3 },
  Quality: { ar: 'الجودة والاعتماد الأكاديمي', icon: BarChart3 },
  KPIs: { ar: 'مؤشرات الأداء الرئيسية', icon: BarChart3 },
  Performance: { ar: 'تقارير الأداء الأكاديمي والسريري', icon: BarChart3 },
  Advising: { ar: 'الإرشاد الأكاديمي والإنذار المبكر', icon: BookOpen },
  Security: { ar: 'الأمان والمستخدمين والجلسات', icon: Monitor },
  System: { ar: 'إعدادات النظام وصحة السيرفر', icon: Monitor },
  'Academic Years': { ar: 'التقويم والأعوام الأكاديمية', icon: Calendar },
  AcademicYears: { ar: 'التقويم والأعوام الأكاديمية', icon: Calendar },
  Departments: { ar: 'الهيكل التنظيمي للأقسام', icon: LayoutGrid },
  Groups: { ar: 'المجموعات والشعب الطلابية', icon: Users },
  'Training Sites': { ar: 'المستشفيات ومواقع التدريب', icon: ShieldCheck },
  Partnerships: { ar: 'الاتفاقيات والشراكات السريرية', icon: ShieldCheck },
  GroupRegistration: { ar: 'تسجيل وتوزيع مجموعات الطلبة', icon: GraduationCap },
};

const PERMISSION_LABELS: Record<string, { ar: string; isScreen?: boolean }> = {
  // Students
  'students.view': { ar: 'دخول شاشة دليل الطلبة', isScreen: true },
  'students.create': { ar: 'إضافة طالب جديد / استيراد كشوفات' },
  'students.update': { ar: 'تعديل وتحديث بيانات الطلبة' },
  'students.delete': { ar: 'حذف سجلات الطلبة' },
  'students.export': { ar: 'تصدير كشوفات الطلبة' },

  // Grades
  'grades.view': { ar: 'دخول شاشة سجل العلامات والاعتماد', isScreen: true },
  'grades.create': { ar: 'رصد وإدخال العلامات للمساقات' },
  'rta_assignments.manage': { ar: 'إدارة تكليف مساعدي البحث والتدريس بالدفعات', isScreen: true },
  'grades.update': { ar: 'تعديل وتحديث مسودات العلامات' },
  'grades.lock': { ar: 'قفل العلامات ومنع التعديل' },
  'grades.approve': { ar: 'اعتماد العلامات رسمياً' },
  'grades.publish': { ar: 'نشر وإعلان العلامات للطلبة' },

  // Distribution
  'distribution.view': { ar: 'دخول شاشة إنشاء وإدارة التوزيع السريري', isScreen: true },
  'clinical_schedule.view': { ar: 'دخول شاشة الجدول السريري المنشور', isScreen: true },
  'distribution.create': { ar: 'إنشاء مخطط توزيع سريري جديد' },
  'distribution.generate': { ar: 'توليد التوزيع السريري آلياً' },
  'distribution.update': { ar: 'تعديل وتحديث بيانات التوزيع السريري' },
  'distribution.schedule_rows.manage': { ar: 'إضافة وتعديل وحذف صفوف الأطباء والشواغر في الجدول' },
  'distribution.student_portal.manage': { ar: 'تفعيل وتعطيل رابط استعلام الطلبة عن الجدول السريري' },
  'distribution.validate': { ar: 'التحقق من صحة التوزيع وتفادي التعارض' },
  'distribution.approve': { ar: 'اعتماد التوزيع السريري رسمياً' },
  'distribution.publish': { ar: 'نشر وتعميم التوزيع السريري للطلبة' },
  'distribution.revise': { ar: 'إنشاء نسخة لتعديل جدول سريري منشور' },
  'distribution.unpublish': { ar: 'إلغاء نشر الجدول السريري وإخفاؤه' },
  'distribution.delete': { ar: 'حذف التوزيع السريري' },
  'distribution.override': { ar: 'تجاوز واستثناء قيود التوزيع السريري' },

  // Rotations
  'rotations.view': { ar: 'عرض الدورات السريرية في شاشة التوزيع' },
  'rotations.create': { ar: 'إنشاء جدول الأسابيع لمساق سريري' },
  'rotations.update': { ar: 'تعديل إعدادات جدول المساق السريري' },
  'rotations.delete': { ar: 'حذف دورة سريرية' },

  // Attendance
  'attendance.view': { ar: 'دخول شاشة سجل الحضور والغياب', isScreen: true },
  'attendance.record': { ar: 'تسجيل وتأكيد حضور الطلبة' },
  'attendance.excuse': { ar: 'قبول وتوثيق الأعذار الطبية' },
  'attendance.notify': { ar: 'إرسال إنذارات الغياب عبر البريد الجامعي' },

  // Assessment
  'assessment.view': { ar: 'دخول بوابة التقييم والإشراف السريري', isScreen: true },
  'assessment.create': { ar: 'إدخال تقييم سريري جديد' },
  'assessment.submit': { ar: 'رفع وتسليم التقييم السريري' },
  'assessment.approve': { ar: 'اعتماد التقييمات السريرية (20)' },
  'supervisor.workspace.view': { ar: 'دخول مساحة العمل الشخصية للمشرف السريري', isScreen: true },

  // Courses & Course Reports
  'courses.view': { ar: 'دخول شاشة مساقات الدائرة السريرية', isScreen: true },
  'courses.manage': { ar: 'إدارة وتعديل المساقات والخطط الدراسية' },
  'course_report.manage': { ar: 'إعداد وإدارة تقارير المساقات السريرية' },
  'course_report.approve': { ar: 'اعتماد تقارير المساقات السريرية' },

  // Advising
  'advising.view': { ar: 'دخول شاشة الإرشاد الأكاديمي والإنذار المبكر', isScreen: true },
  'advising.manage': { ar: 'إدارة جلسات وسجلات الإرشاد' },
  'advising.assign': { ar: 'تعيين وتغيير المرشدين الأكاديميين للطلبة' },
  'advising.export_pdf': { ar: 'تصدير ملفات وتقارير الإرشاد' },

  // Quality & KPIs & Performance
  'quality.view': { ar: 'دخول شاشة الجودة والاعتماد الأكاديمي', isScreen: true },
  'quality.manage': { ar: 'إدارة الاستبيانات وخطط التحسين' },
  'kpi.manage': { ar: 'إدارة واحتساب مؤشرات الأداء الرئيسية' },
  'performance.view': { ar: 'مراقبة تقارير الأداء الأكاديمي والسريري' },
  'department_head_evaluations.view': { ar: 'دخول سجل تقييم رؤساء الأقسام الرسمي', isScreen: true },
  'department_head_evaluations.create': { ar: 'إنشاء وتعديل وتوقيع تقييم رئيس قسم' },
  'department_head_evaluations.approve': { ar: 'اعتماد التقييم النهائي وتوقيع العميد' },
  'clinical_supervisor_evaluations.view': { ar: 'دخول سجل التقييم الرسمي للمشرفين السريريين', isScreen: true },
  'clinical_supervisor_evaluations.create': { ar: 'إنشاء وتعديل وتوقيع تقييم مشرف سريري' },
  'clinical_supervisor_evaluations.approve': { ar: 'اعتماد التقييم النهائي للمشرف السريري' },
  'clinical_supervisor_evaluations.export': { ar: 'طباعة أو تصدير تقييم مشرف سريري' },
  'department_head_evaluations.export': { ar: 'طباعة أو تصدير نموذج تقييم رئيس قسم' },

  // Correspondence
  'correspondence.view': { ar: 'دخول شاشات المراسلات (الوارد والصادر)', isScreen: true },
  'correspondence.create': { ar: 'إنشاء وإرسال معاملة جديدة' },
  'correspondence.update': { ar: 'تعديل بيانات المعاملة' },
  'correspondence.submit': { ar: 'إرسال المعاملة للموافقة' },
  'correspondence.forward': { ar: 'تحويل وتوجيه المعاملات' },
  'correspondence.approve': { ar: 'الموافقة على الطلبات والمعاملات' },
  'correspondence.close': { ar: 'إغلاق وأرشفة المعاملات' },

  // Meetings & Tasks
  'meetings.manage': { ar: 'دخول وإدارة شاشة محاضر الاجتماعات', isScreen: true },
  'meetings.approve_minutes': { ar: 'اعتماد محاضر الاجتماعات رسمياً' },
  'tasks.view': { ar: 'دخول شاشة المهام والتكليفات', isScreen: true },
  'tasks.manage': { ar: 'إشهار وإسناد المهام والمتابعة' },

  // Reports
  'reports.view': { ar: 'دخول شاشة التقارير السنوية والإحصائيات', isScreen: true },
  'reports.export': { ar: 'تصدير التقارير والإحصائيات' },

  // Security & Users & System
  'users.view': { ar: 'عرض قائمة المستخدمين والحسابات' },
  'users.manage': { ar: 'دخول وإدارة شاشات المستخدمين والجلسات الحية', isScreen: true },
  'roles.manage': { ar: 'دخول وإدارة شاشة مصفوفة الصلاحيات', isScreen: true },
  'audit.view': { ar: 'دخول شاشة سجل العمليات والتدقيق', isScreen: true },
  'settings.manage': { ar: 'دخول شاشات صحة السيرفر والإعدادات والنسخ الاحتياطي', isScreen: true },

  // Academic Years
  'academic_years.view': { ar: 'عرض الأعوام والتقويم الأكاديمي' },
  'academic_years.manage': { ar: 'دخول وإدارة شاشة التقويم الأكاديمي', isScreen: true },

  // Departments & People
  'departments.view': { ar: 'عرض دليل الأقسام الأكاديمية', isScreen: true },
  'departments.manage': { ar: 'إدارة الهيكل التنظيمي للأقسام' },
  'people.view': { ar: 'دخول شاشة المشرفين السريريين والكادر', isScreen: true },
  'people.manage': { ar: 'إدارة الكادر وإضافة أطباء المستشفيات وحسابات المشرفين', isScreen: true },

  // Groups & Sites & Partnerships
  'groups.view': { ar: 'عرض المجموعات والشعب الطلابية' },
  'groups.manage': { ar: 'إدارة وتشكيل المجموعات والشعب' },
  'training_sites.view': { ar: 'عرض المستشفيات ومواقع التدريب السريري' },
  'training_sites.manage': { ar: 'إدارة وتخصيص مواقع التدريب والمستشفيات' },
  'partnerships.view': { ar: 'عرض الاتفاقيات والشراكات السريرية' },
  'partnerships.manage': { ar: 'إدارة وتوثيق الشراكات السريرية' },

  // Student group self-registration
  'group_registration.view': { ar: 'دخول شاشة تسجيل مجموعات الطلبة', isScreen: true },
  'group_registration.manage_roster': { ar: 'استيراد وإدارة قائمة طلبة دورة التسجيل' },
  'group_registration.manage_groups': { ar: 'إنشاء وتعديل وحذف الدورات والمجموعات الفرعية' },
  'group_registration.open_close': { ar: 'فتح وإغلاق بوابة تسجيل الطلبة' },
  'group_registration.override': { ar: 'تسجيل الطالب أو سحبه إدارياً من مجموعة' },
  'group_registration.export': { ar: 'تصدير نتائج تسجيل المجموعات' },
};

function displayModule(module: string): string {
  return module === 'Rotations' ? 'Distribution' : module;
}

export function PermissionMatrixPage() {
  const [viewMode, setViewMode] = useState<'role_cards' | 'matrix_table'>('role_cards');
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [screensOnlyFilter, setScreensOnlyFilter] = useState(false);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

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
    mutationFn: (body: { role_id: number; permission_id: number; granted: boolean }) =>
      apiFetch('/admin/permissions/toggle', { method: 'POST', body }),
    onSuccess: (res: any) => {
      setLocalMatrix((previous) => previous.map((roleEntry) => roleEntry.role_id !== res.role_id
        ? roleEntry
        : {
            ...roleEntry,
            permissions: roleEntry.permissions.map((permission: any) => permission.permission_id !== res.permission_id
              ? permission
              : { ...permission, granted: Boolean(res.granted) }),
          }));
      setToastMessage('تم تحديث الصلاحية وحفظها بنجاح.');
      setPendingCells((previous) => {
        const next = new Set(previous);
        next.delete(`${res.role_id}:${res.permission_id}`);
        return next;
      });
      setTimeout(() => setToastMessage(null), 2500);
    },
    onError: (_error, variables) => {
      setPendingCells((previous) => {
        const next = new Set(previous);
        next.delete(`${variables.role_id}:${variables.permission_id}`);
        return next;
      });
      setToastMessage('تعذر حفظ الصلاحية؛ تمت استعادة الحالة المسجلة في الخادم.');
      void refetch();
      setTimeout(() => setToastMessage(null), 3500);
    },
  });

  const handleToggle = (roleId: number, permId: number) => {
    const cellKey = `${roleId}:${permId}`;
    if (pendingCells.has(cellKey)) return;
    const roleEntry = localMatrix.find((entry: any) => entry.role_id === roleId);
    const current = roleEntry?.permissions?.find((permission: any) => permission.permission_id === permId)?.granted ?? false;
    const nextGranted = !current;
    const role = roles.find((entry: any) => entry.id === roleId);
    const permission = permissions.find((entry: any) => entry.id === permId);
    if (role?.code === 'SYS_ADMIN' && permission?.code === 'roles.manage' && !nextGranted) {
      setToastMessage('هذه الصلاحية أساسية ولا يمكن تعطيلها عن مدير النظام.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }
    setPendingCells((previous) => new Set(previous).add(cellKey));
    // 1. Instant Optimistic Local Update (0ms delay, zero scroll jump)
    setLocalMatrix((prev) =>
      prev.map((roleEntry) => {
        if (roleEntry.role_id !== roleId) return roleEntry;
        return {
          ...roleEntry,
          permissions: roleEntry.permissions.map((p: any) => {
            if (p.permission_id !== permId) return p;
            return { ...p, granted: nextGranted };
          }),
        };
      })
    );

    // 2. Silent backend sync
    toggleMutation.mutate({ role_id: roleId, permission_id: permId, granted: nextGranted });
  };

  const roles = data?.roles || [];
  const permissions = data?.permissions || [];
  const audit = data?.audit;
  const unlabeledPermissions = permissions.filter((permission: any) => !PERMISSION_LABELS[permission.code]);

  // Group permissions by module
  const modules = useMemo<string[]>(() => {
    const mods = Array.from(new Set(permissions.map((p: any) => displayModule(p.module as string)))) as string[];
    return ['ALL', ...mods];
  }, [permissions]);

  // Filter permissions
  const filteredPermissions = useMemo(() => {
    return permissions.filter((perm: any) => {
      const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code };
      const matchesSearch =
        search.trim() === '' ||
        permLabel.ar.includes(search) ||
        perm.code.toLowerCase().includes(search.toLowerCase());
      const matchesModule = selectedModule === 'ALL' || displayModule(perm.module) === selectedModule;
      const matchesScreensOnly = !screensOnlyFilter || permLabel.isScreen;

      return matchesSearch && matchesModule && matchesScreensOnly;
    });
  }, [permissions, search, selectedModule, screensOnlyFilter]);

  // Group filtered permissions by module for the Card view
  const permissionsByModule = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const p of filteredPermissions) {
      const mod = displayModule(p.module || 'Other');
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
          title="مصفوفة الصلاحيات والتحكم بالشاشات"
          description="تحديد الشاشات والصلاحيات المتاحة لكل مستخدم ودور في النظام مع الحفظ المباشر."
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

      {/* Floating Toast */}
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
              placeholder="بحث في الشاشات أو الصلاحيات (مثال: رؤساء الأقسام، المشرفين، علامات)..."
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-slate-200 p-4">
          <p className="text-[11px] font-bold text-slate-500">إجمالي الصلاحيات</p>
          <p className="mt-1 text-2xl font-black text-teal-700">{permissions.length}</p>
        </Card>
        <Card className="rounded-3xl border-slate-200 p-4">
          <p className="text-[11px] font-bold text-slate-500">الأدوار المعرفة</p>
          <p className="mt-1 text-2xl font-black text-teal-700">{roles.length}</p>
        </Card>
        <Card className="rounded-3xl border-slate-200 p-4">
          <p className="text-[11px] font-bold text-slate-500">أكواد حماية مسارات API</p>
          <p className="mt-1 text-2xl font-black text-teal-700">{audit?.guarded_permission_codes ?? '—'}</p>
        </Card>
        <Card className={`rounded-3xl p-4 ${audit?.is_complete && unlabeledPermissions.length === 0 ? 'border-teal-100 bg-teal-50/40' : 'border-amber-200 bg-amber-50/60'}`}>
          <div className="flex items-center gap-2">
            {audit?.is_complete && unlabeledPermissions.length === 0
              ? <ShieldCheck className="h-4 w-4 text-teal-600" />
              : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            <p className="text-[11px] font-black text-slate-700">تغطية المصفوفة</p>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-600">
            {audit?.is_complete && unlabeledPermissions.length === 0
              ? 'مكتملة: جميع الصلاحيات محمية ومعنونة'
              : `${audit?.missing_route_permissions?.length ?? 0} مفقودة · ${unlabeledPermissions.length} بلا عنوان واضح`}
          </p>
        </Card>
      </div>

      {audit && !audit.is_complete && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
          توجد أكواد مستخدمة لحماية مسارات وليست مسجلة في المصفوفة: {audit.missing_route_permissions.join('، ')}
        </div>
      )}

      {/* VIEW 1: Role-Centric Cards View (100% Arabic) */}
      {viewMode === 'role_cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Role Selector Tabs */}
          <div className="lg:col-span-4 space-y-2 sticky top-4">
            <div className="bg-slate-50 p-2.5 rounded-3xl border border-slate-200 space-y-1.5">
              <span className="px-3 text-[11px] font-black text-slate-400 uppercase tracking-wider block mb-2">
                اختر الدور لتحديد صلاحياته وشاشاته:
              </span>
              {roles.map((role: any) => {
                const rInfo = ROLE_LABELS[role.code] || { ar: role.name || role.code };
                const Icon = rInfo.icon || Users;
                const isSelected = selectedRole?.id === role.id;

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
                        <div className={`mt-0.5 text-[10px] ${isSelected ? 'text-white/75' : 'text-slate-400'}`}>
                          {role.users_count ?? 0} مستخدم
                        </div>
                      </div>
                    </div>

                    <span className={`text-[11px] px-2 py-0.5 rounded-lg font-bold shrink-0 ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {grantedCount} مفعّل
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Permission Groups for Selected Role */}
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
                    <p className="mt-1 text-[11px] font-bold text-amber-700">
                      المستخدمون المتأثرون يحتاجون تحديث الصفحة أو تسجيل الدخول مجددًا بعد تغيير صلاحيات دورهم.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Permission Cards by Module */}
            {Array.from(permissionsByModule.entries()).map(([moduleName, perms]) => {
              const modInfo = MODULE_LABELS[moduleName] || { ar: moduleName, icon: LayoutGrid };
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
                      <span className="text-[10.5px] text-slate-400 font-bold">({perms.length})</span>
                    </div>
                  </div>

                  {/* List of Permissions in Module */}
                  <div className="divide-y divide-slate-100 p-2">
                    {perms.map((perm: any) => {
                      const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code };
                      const isScreen = permLabel.isScreen;
                      const permEntry = selectedRoleMatrix?.permissions?.find((p: any) => p.permission_id === perm.id);
                      const isGranted = permEntry?.granted ?? false;
                      const isPending = selectedRole ? pendingCells.has(`${selectedRole.id}:${perm.id}`) : false;
                      const isLocked = selectedRole?.code === 'SYS_ADMIN' && perm.code === 'roles.manage';

                      return (
                        <div
                          key={perm.id}
                          onClick={() => selectedRole && !isPending && handleToggle(selectedRole.id, perm.id)}
                          className={`p-3 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all duration-150 select-none ${
                            isGranted
                              ? 'bg-teal-50/40 hover:bg-teal-50/80 border border-teal-100/60'
                              : 'hover:bg-slate-50 border border-transparent'
                          } ${isPending ? 'pointer-events-none opacity-60' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold ${isGranted ? 'text-teal-950 font-black' : 'text-slate-700'}`}>
                                {permLabel.ar}
                              </span>
                              {isScreen && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-bold">
                                  <LayoutGrid className="w-2.5 h-2.5" /> شاشة
                                </span>
                              )}
                              {isLocked && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  <LockKeyhole className="h-2.5 w-2.5" /> أساسية
                                </span>
                              )}
                            </div>
                            <p dir="ltr" className="mt-1 text-left font-mono text-[10px] text-slate-400">{perm.code}</p>
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

      {/* VIEW 2: Full Matrix Table View (100% Arabic) */}
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
                    const permLabel = PERMISSION_LABELS[perm.code] || { ar: perm.code };
                    const isScreen = permLabel.isScreen;
                    return (
                      <TableRow
                        key={perm.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                        }`}
                      >
                        {/* Permission Title */}
                        <TableCell className="p-3.5">
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
                        </TableCell>

                        {/* Checkboxes for each Role */}
                        {roles.map((role: any) => {
                          const roleEntry = localMatrix.find((m: any) => m.role_id === role.id);
                          const permEntry = roleEntry?.permissions?.find((p: any) => p.permission_id === perm.id);
                          const isGranted = permEntry?.granted ?? false;
                          const isPending = pendingCells.has(`${role.id}:${perm.id}`);
                          const isLocked = role.code === 'SYS_ADMIN' && perm.code === 'roles.manage';

                          return (
                            <TableCell
                              key={role.id}
                              className="p-3 text-center border-s border-slate-100"
                            >
                              <div className="flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleToggle(role.id, perm.id)}
                                  disabled={isPending}
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                    isGranted
                                      ? 'bg-teal-600 text-white shadow-xs hover:bg-teal-700'
                                      : 'bg-slate-100 text-slate-300 hover:bg-slate-200 hover:text-slate-500 border border-slate-200'
                                  } ${isPending ? 'cursor-wait opacity-50' : ''}`}
                                  title={isLocked ? 'صلاحية أساسية لمدير النظام' : isGranted ? 'انقر للتعطيل' : 'انقر للتفعيل'}
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
