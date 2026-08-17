import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Search, BookOpen, Plus } from 'lucide-react';

interface Course { 
  id: number; 
  code: string; 
  name_ar: string; 
  name_en: string | null; 
  credit_hours: number; 
  academic_level: string | null; 
  is_active: boolean; 
}

export function CoursesPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [credits, setCredits] = useState('1');
  
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['courses', search],
    queryFn: () => apiFetch<Course[]>(`/courses?per_page=25&search=${encodeURIComponent(search)}`)
  });

  if (!can('courses.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    await apiFetch('/courses', {
      method: 'POST',
      body: { code, name_ar: nameAr, name_en: nameEn || null, credit_hours: Number(credits), is_active: true }
    });
    setShow(false); setCode(''); setNameAr(''); setNameEn('');
    await qc.invalidateQueries({ queryKey: ['courses'] });
  };

  const StatusBadge = ({ active, text }: { active: boolean, text: string }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
      active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
    }`}>
      {text}
    </span>
  );

  const courses = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('courses.title', 'المساقات')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('courses.description', 'إدارة المساقات الدراسية والمناهج.')}</p>
        </div>
        {can('courses.manage') && (
          <Button onClick={() => setShow(!show)} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            {t('courses.create', 'إضافة مساق')}
          </Button>
        )}
      </div>

      {show && (
        <form onSubmit={create} className="grid gap-4 rounded-2xl bg-white p-6 shadow-sm border border-slate-100 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h3 className="text-sm font-bold text-slate-900 mb-2">{t('courses.create', 'إضافة مساق جديد')}</h3>
          </div>
          <input required value={code} onChange={e => setCode(e.target.value)} placeholder={t('courses.code', 'رمز المساق')} className="rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-600" />
          <input required type="number" min="1" value={credits} onChange={e => setCredits(e.target.value)} placeholder={t('courses.credits', 'الساعات المعتمدة')} className="rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-600" />
          <input required value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('courses.nameAr', 'الاسم (عربي)')} className="rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-600" />
          <input value={nameEn} onChange={e => setNameEn(e.target.value)} placeholder={t('courses.nameEn', 'الاسم (إنجليزي)')} className="rounded-xl border border-slate-200 p-2.5 text-sm outline-none focus:border-indigo-600" />
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" className="rounded-xl">{t('courses.save', 'حفظ')}</Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder={t('common.search', 'البحث في المساقات...')} 
            className="block w-full rounded-xl border-none bg-slate-50 py-2.5 pr-10 pl-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-600 transition-shadow" 
          />
        </div>
        <span className="text-sm font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">
          {t('directory.showing', 'عرض')}: <span className="text-indigo-600 font-bold">{courses.length}</span>
        </span>
      </div>

      {!courses.length ? (
        <EmptyState message={t('courses.noCourses', 'لا توجد مساقات')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {[t('courses.code', 'رمز المساق'), t('courses.name', 'اسم المساق'), t('courses.credits', 'الساعات المعتمدة'), t('courses.level', 'المستوى'), t('courses.status', 'الحالة')].map(label => (
                <TableHead key={label}>{label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map(course => (
              <TableRow key={course.id}>
                <TableCell>
                  <Link to={`/courses/${course.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    {course.code}
                  </Link>
                </TableCell>
                <TableCell className="font-medium text-slate-700">
                  {locale === 'ar' ? course.name_ar : course.name_en || course.name_ar}
                </TableCell>
                <TableCell>{course.credit_hours}</TableCell>
                <TableCell>{course.academic_level || '—'}</TableCell>
                <TableCell>
                  <StatusBadge active={course.is_active} text={course.is_active ? t('directory.active', 'نشط') : t('directory.inactive', 'غير نشط')} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
