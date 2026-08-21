import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AdvisingNavTabs } from '@/components/advising/AdvisingNavTabs';
import { Save, UserCheck, Search, Users, Zap, Shuffle } from 'lucide-react';

export function AdvisingAssignmentsPage() {
  const { can, user } = useAuth();
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const [pendingChanges, setPendingChanges] = useState<Record<number, number>>({});
  const [selectedLevel, setSelectedLevel] = useState<'all' | 'fourth' | 'fifth' | 'sixth'>('all');
  const [search, setSearch] = useState('');

  // Bulk Tools State
  const [bulkLevel, setBulkLevel] = useState<'fourth' | 'fifth' | 'sixth' | 'unassigned_only'>('fourth');
  const [bulkAdvisorId, setBulkAdvisorId] = useState<string>('');

  // Check if current user is an Administrator / Department Head / Dean / RTA
  const isAdminOrHead = useMemo(() => {
    if (!user?.roles) return false;
    const roles = user.roles.map(r => (typeof r === 'string' ? r : (r as any).name || '').toUpperCase());
    return roles.some(r => ['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'RTA'].includes(r));
  }, [user]);

  // Fetch ALL students without 100 limit
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-for-assignment'],
    queryFn: () => apiFetch<any>(`/students?per_page=1000`)
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users-lookup'],
    queryFn: () => apiFetch<any>(`/users/lookup`)
  });

  const updateMutation = useMutation({
    mutationFn: async (changes: Record<number, number>) => {
      const payload = Object.entries(changes).map(([studentId, advisorId]) => ({
        student_id: Number(studentId),
        academic_advisor_id: advisorId ? Number(advisorId) : null
      }));

      await apiFetch('/students/bulk-assign-advisor', {
        method: 'POST',
        body: { assignments: payload }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students-for-assignment'] });
      queryClient.invalidateQueries({ queryKey: ['advised-students-list'] });
      queryClient.invalidateQueries({ queryKey: ['early-warning-students-list'] });
      setPendingChanges({});
      alert(locale === 'ar' ? 'تم حفظ وتطبيق تعيينات المرشدين بنجاح وفوراً في قاعدة البيانات ✓' : 'Advisor assignments saved successfully ✓');
    }
  });

  const hasAccess = can('advising.manage') || can('advising.view') || can('students.view') || can('students.manage') || isAdminOrHead;

  if (!hasAccess) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (studentsLoading || usersLoading) return <LoadingState />;

  const rawStudentsList: any[] = Array.isArray(students) ? students : (students?.data || students?.items || []);
  const advisorsList: any[] = Array.isArray(users) ? users : (users?.data || []);

  // Filter students by cohort tab & search term
  const filteredStudentsList = rawStudentsList.filter((s: any) => {
    if (selectedLevel !== 'all' && s.academic_level !== selectedLevel) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const nameAr = (s.full_name_ar || '').toLowerCase();
      const nameEn = (s.full_name_en || '').toLowerCase();
      const num = (s.university_number || '').toLowerCase();
      if (!nameAr.includes(q) && !nameEn.includes(q) && !num.includes(q)) return false;
    }
    return true;
  });

  const handleAdvisorChange = (studentId: number, advisorId: string) => {
    setPendingChanges(prev => ({
      ...prev,
      [studentId]: Number(advisorId)
    }));
  };

  // ⚡ Action 1: Bulk Assign All Students in a Cohort to One Selected Advisor
  const handleBulkAssignToAdvisor = () => {
    if (!bulkAdvisorId) {
      alert(locale === 'ar' ? 'يرجى تحديد المرشد الأكاديمي أولاً' : 'Please select an advisor first');
      return;
    }

    const targetAdvisor = advisorsList.find(a => String(a.id) === String(bulkAdvisorId));
    const targetStudents = rawStudentsList.filter((s: any) => {
      if (bulkLevel === 'unassigned_only') return !s.academic_advisor_id;
      return s.academic_level === bulkLevel;
    });

    if (targetStudents.length === 0) {
      alert(locale === 'ar' ? 'لا يوجد طلاب ينطبق عليهم هذا المعيار' : 'No matching students found');
      return;
    }

    const advisorIdNum = Number(bulkAdvisorId);
    const newPending = { ...pendingChanges };
    targetStudents.forEach(s => {
      newPending[s.id] = advisorIdNum;
    });

    setPendingChanges(newPending);
    alert(
      locale === 'ar' 
        ? `تم تعيين ${targetStudents.length} طالباً للمرشد (${targetAdvisor?.name || ''}) بنجاح! اضغط على "حفظ التغييرات" لتخزين القرار.` 
        : `Assigned ${targetStudents.length} students to advisor (${targetAdvisor?.name || ''}). Click Save to persist.`
    );
  };

  // ⚡ Action 2: Auto-Distribute Students Equally (Round-Robin) Among All Available Advisors
  const handleAutoDistributeEqually = () => {
    if (advisorsList.length === 0) {
      alert(locale === 'ar' ? 'لا يوجد مرشدون متاحون في الكلية' : 'No advisors available');
      return;
    }

    const targetStudents = rawStudentsList.filter((s: any) => {
      if (bulkLevel === 'unassigned_only') return !s.academic_advisor_id;
      return s.academic_level === bulkLevel;
    });

    if (targetStudents.length === 0) {
      alert(locale === 'ar' ? 'لا يوجد طلاب ينطبق عليهم هذا المعيار للتوزيع' : 'No matching students found');
      return;
    }

    if (!window.confirm(
      locale === 'ar' 
        ? `هل أنت متأكد من التوزيع الآلي المتساوي لعدد (${targetStudents.length}) طالب على (${advisorsList.length}) مرشدين بالتساوي؟` 
        : `Auto distribute ${targetStudents.length} students equally among ${advisorsList.length} advisors?`
    )) return;

    const newPending = { ...pendingChanges };
    targetStudents.forEach((s, idx) => {
      const assignedAdvisor = advisorsList[idx % advisorsList.length];
      newPending[s.id] = Number(assignedAdvisor.id);
    });

    setPendingChanges(newPending);
    const perAdvisor = Math.ceil(targetStudents.length / advisorsList.length);
    alert(
      locale === 'ar' 
        ? `تم توزيع ${targetStudents.length} طالباً بالتساوي على ${advisorsList.length} مرشدين (حوالي ${perAdvisor} طالب لكل مرشد) بنجاح! اضغط "حفظ التغييرات".` 
        : `Auto-distributed ${targetStudents.length} students among ${advisorsList.length} advisors (~${perAdvisor} per advisor). Click Save to persist.`
    );
  };

  const handleSaveAll = () => {
    if (Object.keys(pendingChanges).length === 0) return;
    updateMutation.mutate(pendingChanges);
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;

  return (
    <div className="space-y-4 pb-16 px-1 sm:px-0">
      {/* Responsive Page Header */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-800">
              {locale === 'ar' ? 'تعيين وتخصيص المرشدين الأكاديميين' : 'Academic Advisor Assignments'}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
              {locale === 'ar' ? 'ربط وتوزيع جميع طلبة الكلية على أعضاء الهيئة التدريسية يدوياً أو آلياً بضغطة زر.' : 'Bulk assign or auto-distribute students to faculty academic advisors.'}
            </p>
          </div>
        </div>

        <button 
          onClick={handleSaveAll} 
          disabled={!hasChanges || updateMutation.isPending} 
          className={`w-full sm:w-auto px-4 py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs ${
            hasChanges 
              ? 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs' 
              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
          }`}
        >
          <Save className="w-3.5 h-3.5" />
          <span>
            {updateMutation.isPending 
              ? (locale === 'ar' ? 'جاري التخزين...' : 'Saving...')
              : (locale === 'ar' ? `حفظ التغييرات (${Object.keys(pendingChanges).length})` : `Save (${Object.keys(pendingChanges).length})`)}
          </span>
        </button>
      </div>

      {/* Advising Sub-Navigation Tabs */}
      <AdvisingNavTabs />

      {/* 🚀 Soft & Clean Bulk Assignment Card (Light & Responsive) */}
      <div className="bg-teal-50/70 p-3.5 sm:p-4 rounded-2xl border border-teal-200/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-teal-200/60 pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-600" />
            <h3 className="font-bold text-xs sm:text-sm text-teal-900">
              {locale === 'ar' ? 'شريط التعيين والتوزيع الجماعي السريع' : 'Bulk Advisor Assignment Toolbar'}
            </h3>
          </div>
          <span className="text-[10px] font-semibold bg-white text-teal-700 px-2 py-0.5 rounded-md border border-teal-200">
            {locale === 'ar' ? 'توفير الوقت والإدخال الفردي' : 'Quick Batch Tool'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 items-end">
          {/* Target Group/Cohort */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              {locale === 'ar' ? '1. اختر الدفعة المستهدفة:' : '1. Select Target Cohort:'}
            </label>
            <select
              value={bulkLevel}
              onChange={e => setBulkLevel(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer"
            >
              <option value="fourth">{locale === 'ar' ? 'طلاب السنة الرابعة' : '4th Year Students'}</option>
              <option value="fifth">{locale === 'ar' ? 'طلاب السنة الخامسة' : '5th Year Students'}</option>
              <option value="sixth">{locale === 'ar' ? 'طلاب السنة السادسة' : '6th Year Students'}</option>
              <option value="unassigned_only">{locale === 'ar' ? 'الطلاب بدون مرشد فقط' : 'Unassigned Students Only'}</option>
            </select>
          </div>

          {/* Select Advisor */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              {locale === 'ar' ? '2. اختر المرشد الأكاديمي:' : '2. Select Advisor:'}
            </label>
            <select
              value={bulkAdvisorId}
              onChange={e => setBulkAdvisorId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-teal-600 cursor-pointer"
            >
              <option value="">{locale === 'ar' ? '-- اختر عضو هيئة تدريس --' : '-- Select Faculty Advisor --'}</option>
              {advisorsList.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Action 1: Assign to Selected Doctor */}
          <div>
            <button
              type="button"
              onClick={handleBulkAssignToAdvisor}
              disabled={!bulkAdvisorId}
              className={`w-full px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                bulkAdvisorId 
                  ? 'bg-teal-600 hover:bg-teal-700 text-white' 
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'تخصيص جماعي لهذه الدفعة' : 'Assign Cohort to Advisor'}</span>
            </button>
          </div>

          {/* Action 2: Auto-Distribute Equally */}
          <div>
            <button
              type="button"
              onClick={handleAutoDistributeEqually}
              className="w-full px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5 text-teal-600" />
              <span>{locale === 'ar' ? 'توزيع آلي متساوي على المرشدين' : 'Auto Equally Distribute'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters Control Bar */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Cohort Level Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSelectedLevel('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedLevel === 'all'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'جميع الطلاب' : 'All Students'}</span>
            <span className="mx-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-white/20">
              {rawStudentsList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel('fourth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedLevel === 'fourth'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'السنة الرابعة' : '4th Year'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel('fifth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedLevel === 'fifth'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'السنة الخامسة' : '5th Year'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedLevel('sixth')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedLevel === 'sixth'
                ? 'bg-teal-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span>{locale === 'ar' ? 'السنة السادسة' : '6th Year'}</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث باسم أو الرقم الجامعي...' : 'Search student...'}
            className="w-full pr-8 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-teal-600 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
          <span>{locale === 'ar' ? 'قائمة الطلبة والتعيين الإرشادي' : 'Student Advisor Mapping List'}</span>
          <span className="text-teal-700">{filteredStudentsList.length} / {rawStudentsList.length} {locale === 'ar' ? 'طالباً' : 'Students'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className={`w-full border-collapse text-xs min-w-[550px] ${locale === 'ar' ? 'text-right' : 'text-left'}`}>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-semibold text-[11px]">
                <th className="p-2.5 text-center w-12">#</th>
                <th className="p-2.5 text-center w-28">{locale === 'ar' ? 'الرقم الجامعي' : 'Student ID'}</th>
                <th className="p-2.5">{locale === 'ar' ? 'اسم الطالب' : 'Student Name'}</th>
                <th className="p-2.5 text-center w-28">{locale === 'ar' ? 'المستوى' : 'Level'}</th>
                <th className="p-2.5">{locale === 'ar' ? 'المرشد الأكاديمي المخصص' : 'Assigned Advisor'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredStudentsList.map((s: any, idx: number) => {
                const matchedAdvisor = advisorsList.find(
                  (a: any) => String(a.id) === String(s.academic_advisor_id) || (a.person_id && String(a.person_id) === String(s.academic_advisor_id))
                );
                const initialAdvisorId = matchedAdvisor ? String(matchedAdvisor.id) : (s.academic_advisor_id ? String(s.academic_advisor_id) : '');
                const currentAdvisorId = pendingChanges[s.id] !== undefined ? String(pendingChanges[s.id]) : initialAdvisorId;
                const isChanged = pendingChanges[s.id] !== undefined && String(pendingChanges[s.id]) !== initialAdvisorId;

                return (
                  <tr key={s.id} className={`hover:bg-slate-50/80 transition-colors ${isChanged ? 'bg-amber-50/40' : ''}`}>
                    <td className="p-2.5 text-center font-bold text-slate-400 text-[11px]">{idx + 1}</td>
                    <td className="p-2.5 text-center font-mono font-semibold text-slate-600 text-[11px]">{s.university_number}</td>
                    <td className="p-2.5">
                      <div className="font-semibold text-slate-800 text-xs">{locale === 'ar' ? s.full_name_ar : (s.full_name_en || s.full_name_ar)}</div>
                    </td>
                    <td className="p-2.5 text-center text-slate-600">
                      {s.academic_level === 'fourth' ? (locale === 'ar' ? 'سنة رابعة' : '4th Year') : s.academic_level === 'fifth' ? (locale === 'ar' ? 'سنة خامسة' : '5th Year') : (locale === 'ar' ? 'سنة سادسة' : '6th Year')}
                    </td>
                    <td className="p-2.5">
                      <select 
                        value={currentAdvisorId} 
                        onChange={(e) => handleAdvisorChange(s.id, e.target.value)}
                        className={`w-full max-w-xs rounded-xl border p-1.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600 bg-white cursor-pointer ${
                          isChanged ? 'border-amber-400 bg-amber-50/60 text-amber-900 font-bold' : 'border-slate-200 text-slate-800'
                        }`}
                      >
                        <option value="">{locale === 'ar' ? '-- بدون مرشد أكاديمي --' : '-- No Advisor --'}</option>
                        {advisorsList.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {!filteredStudentsList.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-xs text-slate-400">{locale === 'ar' ? 'لا يوجد طلاب مطابقون لمعايير البحث' : 'No students found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
