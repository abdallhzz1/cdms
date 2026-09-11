import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FolderGit2,
  GraduationCap,
  LayoutGrid,
  Loader2,
  Monitor,
  Search,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { apiFetch } from '@/api/client';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';

type Icon = ComponentType<{ className?: string }>;
type Role = { id: number; code: string; name: string; users_count: number };
type Permission = { id: number; code: string; module: string; action: string };
type MatrixPermission = { permission_id: number; granted: boolean };
type MatrixRole = { role_id: number; permissions: MatrixPermission[] };
type MatrixResponse = { roles: Role[]; permissions: Permission[]; matrix: MatrixRole[] };

const ROLE_LABELS: Record<string, { label: string; icon: Icon }> = {
  SYS_ADMIN: { label: 'مدير النظام التقني', icon: Monitor },
  CLINICAL_DIRECTOR: { label: 'مدير الدائرة السريرية', icon: ShieldCheck },
  DEPARTMENT_HEAD: { label: 'رئيس القسم الأكاديمي', icon: GraduationCap },
  CLINICAL_SUPERVISOR: { label: 'المشرف السريري', icon: Users },
  DEAN: { label: 'عميد الكلية', icon: Shield },
  VICE_DEAN: { label: 'نائب العميد', icon: Shield },
  RTA: { label: 'مساعد البحث والتدريس', icon: ClipboardCheck },
  ACADEMIC_ADVISOR: { label: 'المرشد الأكاديمي', icon: BookOpen },
  QUALITY: { label: 'مسؤول الجودة والاعتماد', icon: BarChart3 },
  ADMIN_ASSISTANT: { label: 'المساعد الإداري', icon: FolderGit2 },
};

const MODULES: Record<string, { label: string; icon: Icon }> = {
  People: { label: 'الكادر والمشرفون', icon: Users },
  Students: { label: 'شؤون الطلبة', icon: GraduationCap },
  Grades: { label: 'العلامات الأكاديمية', icon: ClipboardCheck },
  Distribution: { label: 'التوزيع والجدول السريري', icon: CalendarDays },
  Rotations: { label: 'التوزيع والجدول السريري', icon: CalendarDays },
  Courses: { label: 'المساقات والخطط الدراسية', icon: BookOpen },
  'Course Reports': { label: 'تقارير المساقات السريرية', icon: BookOpen },
  Attendance: { label: 'الحضور والغياب', icon: ClipboardCheck },
  Assessment: { label: 'التقييم والإشراف السريري', icon: ShieldCheck },
  'Clinical Supervisor Evaluations': { label: 'تقييم المشرفين السريريين', icon: ClipboardCheck },
  'Department Head Evaluations': { label: 'تقييم رؤساء الأقسام', icon: ClipboardCheck },
  Correspondence: { label: 'المراسلات', icon: FolderGit2 },
  Meetings: { label: 'الاجتماعات', icon: CalendarDays },
  Tasks: { label: 'المهام والتكليفات', icon: FolderGit2 },
  Reports: { label: 'التقارير والإحصائيات', icon: BarChart3 },
  Quality: { label: 'الجودة والاعتماد', icon: BarChart3 },
  KPIs: { label: 'مؤشرات الأداء', icon: BarChart3 },
  Performance: { label: 'تقارير الأداء', icon: BarChart3 },
  Advising: { label: 'الإرشاد الأكاديمي', icon: BookOpen },
  Security: { label: 'المستخدمون والصلاحيات', icon: Shield },
  System: { label: 'إعدادات النظام', icon: Monitor },
  'Approval Workflows': { label: 'إعداد مسارات الاعتماد', icon: ShieldCheck },
  Approvals: { label: 'مركز الاعتمادات', icon: ShieldCheck },
  'Academic Years': { label: 'الأعوام الأكاديمية', icon: CalendarDays },
  AcademicYears: { label: 'الأعوام الأكاديمية', icon: CalendarDays },
  Departments: { label: 'الأقسام الأكاديمية', icon: LayoutGrid },
  Groups: { label: 'المجموعات الطلابية', icon: Users },
  'Training Sites': { label: 'المستشفيات ومواقع التدريب', icon: ShieldCheck },
  Partnerships: { label: 'الشراكات السريرية', icon: ShieldCheck },
  GroupRegistration: { label: 'تسجيل مجموعات الطلبة', icon: GraduationCap },
};

