import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useI18n } from '@/i18n/I18nContext';
import {
  Building2, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle,
  AlertTriangle, Filter, UserCheck, GraduationCap, ClipboardCheck,
  Shield, Layers, Users
} from 'lucide-react';

const LEVEL_OPTIONS = [
  { value: 'الرابعة', ar: 'الرابعة', en: 'Fourth' },
  { value: 'الخامسة', ar: 'الخامسة', en: 'Fifth' },
  { value: 'السادسة', ar: 'السادسة', en: 'Sixth' },
];

const OFFICIAL_ORDER = [
  'DEP-IM',
  'DEP-GS',
  'DEP-PED',
  'DEP-OBG',
  'DEP-SSS',
  'DEP-IMS',
  'DEP-FCM',
];

export function DepartmentsManagementPage() {
  const qc = useQueryClient();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<any | null>(null);
  const [assigningDept, setAssigningDept] = useState<any | null>(null);
  const [deleteConfirmDept, setDeleteConfirmDept] = useState<any | null>(null);

  // Form States
  const [deptForm, setDeptForm] = useState({
    code: '',
    name_ar: '',
    name_en: '',
    dept_type: 'primary',
    serves_academic_levels: [] as string[],
    is_active: true,
    notes: '',
    head_person_id: '' as string | number,
    rta_person_id: '' as string | number,
  });

  const [assignForm, setAssignForm] = useState({
    head_person_id: '' as string | number,
    rta_person_id: '' as string | number,
  });

  // 1. Fetch Departments
  const { data: deptsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-departments-manage-list'],
    queryFn: () => apiFetch<any>('/departments-manage'),
  });

  const departments: any[] = useMemo(() => {
    const raw = deptsData?.data || deptsData || [];
    const list = Array.isArray(raw) ? [...raw] : [];
    // Sort cleanly: primary departments first in official order, then subspecialties
    return list.sort((a, b) => {
      const idxA = OFFICIAL_ORDER.indexOf(a.code);
      const idxB = OFFICIAL_ORDER.indexOf(b.code);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      if (a.dept_type === 'primary' && b.dept_type !== 'primary') return -1;
      if (a.dept_type !== 'primary' && b.dept_type === 'primary') return 1;
      return (a.name_ar || '').localeCompare(b.name_ar || '', 'ar');
    });
  }, [deptsData]);

  // 2. Fetch Candidates
  const { data: candidatesData } = useQuery({
    queryKey: ['admin-departments-candidates'],
    queryFn: () => apiFetch<any>('/departments-manage/candidates'),
  });

  const headCandidates: any[] = useMemo(() => {
    const raw = candidatesData?.head_candidates || candidatesData?.data?.head_candidates;
    return Array.isArray(raw) ? raw : [];
  }, [candidatesData]);

  const rtaCandidates: any[] = useMemo(() => {
    const raw = candidatesData?.rta_candidates || candidatesData?.data?.rta_candidates;
    return Array.isArray(raw) ? raw : [];
  }, [candidatesData]);

  // Instant Filter
  const filteredDepartments = useMemo(() => {
    return departments.filter((d: any) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (d.name_ar && d.name_ar.toLowerCase().includes(q)) ||
        (d.name_en && d.name_en.toLowerCase().includes(q)) ||
        (d.code && d.code.toLowerCase().includes(q)) ||
        (d.current_head?.full_name_ar && d.current_head.full_name_ar.toLowerCase().includes(q)) ||
        (d.current_rta?.full_name_ar && d.current_rta.full_name_ar.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (typeFilter !== 'ALL' && d.dept_type !== typeFilter) return false;
      if (statusFilter !== 'ALL') {
        const isActive = statusFilter === 'ACTIVE';
        if (d.is_active !== isActive) return false;
      }

      return true;
    });
  }, [departments, search, typeFilter, statusFilter]);

  // KPIs
  const stats = useMemo(() => {
    const total = departments.length;
    const primary = departments.filter((d: any) => d.dept_type === 'primary').length;
    const sub = departments.filter((d: any) => d.dept_type === 'sub').length;
    const withHead = departments.filter((d: any) => !!d.current_head).length;
    const withRta = departments.filter((d: any) => !!d.current_rta).length;
    return { total, primary, sub, withHead, withRta };
  }, [departments]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/departments-manage', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setIsAddModalOpen(false);
      resetDeptForm();
      setSuccessMessage(tr('تم إنشاء القسم الأكاديمي وتعيين قيادته بنجاح.', 'The academic department and its leadership were created successfully.'));
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/departments-manage/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setEditingDept(null);
      setSuccessMessage(tr('تم تحديث بيانات القسم بنجاح.', 'Department details were updated successfully.'));
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const assignLeadersMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/departments-manage/${id}/assign-leaders`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setAssigningDept(null);
      setSuccessMessage(tr('تم تعيين قيادات القسم (رئيس القسم / TA) بنجاح.', 'Department leadership was assigned successfully.'));
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/departments-manage/${id}/toggle`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setSuccessMessage(tr('تم تغيير حالة تفعيل القسم بنجاح.', 'Department status was updated successfully.'));
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/departments-manage/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setDeleteConfirmDept(null);
      setSuccessMessage(tr('تم حذف القسم الأكاديمي بنجاح.', 'The academic department was deleted successfully.'));
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const resetDeptForm = () => {
    setDeptForm({
      code: '',
      name_ar: '',
      name_en: '',
      dept_type: 'primary',
      serves_academic_levels: [],
      is_active: true,
      notes: '',
      head_person_id: '',
      rta_person_id: '',
    });
  };

  const openEditModal = (d: any) => {
    setEditingDept(d);
    setDeptForm({
      code: d.code || '',
      name_ar: d.name_ar || '',
      name_en: d.name_en || '',
      dept_type: d.dept_type || 'primary',
      serves_academic_levels: Array.isArray(d.serves_academic_levels) ? d.serves_academic_levels : [],
      is_active: d.is_active ?? true,
      notes: d.notes || '',
      head_person_id: d.current_head?.id || '',
      rta_person_id: d.current_rta?.id || '',
    });
  };

  const openAssignModal = (d: any) => {
    setAssigningDept(d);
    setAssignForm({
      head_person_id: d.current_head?.id || '',
      rta_person_id: d.current_rta?.id || '',
    });
  };

  const toggleLevel = (lvl: string) => {
    setDeptForm((prev) => {
      const exists = prev.serves_academic_levels.includes(lvl);
      return {
        ...prev,
        serves_academic_levels: exists
          ? prev.serves_academic_levels.filter((l) => l !== lvl)
          : [...prev.serves_academic_levels, lvl],
      };
    });
  };

  if (isLoading && !deptsData) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title={tr('إدارة أقسام الكلية والقيادات الأكاديمية', 'Faculty Departments and Academic Leadership')}
          description={tr('إضافة وتعديل أقسام الكلية، تحديد وتغيير رؤساء الأقسام ومساعدي البحث والتدريس، ومتابعة كادر كل قسم.', 'Create and update faculty departments, assign department heads and RTAs, and monitor department staff.')}
        />
        <Button
          onClick={() => {
            resetDeptForm();
            setIsAddModalOpen(true);
          }}
          className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
        >
          <Plus className="w-4 h-4" />
          {tr('إضافة قسم جديد', 'Add department')}
        </Button>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.total}</div>
            <div className="text-[11px] font-bold text-slate-500">{tr('إجمالي الأقسام الأكاديمية', 'Academic departments')}</div>
          </div>
        </Card>

        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.withHead} / {stats.total}</div>
            <div className="text-[11px] font-bold text-slate-500">{tr('أقسام برئيس قسم معين', 'Departments with a head')}</div>
          </div>
        </Card>

        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.withRta} / {stats.total}</div>
            <div className="text-[11px] font-bold text-slate-500">{tr('أقسام بمساعد بحث (TA)', 'Departments with an RTA')}</div>
          </div>
        </Card>

        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.primary} {tr('رئيسي', 'primary')} / {stats.sub} {tr('فرعي', 'sub')}</div>
            <div className="text-[11px] font-bold text-slate-500">{tr('توزيع هيكل الأقسام', 'Department structure')}</div>
          </div>
        </Card>
      </div>

      {/* Controls: Search & Filters */}
      <Card className="p-4 border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              placeholder={tr('ابحث باسم القسم، الرمز، رئيس القسم، أو مساعد البحث...', 'Search by department, code, head, or RTA...')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-slate-50/50"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:ring-2 focus:ring-teal-500 outline-hidden"
            >
              <option value="ALL">{tr('جميع الحالات', 'All statuses')}</option>
              <option value="ACTIVE">{tr('الأقسام النشطة فقط', 'Active departments')}</option>
              <option value="INACTIVE">{tr('الأقسام المجمدة', 'Inactive departments')}</option>
            </select>

            <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mr-2">
              <Filter className="w-4 h-4 text-teal-600" />
              <span>{tr('عرض', 'Showing')} {filteredDepartments.length} {tr('من', 'of')} {departments.length}</span>
            </div>
          </div>
        </div>

        {/* Type Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              typeFilter === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tr('جميع الأقسام', 'All departments')} ({departments.length})
          </button>
          <button
            onClick={() => setTypeFilter('primary')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              typeFilter === 'primary' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tr('أقسام رئيسية', 'Primary departments')} ({stats.primary})
          </button>
          <button
            onClick={() => setTypeFilter('sub')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              typeFilter === 'sub' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tr('تخصصات وأقسام فرعية', 'Subspecialties and subdepartments')} ({stats.sub})
          </button>
        </div>
      </Card>

      {/* Departments Table */}
      <Card className="overflow-hidden border-slate-100 shadow-xs">
        <Table>
          <TableHeader className="bg-slate-50/90">
            <TableRow>
              <TableHead className="min-w-[280px]">{tr('القسم الأكاديمي والرمز', 'Academic department and code')}</TableHead>
              <TableHead className="min-w-[230px]">{tr('رئيس القسم المكلف', 'Assigned department head')}</TableHead>
              <TableHead className="min-w-[230px]">{tr('مساعد البحث والتدريس', 'Research and Teaching Assistant')}</TableHead>
              <TableHead className="text-center w-24">{tr('الكادر', 'Staff')}</TableHead>
              <TableHead className="text-center w-28">{tr('الحالة', 'Status')}</TableHead>
              <TableHead className="text-center w-36">{tr('إجراءات وإدارة', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                  {tr('لا توجد أقسام مطابقة لخيارات البحث أو التصفية.', 'No departments match the selected search or filters.')}
                </TableCell>
              </TableRow>
            ) : (
              filteredDepartments.map((d: any) => {
                const head = d.current_head;
                const rta = d.current_rta;
                const levels: string[] = d.serves_academic_levels || [];

                return (
                  <TableRow key={d.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Dept Name, Code, Type, Levels - Beautifully Arranged */}
                    <TableCell>
                      <div className="space-y-1.5 py-1">
                        {/* 1. Arabic Name & Type Badge */}
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{d.name_ar}</span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              d.dept_type === 'primary'
                                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {d.dept_type === 'primary' ? tr('قسم رئيسي', 'Primary') : tr('قسم فرعي', 'Subdepartment')}
                          </span>
                        </div>

                        {/* 2. English Name & Code */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <span className="font-sans font-semibold text-slate-600">{d.name_en}</span>
                          <span className="text-slate-300">•</span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-100 font-mono text-[11px] font-bold text-slate-700">
                            {d.code}
                          </span>
                        </div>

                        {/* 3. Academic Levels Served */}
                        {levels.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                            <span className="font-bold text-slate-400 text-[10px]">{tr('السنوات:', 'Years:')}</span>
                            {levels.map((lvl) => (
                              <span
                                key={lvl}
                                className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 font-bold text-[10px]"
                              >
                                {ar ? `السنة ${lvl}` : `${LEVEL_OPTIONS.find(option => option.value === lvl)?.en ?? lvl} year`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Department Head */}
                    <TableCell>
                      {head ? (
                        <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                            <GraduationCap className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{head.full_name_ar}</span>
                          </div>
                          {head.specialty && (
                            <div className="text-[10px] text-slate-500 font-medium mr-5">{head.specialty}</div>
                          )}
                          <button
                            onClick={() => openAssignModal(d)}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold mr-5 block hover:underline cursor-pointer pt-0.5"
                          >
                            {tr('تغيير رئيس القسم ↻', 'Change department head ↻')}
                          </button>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-400">{tr('لم يُعيّن رئيس بعد', 'No department head assigned')}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAssignModal(d)}
                            className="text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 font-bold px-2.5 py-1 h-auto rounded-lg"
                          >
                            {tr('+ تعيين', '+ Assign')}
                          </Button>
                        </div>
                      )}
                    </TableCell>

                    {/* RTA / TA */}
                    <TableCell>
                      {rta ? (
                        <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                            <ClipboardCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{rta.full_name_ar}</span>
                          </div>
                          {rta.email && (
                            <div className="text-[10px] text-slate-500 font-mono mr-5 truncate max-w-[180px]">{rta.email}</div>
                          )}
                          <button
                            onClick={() => openAssignModal(d)}
                            className="text-[10px] text-amber-700 hover:text-amber-900 font-bold mr-5 block hover:underline cursor-pointer pt-0.5"
                          >
                            {tr('تغيير مساعد البحث ↻', 'Change RTA ↻')}
                          </button>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-400">{tr('لم يُعيّن مساعد بحث بعد', 'No RTA assigned')}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAssignModal(d)}
                            className="text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 font-bold px-2.5 py-1 h-auto rounded-lg"
                          >
                            {tr('+ تعيين', '+ Assign')}
                          </Button>
                        </div>
                      )}
                    </TableCell>

                    {/* Staff Count */}
                    <TableCell className="text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-bold inline-flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        {d.people_count}
                      </span>
                    </TableCell>

                    {/* Status Toggle */}
                    <TableCell className="text-center">
                      <button
                        onClick={() => toggleMutation.mutate(d.id)}
                        disabled={toggleMutation.isPending}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                          d.is_active
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                      >
                        {d.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {d.is_active ? tr('نشط', 'Active') : tr('مجمد', 'Inactive')}
                      </button>
                    </TableCell>

                    {/* Action Buttons */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAssignModal(d)}
                          title={tr('تعيين وتغيير قيادات القسم', 'Assign department leadership')}
                          className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(d)}
                          title={tr('تعديل بيانات القسم', 'Edit department')}
                          className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirmDept(d)}
                          title={tr('حذف القسم نهائياً', 'Delete department')}
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 1. Add / Edit Department Modal */}
      <Modal
        isOpen={isAddModalOpen || !!editingDept}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingDept(null);
        }}
        title={editingDept ? `${tr('تعديل بيانات القسم', 'Edit department')}: ${ar ? editingDept.name_ar : editingDept.name_en || editingDept.name_ar}` : tr('إضافة قسم أكاديمي جديد', 'Add academic department')}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const payload = {
              ...deptForm,
              head_person_id: deptForm.head_person_id ? Number(deptForm.head_person_id) : null,
              rta_person_id: deptForm.rta_person_id ? Number(deptForm.rta_person_id) : null,
            };
            if (editingDept) {
              updateMutation.mutate({ id: editingDept.id, body: payload });
            } else {
              createMutation.mutate(payload);
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم القسم بالعربية *', 'Arabic department name *')}</label>
              <input
                type="text"
                required
                placeholder={tr('مثال: قسم الجراحة العامة', 'Example: General Surgery Department')}
                value={deptForm.name_ar}
                onChange={(e) => setDeptForm({ ...deptForm, name_ar: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('اسم القسم بالإنجليزية *', 'English department name *')}</label>
              <input
                type="text"
                required
                placeholder="e.g. General Surgery"
                value={deptForm.name_en}
                onChange={(e) => setDeptForm({ ...deptForm, name_en: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium font-sans"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رمز القسم *', 'Department code *')}</label>
              <input
                type="text"
                required
                placeholder={tr('مثال: DEP-GS أو SURG', 'Example: DEP-GS or SURG')}
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-mono uppercase font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('نوع القسم الأكاديمي *', 'Department type *')}</label>
              <select
                value={deptForm.dept_type}
                onChange={(e) => setDeptForm({ ...deptForm, dept_type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-white"
              >
                <option value="primary">{tr('قسم رئيسي', 'Primary department')}</option>
                <option value="sub">{tr('قسم فرعي / تخصص دقيق', 'Subdepartment / subspecialty')}</option>
              </select>
            </div>
          </div>

          {/* Academic Levels */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">{tr('السنوات الأكاديمية التي يخدمها القسم', 'Academic years served by the department')}</label>
            <div className="flex flex-wrap gap-2">
              {LEVEL_OPTIONS.map((option) => {
                const isSelected = deptForm.serves_academic_levels.includes(option.value);
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => toggleLevel(option.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {ar ? `السنة ${option.ar}` : `${option.en} year`} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Leaders Selection */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-3">
            <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-teal-700" />
              {tr('تعيين القيادات الأكاديمية للقسم', 'Assign department academic leadership')}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('رئيس القسم المكلف', 'Assigned department head')}</label>
              <select
                value={deptForm.head_person_id}
                onChange={(e) => setDeptForm({ ...deptForm, head_person_id: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden bg-white font-medium"
              >
                <option value="">{tr('— لا يوجد رئيس قسم مكلف حالياً —', '— No department head currently assigned —')}</option>
                {headCandidates.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name_ar} {p.specialty ? `(${p.specialty})` : ''} - {p.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">{tr('مساعد البحث والتدريس', 'Research and Teaching Assistant')}</label>
              <select
                value={deptForm.rta_person_id}
                onChange={(e) => setDeptForm({ ...deptForm, rta_person_id: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden bg-white font-medium"
              >
                <option value="">{tr('— لا يوجد مساعد بحث وتدريس حالياً —', '— No RTA currently assigned —')}</option>
                {rtaCandidates.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name_ar} - {p.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">{tr('ملاحظات إضافية', 'Additional notes')}</label>
            <textarea
              rows={2}
              placeholder={tr('أي ملاحظات تنظيمية أو إدارية تخص هذا القسم...', 'Any organizational or administrative notes about this department...')}
              value={deptForm.notes}
              onChange={(e) => setDeptForm({ ...deptForm, notes: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingDept(null);
              }}
            >
              {tr('إلغاء', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
            >
              {editingDept ? tr('حفظ التعديلات', 'Save changes') : tr('إنشاء القسم', 'Create department')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Assign Leaders Quick Modal */}
      <Modal
        isOpen={!!assigningDept}
        onClose={() => setAssigningDept(null)}
        title={`${tr('تعيين قيادات قسم', 'Assign department leadership')}: ${ar ? assigningDept?.name_ar || '' : assigningDept?.name_en || assigningDept?.name_ar || ''}`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (assigningDept) {
              assignLeadersMutation.mutate({
                id: assigningDept.id,
                body: {
                  head_person_id: assignForm.head_person_id || null,
                  rta_person_id: assignForm.rta_person_id || null,
                },
              });
            }
          }}
          className="space-y-4"
        >
          <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200 text-xs font-medium text-teal-800 leading-relaxed">
            {tr('يتم هنا تحديد وتغيير رئيس القسم ومساعد البحث والتدريس لهذا القسم. تقتصر الخيارات على الكادر المؤهل في النظام.', 'Assign or change the department head and RTA here. Options are limited to eligible staff accounts.')}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              {tr('رئيس القسم الأكاديمي الحالي', 'Current academic department head')}
            </label>
            <select
              value={assignForm.head_person_id}
              onChange={(e) => setAssignForm({ ...assignForm, head_person_id: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white font-medium"
            >
              <option value="">{tr('— لا يوجد رئيس قسم (إخلاء المنصب) —', '— No department head (vacate position) —')}</option>
              {headCandidates.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.full_name_ar} {p.specialty ? `(${p.specialty})` : ''} - {p.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 text-amber-600" />
              {tr('مساعد البحث والتدريس الحالي', 'Current Research and Teaching Assistant')}
            </label>
            <select
              value={assignForm.rta_person_id}
              onChange={(e) => setAssignForm({ ...assignForm, rta_person_id: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden bg-white font-medium"
            >
              <option value="">{tr('— لا يوجد مساعد بحث وتدريس —', '— No RTA assigned —')}</option>
              {rtaCandidates.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.full_name_ar} - {p.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={() => setAssigningDept(null)}>
              {tr('إلغاء', 'Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={assignLeadersMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
            >
              {tr('اعتماد القيادات وحفظ التغيير', 'Confirm leadership assignments')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. Delete Department Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirmDept}
        onClose={() => setDeleteConfirmDept(null)}
        title={tr('تأكيد حذف القسم الأكاديمي', 'Confirm department deletion')}
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">{tr('هل أنت متأكد من حذف هذا القسم نهائياً؟', 'Are you sure you want to permanently delete this department?')}</p>
              <p className="mt-1 text-red-700 leading-relaxed">
                {tr('سيتم حذف القسم وإلغاء تكليفات القيادة المرتبطة به.', 'The department and its related leadership assignments will be removed.')} (<b>{ar ? deleteConfirmDept?.name_ar : deleteConfirmDept?.name_en || deleteConfirmDept?.name_ar}</b> - {deleteConfirmDept?.code})
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteConfirmDept(null)}>
              {tr('إلغاء الأمر', 'Cancel')}
            </Button>
            <Button
              onClick={() => deleteMutation.mutate(deleteConfirmDept?.id)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
            >
              {tr('تأكيد الحذف النهائي', 'Delete permanently')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
