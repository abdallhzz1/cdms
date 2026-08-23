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
import {
  Building2, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle,
  AlertTriangle, Filter, UserCheck, GraduationCap, ClipboardCheck,
  Shield, Layers, Users
} from 'lucide-react';

const LEVEL_OPTIONS = ['الرابعة', 'الخامسة', 'السادسة'];

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
    return candidatesData?.data?.head_candidates || [];
  }, [candidatesData]);

  const rtaCandidates: any[] = useMemo(() => {
    return candidatesData?.data?.rta_candidates || [];
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
      setSuccessMessage('تم إنشاء القسم الأكاديمي وتعيين قيادته بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/departments-manage/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setEditingDept(null);
      setSuccessMessage('تم تحديث بيانات القسم بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const assignLeadersMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/departments-manage/${id}/assign-leaders`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setAssigningDept(null);
      setSuccessMessage('تم تعيين قيادات القسم (رئيس القسم / TA) بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/departments-manage/${id}/toggle`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setSuccessMessage('تم تغيير حالة تفعيل القسم بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/departments-manage/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-departments-manage-list'] });
      setDeleteConfirmDept(null);
      setSuccessMessage('تم حذف القسم الأكاديمي بنجاح.');
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
          title="شاشة إدارة أقسام الكلية والقيادات الأكاديمية"
          description="إضافة وتعديل أقسام الكلية، تحديد وتغيير رؤساء الأقسام ومساعدي البحث والتدريس (TA)، ومتابعة كادر كل قسم."
        />
        <Button
          onClick={() => {
            resetDeptForm();
            setIsAddModalOpen(true);
          }}
          className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
        >
          <Plus className="w-4 h-4" />
          إضافة قسم جديد
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
            <div className="text-[11px] font-bold text-slate-500">إجمالي الأقسام الأكاديمية</div>
          </div>
        </Card>

        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.withHead} / {stats.total}</div>
            <div className="text-[11px] font-bold text-slate-500">أقسام برئيس قسم معين</div>
          </div>
        </Card>

        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.withRta} / {stats.total}</div>
            <div className="text-[11px] font-bold text-slate-500">أقسام بمساعد بحث (TA)</div>
          </div>
        </Card>

        <Card className="p-4 border-slate-100 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">{stats.primary} رئيسي / {stats.sub} فرعي</div>
            <div className="text-[11px] font-bold text-slate-500">توزيع هيكل الأقسام</div>
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
              placeholder="ابحث باسم القسم، الرمز، رئيس القسم، أو الـ TA..."
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
              <option value="ALL">جميع الحالات</option>
              <option value="ACTIVE">الأقسام النشطة فقط</option>
              <option value="INACTIVE">الأقسام المجمدة</option>
            </select>

            <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mr-2">
              <Filter className="w-4 h-4 text-teal-600" />
              <span>عرض {filteredDepartments.length} من {departments.length}</span>
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
            جميع الأقسام ({departments.length})
          </button>
          <button
            onClick={() => setTypeFilter('primary')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              typeFilter === 'primary' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            أقسام رئيسية ({stats.primary})
          </button>
          <button
            onClick={() => setTypeFilter('sub')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              typeFilter === 'sub' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            تخصصات وأقسام فرعية ({stats.sub})
          </button>
        </div>
      </Card>

      {/* Departments Table */}
      <Card className="overflow-hidden border-slate-100 shadow-xs">
        <Table>
          <TableHeader className="bg-slate-50/90">
            <TableRow>
              <TableHead className="min-w-[280px]">القسم الأكاديمي والرمز</TableHead>
              <TableHead className="min-w-[230px]">رئيس القسم المكلف</TableHead>
              <TableHead className="min-w-[230px]">مساعد البحث والتدريس (TA)</TableHead>
              <TableHead className="text-center w-24">الكادر</TableHead>
              <TableHead className="text-center w-28">الحالة</TableHead>
              <TableHead className="text-center w-36">إجراءات وإدارة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDepartments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-xs">
                  لا يوجد أقسام مطابقة لخيارات البحث أو التصفية.
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
                            {d.dept_type === 'primary' ? 'قسم رئيسي' : 'قسم فرعي'}
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
                            <span className="font-bold text-slate-400 text-[10px]">السنوات:</span>
                            {levels.map((lvl) => (
                              <span
                                key={lvl}
                                className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-700 font-bold text-[10px]"
                              >
                                السنة {lvl}
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
                            تغيير رئيس القسم ↻
                          </button>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-400">لم يُعيّن رئيس بعد</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAssignModal(d)}
                            className="text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 font-bold px-2.5 py-1 h-auto rounded-lg"
                          >
                            + تعيين
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
                            تغيير الـ TA ↻
                          </button>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-400">لم يُعيّن TA بعد</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAssignModal(d)}
                            className="text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 font-bold px-2.5 py-1 h-auto rounded-lg"
                          >
                            + تعيين
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
                        {d.is_active ? 'نشط' : 'مجمد'}
                      </button>
                    </TableCell>

                    {/* Action Buttons */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAssignModal(d)}
                          title="تعيين وتغيير قيادات القسم"
                          className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(d)}
                          title="تعديل بيانات القسم"
                          className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirmDept(d)}
                          title="حذف القسم نهائياً"
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
        title={editingDept ? `تعديل بيانات القسم: ${editingDept.name_ar}` : 'إضافة قسم أكاديمي جديد'}
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
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم القسم بالعربية *</label>
              <input
                type="text"
                required
                placeholder="مثال: قسم الجراحة العامة"
                value={deptForm.name_ar}
                onChange={(e) => setDeptForm({ ...deptForm, name_ar: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم القسم بالإنجليزية *</label>
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
              <label className="block text-xs font-bold text-slate-700 mb-1">رمز القسم (Code) *</label>
              <input
                type="text"
                required
                placeholder="مثال: DEP-GS أو SURG"
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-mono uppercase font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع القسم الأكاديمي *</label>
              <select
                value={deptForm.dept_type}
                onChange={(e) => setDeptForm({ ...deptForm, dept_type: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-white"
              >
                <option value="primary">قسم رئيسي (Primary Department)</option>
                <option value="sub">قسم فرعي / تخصص دقيق (Subspecialty)</option>
              </select>
            </div>
          </div>

          {/* Academic Levels */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">السنوات الأكاديمية التي يخدمها القسم</label>
            <div className="flex flex-wrap gap-2">
              {LEVEL_OPTIONS.map((lvl) => {
                const isSelected = deptForm.serves_academic_levels.includes(lvl);
                return (
                  <button
                    type="button"
                    key={lvl}
                    onClick={() => toggleLevel(lvl)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    السنة {lvl} {isSelected && '✓'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Leaders Selection */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 space-y-3">
            <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-teal-700" />
              تعيين القيادات الأكاديمية للقسم
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رئيس القسم المكلف</label>
              <select
                value={deptForm.head_person_id}
                onChange={(e) => setDeptForm({ ...deptForm, head_person_id: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden bg-white font-medium"
              >
                <option value="">— لا يوجد رئيس قسم مكلف حالياً —</option>
                {headCandidates.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name_ar} {p.specialty ? `(${p.specialty})` : ''} - {p.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مساعد البحث والتدريس (TA)</label>
              <select
                value={deptForm.rta_person_id}
                onChange={(e) => setDeptForm({ ...deptForm, rta_person_id: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden bg-white font-medium"
              >
                <option value="">— لا يوجد مساعد بحث وتدريس حالياً —</option>
                {rtaCandidates.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name_ar} - {p.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
            <textarea
              rows={2}
              placeholder="أي ملاحظات تنظيمية أو إدارية تخص هذا القسم..."
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
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
            >
              {editingDept ? 'حفظ التعديلات' : 'إنشاء القسم فوراً'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Assign Leaders Quick Modal */}
      <Modal
        isOpen={!!assigningDept}
        onClose={() => setAssigningDept(null)}
        title={`تعيين قيادات قسم: ${assigningDept?.name_ar || ''}`}
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
            يتم هنا تحديد وتغيير رئيس القسم ومساعد البحث والتدريس (TA) لهذا القسم. تقتصر الخيارات على الكادر الحاملين لدور <b>رئيس القسم</b> و<b>مساعد بحث وتدريس</b> في النظام.
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              رئيس القسم الأكاديمي الحالي
            </label>
            <select
              value={assignForm.head_person_id}
              onChange={(e) => setAssignForm({ ...assignForm, head_person_id: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden bg-white font-medium"
            >
              <option value="">— لا يوجد رئيس قسم (إخلاء المنصب) —</option>
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
              مساعد البحث والتدريس (TA) الحالي
            </label>
            <select
              value={assignForm.rta_person_id}
              onChange={(e) => setAssignForm({ ...assignForm, rta_person_id: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden bg-white font-medium"
            >
              <option value="">— لا يوجد مساعد بحث وتدريس —</option>
              {rtaCandidates.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.full_name_ar} - {p.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={() => setAssigningDept(null)}>
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={assignLeadersMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs"
            >
              اعتماد القيادات وحفظ التغيير
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. Delete Department Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirmDept}
        onClose={() => setDeleteConfirmDept(null)}
        title="تأكيد حذف القسم الأكاديمي"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">هل أنت متأكد من حذف هذا القسم نهائياً؟</p>
              <p className="mt-1 text-red-700 leading-relaxed">
                سيتم حذف القسم (<b>{deleteConfirmDept?.name_ar}</b> - {deleteConfirmDept?.code})، وإلغاء تكليفات رئيس القسم والـ TA المرتبطة به.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteConfirmDept(null)}>
              إلغاء الأمر
            </Button>
            <Button
              onClick={() => deleteMutation.mutate(deleteConfirmDept?.id)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
            >
              تأكيد الحذف النهائي
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
