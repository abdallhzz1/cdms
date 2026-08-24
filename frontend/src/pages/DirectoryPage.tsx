import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { 
  Search, ChevronRight, ChevronLeft, UserPlus, X, 
  CheckCircle, AlertCircle, FileSpreadsheet, Download, UploadCloud, FileCheck,
  Pencil, Trash2
} from 'lucide-react';

type DirectoryKind = 'students' | 'supervisors' | 'departments' | 'sites';
type RecordItem = Record<string, any>;
type RegistrationCycle = {id:number;academic_level:string;status:string;academic_year?:{code:string};groups?:Array<{name:string}>};

const paths: Record<DirectoryKind, string> = { 
  students: '/students', 
  supervisors: '/people', 
  departments: '/departments', 
  sites: '/training-sites' 
};

const permissions: Record<DirectoryKind, string> = { 
  students: 'students.view', 
  supervisors: 'people.view', 
  departments: 'departments.view', 
  sites: 'training_sites.view' 
};

export function DirectoryPage({ kind }: { kind: DirectoryKind }) {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search input state with debouncing to prevent losing focus
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState('50');
  
  // Debounce search input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Single Add / Edit Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [modalSuccessMsg, setModalSuccessMsg] = useState('');
  const [modalErrorMsg, setModalErrorMsg] = useState('');

  // Bulk Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const [importErrorMsg, setImportErrorMsg] = useState('');
  const [importCycleId, setImportCycleId] = useState('');

  // Student Form State
  const [studentForm, setStudentForm] = useState({
    university_number: '',
    full_name_ar: '',
    full_name_en: '',
    national_id: '',
    academic_level: 'fourth',
    batch_year: 2022,
    registration_status: 'active',
    academic_registration_status: 'registered',
    gender: 'male',
    university_email: '',
    phone: '',
    city: 'الخليل',
    notes: '',
    gpa: '',
    warning_count: 0,
    group_registration_cycle_id: '',
    main_group_code: '',
  });

  const resetStudentForm = () => {
    setStudentForm({
      university_number: '',
      full_name_ar: '',
      full_name_en: '',
      national_id: '',
      academic_level: 'fourth',
      batch_year: 2022,
      registration_status: 'active',
      academic_registration_status: 'registered',
      gender: 'male',
      university_email: '',
      phone: '',
      city: 'الخليل',
      notes: '',
      gpa: '',
      warning_count: 0,
      group_registration_cycle_id: '',
      main_group_code: '',
    });
  };

  const query = new URLSearchParams({ per_page: perPage, page: String(page) });
  if (debouncedSearch.trim()) query.set('search', debouncedSearch.trim());
  if (kind === 'students' && levelFilter) query.set('academic_level', levelFilter);
  
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['directory', kind, page, perPage, debouncedSearch, levelFilter],
    queryFn: () => apiFetch<RecordItem[]>(`${paths[kind]}?${query.toString()}`),
    placeholderData: (previousData) => previousData,
  });

  const { data: registrationCycles = [] } = useQuery({
    queryKey: ['group-registration-cycles', 'student-directory'],
    queryFn: () => apiFetch<RegistrationCycle[]>('/group-registration-cycles'),
    enabled: kind === 'students' && can('students.create') && can('group_registration.view'),
  });

  // Create Student Mutation
  const createStudentMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/students', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
      setModalSuccessMsg(locale === 'ar' ? 'تمت إضافة الطالب بنجاح!' : 'Student added successfully!');
      setTimeout(() => {
        setModalSuccessMsg('');
        setIsAddModalOpen(false);
        resetStudentForm();
      }, 1000);
    },
    onError: (err: any) => {
      setModalErrorMsg(err?.message || (locale === 'ar' ? 'تعذر حفظ بيانات الطالب.' : 'Failed to save student.'));
    }
  });

  // Update Student Mutation
  const updateStudentMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/students/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
      setModalSuccessMsg(locale === 'ar' ? 'تم تحديث بيانات الطالب بنجاح!' : 'Student updated successfully!');
      setTimeout(() => {
        setModalSuccessMsg('');
        setIsAddModalOpen(false);
        setEditingStudent(null);
        resetStudentForm();
      }, 1000);
    },
    onError: (err: any) => {
      setModalErrorMsg(err?.message || (locale === 'ar' ? 'تعذر تحديث بيانات الطالب.' : 'Failed to update student.'));
    }
  });

  // Delete Student Mutation
  const deleteStudentMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/students/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
    },
    onError: (err: any) => {
      alert(err?.message || (locale === 'ar' ? 'تعذر حذف سجل الطالب.' : 'Failed to delete student.'));
    }
  });

  // Bulk Import Mutation
  const bulkImportMutation = useMutation({
    mutationFn: ({students,cycleId}:{students:any[];cycleId:string}) => apiFetch<any>('/students/bulk-import', { method: 'POST', body: { students, group_registration_cycle_id: cycleId ? Number(cycleId) : null } }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['directory', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['group-registration-cycles'] });
      setImportSuccessMsg(locale === 'ar' ? `تمت إضافة ${res.imported ?? 0} طالب وتحديث ${res.updated ?? 0} سجل${res.rostered ? ` وربط ${res.rostered} طالب بقائمة التسجيل` : ''}.` : 'Students imported successfully!');
      setTimeout(() => {
        setImportSuccessMsg('');
        setIsImportModalOpen(false);
        setImportRows([]);
        setImportFileName('');
        setImportCycleId('');
      }, 1800);
    },
    onError: (err: any) => {
      setImportErrorMsg(err?.message || (locale === 'ar' ? 'تعذر إتمام الاستيراد.' : 'Failed to import students.'));
    }
  });

  const handleOpenAdd = () => {
    setEditingStudent(null);
    resetStudentForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (student: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStudent(student);
    setStudentForm({
      university_number: student.university_number || '',
      full_name_ar: student.full_name_ar || '',
      full_name_en: student.full_name_en || '',
      national_id: student.national_id || '',
      academic_level: student.academic_level || 'fourth',
      batch_year: student.batch_year || (student.academic_level === 'fourth' ? 2022 : student.academic_level === 'fifth' ? 2021 : 2020),
      registration_status: student.registration_status || 'active',
      academic_registration_status: student.academic_registration_status || 'registered',
      gender: student.gender || 'male',
      university_email: student.university_email || '',
      phone: student.phone || '',
      city: student.city || 'الخليل',
      notes: student.notes || '',
      gpa: student.gpa !== null && student.gpa !== undefined ? String(student.gpa) : '',
      warning_count: student.warning_count ?? 0,
      group_registration_cycle_id: student.registration_cycle_id ? String(student.registration_cycle_id) : '',
      main_group_code: student.registration_main_group || '',
    });
    setIsAddModalOpen(true);
  };

  const handleDeleteStudent = (student: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const studentName = locale === 'ar' ? student.full_name_ar : (student.full_name_en || student.full_name_ar);
    if (window.confirm(locale === 'ar' ? `هل أنت متأكد من رغبتك في حذف الطالب "${studentName}" (${student.university_number})؟` : `Are you sure you want to delete student "${studentName}"?`)) {
      deleteStudentMutation.mutate(student.id);
    }
  };

  const handleStudentFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalErrorMsg('');
    const payload = {
      ...studentForm,
      batch_year: studentForm.batch_year ? Number(studentForm.batch_year) : undefined,
      university_email: studentForm.university_email || `${studentForm.university_number}@students.hebron.edu`,
      gpa: studentForm.gpa !== '' ? Number(studentForm.gpa) : null,
      warning_count: Number(studentForm.warning_count || 0),
    };

    if (editingStudent) {
      updateStudentMutation.mutate({ id: editingStudent.id, body: payload });
    } else {
      createStudentMutation.mutate(payload);
    }
  };

  // Download CSV Template with GPA and Warning Count
  const handleDownloadTemplate = () => {
    const csvContent = "\uFEFF" + 
      "الرقم_الجامعي,الاسم_بالعربية,الاسم_بالانجليزية,السنة_السريرية,المعدل_التراكمي,عدد_الإنذارات,سنة_الدفعة,الجنس,رقم_الهاتف,المدينة,الحالة_النظامية,حالة_التسجيل_الأكاديمي,المجموعة_الرئيسية\n" +
      "22011001,محمد أحمد إبراهيم القواسمي,Mohammad A. Qawasmi,fourth,78.50,0,2022,male,0599111222,الخليل,active,registered,L\n" +
      "22011002,سارة محمود علي التميمي,Sara M. Tamimi,fourth,71.25,1,2022,female,0599222333,الخليل,active,unregistered,M\n";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'نموذج_استيراد_الطلبة_جامعة_الخليل.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse Uploaded CSV File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setImportErrorMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          setImportErrorMsg(locale === 'ar' ? 'الملف فارغ أو لا يحتوي على صفوف بيانات كافية.' : 'File is empty or invalid.');
          return;
        }

        const parsed: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 2 && cols[0] && cols[1]) {
            // Check if column 4 is GPA (numeric or decimal) or batch_year
            const col4 = cols[4] || '';
            const col5 = cols[5] || '';
            
            // Official template: student data, academic registration status, then main group.
            if (cols.length >= 10) {
              parsed.push({
                university_number: cols[0],
                full_name_ar: cols[1],
                full_name_en: cols[2] || '',
                academic_level: cols[3] || 'fourth',
                gpa: col4 ? Number(col4) : undefined,
                warning_count: col5 ? Number(col5) : 0,
                batch_year: cols[6] || '2022',
                gender: cols[7] || 'male',
                phone: cols[8] || '',
                city: cols[9] || 'الخليل',
                registration_status: cols[10] || 'active',
                academic_registration_status: cols[11] || 'registered',
                main_group_code: (cols[12] || '').toUpperCase(),
              });
            } else {
              // Legacy 9 cols support
              parsed.push({
                university_number: cols[0],
                full_name_ar: cols[1],
                full_name_en: cols[2] || '',
                academic_level: cols[3] || 'fourth',
                batch_year: cols[4] || '2022',
                gender: cols[5] || 'male',
                phone: cols[6] || '',
                city: cols[7] || 'الخليل',
                registration_status: cols[8] || 'active',
                academic_registration_status: 'registered',
              });
            }
          }
        }

        if (parsed.length === 0) {
          setImportErrorMsg(locale === 'ar' ? 'لم يتم العثور على سجلات صالحة في الملف.' : 'No valid records found in file.');
        } else {
          setImportRows(parsed);
        }
      } catch (err: any) {
        setImportErrorMsg(locale === 'ar' ? 'فشل في قراءة الملف. يرجى التأكد من أنه ملف CSV صالح.' : 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  if (!can(permissions[kind])) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading && !data) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  
  const rows = data ?? [];
  const name = (row: RecordItem) => String(locale === 'ar' ? row.full_name_ar ?? row.name_ar ?? '' : row.full_name_en ?? row.name_en ?? row.full_name_ar ?? row.name_ar ?? '');
  
  const StatusBadge = ({ active, text }: { active: boolean, text: string }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-teal-50 text-teal-700 border border-teal-100' : 'bg-slate-100 text-slate-600'
    }`}>
      {text}
    </span>
  );

  const getStatus = (row: RecordItem) => {
    if (kind === 'students') {
      const isAct = row.academic_registration_status === 'registered';
      return <StatusBadge active={isAct} text={isAct ? (locale === 'ar' ? 'مسجل' : 'Registered') : (locale === 'ar' ? 'غير مسجل' : 'Unregistered')} />;
    }
    return <StatusBadge active={!!row.is_active} text={row.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')} />;
  };

  const getBatchLabel = (row: RecordItem) => {
    if (row.batch_year) return locale === 'ar' ? `دفعة ${row.batch_year}` : `Batch ${row.batch_year}`;
    if (row.academic_level === 'fourth') return locale === 'ar' ? 'دفعة 2022' : 'Batch 2022';
    if (row.academic_level === 'fifth') return locale === 'ar' ? 'دفعة 2021' : 'Batch 2021';
    if (row.academic_level === 'sixth') return locale === 'ar' ? 'دفعة 2020' : 'Batch 2020';
    return (row.academic_year as RecordItem | undefined)?.code ?? '—';
  };

  const getLevelLabel = (level: string) => {
    const map: Record<string, string> = {
      fourth: locale === 'ar' ? 'سنة رابعة' : '4th Year',
      fifth: locale === 'ar' ? 'سنة خامسة' : '5th Year',
      sixth: locale === 'ar' ? 'سنة سادسة' : '6th Year',
    };
    return map[level] || level;
  };

  const manualRegistrationCycles = registrationCycles.filter(c=>c.status!=='archived'&&c.academic_level===studentForm.academic_level);
  const selectedManualCycle = manualRegistrationCycles.find(c=>String(c.id)===studentForm.group_registration_cycle_id);

  const pageTitle = kind === 'students' 
    ? (locale === 'ar' ? 'دليل وسجلات الطلاب' : 'Students Directory')
    : (locale === 'ar' ? 'دليل الكادر والمشرفين' : 'Staff Directory');

  const pageDesc = kind === 'students'
    ? (locale === 'ar' ? 'إدارة سجلات وبيانات طلبة كلية الطب والمرحلة السريرية' : 'Manage student clinical records and cohorts')
    : (locale === 'ar' ? 'عرض المشرفين والأقسام ومواقع التدريب' : 'View supervisors, departments and training sites');

  const headers: Record<DirectoryKind, string[]> = {
    students: [
      locale === 'ar' ? 'الاسم' : 'Student Name', 
      locale === 'ar' ? 'الرقم الجامعي' : 'University ID', 
      locale === 'ar' ? 'الدفعة' : 'Batch',
      locale === 'ar' ? 'السنة الدراسية' : 'Academic Year', 
      locale === 'ar' ? 'المجموعة الرئيسية' : 'Main Group',
      locale === 'ar' ? 'الحالة الأكاديمية' : 'Status',
      locale === 'ar' ? 'الإجراءات' : 'Actions'
    ],
    supervisors: [
      locale === 'ar' ? 'المشرف' : 'Supervisor', 
      locale === 'ar' ? 'القسم' : 'Department', 
      locale === 'ar' ? 'موقع التدريب' : 'Training Site', 
      locale === 'ar' ? 'السعة' : 'Capacity', 
      locale === 'ar' ? 'الحالة' : 'Status'
    ],
    departments: [
      locale === 'ar' ? 'القسم' : 'Department', 
      locale === 'ar' ? 'الحالة' : 'Status'
    ],
    sites: [
      locale === 'ar' ? 'موقع التدريب' : 'Training Site', 
      locale === 'ar' ? 'القسم' : 'Department', 
      locale === 'ar' ? 'السعة' : 'Capacity', 
      locale === 'ar' ? 'الحالة' : 'Status'
    ],
  };

  const cohorts = [
    { value: '', label_ar: 'جميع الطلبة', label_en: 'All Students' },
    { value: 'fourth', label_ar: 'الدفعة الرابعة (سنة 4)', label_en: '4th Year (Cohort 4)' },
    { value: 'fifth', label_ar: 'الدفعة الخامسة (سنة 5)', label_en: '5th Year (Cohort 5)' },
    { value: 'sixth', label_ar: 'الدفعة السادسة (سنة 6)', label_en: '6th Year (Cohort 6)' },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-14">
      
      {/* Top Header with Perfectly Aligned Capsule Dock */}
      <div className="flex flex-row items-center justify-between gap-4 py-0.5">
        <div className="min-w-0">
          <h1 className="text-base sm:text-2xl font-black text-slate-800 leading-tight truncate">
            {pageTitle}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5 hidden sm:block">
            {pageDesc}
          </p>
        </div>

        {kind === 'students' && can('students.create') && (
          <div className="flex items-center p-1 bg-white rounded-full border border-slate-200/80 shadow-xs gap-1 shrink-0">
            {/* 1. Download Template */}
            <button 
              type="button"
              onClick={handleDownloadTemplate}
              className="w-9 h-9 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors"
              title={locale === 'ar' ? 'تحميل نموذج Excel / CSV الفارغ' : 'Download Sample CSV'}
            >
              <Download className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-slate-200" />

            {/* 2. Bulk Import */}
            <button 
              type="button"
              onClick={() => { setImportErrorMsg(''); setImportSuccessMsg(''); setIsImportModalOpen(true); }}
              className="w-9 h-9 rounded-full text-teal-600 hover:bg-teal-50 flex items-center justify-center transition-colors"
              title={locale === 'ar' ? 'استيراد قائمة الطلبة من Excel' : 'Import Excel'}
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-slate-200" />

            {/* 3. Add Student */}
            <button 
              type="button"
              onClick={handleOpenAdd}
              className="h-9 px-3 sm:px-4 rounded-full bg-teal-600 text-white font-bold text-xs shadow-sm hover:opacity-95 flex items-center justify-center gap-1.5 transition-all"
              title={locale === 'ar' ? 'إضافة طالب سريري جديد' : 'Add Student'}
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{locale === 'ar' ? 'إضافة طالب' : 'Add Student'}</span>
            </button>
          </div>
        )}
      </div>
      
      {/* Cohort Tabs for Students */}
      {kind === 'students' && (
        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 gap-1.5 overflow-x-auto">
          {cohorts.map((c) => (
            <button
              key={c.value}
              onClick={() => { setLevelFilter(c.value); setPage(1); }}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                levelFilter === c.value
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {locale === 'ar' ? c.label_ar : c.label_en}
            </button>
          ))}
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 right-0 rtl:right-0 rtl:left-auto ltr:left-0 ltr:right-auto flex items-center px-3.5 pointer-events-none text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input 
            type="text"
            value={searchInput} 
            onChange={(e) => setSearchInput(e.target.value)} 
            placeholder={locale === 'ar' ? 'البحث بالاسم أو الرقم الجامعي...' : 'Search by name or university ID...'} 
            className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 rtl:pr-10 ltr:pl-10 text-sm text-slate-800 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors" 
          />
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {/* Per Page Selector */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>{locale === 'ar' ? 'عرض:' : 'Show:'}</span>
            <select
              value={perPage}
              onChange={(e) => { setPerPage(e.target.value); setPage(1); }}
              className="rounded-xl border border-slate-200 bg-slate-50 py-1.5 px-2.5 text-xs font-bold text-slate-700 focus:border-teal-500"
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200 ({locale === 'ar' ? 'الكل' : 'All'})</option>
            </select>
          </div>

          <span className="text-xs font-semibold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
            {locale === 'ar' ? 'إجمالي المعروض' : 'Count'}: <span className="text-teal-600 font-bold">{rows.length}</span>
          </span>
        </div>
      </div>

      {/* Records Table */}
      {rows.length === 0 ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching records'} />
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {rows.map((row) => (
            <article key={String(row.id)} onClick={() => { if (kind === 'students') navigate(`/students/${String(row.id)}`); else if (kind === 'supervisors') navigate(`/staff/${String(row.id)}`); }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-teal-100 bg-teal-50 text-sm font-black text-teal-700">
                  {(row.photo_url || (kind === 'students' && localStorage.getItem(`student_photo_${row.id}`))) ? <img src={row.photo_url || localStorage.getItem(`student_photo_${row.id}`)!} alt={name(row)} className="h-full w-full object-cover"/> : name(row).substring(0,1)}
                </div>
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-slate-800">{name(row)}</h3>{kind==='students'&&<p className="mt-1 font-mono text-[11px] text-slate-500">{row.university_number}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{kind==='students'&&<span className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-800">{getLevelLabel(row.academic_level)}</span>}{getStatus(row)}</div></div>
                {kind==='students'&&<div className="flex shrink-0 gap-1" onClick={event=>event.stopPropagation()}>{can('students.update')&&<button type="button" onClick={event=>handleOpenEdit(row,event)} className="rounded-lg bg-slate-50 p-2 text-teal-600"><Pencil className="h-4 w-4"/></button>}{can('students.delete')&&<button type="button" onClick={event=>handleDeleteStudent(row,event)} className="rounded-lg bg-red-50 p-2 text-red-500"><Trash2 className="h-4 w-4"/></button>}</div>}
              </div>
              {kind==='students'&&<div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-[11px]"><div><span className="text-slate-400">الدفعة</span><p className="mt-1 font-bold text-slate-700">{getBatchLabel(row)}</p></div><div><span className="text-slate-400">المجموعة الرئيسية</span><p className="mt-1 font-bold text-slate-700">{row.registration_main_group||'—'}</p></div></div>}
            </article>
          ))}
        </div>
        <div className="hidden rounded-3xl border border-slate-100 bg-white shadow-sm md:block">
          <Table>
            <TableHeader>
              <TableRow>
                {headers[kind].map((header) => <TableHead key={header}>{header}</TableHead>)}
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow 
                  key={String(row.id)} 
                  onClick={() => {
                    if (kind === 'students') navigate(`/students/${String(row.id)}`);
                    else if (kind === 'supervisors') navigate(`/staff/${String(row.id)}`);
                  }}
                  className={(kind === 'students' || kind === 'supervisors') ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}
                >
                  {/* 1. Student Name & Avatar */}
                  <TableCell>
                    <div className="font-bold text-slate-800 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-black shrink-0 border border-teal-100 overflow-hidden">
                        {(row.photo_url || (kind === 'students' && localStorage.getItem(`student_photo_${row.id}`))) ? (
                          <img 
                            src={row.photo_url || localStorage.getItem(`student_photo_${row.id}`)!} 
                            alt={name(row)} 
                            className="w-full h-full object-cover rounded-full" 
                          />
                        ) : (
                          name(row).substring(0, 1)
                        )}
                      </div>
                      <div>
                        <span className="hover:text-teal-600 transition-colors block">{name(row)}</span>
                        {kind === 'students' && row.full_name_en && locale === 'ar' && (
                          <span className="text-[11px] text-slate-400 font-normal">{row.full_name_en}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* 2. University ID */}
                  <TableCell>
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      {row.university_number}
                    </span>
                  </TableCell>

                  {/* 3. Batch (الدفعة) */}
                  <TableCell>
                    <span className="font-semibold text-xs text-slate-700">
                      {getBatchLabel(row)}
                    </span>
                  </TableCell>

                  {/* 4. Academic Level (السنة الدراسية) */}
                  <TableCell>
                    <span className="font-semibold text-xs text-teal-800 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100">
                      {getLevelLabel(row.academic_level)}
                    </span>
                  </TableCell>

                  {/* 5. Main registration group */}
                  <TableCell>
                    <span className="font-bold text-xs text-slate-700">
                      {row.registration_main_group || '—'}
                    </span>
                  </TableCell>

                  {/* 6. Status (الحالة) */}
                  <TableCell>
                    {getStatus(row)}
                  </TableCell>

                  {/* 7. Actions (تعديل وحذف) */}
                  {kind === 'students' && (
                    <TableCell>
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {can('students.update') && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenEdit(row, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                            title={locale === 'ar' ? 'تعديل بيانات الطالب' : 'Edit Student'}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {can('students.delete') && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteStudent(row, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title={locale === 'ar' ? 'حذف الطالب' : 'Delete Student'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div></>
      )}

      {/* Pagination Controls */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-slate-400">
          {locale === 'ar' ? `الصفحة ${page}` : `Page ${page}`}
        </span>

        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1} 
            onClick={() => setPage((value) => value - 1)} 
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-xs"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            <span>{locale === 'ar' ? 'السابق' : 'Previous'}</span>
          </button>

          <span className="text-xs font-bold text-slate-700 bg-white px-3.5 py-2 rounded-xl border border-slate-100 shadow-xs">
            {page}
          </span>

          <button 
            disabled={rows.length < Number(perPage)} 
            onClick={() => setPage((value) => value + 1)} 
            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-all shadow-xs"
          >
            <span>{locale === 'ar' ? 'التالي' : 'Next'}</span>
            <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. ADD / EDIT STUDENT MODAL */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/25 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-500/25">
                  {editingStudent ? <Pencil className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">
                    {editingStudent ? (locale === 'ar' ? 'تعديل بيانات الطالب' : 'Edit Student Details') : (locale === 'ar' ? 'إضافة طالب سريري جديد' : 'Add New Clinical Student')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingStudent ? `${editingStudent.full_name_ar} (${editingStudent.university_number})` : (locale === 'ar' ? 'تسجيل طالب في قاعدة بيانات الكلية والمرحلة السريرية' : 'Register student into clinical database')}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingStudent(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleStudentFormSubmit} className="p-6 space-y-4 overflow-y-auto">
              {modalSuccessMsg && (
                <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{modalSuccessMsg}</span>
                </div>
              )}

              {modalErrorMsg && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{modalErrorMsg}</span>
                </div>
              )}

              {/* Row 1: University Number & Academic Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'الرقم الجامعي *' : 'University ID *'}
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="22011234"
                    value={studentForm.university_number}
                    onChange={(e) => setStudentForm({ ...studentForm, university_number: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'السنة الدراسية السريرية *' : 'Clinical Year *'}
                  </label>
                  <select
                    required
                    value={studentForm.academic_level}
                    onChange={(e) => setStudentForm({ ...studentForm, academic_level: e.target.value, group_registration_cycle_id: '', main_group_code: '' })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="fourth">{locale === 'ar' ? 'سنة رابعة (Fourth Year)' : '4th Year'}</option>
                    <option value="fifth">{locale === 'ar' ? 'سنة خامسة (Fifth Year)' : '5th Year'}</option>
                    <option value="sixth">{locale === 'ar' ? 'سنة سادسة (Sixth Year)' : '6th Year'}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">{locale === 'ar' ? 'حالة التسجيل الأكاديمي' : 'Academic Registration'}</label>
                  <select value={studentForm.academic_registration_status} onChange={(e) => setStudentForm({ ...studentForm, academic_registration_status: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white">
                    <option value="registered">{locale === 'ar' ? 'مسجل' : 'Registered'}</option>
                    <option value="unregistered">{locale === 'ar' ? 'غير مسجل' : 'Unregistered'}</option>
                  </select>
                </div>
              </div>

              {/* Registration cycle and main group */}
              <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4 space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-teal-800">دورة التسجيل والمجموعة الرئيسية</h4>
                  <p className="mt-1 text-[11px] text-teal-800">اختياري: اترك الدورة فارغة لحفظ الطالب في الدليل فقط، أو اخترها لإتاحته في رابط التسجيل الذاتي.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">دورة التسجيل</label>
                    <select
                      value={studentForm.group_registration_cycle_id}
                      onChange={(e)=>setStudentForm({...studentForm,group_registration_cycle_id:e.target.value,main_group_code:''})}
                      className="w-full rounded-xl border border-teal-200 bg-white px-3.5 py-2.5 text-sm"
                    >
                      <option value="">بدون ربط بدورة</option>
                      {manualRegistrationCycles.map(c=><option key={c.id} value={c.id}>{c.academic_year?.code||'—'} · {getLevelLabel(c.academic_level)}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">المجموعة الرئيسية {studentForm.group_registration_cycle_id?'*':''}</label>
                    <select
                      required={Boolean(studentForm.group_registration_cycle_id)}
                      disabled={!selectedManualCycle}
                      value={studentForm.main_group_code}
                      onChange={(e)=>setStudentForm({...studentForm,main_group_code:e.target.value})}
                      className="w-full rounded-xl border border-teal-200 bg-white px-3.5 py-2.5 text-sm disabled:bg-slate-100"
                    >
                      <option value="">اختر المجموعة</option>
                      {selectedManualCycle?.groups?.map(g=><option key={g.name} value={g.name}>{g.name}</option>)}
                    </select>
                  </div>
                </div>
                {manualRegistrationCycles.length===0&&<p className="text-[11px] font-bold text-slate-700">لا توجد دورة تسجيل لهذه السنة السريرية. أنشئ المجموعات الفارغة أولاً من شاشة إدارة المجموعات.</p>}
              </div>

              {/* Row 2: Full Name Arabic & English */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'الاسم باللغة العربية (رباعي) *' : 'Full Name (Arabic) *'}
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="مثال: أحمد محمود علي القواسمي"
                    value={studentForm.full_name_ar}
                    onChange={(e) => setStudentForm({ ...studentForm, full_name_ar: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'الاسم باللغة الإنجليزية' : 'Full Name (English)'}
                  </label>
                  <input
                    type="text"
                    placeholder="Ahmad M. Qawasmi"
                    value={studentForm.full_name_en}
                    onChange={(e) => setStudentForm({ ...studentForm, full_name_en: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              {/* Row 3: Batch Year & Registration Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'سنة الدفعة' : 'Batch Year'}
                  </label>
                  <input
                    type="number"
                    value={studentForm.batch_year}
                    onChange={(e) => setStudentForm({ ...studentForm, batch_year: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'الحالة الأكاديمية' : 'Status'}
                  </label>
                  <select
                    value={studentForm.registration_status}
                    onChange={(e) => setStudentForm({ ...studentForm, registration_status: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="active">{locale === 'ar' ? 'منتظم / نشط' : 'Active'}</option>
                    <option value="deferred">{locale === 'ar' ? 'مؤجل' : 'Deferred'}</option>
                    <option value="suspended">{locale === 'ar' ? 'موقوف' : 'Suspended'}</option>
                    <option value="graduated">{locale === 'ar' ? 'متخرج' : 'Graduated'}</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'الجنس' : 'Gender'}
                  </label>
                  <select
                    value={studentForm.gender}
                    onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  >
                    <option value="male">{locale === 'ar' ? 'ذكر' : 'Male'}</option>
                    <option value="female">{locale === 'ar' ? 'أنثى' : 'Female'}</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Phone & City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'رقم الهاتف' : 'Phone'}
                  </label>
                  <input
                    type="tel"
                    placeholder="0599123456"
                    value={studentForm.phone}
                    onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'المدينة / السكن' : 'City'}
                  </label>
                  <input
                    type="text"
                    placeholder="الخليل"
                    value={studentForm.city}
                    onChange={(e) => setStudentForm({ ...studentForm, city: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>
              </div>

              {/* Row 5: Baseline GPA (Out of 100%) & Academic Warning Count */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-teal-50/50 p-3.5 rounded-2xl border border-teal-100/80">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-teal-800">
                    {locale === 'ar' ? 'المعدل التراكمي السابق (من %100)' : 'Cumulative GPA (out of 100%)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="مثال: 78.50"
                    value={studentForm.gpa}
                    onChange={(e) => setStudentForm({ ...studentForm, gpa: e.target.value })}
                    className="w-full rounded-xl border border-teal-200 px-3.5 py-2 text-sm bg-white font-bold text-slate-800 focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800">
                    {locale === 'ar' ? 'عدد الإنذارات الأكاديمية التراكمية' : 'Warning Count'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    placeholder="0"
                    value={studentForm.warning_count}
                    onChange={(e) => setStudentForm({ ...studentForm, warning_count: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm bg-white font-bold text-slate-800 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/20"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-5 mt-4 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingStudent(null);
                  }}
                  className="rounded-xl"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button 
                  type="submit" 
                  isLoading={createStudentMutation.isPending || updateStudentMutation.isPending}
                  className="rounded-xl bg-teal-600 text-white font-bold shadow-md shadow-teal-500/25"
                >
                  {editingStudent ? (locale === 'ar' ? 'تحديث البيانات' : 'Update Student') : (locale === 'ar' ? 'حفظ الطالب' : 'Save Student')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. BULK IMPORT EXCEL / CSV MODAL */}
      {/* ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/25 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">
                    {locale === 'ar' ? 'استيراد قائمة الطلبة من ملف Excel / CSV' : 'Bulk Import Students from Excel / CSV'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {locale === 'ar' ? 'رفع وتغذية قاعدة البيانات بدفعة كاملة من طلبة الكلية دفعة واحدة' : 'Upload and import student cohorts in bulk'}
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportRows([]);
                  setImportFileName('');
                  setImportCycleId('');
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              
              {/* Notification Alerts */}
              {importSuccessMsg && (
                <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-100 text-xs font-bold text-teal-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}

              {importErrorMsg && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-100 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{importErrorMsg}</span>
                </div>
              )}

              {/* Registration cycle binding */}
              <div className="space-y-2 rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
                <label className="block text-xs font-bold text-teal-800">
                  {locale === 'ar' ? 'ربط القائمة بدورة التسجيل والمجموعات الرئيسية' : 'Link to registration cycle and main groups'}
                </label>
                <select
                  value={importCycleId}
                  onChange={(e) => { setImportCycleId(e.target.value); setImportErrorMsg(''); }}
                  className="w-full rounded-xl border border-teal-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:border-teal-500"
                >
                  <option value="">حفظ في دليل الطلاب فقط (بدون ربط بدورة)</option>
                  {registrationCycles.filter(c=>c.status!=='archived').map(c=><option key={c.id} value={c.id}>{c.academic_year?.code || '—'} · {getLevelLabel(c.academic_level)} · {c.groups?.map(g=>g.name).join(', ') || 'المجموعات الرئيسية'}</option>)}
                </select>
                <p className="text-[11px] leading-5 text-teal-800">
                  {importCycleId
                    ? 'سيتم تحديث دليل الطلاب وربط كل طالب بالمجموعة الرئيسية الموجودة في عمود المجموعة_الرئيسية. حالة registered أو unregistered هي الحالة الأكاديمية العامة للطالب.'
                    : 'يمكن الاستيراد للدليل فقط. لتمكين رابط التسجيل الذاتي اختر دورة؛ ويجب أن يحتوي الملف على المجموعة الرئيسية لكل طالب.'}
                </p>
                {registrationCycles.length===0&&<button type="button" onClick={()=>navigate('/distribution/groups')} className="text-xs font-bold text-teal-700 underline">لا توجد دورة؟ أنشئ المجموعات الفارغة أولاً من شاشة إدارة المجموعات</button>}
              </div>

              {/* Step 1: Download Template */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">
                    {locale === 'ar' ? 'الخطوة 1: تنزيل وتعبئة النموذج المعتمد' : 'Step 1: Download & Fill Official Template'}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {locale === 'ar' ? 'يتضمن النموذج حالة التسجيل الأكاديمية والمجموعة الرئيسية لكل طالب' : 'Template includes academic registration status and main group'}
                  </p>
                </div>
                <Button 
                  type="button"
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  className="rounded-xl shrink-0 flex items-center gap-2 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'تنزيل النموذج' : 'Download'}</span>
                </Button>
              </div>

              {/* Step 2: Upload Area */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800">
                  {locale === 'ar' ? 'الخطوة 2: رفع ملف البيانات (.CSV)' : 'Step 2: Upload CSV File'}
                </h4>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".csv,text/csv" 
                  onChange={handleFileChange} 
                  className="hidden" 
                />

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-teal-400 hover:bg-teal-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
                >
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <UploadCloud className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">
                      {importFileName || (locale === 'ar' ? 'اضغط هنا لاختيار ملف الـ CSV' : 'Click to select CSV file')}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {importFileName ? (locale === 'ar' ? 'تم اختيار الملف بنجاح' : 'File selected') : (locale === 'ar' ? 'ملفات CSV المدعومة (ترميز UTF-8)' : 'Supported: UTF-8 CSV')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 3: Data Preview */}
              {importRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-teal-600" />
                      <span>{locale === 'ar' ? 'معاينة السجلات الجاهزة للاستيراد' : 'Import Preview'}</span>
                    </h4>
                    <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-lg">
                      {importRows.length} {locale === 'ar' ? 'طالب جاهز' : 'students'}
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 shadow-inner">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-100 text-slate-500 font-bold">
                        <tr>
                          <th className="p-2 text-start">#</th>
                          <th className="p-2 text-start">{locale === 'ar' ? 'الرقم الجامعي' : 'Univ ID'}</th>
                          <th className="p-2 text-start">{locale === 'ar' ? 'الاسم' : 'Name'}</th>
                          <th className="p-2 text-start">{locale === 'ar' ? 'السنة السريرية' : 'Level'}</th>
                          <th className="p-2 text-start">{locale === 'ar' ? 'الحالة' : 'Status'}</th>
                          <th className="p-2 text-start">{locale === 'ar' ? 'المجموعة' : 'Group'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importRows.slice(0, 15).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="p-2 font-mono text-slate-400">{i + 1}</td>
                            <td className="p-2 font-bold text-slate-700">{r.university_number}</td>
                            <td className="p-2 text-slate-800">{r.full_name_ar}</td>
                            <td className="p-2 text-slate-600">{getLevelLabel(r.academic_level)}</td>
                            <td className="p-2 text-slate-500">{r.academic_registration_status==='registered'?'مسجل':'غير مسجل'}</td>
                            <td className="p-2 font-bold text-teal-700">{r.main_group_code||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importRows.length > 15 && (
                      <div className="p-2 text-center text-[11px] font-semibold text-slate-400 bg-slate-50 border-t border-slate-100">
                        + {importRows.length - 15} {locale === 'ar' ? 'سجلات أخرى...' : 'more records...'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-5 border-t border-slate-100">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportRows([]);
                    setImportFileName('');
                    setImportCycleId('');
                  }}
                  className="rounded-xl"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button 
                  type="button" 
                  disabled={importRows.length === 0 || (Boolean(importCycleId) && importRows.some(r=>!r.main_group_code))}
                  isLoading={bulkImportMutation.isPending}
                  onClick={() => bulkImportMutation.mutate({students:importRows,cycleId:importCycleId})}
                  className="rounded-xl bg-teal-600 text-white font-bold shadow-md shadow-teal-500/25 disabled:opacity-50"
                >
                  {locale === 'ar' ? `استيراد وحفظ (${importRows.length}) طالب` : `Import (${importRows.length}) Students`}
                </Button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