const PERMISSION_LABELS: Record<string, string> = {
  'students.view': 'عرض دليل الطلبة',
  'students.create': 'إضافة الطلبة واستيراد كشوفاتهم',
  'students.update': 'تعديل بيانات الطلبة',
  'students.delete': 'حذف سجلات الطلبة',
  'students.export': 'تصدير كشوفات الطلبة',
  'grades.view': 'عرض سجل العلامات',
  'grades.create': 'إدخال العلامات',
  'grades.update': 'تعديل العلامات',
  'grades.lock': 'قفل العلامات ومنع تعديلها',
  'grades.approve': 'اعتماد العلامات',
  'rta_assignments.manage': 'إدارة تكليفات مساعدي البحث والتدريس',
  'distribution.view': 'عرض شاشة التوزيع السريري',
  'clinical_schedule.view': 'عرض الجدول السريري المنشور',
  'distribution.create': 'إنشاء توزيع سريري',
  'distribution.generate': 'توليد التوزيع آليًا',
  'distribution.update': 'تعديل التوزيع السريري',
  'distribution.schedule_rows.manage': 'إدارة صفوف الأطباء والشواغر',
  'distribution.student_portal.manage': 'إدارة بوابة استعلام الطلبة',
  'distribution.validate': 'فحص تعارضات التوزيع',
  'distribution.approve': 'اعتماد التوزيع السريري',
  'distribution.publish': 'نشر التوزيع السريري',
  'distribution.revise': 'إنشاء نسخة لتعديل جدول منشور',
  'distribution.unpublish': 'إلغاء نشر الجدول',
  'distribution.delete': 'حذف التوزيع السريري',
  'distribution.override': 'تجاوز قيود التوزيع استثنائيًا',
  'rotations.view': 'عرض الدورات السريرية',
  'rotations.create': 'إنشاء جدول أسابيع المساق',
  'rotations.update': 'تعديل إعدادات جدول المساق',
  'rotations.delete': 'حذف دورة سريرية',
  'attendance.view': 'عرض سجل الحضور والغياب',
  'attendance.record': 'تسجيل حضور الطلبة',
  'attendance.excuse': 'توثيق أعذار الغياب',
  'attendance.notify': 'إرسال إنذارات الغياب',
  'assessment.view': 'عرض بوابة التقييم السريري',
  'assessment.create': 'إدخال تقييم سريري',
  'assessment.submit': 'تسليم التقييم السريري',
  'assessment.criteria.manage': 'إدارة معايير نموذج التقييم',
  'supervisor.workspace.view': 'عرض مساحة عمل المشرف السريري',
  'courses.view': 'عرض المساقات',
  'courses.manage': 'إدارة المساقات والخطط الدراسية',
  'course_report.manage': 'إعداد تقارير المساقات السريرية',
  'course_report.approve': 'اعتماد تقارير المساقات',
  'advising.view': 'عرض الإرشاد الأكاديمي',
  'advising.manage': 'إدارة جلسات الإرشاد',
  'advising.assign': 'تعيين المرشدين الأكاديميين',
  'advising.export_pdf': 'تصدير تقارير الإرشاد',
  'quality.view': 'عرض مركز الجودة والاعتماد',
  'quality.manage': 'إدارة أعمال الجودة والتحسين',
  'kpi.manage': 'إدارة مؤشرات الأداء',
  'performance.view': 'عرض تقارير الأداء',
  'clinical_supervisor_evaluations.view': 'عرض تقييمات المشرفين السريريين',
  'clinical_supervisor_evaluations.create': 'إنشاء وتعديل تقييم مشرف سريري',
  'clinical_supervisor_evaluations.approve': 'اعتماد تقييم مشرف سريري',
  'clinical_supervisor_evaluations.export': 'تصدير تقييم مشرف سريري',
  'department_head_evaluations.view': 'عرض تقييمات رؤساء الأقسام',
  'department_head_evaluations.create': 'إنشاء وتعديل تقييم رئيس قسم',
  'department_head_evaluations.approve': 'اعتماد تقييم رئيس قسم',
  'department_head_evaluations.export': 'تصدير تقييم رئيس قسم',
  'correspondence.view': 'عرض المراسلات',
  'correspondence.create': 'إنشاء معاملة جديدة',
  'correspondence.update': 'تعديل المعاملات',
  'correspondence.submit': 'إرسال المعاملة للموافقة',
  'correspondence.forward': 'تحويل المعاملات',
  'correspondence.approve': 'الموافقة على المعاملات',
  'correspondence.close': 'إغلاق وأرشفة المعاملات',
  'meetings.manage': 'إدارة الاجتماعات والمحاضر',
  'meetings.approve_minutes': 'اعتماد محاضر الاجتماعات',
  'approval_workflows.view': 'عرض إعداد مسارات الاعتماد',
  'approval_workflows.manage': 'تعديل مسارات الاعتماد',
  'approvals.view': 'عرض مركز الاعتمادات',
  'approvals.decide': 'اتخاذ قرار الاعتماد',
  'tasks.view': 'عرض المهام والتكليفات',
  'tasks.manage': 'إدارة وإسناد المهام',
  'reports.view': 'عرض التقارير والإحصائيات',
  'reports.export': 'تصدير التقارير',
  'users.view': 'عرض المستخدمين',
  'users.manage': 'إدارة المستخدمين والجلسات',
  'roles.manage': 'إدارة أدوار وصلاحيات النظام',
  'audit.view': 'عرض سجل العمليات',
  'settings.manage': 'إدارة إعدادات النظام',
  'academic_years.view': 'عرض الأعوام الأكاديمية',
  'academic_years.manage': 'إدارة الأعوام والتقويم الأكاديمي',
  'departments.view': 'عرض الأقسام الأكاديمية',
  'departments.manage': 'إدارة الأقسام الأكاديمية',
  'people.view': 'عرض الكادر والمشرفين',
  'people.manage': 'إدارة الكادر والمشرفين',
  'groups.view': 'عرض المجموعات الطلابية',
  'groups.manage': 'إدارة المجموعات الطلابية',
  'training_sites.view': 'عرض المستشفيات ومواقع التدريب',
  'training_sites.manage': 'إدارة المستشفيات ومواقع التدريب',
  'partnerships.view': 'عرض الشراكات السريرية',
  'partnerships.manage': 'إدارة الشراكات السريرية',
  'group_registration.view': 'عرض تسجيل مجموعات الطلبة',
  'group_registration.manage_roster': 'إدارة قائمة الطلبة المسجلين',
  'group_registration.manage_groups': 'إدارة الدورات والمجموعات الفرعية',
  'group_registration.open_close': 'فتح وإغلاق بوابة التسجيل',
  'group_registration.override': 'تسجيل أو سحب طالب إداريًا',
  'group_registration.export': 'تصدير نتائج التسجيل',
};

