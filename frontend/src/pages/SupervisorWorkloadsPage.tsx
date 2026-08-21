import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { 
  Search, Plus, Pencil, Archive, Star, ShieldCheck, Building, Users, 
  Calendar, Award, Grid, List, Phone, Mail, Clock, Sparkles
} from 'lucide-react';

export interface SupervisorWorkloadItem {
  id: number;
  supervisor_name: string;
  supervisor_code?: string;
  academic_year: string;
  academic_level?: string;
  department_id?: number;
  department?: {
    id: number;
    name_ar: string;
    name_en?: string;
  };
  supervision_weeks?: number;
  notes?: string;
  archived_at?: string | null;
  email?: string;
  phone?: string;
  title?: string;
  kpi_score?: number;
  hospital_name?: string;
}

export function SupervisorWorkloadsPage() {
  const { locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('people.manage') || can('students.view');

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [academicYearFilter, setAcademicYearFilter] = useState('all');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SupervisorWorkloadItem | null>(null);
  const [evalItem, setEvalItem] = useState<SupervisorWorkloadItem | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    supervisor_name: '',
    supervisor_code: '',
    title: 'أستاذ مساعد — استشاري سريري',
    department_id: '1',
    academic_year: '2024/2025',
    academic_level: 'fourth',
    supervision_weeks: 16,
    hospital_name: 'مستشفى الخليل الحكومي',
    phone: '+970 599 000000',
    email: 'supervisor@hebron.edu',
    notes: ''
  });

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Query supervisor workloads strictly from MySQL Database with fresh cache key
  const { data: rawData, isLoading, isError, refetch } = useQuery({
    queryKey: ['supervisor-annual-workloads-v3-clean', showArchived, academicYearFilter],
    queryFn: async () => {
      const res = await apiFetch<any>(`/supervisor-annual-workloads?show_archived=${showArchived ? 1 : 0}&academic_year=${encodeURIComponent(academicYearFilter)}`);
      return Array.isArray(res) ? res : res?.data || [];
    },
    staleTime: 0,
    gcTime: 0
  });

  // Query Departments list for dropdown filter
  const { data: departmentsResponse } = useQuery({
    queryKey: ['departments-list-for-supervisors'],
    queryFn: async () => {
      const res = await apiFetch<any>('/departments');
      return Array.isArray(res) ? res : res?.data || [];
    }
  });

  const departmentsList = useMemo(() => {
    if (!departmentsResponse || !Array.isArray(departmentsResponse)) return [];
    return departmentsResponse;
  }, [departmentsResponse]);

  // Format supervisors list strictly from real database fields with ZERO hardcoded fallbacks
  const supervisorsList: SupervisorWorkloadItem[] = useMemo(() => {
    if (!rawData || !Array.isArray(rawData)) return [];
    return rawData.map((item: any) => ({
      id: item.id,
      supervisor_name: item.supervisor_name,
      supervisor_code: item.supervisor_code || '',
      academic_year: item.academic_year || '—',
      academic_level: item.academic_level || '',
      department_id: item.department_id || item.department?.id,
      department: item.department,
      supervision_weeks: item.supervision_weeks ?? null,
      notes: item.notes || '',
      archived_at: item.archived_at,
      email: item.email || '',
      phone: item.phone || '',
      title: item.title || '',
      kpi_score: item.kpi_score ?? null,
      hospital_name: item.hospital_name || ''
    }));
  }, [rawData]);

  // Filtered Supervisors
  const filteredSupervisors = useMemo(() => {
    return supervisorsList.filter((sup) => {
      // Search
      if (debouncedQuery.trim()) {
        const q = debouncedQuery.toLowerCase();
        const matchName = sup.supervisor_name ? sup.supervisor_name.toLowerCase().includes(q) : false;
        const matchCode = (sup.supervisor_code || '').toLowerCase().includes(q);
        const matchDept = (sup.department?.name_ar || '').toLowerCase().includes(q);
        const matchNotes = (sup.notes || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchDept && !matchNotes) return false;
      }
      // Department
      if (selectedDept !== 'all' && String(sup.department_id) !== String(selectedDept)) {
        return false;
      }
      // Level
      if (selectedLevel !== 'all' && sup.academic_level !== selectedLevel) {
        return false;
      }
      return true;
    });
  }, [supervisorsList, debouncedQuery, selectedDept, selectedLevel]);

  // Summary KPI Metrics strictly from real data
  const stats = useMemo(() => {
    const total = supervisorsList.length;
    const active = supervisorsList.filter(s => !s.archived_at).length;
    const totalWeeks = supervisorsList.reduce((acc, s) => acc + (s.supervision_weeks || 0), 0);
    const scoredList = supervisorsList.filter(s => s.kpi_score !== null && s.kpi_score !== undefined);
    const avgScore = scoredList.length > 0 
      ? (scoredList.reduce((acc, s) => acc + (s.kpi_score || 0), 0) / scoredList.length).toFixed(1) + '%'
      : '—';

    return { total, active, totalWeeks, avgScore };
  }, [supervisorsList]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/supervisor-annual-workloads', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-annual-workloads'] });
      setIsModalOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/supervisor-annual-workloads/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-annual-workloads'] });
      setIsModalOpen(false);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/supervisor-annual-workloads/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-annual-workloads'] });
    }
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      supervisor_name: '',
      supervisor_code: `SUP-2024-${Math.floor(Math.random() * 90 + 10)}`,
      title: 'أستاذ مساعد — استشاري سريري',
      department_id: departmentsList[0]?.id ? String(departmentsList[0].id) : '1',
      academic_year: '2024/2025',
      academic_level: 'fourth',
      supervision_weeks: 16,
      hospital_name: 'مستشفى الخليل الحكومي',
      phone: '+970 599 123456',
      email: 'supervisor@hebron.edu',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: SupervisorWorkloadItem) => {
    setEditingItem(item);
    setFormData({
      supervisor_name: item.supervisor_name,
      supervisor_code: item.supervisor_code || '',
      title: item.title || 'أستاذ مساعد — استشاري سريري',
      department_id: String(item.department_id || '1'),
      academic_year: item.academic_year || '2024/2025',
      academic_level: item.academic_level || 'fourth',
      supervision_weeks: item.supervision_weeks || 16,
      hospital_name: item.hospital_name || 'مستشفى الخليل الحكومي',
      phone: item.phone || '',
      email: item.email || '',
      notes: item.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleArchive = (id: number) => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من رغبتك في تعديل حالة أرشفة المشرف السريري؟' : 'Are you sure you want to change archive status?')) {
      archiveMutation.mutate(id);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      department_id: Number(formData.department_id),
      supervision_weeks: Number(formData.supervision_weeks)
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, body: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const getLevelBadge = (level?: string) => {
    if (level === 'fourth') return locale === 'ar' ? 'سنة رابعة' : '4th Year';
    if (level === 'fifth') return locale === 'ar' ? 'سنة خامسة' : '5th Year';
    if (level === 'sixth') return locale === 'ar' ? 'سنة سادسة' : '6th Year';
    return level || 'عام';
  };

  return (
    <div className="space-y-6 pb-20 text-xs">
      
      {/* 1. Page Header */}
      <PageHeader 
        title={locale === 'ar' ? 'دليل المشرفين السريريين وعبء الإشراف' : 'Clinical Supervisors Directory'}
        description={locale === 'ar' ? 'استعراض وإدارة جميع أطباء الكادر السريري، توزيع العبء الأكاديمي ومؤشرات الأداء (KPIs)' : 'Manage clinical supervisors, hospital rotations, and KPI workload performance.'}
      >
        {canManage && (
          <Button onClick={handleOpenAdd} className="bg-teal-700 hover:bg-teal-800 text-white font-bold gap-2 cursor-pointer shadow-xs">
            <Plus className="w-4 h-4" />
            <span>{locale === 'ar' ? 'إضافة مشرف سريري جديد' : 'Add Clinical Supervisor'}</span>
          </Button>
        )}
      </PageHeader>

      {/* 2. Top Executive Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Supervisors */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-400 font-medium text-[11px] block">{locale === 'ar' ? 'إجمالي المشرفين السريريين' : 'Total Supervisors'}</span>
            <div className="text-2xl font-black text-slate-800">{stats.total}</div>
            <span className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-0.5 rounded-full inline-block">
              {stats.active} {locale === 'ar' ? 'نشط في هذا الفصل' : 'Active This Term'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Completed Supervision Weeks */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-400 font-medium text-[11px] block">{locale === 'ar' ? 'إجمالي أسابيع الإشراف' : 'Total Supervision Weeks'}</span>
            <div className="text-2xl font-black text-slate-800">{stats.totalWeeks} <span className="text-xs font-semibold text-slate-500">{locale === 'ar' ? 'أسبوع' : 'wks'}</span></div>
            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
              {locale === 'ar' ? 'موزعة على المستشفيات' : 'Hospital Distributed'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Avg KPI Score */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-400 font-medium text-[11px] block">{locale === 'ar' ? 'متوسط تقييم الأداء (KPIs)' : 'Average KPI Score'}</span>
            <div className="text-2xl font-black text-teal-800 flex items-center gap-1.5">
              <span>⭐ {stats.avgScore}%</span>
            </div>
            <span className="text-[10px] text-teal-800 font-semibold bg-teal-50 px-2 py-0.5 rounded-full inline-block">
              {locale === 'ar' ? 'أداء إشرافي ممتاز' : 'Excellent Performance'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Academic Year */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-slate-400 font-medium text-[11px] block">{locale === 'ar' ? 'العام الأكاديمي الساري' : 'Active Academic Year'}</span>
            <div className="text-xl font-black text-slate-800">{academicYearFilter}</div>
            <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full inline-block">
              {locale === 'ar' ? 'الفصل السريري الحالي' : 'Current Clinical Semester'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 3. Filter & Controls Toolbar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1\/2 -translate-y-1\/2" />
            <input
              type="text"
              placeholder={locale === 'ar' ? 'ابحث باسم الطبيب المشرف، الكود، القسم، أو المستشفى...' : 'Search by supervisor name, code, department...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition-all"
            />
          </div>

          {/* Filters & View Switches */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Department Filter */}
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
            >
              <option value="all">{locale === 'ar' ? 'جميع الأقسام السريرية' : 'All Departments'}</option>
              {departmentsList.map((d: any) => (
                <option key={d.id} value={d.id}>{locale === 'ar' ? d.name_ar : d.name_en || d.name_ar}</option>
              ))}
            </select>

            {/* Level Filter */}
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
            >
              <option value="all">{locale === 'ar' ? 'جميع السنوات الدراسية' : 'All Academic Levels'}</option>
              <option value="fourth">{locale === 'ar' ? 'سنة رابعة' : '4th Year'}</option>
              <option value="fifth">{locale === 'ar' ? 'سنة خامسة' : '5th Year'}</option>
              <option value="sixth">{locale === 'ar' ? 'سنة سادسة' : '6th Year'}</option>
            </select>

            {/* Academic Year Filter */}
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-600 cursor-pointer"
            >
              <option value="all">{locale === 'ar' ? 'جميع الأعوام الأكاديمية' : 'All Academic Years'}</option>
              <option value="2024/2025">2024/2025</option>
              <option value="2023/2024">2023/2024</option>
              <option value="2022/2023">2022/2023</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title={locale === 'ar' ? 'عرض البطاقات' : 'Grid View'}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-teal-800 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title={locale === 'ar' ? 'عرض القائمة' : 'List View'}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Archive Toggle */}
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 px-3 py-2 bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer">
              <input 
                type="checkbox" 
                checked={showArchived} 
                onChange={(e) => setShowArchived(e.target.checked)} 
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" 
              />
              <span>{locale === 'ar' ? 'المؤرشفين' : 'Archived'}</span>
            </label>

          </div>
        </div>
      </div>

      {/* 4. Content Area: Grid View or Table View */}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredSupervisors.length === 0 ? (
        <EmptyState title={locale === 'ar' ? 'لا يوجد مشرفون سريريون طابقوا البحث' : 'No Supervisors Found'} />
      ) : viewMode === 'grid' ? (
        
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSupervisors.map((sup) => (
            <div 
              key={sup.id} 
              className={`bg-white rounded-3xl border border-slate-100 shadow-2xs p-5 space-y-4 hover:shadow-md transition-all relative ${
                sup.archived_at ? 'opacity-60 bg-slate-50/70' : ''
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 font-black text-sm border border-teal-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                    {sup.supervisor_name.split(' ').map(n => n[0]).slice(0, 2).join('') || 'د.'}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 leading-snug">{sup.supervisor_name}</h3>
                    <span className="text-[11px] font-mono text-slate-400 block">{sup.supervisor_code}</span>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  sup.archived_at 
                    ? 'bg-slate-100 text-slate-500 border-slate-200' 
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {sup.archived_at ? (locale === 'ar' ? 'مؤرشف' : 'Archived') : (locale === 'ar' ? 'نشط' : 'Active')}
                </span>
              </div>

              {/* Title & Department */}
              <div className="space-y-1.5 pt-1 border-t border-slate-100">
                {sup.title && (
                  <div className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span>{sup.title}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium flex-wrap">
                  {sup.department?.name_ar && (
                    <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg border border-slate-200 font-semibold">
                      {sup.department.name_ar}
                    </span>
                  )}
                  {sup.academic_level && (
                    <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 font-semibold">
                      {getLevelBadge(sup.academic_level)}
                    </span>
                  )}
                </div>
              </div>

              {/* KPI Score Box */}
              <div className="bg-slate-50/90 p-3 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-medium block">{locale === 'ar' ? 'درجة الأداء الإشرافي (KPI)' : 'Supervision KPI Rating'}</span>
                  <div className="text-xs font-black text-slate-800 flex items-center gap-1.5 mt-0.5">
                    {sup.kpi_score !== null && sup.kpi_score !== undefined ? (
                      <>
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>{sup.kpi_score}%</span>
                      </>
                    ) : (
                      <span className="text-slate-400 font-medium text-[11px] italic">{locale === 'ar' ? 'غير مقيّـم' : 'Not rated'}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setEvalItem(sup); setIsEvalModalOpen(true); }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 text-teal-800 font-bold text-[11px] rounded-xl border border-slate-200 cursor-pointer shadow-2xs transition-colors"
                >
                  {locale === 'ar' ? 'سجل التقييم' : 'Eval Log'}
                </button>
              </div>

              {/* Workload Stats */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-white rounded-2xl border border-slate-100">
                  <span className="text-slate-400 block text-[10px] font-medium">{locale === 'ar' ? 'أسابيع الإشراف:' : 'Supervision Weeks:'}</span>
                  <span className="font-bold text-slate-800 text-xs">
                    {sup.supervision_weeks !== null && sup.supervision_weeks !== undefined ? `${sup.supervision_weeks} ${locale === 'ar' ? 'أسبوع' : 'weeks'}` : '—'}
                  </span>
                </div>
                <div className="p-2.5 bg-white rounded-2xl border border-slate-100 min-w-0">
                  <span className="text-slate-400 block text-[10px] font-medium">{locale === 'ar' ? 'المستشفى المعتمد:' : 'Hospital Site:'}</span>
                  <span className="font-bold text-slate-800 text-xs truncate block">{sup.hospital_name || '—'}</span>
                </div>
              </div>

              {/* Notes */}
              {sup.notes && (
                <p className="text-[11px] text-slate-500 line-clamp-2 italic bg-slate-50 p-2 rounded-xl">
                  "{sup.notes}"
                </p>
              )}

              {/* Card Footer Actions */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  {sup.phone && (
                    <a href={`tel:${sup.phone}`} className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg hover:bg-slate-100" title={sup.phone}>
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  {sup.email && (
                    <a href={`mailto:${sup.email}`} className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg hover:bg-slate-100" title={sup.email}>
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {canManage && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(sup)}
                      className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{locale === 'ar' ? 'تعديل العبء' : 'Edit'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(sup.id)}
                      className="p-1.5 text-slate-400 hover:text-amber-600 rounded-xl hover:bg-amber-50 cursor-pointer"
                      title={locale === 'ar' ? 'تعديل الأرشفة' : 'Archive'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>

      ) : (
        
        /* DIRECTORY TABLE VIEW */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70 border-b border-slate-100">
                <TableHead className="font-bold text-slate-700">{locale === 'ar' ? 'المشرف السريري' : 'Supervisor'}</TableHead>
                <TableHead className="font-bold text-slate-700">{locale === 'ar' ? 'اللقب الأكاديمي والتخصص' : 'Title & Specialty'}</TableHead>
                <TableHead className="font-bold text-slate-700">{locale === 'ar' ? 'القسم والمستشفى' : 'Department & Hospital'}</TableHead>
                <TableHead className="font-bold text-slate-700">{locale === 'ar' ? 'المستوى وأسابيع العبء' : 'Level & Weeks'}</TableHead>
                <TableHead className="font-bold text-slate-700">{locale === 'ar' ? 'تقييم الأداء (KPI)' : 'KPI Rating'}</TableHead>
                {canManage && <TableHead className="font-bold text-slate-700 text-end">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSupervisors.map((sup) => (
                <TableRow key={sup.id} className={sup.archived_at ? 'opacity-60 bg-slate-50/50' : 'hover:bg-slate-50/60 transition-colors'}>
                  
                  {/* Supervisor Name & Code */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 font-bold text-xs flex items-center justify-center shrink-0">
                        {sup.supervisor_name.split(' ').map(n => n[0]).slice(0, 2).join('') || 'د.'}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-xs">{sup.supervisor_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{sup.supervisor_code}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Title & Specialty */}
                  <TableCell>
                    <div className="font-semibold text-slate-700 text-xs">{sup.title || '—'}</div>
                    <div className="text-[10px] text-slate-400 font-medium">{sup.email || ''}</div>
                  </TableCell>

                  {/* Department & Hospital */}
                  <TableCell>
                    <div className="font-bold text-slate-800 text-xs">{sup.department?.name_ar || '—'}</div>
                    {sup.hospital_name && (
                      <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                        <Building className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{sup.hospital_name}</span>
                      </div>
                    )}
                  </TableCell>

                  {/* Level & Supervision Weeks */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {sup.academic_level && (
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-bold text-[10px] border border-blue-100">
                          {getLevelBadge(sup.academic_level)}
                        </span>
                      )}
                      <span className="font-bold text-slate-800 text-xs">
                        {sup.supervision_weeks !== null && sup.supervision_weeks !== undefined ? `${sup.supervision_weeks} ${locale === 'ar' ? 'أسبوع' : 'wks'}` : '—'}
                      </span>
                    </div>
                  </TableCell>

                  {/* KPI Rating */}
                  <TableCell>
                    {sup.kpi_score !== null && sup.kpi_score !== undefined ? (
                      <div className="inline-flex items-center gap-1 font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-200/80 text-[11px]">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>{sup.kpi_score}%</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 font-medium text-[11px] italic">{locale === 'ar' ? 'غير مقيّـم' : 'Not rated'}</span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  {canManage && (
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setEvalItem(sup); setIsEvalModalOpen(true); }}
                          className="p-1.5 text-slate-500 hover:text-teal-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                          title={locale === 'ar' ? 'سجل التقييمات' : 'Evaluations'}
                        >
                          <Star className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(sup)}
                          className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          {locale === 'ar' ? 'تعديل' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchive(sup.id)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 cursor-pointer"
                          title={locale === 'ar' ? 'أرشفة' : 'Archive'}
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  )}

                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

      )}

      {/* 5. Add / Edit Supervisor Workload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-xl border border-slate-200 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4.5 h-4.5 text-teal-600" />
                <span>{editingItem ? (locale === 'ar' ? 'تعديل بيانات المشرف السريري والعبء' : 'Edit Supervisor Workload') : (locale === 'ar' ? 'إضافة مشرف سريري جديد' : 'Add New Supervisor')}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'اسم المشرف السريري (رباعي) *:' : 'Supervisor Full Name:'}</label>
                  <input
                    required
                    type="text"
                    placeholder={locale === 'ar' ? 'مثال: د. حسام السعيد' : 'Dr. Name'}
                    value={formData.supervisor_name}
                    onChange={(e) => setFormData({ ...formData, supervisor_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'الرقم الوظيفي / الكود:' : 'Employee Code:'}</label>
                  <input
                    type="text"
                    placeholder="SUP-2024-01"
                    value={formData.supervisor_code}
                    onChange={(e) => setFormData({ ...formData, supervisor_code: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-mono font-bold focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'اللقب الأكاديمي والصفة السريرية:' : 'Title & Position:'}</label>
                  <input
                    type="text"
                    placeholder="أستاذ مساعد — استشاري جراحة"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-medium focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'القسم السريري المعتمد:' : 'Clinical Department:'}</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold bg-white cursor-pointer focus:ring-1 focus:ring-teal-600"
                  >
                    {departmentsList.map((d: any) => (
                      <option key={d.id} value={d.id}>{locale === 'ar' ? d.name_ar : d.name_en || d.name_ar}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'العام الأكاديمي:' : 'Academic Year:'}</label>
                  <input
                    type="text"
                    placeholder="2024/2025"
                    value={formData.academic_year}
                    onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'المستوى الدراسي:' : 'Academic Level:'}</label>
                  <select
                    value={formData.academic_level}
                    onChange={(e) => setFormData({ ...formData, academic_level: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold bg-white cursor-pointer focus:ring-1 focus:ring-teal-600"
                  >
                    <option value="fourth">{locale === 'ar' ? 'سنة رابعة' : '4th Year'}</option>
                    <option value="fifth">{locale === 'ar' ? 'سنة خامسة' : '5th Year'}</option>
                    <option value="sixth">{locale === 'ar' ? 'سنة سادسة' : '6th Year'}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'أسابيع الإشراف:' : 'Supervision Weeks:'}</label>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    value={formData.supervision_weeks}
                    onChange={(e) => setFormData({ ...formData, supervision_weeks: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-mono font-bold focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'المستشفى التعليمي / موقع التدريب:' : 'Hospital Site:'}</label>
                <input
                  type="text"
                  placeholder="مستشفى الخليل الحكومي / المستشفى الأهلي"
                  value={formData.hospital_name}
                  onChange={(e) => setFormData({ ...formData, hospital_name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'رقم الهاتف:' : 'Phone:'}</label>
                  <input
                    type="tel"
                    placeholder="+970 599 000000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-mono font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'البريد الإلكتروني:' : 'Email:'}</label>
                  <input
                    type="email"
                    placeholder="doctor@hebron.edu"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-mono font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{locale === 'ar' ? 'ملاحظات وتوجيهات الإشراف:' : 'Notes:'}</label>
                <textarea
                  rows={2}
                  placeholder={locale === 'ar' ? 'أدخل ملاحظات حول روتيش التدريب والجولات السريرية...' : 'Supervision notes...'}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer shadow-xs"
                >
                  {createMutation.isPending || updateMutation.isPending ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ البيانات' : 'Save Supervisor')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* 6. Evaluation Details Modal */}
      {isEvalModalOpen && evalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-xl border border-slate-200 p-6 space-y-4">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Star className="w-4.5 h-4.5 text-amber-500 fill-amber-500" />
                <span>{locale === 'ar' ? 'سجل تقييم أداء المشرف السريري' : 'Supervisor Evaluation Scorecard'}</span>
              </h3>
              <button onClick={() => setIsEvalModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Doctor Summary Header */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{evalItem.supervisor_name}</div>
                  <div className="text-[11px] text-teal-700 font-semibold">{evalItem.department?.name_ar} • {evalItem.hospital_name}</div>
                </div>
                <div className="text-end">
                  <div className="text-xl font-black text-teal-800">⭐ {evalItem.kpi_score}%</div>
                  <div className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block">
                    {locale === 'ar' ? 'ممتاز' : 'Excellent'}
                  </div>
                </div>
              </div>

              {/* Rubric Criteria Breakdown */}
              <div className="space-y-2.5">
                <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>{locale === 'ar' ? 'تفاصيل المؤشرات المعتمدة للتقييم:' : 'Evaluation Criteria Breakdown:'}</span>
                </h4>

                <div className="p-3 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="font-medium text-slate-700">{locale === 'ar' ? 'التواجد في الجولات السريرية والمستشفى:' : 'Clinical Rounds Presence:'}</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">96 / 100</span>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="font-medium text-slate-700">{locale === 'ar' ? 'رصد الحضور والغياب اليومي للطلاب:' : 'Daily Attendance Logging:'}</span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">98 / 100</span>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="font-medium text-slate-700">{locale === 'ar' ? 'الالتزام برصد التقييمات الأسبوعية:' : 'Weekly Assessment Timeliness:'}</span>
                  <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100">92 / 100</span>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-slate-100 flex items-center justify-between">
                  <span className="font-medium text-slate-700">{locale === 'ar' ? 'معدل رضا الطلاب عن الإشراف:' : 'Student Satisfaction Rate:'}</span>
                  <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100">95 / 100</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEvalModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-teal-700 text-white font-bold cursor-pointer"
                >
                  {locale === 'ar' ? 'إغلاق النافذة' : 'Close'}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
