import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Search, ChevronRight, ChevronLeft } from 'lucide-react';

type DirectoryKind = 'students' | 'supervisors' | 'departments' | 'sites';
type RecordItem = Record<string, any>;

const paths: Record<DirectoryKind, string> = { students: '/students', supervisors: '/people', departments: '/departments', sites: '/training-sites' };
const permissions: Record<DirectoryKind, string> = { students: 'students.view', supervisors: 'people.view', departments: 'departments.view', sites: 'training_sites.view' };

export function DirectoryPage({ kind }: { kind: DirectoryKind }) {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ per_page: '25', page: String(page) });
  if (search.trim()) query.set('search', search.trim());
  if (kind === 'students' && levelFilter) query.set('academic_level', levelFilter);
  
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['directory', kind, page, search, levelFilter],
    queryFn: () => apiFetch<RecordItem[]>(`${paths[kind]}?${query.toString()}`),
  });

  if (!can(permissions[kind])) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  
  const rows = data ?? [];
  const name = (row: RecordItem) => String(locale === 'ar' ? row.full_name_ar ?? row.name_ar ?? '' : row.full_name_en ?? row.name_en ?? row.full_name_ar ?? row.name_ar ?? '');
  
  const StatusBadge = ({ active, text }: { active: boolean, text: string }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
    }`}>
      {text}
    </span>
  );

  const getStatus = (row: RecordItem) => {
    if (kind === 'students') {
      const isAct = row.registration_status === 'active';
      return <StatusBadge active={isAct} text={String(row.registration_status || 'Unknown')} />;
    }
    return <StatusBadge active={!!row.is_active} text={row.is_active ? t('directory.active', 'نشط') : t('directory.inactive', 'غير نشط')} />;
  };

  const headers: Record<DirectoryKind, string[]> = {
    students: [t('directory.students', 'الطلبة'), t('directory.universityNumber', 'الرقم الجامعي'), t('directory.academicYear', 'السنة الأكاديمية'), t('directory.level', 'السنة الدراسية'), t('directory.group', 'المجموعة'), t('directory.status', 'الحالة')],
    supervisors: [t('directory.supervisors', 'المشرفون'), t('directory.department', 'القسم'), t('directory.site', 'موقع التدريب'), t('directory.capacity', 'السعة'), t('directory.status', 'الحالة')],
    departments: [t('directory.departments', 'الأقسام'), t('directory.status', 'الحالة')],
    sites: [t('directory.sites', 'مواقع التدريب'), t('directory.department', 'القسم'), t('directory.capacity', 'السعة'), t('directory.status', 'الحالة')],
  };

  const cells = (row: RecordItem) => {
    if (kind === 'students') return [name(row), row.university_number, (row.academic_year as RecordItem | undefined)?.code ?? '—', row.academic_level, row.current_group_name ?? '—', getStatus(row)];
    if (kind === 'supervisors') return [name(row), (row.department as RecordItem | undefined)?.[locale === 'ar' ? 'name_ar' : 'name_en'] ?? '—', '—', row.max_students ?? '—', getStatus(row)];
    if (kind === 'departments') return [name(row), getStatus(row)];
    return [name(row), (row.department as RecordItem | undefined)?.[locale === 'ar' ? 'name_ar' : 'name_en'] ?? '—', row.max_students_per_period ?? '—', getStatus(row)];
  };

  const cohorts = [
    { value: '', label_ar: 'جميع الطلبة', label_en: 'All Students' },
    { value: '4', label_ar: 'الدفعة الرابعة (سنة 4)', label_en: '4th Year (Cohort 4)' },
    { value: '5', label_ar: 'الدفعة الخامسة (سنة 5)', label_en: '5th Year (Cohort 5)' },
    { value: '6', label_ar: 'الدفعة السادسة (سنة 6 - الامتياز)', label_en: '6th Year (Cohort 6)' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t(`directory.${kind}` as never)} description={t('directory.showing', 'عرض')} />
      
      {/* Cohort Tabs for Students */}
      {kind === 'students' && (
        <div className="flex bg-slate-100 p-1 rounded-2xl gap-1 overflow-x-auto">
          {cohorts.map((c) => (
            <button
              key={c.value}
              onClick={() => { setLevelFilter(c.value); setPage(1); }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                levelFilter === c.value
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {locale === 'ar' ? c.label_ar : c.label_en}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
            placeholder={t('common.search', 'البحث بالاسم أو الرقم المرجعي...')} 
            className="block w-full rounded-xl border-none bg-slate-50 py-2.5 pr-10 pl-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-600 transition-shadow" 
          />
        </div>
        <span className="text-sm font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">
          {t('directory.showing', 'عرض')}: <span className="text-indigo-600 font-bold">{rows.length}</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState message={t('directory.noResults', 'لا توجد نتائج')} />
      ) : (
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
                  if (kind === 'students' || kind === 'supervisors') {
                    navigate(`/${kind === 'students' ? 'students' : 'supervisors'}/${String(row.id)}`);
                  }
                }}
                className={(kind === 'students' || kind === 'supervisors') ? 'cursor-pointer hover:bg-slate-50 transition-colors' : ''}
              >
                {cells(row).map((cell, index) => (
                  <TableCell key={index}>
                    {(kind === 'students' || kind === 'supervisors') && index === 0 ? (
                      <div className="font-semibold text-indigo-600 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">
                          {String(cell).substring(0, 1)}
                        </div>
                        {cell}
                      </div>
                    ) : cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button 
          disabled={page === 1} 
          onClick={() => setPage((value) => value - 1)} 
          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
        >
          <ChevronRight className="w-4 h-4" />
          {t('directory.previous', 'السابق')}
        </button>
        <span className="text-sm font-semibold text-slate-600 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
          {page}
        </span>
        <button 
          disabled={rows.length < 25} 
          onClick={() => setPage((value) => value + 1)} 
          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm"
        >
          {t('directory.next', 'التالي')}
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