const ACTION_LABELS: Record<string, string> = {
  VIEW: 'عرض', CREATE: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف', MANAGE: 'إدارة',
  APPROVE: 'اعتماد', EXPORT: 'تصدير', PUBLISH: 'نشر', SUBMIT: 'تسليم', LOCK: 'قفل',
  GENERATE: 'توليد', VALIDATE: 'تحقق', OVERRIDE: 'تجاوز', RECORD: 'تسجيل', NOTIFY: 'إشعار',
};

function normalizedModule(module: string) {
  return module === 'Rotations' ? 'Distribution' : module;
}

function moduleInfo(module: string) {
  return MODULES[module] ?? { label: 'صلاحيات إضافية', icon: LayoutGrid };
}

function permissionLabel(permission: Permission) {
  if (PERMISSION_LABELS[permission.code]) return PERMISSION_LABELS[permission.code];
  const action = ACTION_LABELS[permission.action] ?? 'استخدام';
  return `${action} ${moduleInfo(normalizedModule(permission.module)).label}`;
}

export function PermissionMatrixPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [matrix, setMatrix] = useState<MatrixRole[]>([]);
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('ALL');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-permission-matrix'],
    queryFn: () => apiFetch<MatrixResponse>('/admin/permissions/matrix'),
  });

  const roles = data?.roles ?? [];
  const permissions = data?.permissions ?? [];

  useEffect(() => {
    if (!data) return;
    setMatrix(data.matrix);
    setSelectedRoleId((current) => current ?? data.roles[0]?.id ?? null);
  }, [data]);

  const toggleMutation = useMutation({
    mutationFn: (body: { role_id: number; permission_id: number; granted: boolean }) =>
      apiFetch<{ role_id: number; permission_id: number; granted: boolean }>('/admin/permissions/toggle', { method: 'POST', body }),
    onSuccess: (result) => {
      setMatrix((current) => current.map((role) => role.role_id !== result.role_id ? role : {
        ...role,
        permissions: role.permissions.map((permission) => permission.permission_id === result.permission_id
          ? { ...permission, granted: Boolean(result.granted) }
          : permission),
      }));
      setPending((current) => {
        const next = new Set(current);
        next.delete(`${result.role_id}:${result.permission_id}`);
        return next;
      });
      setNotice({ text: 'تم حفظ التغيير' });
      window.setTimeout(() => setNotice(null), 1800);
    },
    onError: (_error, variables) => {
      setPending((current) => {
        const next = new Set(current);
        next.delete(`${variables.role_id}:${variables.permission_id}`);
        return next;
      });
      setNotice({ text: 'تعذر حفظ التغيير، أُعيدت الحالة السابقة', error: true });
      void refetch();
      window.setTimeout(() => setNotice(null), 3500);
    },
  });

  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const selectedMatrix = matrix.find((role) => role.role_id === selectedRole?.id);
  const grantedIds = useMemo(() => new Set(
    selectedMatrix?.permissions.filter((permission) => permission.granted).map((permission) => permission.permission_id) ?? [],
  ), [selectedMatrix]);

  const moduleOptions = useMemo(() => Array.from(new Set(permissions.map((permission) => normalizedModule(permission.module)))), [permissions]);
  const groupedPermissions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    const groups = new Map<string, Permission[]>();
    permissions.forEach((permission) => {
      const module = normalizedModule(permission.module);
      if (selectedModule !== 'ALL' && module !== selectedModule) return;
      if (query && !permissionLabel(permission).toLocaleLowerCase('ar').includes(query)) return;
      groups.set(module, [...(groups.get(module) ?? []), permission]);
    });
    return Array.from(groups.entries());
  }, [permissions, search, selectedModule]);

  useEffect(() => {
    if (expandedModules.size === 0 && moduleOptions[0]) setExpandedModules(new Set([moduleOptions[0]]));
  }, [expandedModules.size, moduleOptions]);

  const togglePermission = (permission: Permission) => {
    if (!selectedRole) return;
    const key = `${selectedRole.id}:${permission.id}`;
    if (pending.has(key)) return;
    const currentlyGranted = grantedIds.has(permission.id);
    if (selectedRole.code === 'SYS_ADMIN' && permission.code === 'roles.manage' && currentlyGranted) {
      setNotice({ text: 'هذه صلاحية أساسية لمدير النظام ولا يمكن تعطيلها', error: true });
      window.setTimeout(() => setNotice(null), 3000);
      return;
    }
    setPending((current) => new Set(current).add(key));
    setMatrix((current) => current.map((role) => role.role_id !== selectedRole.id ? role : {
      ...role,
      permissions: role.permissions.map((item) => item.permission_id === permission.id
        ? { ...item, granted: !currentlyGranted }
        : item),
    }));
    toggleMutation.mutate({ role_id: selectedRole.id, permission_id: permission.id, granted: !currentlyGranted });
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const selectedRoleInfo = ROLE_LABELS[selectedRole?.code] ?? { label: 'دور مستخدم', icon: Users };
  const SelectedRoleIcon = selectedRoleInfo.icon;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-16">
      <PageHeader title="إدارة صلاحيات الأدوار" description="اختر الدور، ثم فعّل فقط الشاشات والعمليات التي يحتاجها." />

      {notice && (
        <div className={`fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold text-white shadow-xl ${notice.error ? 'bg-rose-600' : 'bg-slate-900'}`}>
          {notice.error ? <Shield className="h-4 w-4" /> : <Check className="h-4 w-4 text-emerald-300" />}
          {notice.text}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <label className="mb-2 block text-xs font-black text-slate-700 sm:hidden" htmlFor="permission-role">الدور الوظيفي</label>
        <select
          id="permission-role"
          value={selectedRole?.id ?? ''}
          onChange={(event) => setSelectedRoleId(Number(event.target.value))}
          className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 sm:hidden"
        >
          {roles.map((role) => <option key={role.id} value={role.id}>{ROLE_LABELS[role.code]?.label ?? 'دور مستخدم'}</option>)}
        </select>

        <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
          {roles.map((role) => {
            const info = ROLE_LABELS[role.code] ?? { label: 'دور مستخدم', icon: Users };
            const RoleIcon = info.icon;
            const active = role.id === selectedRole?.id;
            const count = matrix.find((item) => item.role_id === role.id)?.permissions.filter((item) => item.granted).length ?? 0;
            return (
              <button key={role.id} type="button" onClick={() => setSelectedRoleId(role.id)} className={`min-h-20 rounded-2xl border p-3 text-right transition ${active ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-700/15' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50/40'}`}>
                <span className="flex items-start justify-between gap-2">
                  <RoleIcon className="h-4 w-4 shrink-0" />
                  <span className="text-xs font-black leading-5">{info.label}</span>
                </span>
                <span className={`mt-2 block text-[10px] font-bold ${active ? 'text-white/80' : 'text-slate-400'}`}>{count} صلاحية · {role.users_count} مستخدم</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><SelectedRoleIcon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-black text-slate-900">{selectedRoleInfo.label}</h2>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">{grantedIds.size} من {permissions.length} صلاحية مفعّلة</p>
            </div>
            <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-slate-100 sm:block">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${permissions.length ? (grantedIds.size / permissions.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_260px]">
            <label className="relative block">
              <Search className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الشاشة أو العملية..." className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pr-10 pl-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:bg-white" />
            </label>
            <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-500">
              <option value="ALL">كل أقسام النظام</option>
              {moduleOptions.map((module) => <option key={module} value={module}>{moduleInfo(module).label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2 bg-slate-50/60 p-2 sm:p-4">
          {groupedPermissions.length === 0 && <div className="py-14 text-center text-sm font-bold text-slate-400">لا توجد صلاحيات مطابقة للبحث.</div>}
          {groupedPermissions.map(([module, items]) => {
            const info = moduleInfo(module);
            const ModuleIcon = info.icon;
            const grantedCount = items.filter((item) => grantedIds.has(item.id)).length;
            const expanded = search.trim() !== '' || selectedModule !== 'ALL' || expandedModules.has(module);
            return (
              <article key={module} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <button type="button" onClick={() => setExpandedModules((current) => { const next = new Set(current); next.has(module) ? next.delete(module) : next.add(module); return next; })} className="flex w-full items-center gap-3 p-3.5 text-right sm:p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><ModuleIcon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black text-slate-900">{info.label}</span>
                    <span className="mt-0.5 block text-[10px] font-bold text-slate-400">{grantedCount} من {items.length} مفعّلة</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {items.map((permission) => {
                      const granted = grantedIds.has(permission.id);
                      const key = `${selectedRole?.id}:${permission.id}`;
                      const saving = pending.has(key);
                      const locked = selectedRole?.code === 'SYS_ADMIN' && permission.code === 'roles.manage';
                      return (
                        <button key={permission.id} type="button" disabled={saving} onClick={() => togglePermission(permission)} className="flex w-full items-center gap-3 px-4 py-3 text-right transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70 sm:px-5">
                          <span className="min-w-0 flex-1 text-xs font-bold text-slate-700">{permissionLabel(permission)}{locked && <span className="mr-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">أساسية</span>}</span>
                          {saving && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
                          <span role="switch" aria-checked={granted} className={`relative h-6 w-11 shrink-0 rounded-full transition ${granted ? 'bg-teal-600' : 'bg-slate-200'}`}>
                            <span className={`absolute top-1 grid h-4 w-4 place-items-center rounded-full bg-white shadow-sm transition-all ${granted ? 'right-6' : 'right-1'}`}>{granted && <Check className="h-2.5 w-2.5 text-teal-700" />}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
