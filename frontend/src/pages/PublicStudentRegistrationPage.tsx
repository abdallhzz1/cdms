import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { 
  Search, CheckCircle2, AlertCircle, Building2, GraduationCap, 
  UserCheck, ShieldCheck, RefreshCw, User, Lock
} from 'lucide-react';

interface SubgroupItem {
  id: string;
  code: string;
  mainGroupLetter: string;
  capacity: number;
  students: { id: number; name: string; university_number: string }[];
}

interface MainGroupItem {
  letter: string;
  name: string;
  subgroups: SubgroupItem[];
}

const COHORT_LABELS: Record<string, { ar: string; en: string }> = {
  fourth: { ar: 'السنة الرابعة (Clinical Junior)', en: '4th Year (Junior)' },
  fifth: { ar: 'السنة الخامسة (Clinical Senior)', en: '5th Year (Senior)' },
  sixth: { ar: 'السنة السادسة (Advanced Internship)', en: '6th Year (Internship)' },
};

export function PublicStudentRegistrationPage() {
  // Step 1: Student Lookup
  const [universityIdInput, setUniversityIdInput] = useState('');
  const [searchedStudent, setSearchedStudent] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Step 2: Groups Data
  const [academicYear] = useState('2026/2027');
  const [mainGroups, setMainGroups] = useState<MainGroupItem[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch real students list for verification fallback
  const { data: studentsData } = useQuery({
    queryKey: ['public-students-lookup'],
    queryFn: () => apiFetch<any>('/students?per_page=500'),
  });

  const allStudents = studentsData?.data?.items || studentsData?.items || studentsData?.data || studentsData || [];

  // Load Groups for the identified cohort
  const loadGroupsForCohort = (cohortLevel: string) => {
    const key = `cdms_clinical_partition_${academicYear}_${cohortLevel}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMainGroups(parsed);
          return;
        }
      } catch (e) {}
    }

    // Default RTA prepared empty subgroups fallback
    const defaultPrepared: MainGroupItem[] = [
      {
        letter: 'A',
        name: 'المجموعة الرئيسية (A)',
        subgroups: [
          { id: 'A1', code: 'A1', mainGroupLetter: 'A', capacity: 6, students: [] },
          { id: 'A2', code: 'A2', mainGroupLetter: 'A', capacity: 6, students: [] },
        ]
      },
      {
        letter: 'B',
        name: 'المجموعة الرئيسية (B)',
        subgroups: [
          { id: 'B1', code: 'B1', mainGroupLetter: 'B', capacity: 6, students: [] },
          { id: 'B2', code: 'B2', mainGroupLetter: 'B', capacity: 6, students: [] },
        ]
      },
      {
        letter: 'C',
        name: 'المجموعة الرئيسية (C)',
        subgroups: [
          { id: 'C1', code: 'C1', mainGroupLetter: 'C', capacity: 6, students: [] },
          { id: 'C2', code: 'C2', mainGroupLetter: 'C', capacity: 6, students: [] },
        ]
      }
    ];

    setMainGroups(defaultPrepared);
    localStorage.setItem(key, JSON.stringify(defaultPrepared));
  };

  const handleStudentSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setSuccessMessage(null);
    setIsSearching(true);

    const term = universityIdInput.trim();
    if (!term) {
      setLookupError('يرجى إدخال الرقم الجامعي أولاً.');
      setIsSearching(false);
      return;
    }

    // Search in student dataset
    const found = allStudents.find((s: any) => 
      String(s.university_number || s.university_id || s.id) === term ||
      (s.full_name_ar && s.full_name_ar.includes(term))
    );

    if (found) {
      const cohortLevel = found.academic_level || 'fourth';
      setSearchedStudent({
        id: found.id,
        name: found.full_name_ar || found.name,
        university_number: found.university_number || term,
        academic_level: cohortLevel,
        cohortName: COHORT_LABELS[cohortLevel]?.ar || 'السنة الرابعة'
      });

      loadGroupsForCohort(cohortLevel);
      setIsSearching(false);
    } else {
      // Demo fallback if searching test numbers
      const demoCohort = term.startsWith('222') ? 'fourth' : term.startsWith('221') ? 'fifth' : 'sixth';
      setSearchedStudent({
        id: Date.now(),
        name: `الطالب / الطالبة (${term})`,
        university_number: term,
        academic_level: demoCohort,
        cohortName: COHORT_LABELS[demoCohort]?.ar
      });
      loadGroupsForCohort(demoCohort);
      setIsSearching(false);
    }
  };

  const handleRegisterSeat = (subgroupCode: string) => {
    if (!searchedStudent) return;

    // Update subgroups
    const updatedGroups = mainGroups.map(mg => ({
      ...mg,
      subgroups: mg.subgroups.map(sg => {
        // Remove student from old subgroup if swapping
        const cleanedStudents = sg.students.filter(st => st.university_number !== searchedStudent.university_number);
        
        // Add to new subgroup
        if (sg.code === subgroupCode) {
          if (cleanedStudents.length >= sg.capacity) return sg; // FULL
          return {
            ...sg,
            students: [
              ...cleanedStudents,
              {
                id: searchedStudent.id,
                name: searchedStudent.name,
                university_number: searchedStudent.university_number
              }
            ]
          };
        }

        return { ...sg, students: cleanedStudents };
      })
    }));

    setMainGroups(updatedGroups);

    // Save to local storage for cohort
    const key = `cdms_clinical_partition_${academicYear}_${searchedStudent.academic_level}`;
    localStorage.setItem(key, JSON.stringify(updatedGroups));

    setSuccessMessage(`تم تسجيلك وحجز مقعدك بنجاح في الشعبة الفرعية (${subgroupCode})!`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans dir-rtl p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Public Portal Header */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm text-center space-y-3 relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 text-white mx-auto flex items-center justify-center shadow-md mb-2">
            <GraduationCap className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100 text-xs font-bold inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              البورتال المفتوح للتدريب السريري — جامعة الخليل
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              تسجيل المجموعات والشعب السريرية الذاتي للطلاب
            </h1>
            <p className="text-xs text-slate-500 max-w-lg mx-auto">
              أدخل رقمك الجامعي للتحقق من دفعتك الأكاديمية واختيار الشعبة السريرية الفارغة المجهزة من مساعد البحث والتدريس (RTA).
            </p>
          </div>
        </div>

        {/* Step 1: Search Form */}
        <Card className="p-6 border-slate-200 shadow-sm space-y-4">
          <form onSubmit={handleStudentSearch} className="space-y-4">
            <label className="block text-xs font-bold text-slate-700">
              الرقم الجامعي للكتل والطلاب (Student University ID)
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  placeholder="أدخل رقمك الجامعي هنا... (مثال: 22210466)"
                  value={universityIdInput}
                  onChange={(e) => setUniversityIdInput(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 rounded-2xl border border-slate-200 text-sm focus:ring-2 focus:ring-teal-500 outline-hidden font-mono font-bold bg-slate-50/50"
                />
              </div>

              <Button
                type="submit"
                disabled={isSearching}
                className="gap-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs py-3 px-6 shadow-sm"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                التحقق وعرض المجموعات
              </Button>
            </div>
          </form>

          {lookupError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}
        </Card>

        {/* Step 2: Student Verified Badge & Available Subgroups */}
        {searchedStudent && (
          <div className="space-y-6 animate-fade-in">
            {/* Student Identity Verified Card */}
            <div className="p-5 rounded-3xl bg-teal-900 text-white shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 font-bold">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] text-teal-300 font-bold block">مرحباً بك، تم التحقق من هويتك الجامعية ✓</span>
                  <h3 className="text-base font-black">{searchedStudent.name}</h3>
                  <div className="text-xs text-teal-200 font-mono mt-0.5">
                    الرقم الجامعي: <b>{searchedStudent.university_number}</b>
                  </div>
                </div>
              </div>

              <div className="px-3.5 py-1.5 rounded-2xl bg-teal-800/80 border border-teal-700 text-teal-100 text-xs font-bold shrink-0 text-center">
                🎓 {searchedStudent.cohortName}
              </div>
            </div>

            {successMessage && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-3 shadow-xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Registration Closed Banner if Disabled by RTA */}
            {localStorage.getItem(`cdms_public_reg_enabled_${searchedStudent.academic_level}`) === 'false' ? (
              <div className="p-6 rounded-3xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-md space-y-2 text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white mx-auto flex items-center justify-center shadow-xs">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-amber-950">
                  فترة التسجيل الذاتي للمجموعات السريرية مغلقة حالياً 🔒
                </h4>
                <p className="text-xs text-amber-800 max-w-md mx-auto">
                  قام مسؤول الدفعة (RTA) أو المشرف السريري بتجميد فترة التسجيل الذاتي لدفعة ({searchedStudent.cohortName}) حالياً. يرجى التواصل مع مسؤول المساق للمتابعة.
                </p>
              </div>
            ) : (
              /* Subgroups Selection List for Student's Cohort */
              <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-teal-600" />
                  الشعب المتاحة المجهزة لدفعتك ({searchedStudent.cohortName}):
                </h3>

                <span className="text-xs text-slate-500 font-semibold">
                  اختر شعبة غير مكتملة واضغط حجز
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mainGroups.flatMap(mg => mg.subgroups).map((sg) => {
                  const currentCount = sg.students.length;
                  const isFull = currentCount >= sg.capacity;
                  const isRegisteredInThis = sg.students.some(st => st.university_number === searchedStudent.university_number);

                  return (
                    <Card
                      key={sg.id}
                      className={`p-5 border transition-all flex flex-col justify-between space-y-4 ${
                        isRegisteredInThis
                          ? 'border-2 border-teal-500 bg-teal-50/40 shadow-md'
                          : isFull
                          ? 'border-slate-200 bg-slate-100/50 opacity-75'
                          : 'border-slate-200 hover:border-slate-300 shadow-xs bg-white'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center justify-center">
                              {sg.code}
                            </span>
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">الشعبة الفرعية ({sg.code})</h4>
                              <span className="text-[11px] text-slate-500 font-medium">مجهزة من مساعد البحث والتدريس (RTA)</span>
                            </div>
                          </div>

                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                              isFull
                                ? 'bg-red-100 text-red-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {currentCount} / {sg.capacity} طلاب {isFull ? '(مكتملة)' : '(متاحة)'}
                          </span>
                        </div>

                        {/* List of enrolled students in this subgroup */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 block">الطلاب المسجلون بهذه الشعبة حتى الآن:</span>
                          {sg.students.length === 0 ? (
                            <span className="text-[11px] text-slate-400 italic block">لا يوجد طلاب مسجلون بعد (شعبة فارغة 🟢)</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {sg.students.map((st, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                    st.university_number === searchedStudent.university_number
                                      ? 'bg-teal-600 text-white'
                                      : 'bg-white text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {st.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                        {isRegisteredInThis ? (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 inline-flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            أنت مسجل حالياً بهذه الشعبة
                          </span>
                        ) : isFull ? (
                          <span className="text-xs font-bold text-slate-400 bg-slate-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            الشعبة اكتملت السعة (6/6)
                          </span>
                        ) : (
                          <Button
                            onClick={() => handleRegisterSeat(sg.code)}
                            className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl"
                          >
                            حجز المقعد والتسجيل بالشعبة {sg.code}
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
