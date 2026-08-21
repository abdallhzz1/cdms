import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { 
  BookOpen, Plus, Search, Edit3, Trash2,
  Calendar, Stethoscope
} from 'lucide-react';

interface Course {
  id: number;
  code: string;
  name_ar: string;
  name_en: string | null;
  credit_hours: number;
  academic_level: 'fourth' | 'fifth' | 'sixth' | string;
  semester: number;
  is_active: boolean;
  description?: string | null;
}

export function CoursesPage() {
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<'fourth' | 'fifth' | 'sixth' | 'all'>('fourth');
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

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

  if (!can('courses.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  // Filtered list based on cohort tab
  const filteredCourses = coursesList.filter(c => {
    if (selectedLevel !== 'all' && c.academic_level !== selectedLevel) return false;
    return true;
  });

  // Calculate total hours
  const totalHoursFourth = coursesList.filter(c => c.academic_level === 'fourth').reduce((acc, c) => acc + (c.credit_hours || 0), 0);
  const totalHoursFifth = coursesList.filter(c => c.academic_level === 'fifth').reduce((acc, c) => acc + (c.credit_hours || 0), 0);
  const totalHoursSixth = coursesList.filter(c => c.academic_level === 'sixth').reduce((acc, c) => acc + (c.credit_hours || 0), 0);

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
    setFormLevel((course.academic_level as any) || 'fourth');
    setFormSemester(String(course.semester || 1) as any);
    setIsModalOpen(true);
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
    } catch (err: any) {
      alert(err.message || 'تعذر حذف المساق من قاعدة البيانات');
    }
  };

  // Helper to render semester table with full mobile responsiveness & bilingual support
  const renderSemesterTable = (courses: Course[], semesterTitle: string, totalSemHours: number) => {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Soft header responsive */}
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
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'إضافة مساق سريري' : 'Add Clinical Course'}</span>
          </button>
        )}
      </div>

      {/* 🚀 Mobile-Responsive Segmented Bar & Search */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Horizontal Scrollable Tabs on Mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
          {/* Option 1: 4th Year */}
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

          {/* Option 2: 5th Year */}
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

          {/* Option 3: 6th Year */}
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

          {/* Option 4: All */}
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
              {totalHoursFourth + totalHoursFifth + totalHoursSixth}{locale === 'ar' ? 'س' : 'h'}
            </span>
          </button>
        </div>

        {/* Compact Mobile Search Input */}
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

      {/* Main Content Layout: Grouped by Semester */}
      {selectedLevel === 'all' ? (
        /* If 'all' selected, render master list */
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
                      {c.academic_level === 'fourth' ? (locale === 'ar' ? 'سنة رابعة' : '4th Year') : c.academic_level === 'fifth' ? (locale === 'ar' ? 'سنة خامسة' : '5th Year') : (locale === 'ar' ? 'سنة سادسة' : '6th Year')}
                    </td>
                    <td className="p-2.5 text-center text-slate-600">
                      {c.semester === 1 ? (locale === 'ar' ? 'الفصل الأول' : 'Semester 1') : (locale === 'ar' ? 'الفصل الثاني' : 'Semester 2')}
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
        /* If specific cohort level selected, render 2 Semester Tables */
        <div className="space-y-4">
          {/* Semester 1 Table */}
          {(() => {
            const sem1Courses = filteredCourses.filter(c => Number(c.semester) === 1);
            const sem1Hours = sem1Courses.reduce((acc, c) => acc + (c.credit_hours || 0), 0);
            return renderSemesterTable(
              sem1Courses,
              locale === 'ar' ? 'الفصل الأول' : 'First Semester',
              sem1Hours
            );
          })()}

          {/* Semester 2 Table */}
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

      {/* Add / Edit Course Modal - Responsive for Mobile */}
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
                    min="1"
                    max="20"
                    required
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
                  placeholder="جراحة عامة (مبتدئ)"
                  value={formNameAr}
                  onChange={e => setFormNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اسم المساق (بالإنجليزية - اختياري):' : 'Course Name (English):'}</label>
                <input
                  type="text"
                  placeholder="General Surgery (Junior)"
                  value={formNameEn}
                  onChange={e => setFormNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-normal focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'السنة / المرحلة:' : 'Academic Level:'}</label>
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
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs cursor-pointer shadow-xs"
                >
                  {isSubmitting 
                    ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...')
                    : (locale === 'ar' ? 'حفظ المساق' : 'Save Course')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
