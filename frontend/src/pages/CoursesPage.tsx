import React, { useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { 
  BookOpen, Plus, Search, Edit3, Trash2,
  Calendar, Stethoscope, UploadCloud, Download, X,
  CheckCircle, AlertCircle, FileSpreadsheet, FileCheck
} from 'lucide-react';

interface Course {
  id: number;
  code: string;
  name_ar: string;
  name_en: string | null;
  credit_hours: number;
  academic_level: 'fourth' | 'fifth' | 'sixth' | string;
  semester?: number;
  is_active: boolean;
  description?: string | null;
}

const normalizeLevel = (level: string | null | undefined): 'fourth' | 'fifth' | 'sixth' => {
  if (!level) return 'fourth';
  const l = String(level).toLowerCase().trim();
  if (l === 'fifth' || l.includes('5') || l.includes('خامس')) return 'fifth';
  if (l === 'sixth' || l.includes('6') || l.includes('سادس')) return 'sixth';
  return 'fourth';
};

export function CoursesPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'fourth' | 'fifth' | 'sixth' | 'all'>('fourth');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  // Bulk Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importSuccessMsg, setImportSuccessMsg] = useState('');
  const [importErrorMsg, setImportErrorMsg] = useState('');

  // Form State
  const [formCode, setFormCode] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formCredits, setFormCredits] = useState('4');
  const [formLevel, setFormLevel] = useState<'fourth' | 'fifth' | 'sixth'>('fourth');
  const [formSemester, setFormSemester] = useState<'1' | '2'>('1');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch all courses live from MySQL DB
  const { data: coursesResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['courses-live', search],
    queryFn: () => apiFetch<any>(`/courses?per_page=100&search=${encodeURIComponent(search)}`),
  });

  const coursesList: Course[] = useMemo(() => {
    if (!coursesResponse) return [];
    if (Array.isArray(coursesResponse)) return coursesResponse;
    return coursesResponse.data || coursesResponse.items || [];
  }, [coursesResponse]);

  // Bulk Import Mutation
  const bulkImportMutation = useMutation({
    mutationFn: (courses: any[]) => apiFetch('/courses/bulk-import', { method: 'POST', body: { courses } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['courses-live'] });
      qc.invalidateQueries({ queryKey: ['courses'] });
      setImportSuccessMsg(
        locale === 'ar' 
          ? `تم استيراد ${res.data?.imported ?? importRows.length} مساق جديد وتحديث ${res.data?.updated ?? 0} مساق بنجاح!` 
          : 'Courses imported successfully!'
      );
      setTimeout(() => {
        setImportSuccessMsg('');
        setIsImportModalOpen(false);
        setImportRows([]);
        setImportFileName('');
        refetch();
      }, 1800);
    },
    onError: (err: any) => {
      setImportErrorMsg(err?.message || (locale === 'ar' ? 'تعذر إتمام عملية استيراد المساقات.' : 'Failed to import courses.'));
    }
  });

  if (!can('courses.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  // Filtered list based on cohort tab with level normalization
  const filteredCourses = coursesList.filter(c => {
    const level = normalizeLevel(c.academic_level);
    if (selectedLevel !== 'all' && level !== selectedLevel) return false;
    return true;
  });

  // Calculate total hours accurately
  const totalHoursFourth = coursesList.filter(c => normalizeLevel(c.academic_level) === 'fourth').reduce((acc, c) => acc + (c.credit_hours || 0), 0);
  const totalHoursFifth = coursesList.filter(c => normalizeLevel(c.academic_level) === 'fifth').reduce((acc, c) => acc + (c.credit_hours || 0), 0);
  const totalHoursSixth = coursesList.filter(c => normalizeLevel(c.academic_level) === 'sixth').reduce((acc, c) => acc + (c.credit_hours || 0), 0);
  const totalHoursAll = coursesList.reduce((acc, c) => acc + (c.credit_hours || 0), 0);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingCourse(null);
    setFormCode('');
    setFormNameAr('');
    setFormNameEn('');
    setFormCredits('4');
    setFormLevel(selectedLevel !== 'all' ? selectedLevel : 'fourth');
    setFormSemester('1');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (course: Course) => {
    setEditingCourse(course);
    setFormCode(course.code);
    setFormNameAr(course.name_ar);
    setFormNameEn(course.name_en || '');
    setFormCredits(String(course.credit_hours));
    setFormLevel(normalizeLevel(course.academic_level));
    setFormSemester(String(course.semester || 1) as any);
    setIsModalOpen(true);
  };

  const handleDownloadTemplate = () => {
    const csvContent = "\uFEFF" + 
      "code,name_ar,name_en,credit_hours,academic_level,semester,is_active,description\n" +
      "MEDI401,مساق الطب الباطني العام,General Internal Medicine,6,fourth,1,1,تدريب سريري في الطب الباطني للسنة الرابعة\n" +
      "SURG402,مساق الجراحة العامة,General Surgery,6,fourth,1,1,تدريب سريري في الجراحة العامة للسنة الرابعة\n" +
      "PEDI501,مساق طب الأطفال,Pediatrics,4,fifth,1,1,تدريب سريري في طب الأطفال للسنة الخامسة\n" +
      "OBGY502,مساق النسائية والتوليد,Obstetrics and Gynecology,4,fifth,2,1,تدريب سريري في النسائية والتوليد للسنة الخامسة\n" +
      "PSYC601,مساق الطب النفسي السريري,Clinical Psychiatry,3,sixth,1,1,تدريب سريري في الطب النفسي للسنة السادسة\n";
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'نموذج_استيراد_مساقات_الدائرة_السريرية.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

        // Auto-detect CSV delimiter (supports comma ',' or semicolon ';' from Excel)
        const delimiter = lines[0].includes(';') ? ';' : ',';

        const parsed: any[] = [];
        const rawHeaders = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

        let codeIdx = rawHeaders.findIndex(h => h.includes('code') || h.includes('رمز'));
        let nameArIdx = rawHeaders.findIndex(h => h.includes('name_ar') || h.includes('العربي') || h.includes('عربي') || (h.includes('اسم') && !h.includes('en') && !h.includes('انجليز')));
        let nameEnIdx = rawHeaders.findIndex(h => h.includes('name_en') || h.includes('انجليز') || h.includes('english'));
        let creditsIdx = rawHeaders.findIndex(h => h.includes('credit') || h.includes('ساع'));
        let levelIdx = rawHeaders.findIndex(h => h.includes('level') || h.includes('مستوى') || h.includes('سنة'));
        let semesterIdx = rawHeaders.findIndex(h => h.includes('semester') || h.includes('فصل'));
        let activeIdx = rawHeaders.findIndex(h => h.includes('active') || h.includes('نشط'));
        let descIdx = rawHeaders.findIndex(h => h.includes('desc') || h.includes('وصف'));

        if (codeIdx === -1) codeIdx = 0;
        if (nameArIdx === -1) nameArIdx = 1;

        const hasHeader = rawHeaders[0].includes('code') || rawHeaders[0].includes('رمز') || rawHeaders[0].includes('اسم');
        const startIndex = hasHeader ? 1 : 0;

        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
          const codeVal = cols[codeIdx] || '';
          const nameArVal = cols[nameArIdx] || '';
          if (codeVal && nameArVal) {
            parsed.push({
              code: codeVal,
              name_ar: nameArVal,
              name_en: nameEnIdx !== -1 ? cols[nameEnIdx] || '' : (cols[2] || ''),
              credit_hours: creditsIdx !== -1 ? cols[creditsIdx] || '4' : (cols[3] || '4'),
              academic_level: levelIdx !== -1 ? cols[levelIdx] || 'fourth' : (cols[4] || 'fourth'),
              semester: semesterIdx !== -1 ? cols[semesterIdx] || '1' : '1',
              is_active: activeIdx !== -1 ? cols[activeIdx] : '1',
              description: descIdx !== -1 ? cols[descIdx] || '' : '',
            });
          }
        }

        if (parsed.length === 0) {
          setImportErrorMsg(locale === 'ar' ? 'لم يتم العثور على سجلات مساقات صالحة في الملف.' : 'No valid course records found.');
        } else {
          setImportRows(parsed);
        }
      } catch (err: any) {
        setImportErrorMsg(locale === 'ar' ? 'فشل في قراءة الملف. يرجى التأكد من اختيار ملف CSV صالح.' : 'Failed to parse CSV file.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Save (Create or Update) course in MySQL DB
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formNameAr.trim()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        code: formCode.trim(),
        name_ar: formNameAr.trim(),
        name_en: formNameEn.trim() || null,
        credit_hours: Number(formCredits),
        academic_level: formLevel,
        semester: Number(formSemester),
        is_active: true,
      };

      if (editingCourse) {
        await apiFetch(`/courses/${editingCourse.id}`, {
          method: 'PUT',
          body: payload,
        });
      } else {
        await apiFetch('/courses', {
          method: 'POST',
          body: payload,
        });
      }

      await qc.invalidateQueries({ queryKey: ['courses-live'] });
      await qc.invalidateQueries({ queryKey: ['courses'] });
      refetch();
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'حدث خطأ أثناء حفظ المساق');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete course from MySQL DB
  const handleDeleteCourse = async (course: Course) => {
    if (!window.confirm(locale === 'ar' ? `هل أنت تأكد من حذف مساق (${course.name_ar}) من قاعدة البيانات؟` : `Delete course ${course.name_en || course.name_ar}?`)) return;

    try {
      await apiFetch(`/courses/${course.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: ['courses-live'] });
      await qc.invalidateQueries({ queryKey: ['courses'] });
      refetch();
    } catch (err: any) {
      alert(err.message || 'تعذر حذف المساق من قاعدة البيانات');
    }
  };

  // Helper to render semester table with full mobile responsiveness & bilingual support
  const renderSemesterTable = (courses: Course[], semesterTitle: string, totalSemHours: number) => {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
            <h3 className="font-bold text-xs text-slate-800">{semesterTitle}</h3>
          </div>
          <span className="text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-0.5 rounded-lg">
            {locale === 'ar' ? `المجموع: ${totalSemHours} ساعة` : `Total: ${totalSemHours} Credits`}
          </span>
        </div>

        {courses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className={`w-full border-collapse text-xs min-w-[500px] ${locale === 'ar' ? 'text-right' : 'text-left'}`}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold text-[11px]">
                  <th className="p-2.5 text-center w-24">{locale === 'ar' ? 'رقم المساق' : 'Code'}</th>
                  <th className={`p-2.5 ${locale === 'ar' ? 'text-right' : 'text-left'}`}>{locale === 'ar' ? 'اسم المساق' : 'Course Name'}</th>
                  <th className="p-2.5 text-center w-20">{locale === 'ar' ? 'الساعات' : 'Credits'}</th>
                  <th className="p-2.5 text-center w-28">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {courses.map(course => (
                  <tr key={course.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-2.5 text-center font-semibold font-mono text-slate-700 text-[11px]">
                      {course.code}
                    </td>
                    <td className="p-2.5">
                      <Link to={`/courses/${course.id}`} className="font-semibold text-slate-800 hover:text-teal-700 transition-colors block text-xs">
                        {locale === 'en' ? (course.name_en || course.name_ar) : course.name_ar}
                      </Link>
                      {locale === 'en' ? (
                        course.name_en ? (
                          <span className="text-[10px] text-slate-400 font-normal block">{course.name_ar}</span>
                        ) : null
                      ) : (
                        course.name_en ? (
                          <span className="text-[10px] text-slate-400 font-normal block">{course.name_en}</span>
                        ) : null
                      )}
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-semibold text-[11px] border border-teal-100/60 inline-block">
                        {course.credit_hours}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          to={`/courses/${course.id}`}
                          className="p-1.5 sm:p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                          title={locale === 'ar' ? 'معاينة المساق' : 'View Details'}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </Link>

                        {can('courses.manage') && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(course)}
                              className="p-1.5 sm:p-1 rounded-md text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                              title={locale === 'ar' ? 'تعديل المساق' : 'Edit'}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteCourse(course)}
                              className="p-1.5 sm:p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title={locale === 'ar' ? 'حذف المساق' : 'Delete'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-center text-slate-400 text-xs">
            {locale === 'ar' ? 'لا توجد مساقات مضافة لهذا الفصل' : 'No courses found'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-16 px-1 sm:px-0">
      {/* Responsive Page Header */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-800">
              {locale === 'ar' ? 'مساقات الدائرة السريرية' : 'Clinical Department Courses'}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              {locale === 'ar' ? 'إدارة دليل مساقات السنين السريرية (السنة الرابعة، الخامسة، والسادسة).' : 'Curriculum management for 4th, 5th, and 6th clinical years.'}
            </p>
          </div>
        </div>

        {can('courses.manage') && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setIsImportModalOpen(true); setImportRows([]); setImportFileName(''); setImportErrorMsg(''); }}
              className="px-3.5 py-2 rounded-xl border border-teal-200 bg-teal-50/50 hover:bg-teal-100/60 text-teal-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
            >
              <UploadCloud className="w-4 h-4 text-teal-600" />
              <span>{locale === 'ar' ? 'استيراد CSV' : 'Import CSV'}</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'إضافة مساق سريري' : 'Add Clinical Course'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Segmented Bar & Search */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSelectedLevel('fourth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              selectedLevel === 'fourth'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'السنة الرابعة' : '4th Year'}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              selectedLevel === 'fourth' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {totalHoursFourth}{locale === 'ar' ? 'س' : 'h'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel('fifth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              selectedLevel === 'fifth'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'السنة الخامسة' : '5th Year'}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              selectedLevel === 'fifth' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {totalHoursFifth}{locale === 'ar' ? 'س' : 'h'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel('sixth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              selectedLevel === 'sixth'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'السنة السادسة' : '6th Year'}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              selectedLevel === 'sixth' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {totalHoursSixth}{locale === 'ar' ? 'س' : 'h'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
              selectedLevel === 'all'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'كافة المساقات' : 'All Courses'}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              selectedLevel === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {totalHoursAll}{locale === 'ar' ? 'س' : 'h'}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث باسم أو رقم المساق...' : 'Search course...'}
            className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-teal-600 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Bulk Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-teal-50 text-teal-600">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{locale === 'ar' ? 'استيراد مساقات جديدة عبر ملف CSV' : 'Bulk Import Courses via CSV'}</h3>
                  <p className="text-xs text-slate-500">{locale === 'ar' ? 'قم بتحميل ملف CSV يحتوي على بيانات المساقات للرفع المباشر' : 'Upload a CSV file with course data for batch insertion'}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsImportModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {importSuccessMsg && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium">{importSuccessMsg}</span>
                </div>
              )}

              {importErrorMsg && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span className="text-sm font-medium">{importErrorMsg}</span>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-800">{locale === 'ar' ? 'تحتاج إلى نموذج جاهز؟' : 'Need a template?'}</p>
                  <p className="text-xs text-slate-500">{locale === 'ar' ? 'قم بتنزيل نموذج CSV المهيأ مسبقاً بالأعمدة المطلوبة.' : 'Download pre-formatted CSV template with required headers.'}</p>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleDownloadTemplate}
                  className="gap-2 shrink-0 rounded-xl text-xs"
                >
                  <Download className="w-4 h-4 text-teal-600" />
                  {locale === 'ar' ? 'تنزيل النموذج' : 'Download Template'}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                  {locale === 'ar' ? 'اختيار ملف CSV' : 'Select CSV File'}
                </label>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".csv" 
                  onChange={handleFileChange}
                  className="hidden" 
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-teal-500 hover:bg-teal-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group"
                >
                  <UploadCloud className="w-10 h-10 mx-auto text-slate-400 group-hover:text-teal-600 transition-colors mb-2" />
                  <p className="text-sm font-medium text-slate-700 group-hover:text-teal-600">
                    {importFileName || (locale === 'ar' ? 'اضغط هنا لاختيار ملف المساقات (.csv)' : 'Click to select CSV file')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {locale === 'ar' ? 'يدعم ترميز UTF-8 والفاصلة العادية والمنقوطة (;)' : 'Supports UTF-8 and comma/semicolon delimiters'}
                  </p>
                </div>
              </div>

              {importRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      {locale === 'ar' ? `معاينة السجلات الجاهزة للإدخال (${importRows.length} مساق)` : `Preview (${importRows.length} courses)`}
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">رمز المساق</TableHead>
                          <TableHead className="text-xs">اسم المساق (عربي)</TableHead>
                          <TableHead className="text-xs">الساعات</TableHead>
                          <TableHead className="text-xs">المستوى</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.slice(0, 10).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs font-mono font-bold text-teal-600">{row.code}</TableCell>
                            <TableCell className="text-xs">{row.name_ar}</TableCell>
                            <TableCell className="text-xs">{row.credit_hours}</TableCell>
                            <TableCell className="text-xs">{row.academic_level || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {importRows.length > 10 && (
                      <div className="p-2 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
                        {locale === 'ar' ? `و ${importRows.length - 10} مساقات إضافية...` : `And ${importRows.length - 10} more courses...`}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsImportModalOpen(false)}
                className="rounded-xl"
              >
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button 
                type="button"
                disabled={importRows.length === 0 || bulkImportMutation.isPending}
                onClick={() => bulkImportMutation.mutate(importRows)}
                className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white"
              >
                {bulkImportMutation.isPending 
                  ? (locale === 'ar' ? 'جاري الاستيراد...' : 'Importing...') 
                  : (locale === 'ar' ? `استيراد ${importRows.length} مساق` : `Import ${importRows.length} Courses`)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Layout: Grouped by Semester */}
      {selectedLevel === 'all' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
            <span>{locale === 'ar' ? 'كافة المساقات السريرية المسجلة في قاعدة البيانات' : 'All Clinical Courses in DB'}</span>
            <span className="text-teal-700">{filteredCourses.length} {locale === 'ar' ? 'مساقاً' : 'Courses'}</span>
          </div>

          <div className="overflow-x-auto">
            <table className={`w-full border-collapse text-xs min-w-[500px] ${locale === 'ar' ? 'text-right' : 'text-left'}`}>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold text-[11px]">
                  <th className="p-2.5 text-center">#</th>
                  <th className="p-2.5 text-center">{locale === 'ar' ? 'رقم المساق' : 'Code'}</th>
                  <th className={`p-2.5 ${locale === 'ar' ? 'text-right' : 'text-left'}`}>{locale === 'ar' ? 'اسم المساق' : 'Course Name'}</th>
                  <th className="p-2.5 text-center">{locale === 'ar' ? 'السنة' : 'Level'}</th>
                  <th className="p-2.5 text-center">{locale === 'ar' ? 'الفصل' : 'Semester'}</th>
                  <th className="p-2.5 text-center">{locale === 'ar' ? 'الساعات' : 'Credits'}</th>
                  <th className="p-2.5 text-center">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredCourses.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="p-2.5 text-center font-bold text-slate-400 text-[11px]">{idx + 1}</td>
                    <td className="p-2.5 text-center font-mono font-semibold text-slate-700 text-[11px]">{c.code}</td>
                    <td className="p-2.5">
                      <Link to={`/courses/${c.id}`} className="font-semibold text-slate-800 hover:text-teal-700 transition-colors block text-xs">
                        {locale === 'en' ? (c.name_en || c.name_ar) : c.name_ar}
                      </Link>
                      {locale === 'en' ? (
                        c.name_en ? (
                          <span className="text-[10px] text-slate-400 font-normal block">{c.name_ar}</span>
                        ) : null
                      ) : (
                        c.name_en ? (
                          <span className="text-[10px] text-slate-400 font-normal block">{c.name_en}</span>
                        ) : null
                      )}
                    </td>
                    <td className="p-2.5 text-center text-slate-600">
                      {normalizeLevel(c.academic_level) === 'fourth' ? (locale === 'ar' ? 'سنة رابعة' : '4th Year') : normalizeLevel(c.academic_level) === 'fifth' ? (locale === 'ar' ? 'سنة خامسة' : '5th Year') : (locale === 'ar' ? 'سنة سادسة' : '6th Year')}
                    </td>
                    <td className="p-2.5 text-center text-slate-600">
                      {Number(c.semester) === 2 ? (locale === 'ar' ? 'الفصل الثاني' : 'Semester 2') : (locale === 'ar' ? 'الفصل الأول' : 'Semester 1')}
                    </td>
                    <td className="p-2.5 text-center font-semibold text-teal-700">{c.credit_hours}</td>
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => handleOpenEditModal(c)} className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 cursor-pointer">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteCourse(c)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const sem1Courses = filteredCourses.filter(c => !c.semester || Number(c.semester) === 1);
            const sem1Hours = sem1Courses.reduce((acc, c) => acc + (c.credit_hours || 0), 0);
            return renderSemesterTable(
              sem1Courses,
              locale === 'ar' ? 'الفصل الأول' : 'First Semester',
              sem1Hours
            );
          })()}

          {(() => {
            const sem2Courses = filteredCourses.filter(c => Number(c.semester) === 2);
            const sem2Hours = sem2Courses.reduce((acc, c) => acc + (c.credit_hours || 0), 0);
            return renderSemesterTable(
              sem2Courses,
              locale === 'ar' ? 'الفصل الثاني' : 'Second Semester',
              sem2Hours
            );
          })()}
        </div>
      )}

      {/* Add / Edit Course Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/30 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-lg border border-slate-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingCourse 
                  ? (locale === 'ar' ? 'تعديل بيانات المساق السريري' : 'Edit Clinical Course')
                  : (locale === 'ar' ? 'إضافة مساق سريري جديد' : 'Add New Clinical Course')
                }
              </h3>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'رقم / رمز المساق:' : 'Course Code:'}</label>
                  <input
                    type="text"
                    required
                    placeholder="M1470"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-mono font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الساعات المعتمدة:' : 'Credit Hours:'}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="20"
                    value={formCredits}
                    onChange={e => setFormCredits(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اسم المساق (بالعربية):' : 'Course Name (Arabic):'}</label>
                <input
                  type="text"
                  required
                  placeholder="مساق الطب الباطني السريري"
                  value={formNameAr}
                  onChange={e => setFormNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اسم المساق (بالإنجليزية):' : 'Course Name (English):'}</label>
                <input
                  type="text"
                  placeholder="Clinical Internal Medicine"
                  value={formNameEn}
                  onChange={e => setFormNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'السنة السريرية:' : 'Clinical Level:'}</label>
                  <select
                    value={formLevel}
                    onChange={e => setFormLevel(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 bg-white"
                  >
                    <option value="fourth">{locale === 'ar' ? 'السنة الرابعة' : '4th Year'}</option>
                    <option value="fifth">{locale === 'ar' ? 'السنة الخامسة' : '5th Year'}</option>
                    <option value="sixth">{locale === 'ar' ? 'السنة السادسة' : '6th Year'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الفصل الدراسي:' : 'Semester:'}</label>
                  <select
                    value={formSemester}
                    onChange={e => setFormSemester(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 bg-white"
                  >
                    <option value="1">{locale === 'ar' ? 'الفصل الأول' : 'Semester 1'}</option>
                    <option value="2">{locale === 'ar' ? 'الفصل الثاني' : 'Semester 2'}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs cursor-pointer shadow-xs"
                >
                  {isSubmitting ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ البيانات' : 'Save Course')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
