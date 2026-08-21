import React, { useState, useMemo, useEffect, type FormEvent } from 'react';
import { 
  resolveSupervisorAssignments, 
  cleanDoctorName, 
  DEFAULT_EVALUATION_PARAMETERS, 
  calculateWeeklyTotal, 
  calculateWeeklyAverage, 
  calculateFinalClinicalScore, 
  type AssessmentParameter 
} from '@/utils/supervisorResolver';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { 
  Users, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Plus, 
  Send, 
  Award, 
  Star
} from 'lucide-react';

type TabKey = 'schedule' | 'attendance' | 'assessments';
type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

const STATUS_MAP: Record<AttendanceStatus, { label_ar: string; label_en: string; icon: any; active: string; inactive: string }> = {
  present:  { label_ar: 'حاضر',  label_en: 'Present', icon: CheckCircle, active: 'bg-emerald-500 text-white', inactive: 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700' },
  absent:   { label_ar: 'غائب',  label_en: 'Absent',  icon: XCircle,     active: 'bg-red-500 text-white',     inactive: 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-700' },
  late:     { label_ar: 'متأخر', label_en: 'Late',    icon: Clock,       active: 'bg-amber-500 text-white',   inactive: 'bg-slate-100 text-slate-500 hover:bg-amber-50 hover:text-amber-700' },
  excused:  { label_ar: 'مبرر',  label_en: 'Excused', icon: AlertCircle, active: 'bg-blue-500 text-white',    inactive: 'bg-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-700' },
};

export function SupervisorPortalPage() {
  const { locale } = useI18n();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<TabKey>('schedule');

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceWeek, setAttendanceWeek] = useState<number>(1);
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<number, AttendanceStatus>>({});

  // Assessment Form Modal State
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [selectedStudentForEval, setSelectedStudentForEval] = useState<any | null>(null);
  const [selectedWeekForEval, setSelectedWeekForEval] = useState<number>(1);
  const [paramScores, setParamScores] = useState<Record<string, number>>({});
  const [evalNotes, setEvalNotes] = useState<string>('');

  // Custom Rubric Parameters (editable or preset)
  const [rubricParameters] = useState<AssessmentParameter[]>(DEFAULT_EVALUATION_PARAMETERS);

  // Fetch supervisor assignments (my students)
  const { data: portalData, isLoading, isError } = useQuery({
    queryKey: ['supervisor-portal'],
    queryFn: () => apiFetch<any>('/operational/my-supervisor-assignments'),
  });

  // Fetch supervisor evaluations payload from MySQL Database
  const { data: rawEvaluationsPayload } = useQuery({
    queryKey: ['supervisor-evaluations-payload'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_supervisor_evaluations')}`),
  });

  // Fetch attendance records payload from MySQL Database
  const { data: rawAttendancePayload } = useQuery({
    queryKey: ['supervisor-attendance-payload'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_supervisor_attendance')}`),
  });

  // State for all attendance logs keyed by `${week}_${date}`
  const [attendanceStore, setAttendanceStore] = useState<Record<string, Record<number, AttendanceStatus>>>(() => {
    try {
      const saved = localStorage.getItem('cdms_supervisor_attendance');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    const payloadData = Array.isArray(rawAttendancePayload) ? rawAttendancePayload : rawAttendancePayload?.data;
    if (payloadData && typeof payloadData === 'object' && !Array.isArray(payloadData)) {
      setAttendanceStore(payloadData);
      try { localStorage.setItem('cdms_supervisor_attendance', JSON.stringify(payloadData)); } catch (e) {}
    }
  }, [rawAttendancePayload]);

  const activeAttKey = `W${attendanceWeek}_${attendanceDate}`;

  // Automatically update active statuses when activeAttKey or attendanceStore changes
  useEffect(() => {
    const currentLog = attendanceStore[activeAttKey] || {};
    setAttendanceStatuses(currentLog);
  }, [activeAttKey, attendanceStore]);

  // State for student weekly evaluations: { [studentId]: { [weekNum]: { scores: { [paramId]: number }, totalScore: number, notes?: string } } }
  const [studentWeeklyEvals, setStudentWeeklyEvals] = useState<Record<string, Record<number, { scores: Record<string, number>; totalScore: number; notes?: string }>>>(() => {
    try {
      const saved = localStorage.getItem('cdms_supervisor_evaluations');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    const payloadData = Array.isArray(rawEvaluationsPayload) ? rawEvaluationsPayload : rawEvaluationsPayload?.data;
    if (payloadData && typeof payloadData === 'object' && !Array.isArray(payloadData)) {
      setStudentWeeklyEvals(payloadData);
      try { localStorage.setItem('cdms_supervisor_evaluations', JSON.stringify(payloadData)); } catch (e) {}
    }
  }, [rawEvaluationsPayload]);

  const isSupervisor = portalData?.meta?.is_supervisor ?? user?.roles?.some(r => ['CLINICAL_SUPERVISOR', 'RTA'].includes(r.toUpperCase()));
  const assignments: any[] = portalData?.data ?? [];
  const rawSupervisorName = portalData?.meta?.full_name_ar || portalData?.meta?.full_name_en || user?.name || '';
  const supervisorName = cleanDoctorName(rawSupervisorName) || rawSupervisorName;

  // Fetch distribution matrices directly from MySQL Database payloads
  const { data: dbPayloadFourth } = useQuery({
    queryKey: ['matrix-payload-fourth'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_course_schedules_2026/2027_fourth')}`),
  });
  const { data: dbPayloadFifth } = useQuery({
    queryKey: ['matrix-payload-fifth'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_course_schedules_2026/2027_fifth')}`),
  });
  const { data: dbPayloadSixth } = useQuery({
    queryKey: ['matrix-payload-sixth'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_course_schedules_2026/2027_sixth')}`),
  });

  const overrideMatrices = useMemo(() => {
    const map: Record<string, any[]> = {};

    const fourthArr = Array.isArray(dbPayloadFourth) ? dbPayloadFourth : (dbPayloadFourth as any)?.data;
    const fifthArr = Array.isArray(dbPayloadFifth) ? dbPayloadFifth : (dbPayloadFifth as any)?.data;
    const sixthArr = Array.isArray(dbPayloadSixth) ? dbPayloadSixth : (dbPayloadSixth as any)?.data;

    if (Array.isArray(fourthArr) && fourthArr.length > 0) {
      map['cdms_course_schedules_2026/2027_fourth'] = fourthArr;
      try { localStorage.setItem('cdms_course_schedules_2026/2027_fourth', JSON.stringify(fourthArr)); } catch (e) {}
    }
    if (Array.isArray(fifthArr) && fifthArr.length > 0) {
      map['cdms_course_schedules_2026/2027_fifth'] = fifthArr;
      try { localStorage.setItem('cdms_course_schedules_2026/2027_fifth', JSON.stringify(fifthArr)); } catch (e) {}
    }
    if (Array.isArray(sixthArr) && sixthArr.length > 0) {
      map['cdms_course_schedules_2026/2027_sixth'] = sixthArr;
      try { localStorage.setItem('cdms_course_schedules_2026/2027_sixth', JSON.stringify(sixthArr)); } catch (e) {}
    }
    return map;
  }, [dbPayloadFourth, dbPayloadFifth, dbPayloadSixth]);

  const resolvedGroupCards = useMemo(() => {
    return resolveSupervisorAssignments(supervisorName, assignments, overrideMatrices);
  }, [supervisorName, assignments, overrideMatrices]);

  const effectiveStudentsList = useMemo(() => {
    const list: any[] = [];
    const seen = new Set();
    resolvedGroupCards.forEach(card => {
      card.students.forEach(st => {
        if (!seen.has(st.id)) {
          seen.add(st.id);
          list.push({
            id: st.id,
            full_name_ar: st.name_ar,
            full_name_en: st.name_en,
            university_number: st.number,
            groupName: card.groupName,
            subgroupCode: card.subgroupCode,
            weeksText: card.weeksText,
            weekNumbers: card.weekNumbers,
          });
        }
      });
    });
    return list;
  }, [resolvedGroupCards]);

  const studentsGroupedBySubgroup = useMemo(() => {
    const groupsMap = new Map<string, any[]>();
    effectiveStudentsList.forEach(st => {
      const gName = st.groupName || st.subgroupCode || (locale === 'ar' ? 'المجموعة السريرية' : 'Clinical Group');
      if (!groupsMap.has(gName)) groupsMap.set(gName, []);
      groupsMap.get(gName)!.push(st);
    });

    const result: { groupName: string; students: any[] }[] = [];
    groupsMap.forEach((students, groupName) => {
      result.push({ groupName, students });
    });

    return result;
  }, [effectiveStudentsList, locale]);

  // Open Evaluation Modal for a Student & Week
  const handleOpenEvalModal = (student: any, weekNum: number = 1) => {
    setSelectedStudentForEval(student);
    setSelectedWeekForEval(weekNum);

    const existingEval = studentWeeklyEvals[String(student.id)]?.[weekNum];
    if (existingEval && existingEval.scores) {
      setParamScores(existingEval.scores);
      setEvalNotes(existingEval.notes || '');
    } else {
      // Preset default scores (e.g. max points per parameter)
      const initialScores: Record<string, number> = {};
      rubricParameters.forEach(p => {
        initialScores[p.id] = p.maxPoints;
      });
      setParamScores(initialScores);
      setEvalNotes('');
    }
    setShowAssessmentForm(true);
  };

  // Submit Weekly Evaluation Handler
  const handleSaveWeeklyEvaluation = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForEval) return;

    const studentId = String(selectedStudentForEval.id);
    const weekTotal = calculateWeeklyTotal(paramScores);

    const updatedEvalsForStudent = {
      ...(studentWeeklyEvals[studentId] || {}),
      [selectedWeekForEval]: {
        scores: paramScores,
        totalScore: weekTotal,
        notes: evalNotes,
        updated_at: new Date().toISOString()
      }
    };

    const updatedAllEvals = {
      ...studentWeeklyEvals,
      [studentId]: updatedEvalsForStudent
    };

    setStudentWeeklyEvals(updatedAllEvals);
    try { localStorage.setItem('cdms_supervisor_evaluations', JSON.stringify(updatedAllEvals)); } catch (e) {}

    // Calculate weekly average out of 10 and final clinical score out of 20
    const weeklyAvg = calculateWeeklyAverage(updatedEvalsForStudent);
    const finalScoreOutof20 = calculateFinalClinicalScore(weeklyAvg);

    // Sync to cdms_student_grades for grade sheet & profile
    try {
      const savedGradesStr = localStorage.getItem('cdms_student_grades') || '{}';
      const savedGrades = JSON.parse(savedGradesStr);
      savedGrades[studentId] = {
        ...savedGrades[studentId],
        clinical_score: finalScoreOutof20,
        weekly_average: weeklyAvg,
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem('cdms_student_grades', JSON.stringify(savedGrades));
    } catch (e) {}

    // Sync payload directly to MySQL Database
    try {
      await apiFetch('/operational/distribution-payload', {
        method: 'POST',
        body: {
          key: 'cdms_supervisor_evaluations',
          payload: updatedAllEvals
        }
      });
    } catch (err) {
      console.error('DB Eval Sync Error:', err);
    }

    setShowAssessmentForm(false);
    setSelectedStudentForEval(null);
    alert(locale === 'ar' 
      ? `تم حفظ تقييم الأسبوع ${selectedWeekForEval} بنجاح ✓\nعلامة الأسبوع: ${weekTotal}/10 | العلامة النهائية: ${finalScoreOutof20}/20` 
      : `Week ${selectedWeekForEval} assessment saved ✓`
    );
  };

  // Save Attendance Handler
  const handleSaveAttendance = async () => {
    const updatedStore = {
      ...attendanceStore,
      [activeAttKey]: attendanceStatuses
    };

    setAttendanceStore(updatedStore);
    try { localStorage.setItem('cdms_supervisor_attendance', JSON.stringify(updatedStore)); } catch (e) {}

    try {
      await apiFetch('/operational/distribution-payload', {
        method: 'POST',
        body: {
          key: 'cdms_supervisor_attendance',
          payload: updatedStore
        }
      });
      alert(locale === 'ar' 
        ? `تم حفظ حضور أسبوع ${attendanceWeek} بتاريخ (${attendanceDate}) بنجاح ✓` 
        : `Attendance for Week ${attendanceWeek} saved successfully ✓`
      );
    } catch (e) {
      alert(locale === 'ar' ? 'تم حفظ الحضور بنجاح ✓' : 'Attendance saved ✓');
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={locale === 'ar' ? 'تعذّر تحميل بيانات بوابة المشرف' : 'Failed to load supervisor portal'} />;

  if (!isSupervisor) {
    return (
      <div className="mx-auto max-w-[700px] py-20 text-center space-y-4">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-10 h-10 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">{locale === 'ar' ? 'ملف المشرف غير موجود' : 'Supervisor Profile Not Found'}</h2>
        <p className="text-slate-500">{locale === 'ar' ? 'حسابك الحالي غير مرتبط بملف مشرف سريري. يرجى مراجعة إدارة النظام.' : 'Your account is not linked to a clinical supervisor profile. Please contact system administration.'}</p>
      </div>
    );
  }

  const TABS: { key: TabKey; label_ar: string; label_en: string; icon: any }[] = [
    { key: 'schedule',    label_ar: 'طلابي والمجموعات',  label_en: 'My Students & Groups', icon: Users },
    { key: 'attendance',  label_ar: 'الحضور والغياب',    label_en: 'Attendance Log',      icon: Calendar },
    { key: 'assessments', label_ar: 'التقييم الأسبوعي (20)', label_en: 'Weekly Evaluations (/20)', icon: Award },
  ];

  const totalStudentsCount = effectiveStudentsList.length;
  const totalGroupsCount = resolvedGroupCards.length;

  // Live score calculation preview inside evaluation modal
  const currentWeekTotal = calculateWeeklyTotal(paramScores);
  const previewStudentId = selectedStudentForEval ? String(selectedStudentForEval.id) : '';
  const existingEvalsMap = studentWeeklyEvals[previewStudentId] || {};
  const tempPreviewMap = {
    ...existingEvalsMap,
    [selectedWeekForEval]: { scores: paramScores, totalScore: currentWeekTotal }
  };
  const previewWeeklyAvg = calculateWeeklyAverage(tempPreviewMap);
  const previewFinalScore = calculateFinalClinicalScore(previewWeeklyAvg);

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === 'ar' ? `أهلاً د. ${supervisorName}` : `Welcome Dr. ${supervisorName}`}
        description={locale === 'ar' ? 'البوابة الموحدة لمتابعة المجموعات ورصد الحضور والتقييم السريري الأسبوعي' : 'Unified portal for student groups, attendance & weekly clinical evaluations'}
      >
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
            👨‍⚕️ {locale === 'ar' ? 'مشرف سريري' : 'Clinical Supervisor'}
          </span>
        </div>
      </PageHeader>

      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center gap-1.5 max-w-lg">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{locale === 'ar' ? tab.label_ar : tab.label_en}</span>
            </button>
          );
        })}
      </div>

      {/* ══════════════════════ TAB: SCHEDULE & MY STUDENTS ══════════════════════ */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'إجمالي الطلبة' : 'Total Students'}</span>
              <span className="text-xl font-bold text-slate-900 block mt-1">{totalStudentsCount}</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'المجموعات السريرية' : 'Clinical Groups'}</span>
              <span className="text-xl font-bold text-slate-800 block mt-1">{totalGroupsCount}</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'الفترة والأنابيب' : 'Period & Weeks'}</span>
              <span className="text-xs font-bold text-slate-800 block mt-1">
                {resolvedGroupCards[0]?.weeksText || (locale === 'ar' ? 'الجدول السريري الحالي' : 'Current Clinical Schedule')}
              </span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'المستشفى / الموقع' : 'Hospital / Site'}</span>
              <span className="text-xs font-bold text-slate-800 block mt-1">
                {resolvedGroupCards[0]?.siteName || (locale === 'ar' ? 'مستشفيات التدريب السريري' : 'Clinical Training Site')}
              </span>
            </div>
          </div>

          {/* Cards for each assigned group */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {resolvedGroupCards.map(card => (
              <div key={card.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-300 block mb-0.5">{card.courseName} — {card.deptName}</span>
                      <h3 className="text-base font-bold">{card.groupName}</h3>
                    </div>
                    <span className="px-3 py-1 bg-white/10 text-white rounded-xl text-xs font-bold border border-white/20">
                      {card.weeksText}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium">
                    <span>🏥 {card.siteName}</span>
                    <span className="font-bold text-slate-900">👥 {card.students.length} {locale === 'ar' ? 'طلاب' : 'students'}</span>
                  </div>

                  <div className="p-3 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {card.students.map((st: any) => (
                      <div key={st.id} className="py-2 flex items-center justify-between hover:bg-slate-50 rounded-xl px-2">
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{st.name_ar}</span>
                          <span className="text-[11px] text-slate-400">{st.number} — {st.level}</span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => {
                            setActiveTab('assessments');
                            handleOpenEvalModal({ ...st, groupName: card.groupName }, card.weekNumbers[0] || 1);
                          }}
                          className="text-xs font-bold text-slate-700 border-slate-300 hover:bg-slate-100"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 mr-1" />
                          {locale === 'ar' ? 'تقييم' : 'Eval'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!resolvedGroupCards.length && (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-2xs space-y-3">
              <div className="w-14 h-14 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800">{locale === 'ar' ? 'لا يوجد طلاب مخصصون لك حالياً' : 'No Students Assigned Currently'}</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {locale === 'ar' ? 'لم يتم تسجيل تكليفات في جدول التوزيع السريري لحسابك بعد.' : 'No rotation assignments found for your supervisor profile yet.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ TAB: ATTENDANCE LOG ══════════════════════ */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={e => setAttendanceDate(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-slate-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">{locale === 'ar' ? 'الأسبوع السريري' : 'Clinical Week'}</label>
                <select
                  value={attendanceWeek}
                  onChange={e => setAttendanceWeek(Number(e.target.value))}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-slate-600"
                >
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(w => (
                    <option key={w} value={w}>{locale === 'ar' ? `الأسبوع ${w}` : `Week ${w}`}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button onClick={handleSaveAttendance} className="bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-2">
              <Send className="w-4 h-4" />
              {locale === 'ar' ? 'حفظ الحضور' : 'Save Attendance Log'}
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs">{locale === 'ar' ? `سجل الحضور والغياب — أسبوع ${attendanceWeek} (${attendanceDate})` : `Attendance Sheet — Week ${attendanceWeek}`}</h3>
              <span className="text-xs text-slate-500 font-medium">{effectiveStudentsList.length} {locale === 'ar' ? 'طلاب' : 'students'}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {studentsGroupedBySubgroup.map(group => (
                <React.Fragment key={group.groupName}>
                  {/* Group Divider Header */}
                  <div className="bg-slate-100/90 text-slate-800 font-bold px-4 py-2 text-xs border-y border-slate-200 flex items-center justify-between">
                    <span>👥 {group.groupName} ({group.students.length} {locale === 'ar' ? 'طلاب' : 'students'})</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newStatuses = { ...attendanceStatuses };
                        group.students.forEach((st: any) => {
                          newStatuses[st.id] = 'present';
                        });
                        setAttendanceStatuses(newStatuses);
                      }}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:underline cursor-pointer"
                    >
                      {locale === 'ar' ? 'تحديد الكل حاضر' : 'Mark all present'}
                    </button>
                  </div>

                  {group.students.map((st: any) => {
                    const currentStatus = attendanceStatuses[st.id] || 'present';
                    return (
                      <div key={st.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/50">
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{st.full_name_ar}</span>
                          <span className="text-[11px] text-slate-400">{st.university_number}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {(Object.keys(STATUS_MAP) as AttendanceStatus[]).map(stKey => {
                            const info = STATUS_MAP[stKey];
                            const Icon = info.icon;
                            const isSel = currentStatus === stKey;
                            return (
                              <button
                                key={stKey}
                                type="button"
                                onClick={() => setAttendanceStatuses(prev => ({ ...prev, [st.id]: stKey }))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                  isSel ? info.active : info.inactive
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span>{locale === 'ar' ? info.label_ar : info.label_en}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB: WEEKLY CLINICAL EVALUATIONS (OUT OF 20) ══════════════════════ */}
      {activeTab === 'assessments' && (
        <div className="space-y-5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">{locale === 'ar' ? 'جدول التقييم السريري الأسبوعي' : 'Weekly Evaluation Matrix'}</h3>
              <span className="text-xs text-slate-500">{locale === 'ar' ? 'يتم التقييم أسبوعياً من 10 ويحسب النظام معدل الأسابيع ثم يضربه × 2 لتصبح العلامة من 20' : 'Evaluated weekly out of 10. Average multiplied by 2 for final mark out of 20.'}</span>
            </div>

            <Button 
              onClick={() => {
                if (effectiveStudentsList.length > 0) {
                  handleOpenEvalModal(effectiveStudentsList[0], 1);
                }
              }} 
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {locale === 'ar' ? 'تقييم أسبوعي' : 'New Evaluation'}
            </Button>
          </div>

          {/* Table of Weekly Evaluations (12 Weeks) per Subgroup */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-4 py-3 text-right sticky right-0 bg-slate-50 min-w-[160px] z-10">{locale === 'ar' ? 'اسم الطالب' : 'Student'}</th>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(w => (
                      <th key={w} className="px-2 py-3 text-center min-w-[48px]">{locale === 'ar' ? `أ${w}` : `W${w}`}</th>
                    ))}
                    <th className="px-3 py-3 text-center text-slate-800 font-bold bg-slate-100/50 min-w-[70px]">{locale === 'ar' ? 'المعدل (/10)' : 'Avg (/10)'}</th>
                    <th className="px-3 py-3 text-center text-slate-900 font-black bg-slate-200/50 min-w-[80px]">{locale === 'ar' ? 'النهائي (/20)' : 'Final (/20)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {studentsGroupedBySubgroup.map(group => (
                    <React.Fragment key={group.groupName}>
                      {/* Subgroup Divider Header */}
                      <tr className="bg-slate-100/90 text-slate-800 font-bold border-y border-slate-200">
                        <td colSpan={15} className="px-4 py-2 text-xs">
                          👥 {group.groupName} ({group.students.length} {locale === 'ar' ? 'طلاب' : 'students'})
                        </td>
                      </tr>

                      {group.students.map((st: any) => {
                        const stEvals = studentWeeklyEvals[String(st.id)] || {};
                        const weeklyAvg = calculateWeeklyAverage(stEvals);
                        const finalScore = calculateFinalClinicalScore(weeklyAvg);
                        const hasEvals = Object.keys(stEvals).length > 0;

                        return (
                          <tr key={st.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 sticky right-0 bg-white shadow-xs z-10">
                              <span className="font-bold text-slate-900 block">{st.full_name_ar}</span>
                              <span className="text-[10px] text-slate-400">{st.university_number}</span>
                            </td>

                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(w => {
                              const wEval = stEvals[w];
                              return (
                                <td key={w} className="px-1.5 py-3 text-center">
                                  {wEval ? (
                                    <button 
                                      onClick={() => handleOpenEvalModal(st, w)}
                                      className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-900 font-bold border border-slate-300 text-[11px] hover:bg-slate-200 cursor-pointer"
                                    >
                                      {wEval.totalScore}
                                    </button>
                                  ) : (
                                    <button 
                                      onClick={() => handleOpenEvalModal(st, w)}
                                      className="text-slate-300 hover:text-slate-700 hover:bg-slate-100 px-1 py-0.5 rounded text-[11px] cursor-pointer"
                                    >
                                      -
                                    </button>
                                  )}
                                </td>
                              );
                            })}

                            <td className="px-3 py-3 text-center font-bold bg-slate-50/50">
                              {hasEvals ? `${weeklyAvg}` : '—'}
                            </td>

                            <td className="px-3 py-3 text-center font-black text-slate-900 bg-slate-100/50">
                              {hasEvals ? `${finalScore}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ MODAL: WEEKLY EVALUATION FORM (BOX INPUTS) ══════════════════════ */}
      {showAssessmentForm && selectedStudentForEval && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-2xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-bold text-slate-500 block mb-0.5">{selectedStudentForEval.groupName}</span>
                <h3 className="text-base font-bold text-slate-900">{selectedStudentForEval.full_name_ar}</h3>
              </div>
              <button 
                onClick={() => setShowAssessmentForm(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 cursor-pointer font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWeeklyEvaluation} className="space-y-4">
              {/* Week Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">{locale === 'ar' ? 'اختر الأسبوع:' : 'Select Week:'}</label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(w => {
                    const isSel = selectedWeekForEval === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setSelectedWeekForEval(w);
                          const existing = studentWeeklyEvals[String(selectedStudentForEval.id)]?.[w];
                          if (existing && existing.scores) {
                            setParamScores(existing.scores);
                            setEvalNotes(existing.notes || '');
                          }
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          isSel ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {locale === 'ar' ? `أ${w}` : `W${w}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Rubric Parameters Box Inputs (Number Box Input) */}
              <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-700">{locale === 'ar' ? 'بنود التقييم' : 'Parameters'}</span>
                  <span className="text-xs font-bold text-slate-600">
                    {locale === 'ar' ? 'المجموع الإجمالي: 10' : 'Total: 10'}
                  </span>
                </div>

                {rubricParameters.map(param => {
                  const val = paramScores[param.id] ?? param.maxPoints;
                  return (
                    <div key={param.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                      <span className="font-medium text-slate-800">{locale === 'ar' ? param.name_ar : param.name_en}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max={param.maxPoints}
                          step="0.5"
                          value={val}
                          onChange={e => {
                            const num = Math.min(param.maxPoints, Math.max(0, Number(e.target.value) || 0));
                            setParamScores({ ...paramScores, [param.id]: num });
                          }}
                          className="w-16 text-center font-bold text-slate-900 bg-slate-50 rounded-lg border border-slate-300 p-1.5 text-xs focus:bg-white focus:border-slate-600 focus:ring-1 focus:ring-slate-600"
                        />
                        <span className="text-slate-400 font-bold">/ {param.maxPoints}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{locale === 'ar' ? 'ملاحظات (اختياري)' : 'Notes'}</label>
                <textarea
                  rows={2}
                  value={evalNotes}
                  onChange={e => setEvalNotes(e.target.value)}
                  placeholder={locale === 'ar' ? 'ملاحظات الأداء...' : 'Notes...'}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:ring-1 focus:ring-slate-600"
                />
              </div>

              {/* Score Summary Box */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{locale === 'ar' ? `علامة الأسبوع ${selectedWeekForEval}:` : `Week ${selectedWeekForEval}:`}</span>
                  <span className="font-bold text-amber-300">{currentWeekTotal} / 10</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="font-bold">{locale === 'ar' ? 'العلامة النهائية (المعدل × 2):' : 'Final Mark (Avg × 2):'}</span>
                  <span className="font-black text-emerald-400 text-base">{previewFinalScore} / 20</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <Button type="button" variant="outline" onClick={() => setShowAssessmentForm(false)}>
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white font-bold">
                  {locale === 'ar' ? 'حفظ التقييم' : 'Save Evaluation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
