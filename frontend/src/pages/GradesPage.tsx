import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import ExcelJS from 'exceljs';
import { 
  Send, FileCheck, Search, ShieldCheck,
  FileSpreadsheet, ClipboardCheck,
  Eye, CheckCircle, RotateCcw
} from 'lucide-react';

interface StudentItem {
  id: number;
  university_number: string;
  full_name_ar: string;
  full_name_en?: string;
  academic_level: string;
  photo_url?: string;
  city?: string;
}

interface CourseItem {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  level: string;
  coordinator?: string;
  coordinator_en?: string;
  credits: number;
}

interface StudentGradeRecord {
  studentId: number;
  universityNumber: string;
  nameAr: string;
  nameEn?: string;
  photoUrl?: string;
  clinicalScore: number | null; // / 20 (submitted by Clinical Supervisor)
  osceScore: number | null;     // / 40 (entered by RTA)
  writtenScore: number | null;  // / 40 (entered by RTA)
  notes?: string;
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  returnReason?: string;
  updatedAt?: string;
}

interface GradeSubmissionRecord {
  key: string;
  courseCode: string;
  courseName: string;
  level: string;
  academicYear: string;
  submittedBy: string;
  submittedAt: string;
  status: 'submitted' | 'approved' | 'returned';
  returnReason?: string;
  recordsCount: number;
}

// Official Faculty Grade Scale Definition (from Hebron University Faculty of Medicine guidelines)
const GRADE_SCALE = [
  { code: 'A+', range: '100-95', min: 95, max: 100 },
  { code: 'A',  range: '94-90',  min: 90, max: 94 },
  { code: 'B+', range: '89-87',  min: 87, max: 89 },
  { code: 'B',  range: '86-83',  min: 83, max: 86 },
  { code: 'B-', range: '82-80',  min: 80, max: 82 },
  { code: 'C+', range: '79-75',  min: 75, max: 79 },
  { code: 'C',  range: '74-70',  min: 70, max: 74 },
  { code: 'C-', range: '69-67',  min: 67, max: 69 },
  { code: 'D+', range: '66-64',  min: 64, max: 66 },
  { code: 'D',  range: '63-60',  min: 60, max: 63 },
  { code: 'E',  range: '< 60',   min: 0,  max: 59 },
];

// Predefined Faculty Clinical Courses per Cohort (Matching Clinical Courses Database Table)
const defaultClinicalCourses: CourseItem[] = [
  // 4th Year (Junior Phase)
  { id: 'M1460', code: 'M1460', name_ar: 'الأمراض الباطنية (مبتدئ)', name_en: 'Internal Medicine (Junior)', level: 'fourth', coordinator: 'د. عبدالله قاسم', coordinator_en: 'Dr. Abdallah Qasim', credits: 10 },
  { id: 'M1470', code: 'M1470', name_ar: 'الجراحة العامة (مبتدئ)', name_en: 'General Surgery (Junior)', level: 'fourth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 10 },
  { id: 'M1480', code: 'M1480', name_ar: 'طب الأطفال (مبتدئ)', name_en: 'Pediatrics (Junior)', level: 'fourth', coordinator: 'د. نادية ابو عيشة', coordinator_en: 'Dr. Nadia Abu Eisheh', credits: 8 },
  { id: 'N1471', code: 'N1471', name_ar: 'طب وجراحة العيون 2', name_en: 'Ophthalmology 2', level: 'fourth', coordinator: 'د. طارق الجعبة', coordinator_en: 'Dr. Tareq Jaaba', credits: 2 },
  { id: 'M1490', code: 'M1490', name_ar: 'مساق اختياري حر 1', name_en: 'Free Elective Course 1', level: 'fourth', coordinator: 'د. طارق الجعبة', coordinator_en: 'Dr. Tareq Jaaba', credits: 4 },
  
  // 5th Year (Specialties Phase)
  { id: 'M1582', code: 'M1582', name_ar: 'التوليد والأمراض النسائية (مبتدئ)', name_en: 'Obstetrics & Gynecology (Junior)', level: 'fifth', coordinator: 'د. اياد عفانة', coordinator_en: 'Dr. Iyad Afaneh', credits: 8 },
  { id: 'M1583', code: 'M1583', name_ar: 'طب الأطفال (مبتدئ)', name_en: 'Pediatrics (Junior)', level: 'fifth', coordinator: 'د. نادية ابو عيشة', coordinator_en: 'Dr. Nadia Abu Eisheh', credits: 12 },
  { id: 'M1574', code: 'M1574', name_ar: 'تخدير وإنعاش', name_en: 'Anesthesia & Resuscitation', level: 'fifth', coordinator: 'د. عبدالله قاسم', coordinator_en: 'Dr. Abdallah Qasim', credits: 2 },
  { id: 'M1563', code: 'M1563', name_ar: 'تخصصات طبية مختارة', name_en: 'Selected Medical Specialties', level: 'fifth', coordinator: 'د. عبدالله قاسم', coordinator_en: 'Dr. Abdallah Qasim', credits: 2 },
  { id: 'M1566', code: 'M1566', name_ar: 'تخصصات جراحية مختارة', name_en: 'Selected Surgical Specialties', level: 'fifth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 2 },
  { id: 'M1571', code: 'M1571', name_ar: 'جراحة العظام والكسور، حالات الطوارئ الجراحية', name_en: 'Orthopedics, Fractures & Surgical Emergencies', level: 'fifth', coordinator: 'د. عمار شاهين', coordinator_en: 'Dr. Ammar Shaheen', credits: 4 },
  { id: 'M1572', code: 'M1572', name_ar: 'الأنف والأذن والحنجرة', name_en: 'ENT (Otorhinolaryngology)', level: 'fifth', coordinator: 'د. نهاد مسودة', coordinator_en: 'Dr. Nihad Maswadeh', credits: 2 },
  { id: 'M1584', code: 'M1584', name_ar: 'الطب الشرعي', name_en: 'Forensic Medicine', level: 'fifth', coordinator: 'د. نهاد مسودة', coordinator_en: 'Dr. Nihad Maswadeh', credits: 2 },
  { id: 'M1587', code: 'M1587', name_ar: 'التصوير الطبي (في الصف)', name_en: 'Medical Imaging', level: 'fifth', coordinator: 'د. نهاد مسودة', coordinator_en: 'Dr. Nihad Maswadeh', credits: 2 },
  { id: 'M1594', code: 'M1594', name_ar: 'مشروع بحث1 (في الصف)', name_en: 'Research Project 1', level: 'fifth', coordinator: 'د. رامي القواسمة', coordinator_en: 'Dr. Rami Qawasmeh', credits: 2 },
  { id: 'M1593', code: 'M1593', name_ar: 'طب الاسرة والمجتمع', name_en: 'Family & Community Medicine', level: 'fifth', coordinator: 'د. رامي القواسمة', coordinator_en: 'Dr. Rami Qawasmeh', credits: 4 },
  { id: 'M1596', code: 'M1596', name_ar: 'مساق اختياري حر (2)', name_en: 'Free Elective Course 2', level: 'fifth', coordinator: 'د. رامي القواسمة', coordinator_en: 'Dr. Rami Qawasmeh', credits: 4 },

  // 6th Year (Advanced Senior / Internship Phase)
  { id: 'M1661', code: 'M1661', name_ar: 'الطب الباطني متقدم', name_en: 'Internal Medicine (Advanced)', level: 'sixth', coordinator: 'د. هاني عابدين', coordinator_en: 'Dr. Hani Abdeen', credits: 8 },
  { id: 'M1662', code: 'M1662', name_ar: 'طبي القلب', name_en: 'Cardiology', level: 'sixth', coordinator: 'د. هاني عابدين', coordinator_en: 'Dr. Hani Abdeen', credits: 2 },
  { id: 'M1673', code: 'M1673', name_ar: 'جراحة عامة متقدم', name_en: 'General Surgery (Advanced)', level: 'sixth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 8 },
  { id: 'M1687', code: 'M1687', name_ar: 'طب طوارئ', name_en: 'Emergency Medicine', level: 'sixth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 4 },
  { id: 'M1677', code: 'M1677', name_ar: 'جراحة القلب الصدر والاوعية الدموية', name_en: 'Cardiothoracic & Vascular Surgery', level: 'sixth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 2 },
  { id: 'M1688', code: 'M1688', name_ar: 'طب الأطفال متقدم', name_en: 'Pediatrics (Advanced)', level: 'sixth', coordinator: 'د. نادية ابو عيشة', coordinator_en: 'Dr. Nadia Abu Eisheh', credits: 6 },
  { id: 'M1689', code: 'M1689', name_ar: 'التوليد والامراض النسائية (متقدم)', name_en: 'Obstetrics & Gynecology (Advanced)', level: 'sixth', coordinator: 'د. عبدالسلام حداد', coordinator_en: 'Dr. Abdulsalam Haddad', credits: 6 },
  { id: 'M1693', code: 'M1693', name_ar: 'مشروع بحث (2) (في الصف)', name_en: 'Research Project 2', level: 'sixth', coordinator: 'د. عبدالسلام حداد', coordinator_en: 'Dr. Abdulsalam Haddad', credits: 4 },
  { id: 'M169', code: 'M169', name_ar: 'الإدارة الصحية', name_en: 'Health Administration', level: 'sixth', coordinator: 'د. عبدالسلام حداد', coordinator_en: 'Dr. Abdulsalam Haddad', credits: 2 },
];

export function GradesPage() {
  const { locale } = useI18n();
  const { user } = useAuth();

  // Role-Based Access Control
  const isSupervisorOnly = useMemo(() => {
    if (!user?.roles) return false;
    const roles = user.roles.map(r => r.toUpperCase());
    return roles.includes('CLINICAL_SUPERVISOR') && !roles.some(r => ['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'RTA'].includes(r));
  }, [user]);

  const isApprover = useMemo(() => {
    if (!user?.roles) return false;
    return user.roles.some(r => 
      ['department_head', 'clinical_director', 'dean', 'vice_dean', 'admin_assistant', 'sys_admin', 'admin'].includes(r.toLowerCase())
    );
  }, [user]);

  // RTA/Supervisor assigned levels restriction
  const assignedLevels: string[] | null = useMemo(() => {
    if (!user?.assigned_levels || user.assigned_levels.length === 0) return null;
    return user.assigned_levels;
  }, [user]);

  // All available cohort tabs
  const allCohortTabs = [
    { key: 'fourth' as const, label: locale === 'ar' ? 'السنة الرابعة (المرحلة السريرية الأولى)' : '4th Year (Clinical Phase I)' },
    { key: 'fifth' as const, label: locale === 'ar' ? 'السنة الخامسة (المرحلة السريرية الثانية)' : '5th Year (Clinical Phase II)' },
    { key: 'sixth' as const, label: locale === 'ar' ? 'السنة السادسة (سنة التدريب النهائي)' : '6th Year (Senior Phase)' },
  ];

  // Filter tabs based on assigned levels
  const visibleCohortTabs = useMemo(() => {
    if (!assignedLevels) return allCohortTabs;
    return allCohortTabs.filter(t => assignedLevels.includes(t.key));
  }, [assignedLevels, locale]);

  // Active View Tab for Approvers: 'approval_hub' (مركز الاعتماد) vs 'sheet' (الكشف التفصيلي)
  const [activeMainTab, setActiveMainTab] = useState<'approval_hub' | 'sheet'>(isApprover ? 'approval_hub' : 'sheet');

  // 1. Academic Year
  const [academicYears] = useState<string[]>(() => {
    const saved = localStorage.getItem('cdms_academic_years');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ['2026/2027'];
  });
  const academicYear = academicYears[0] || '2026/2027';

  // 2. Selected Level (fourth, fifth, sixth)
  const [selectedLevel, setSelectedLevel] = useState<'fourth' | 'fifth' | 'sixth'>(() => {
    if (assignedLevels && assignedLevels.length > 0) {
      const valid = assignedLevels.find(l => ['fourth', 'fifth', 'sixth'].includes(l));
      if (valid) return valid as any;
    }
    return 'fourth';
  });

  // Query live courses dynamically from MySQL database
  const { data: dbCoursesResponse } = useQuery({
    queryKey: ['courses-live-grades'],
    queryFn: () => apiFetch<any>('/courses?per_page=100'),
  });

  const liveCoursesList: CourseItem[] = useMemo(() => {
    const rawList = Array.isArray(dbCoursesResponse) ? dbCoursesResponse : (dbCoursesResponse?.data || dbCoursesResponse?.items || []);
    if (rawList && rawList.length > 0) {
      return rawList.map((c: any) => ({
        id: c.code || String(c.id),
        code: c.code,
        name_ar: c.name_ar,
        name_en: c.name_en || c.name_ar,
        level: c.academic_level || 'fourth',
        coordinator: c.coordinator || '',
        credits: c.credit_hours || 6,
      }));
    }
    return defaultClinicalCourses;
  }, [dbCoursesResponse]);

  // 3. Courses available for this level (fetched live from DB)
  const availableCourses = useMemo(() => {
    const filtered = liveCoursesList.filter(c => c.level === selectedLevel);
    if (filtered.length > 0) return filtered;
    return defaultClinicalCourses.filter(c => c.level === selectedLevel);
  }, [liveCoursesList, selectedLevel]);

  // 4. Selected Course
  const [selectedCourseId, setSelectedCourseId] = useState<string>('M1460');

  // Update selected course when level changes or DB courses arrive
  useEffect(() => {
    if (availableCourses.length > 0 && !availableCourses.some(c => c.id === selectedCourseId)) {
      setSelectedCourseId(availableCourses[0].id);
    }
  }, [availableCourses, selectedCourseId]);

  const activeCourse = useMemo(() => {
    return liveCoursesList.find(c => c.id === selectedCourseId) || availableCourses[0] || defaultClinicalCourses[0];
  }, [selectedCourseId, liveCoursesList, availableCourses]);

  // 5. Search / Filter query inside the grade table
  const [searchQuery, setSearchQuery] = useState('');

  // 6. Return Modal State
  const [isBatchReturnModalOpen, setIsBatchReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  // 7. Max Scores Weighting Configuration (Clinical 20, OSCE 40, Written 40 = 100 Total)
  const [maxScores] = useState({
    clinical: 20,
    osce: 40,
    written: 40,
    total: 100
  });

  // 8. Fetch all students from directory
  const { data: studentsData } = useQuery({
    queryKey: ['grades-students-all'],
    queryFn: () => apiFetch<any>('/students?per_page=1000'),
  });

  const allStudentsList: StudentItem[] = useMemo(() => {
    if (Array.isArray(studentsData)) return studentsData;
    return studentsData?.data || studentsData?.items || [];
  }, [studentsData]);

  // Filter students belonging to the selected level
  const levelStudents = useMemo(() => {
    if (!allStudentsList.length) return [];
    return allStudentsList.filter(s => {
      const lvl = (s.academic_level || '').toLowerCase();
      if (selectedLevel === 'fourth') return lvl.includes('4') || lvl.includes('fourth') || lvl.includes('رابع');
      if (selectedLevel === 'fifth') return lvl.includes('5') || lvl.includes('fifth') || lvl.includes('خامس');
      if (selectedLevel === 'sixth') return lvl.includes('6') || lvl.includes('sixth') || lvl.includes('سادس');
      return false;
    });
  }, [allStudentsList, selectedLevel]);

  // Storage key for persistent grades: cdms_grades_${year}_${level}_${courseId}
  const storageKey = `cdms_grades_${academicYear}_${selectedLevel}_${selectedCourseId}`;

  // Fetch persistent grade payload from MySQL Database
  const { data: dbGradesPayload } = useQuery({
    queryKey: ['db-grades-payload', storageKey],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent(storageKey)}`),
  });

  // Fetch supervisor evaluations payload from MySQL Database
  const { data: rawEvaluationsPayload } = useQuery({
    queryKey: ['supervisor-evaluations-payload-grades'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_supervisor_evaluations')}`),
  });

  // Fetch submitted grade sheets index from MySQL Database
  const { data: rawSubmittedSheetsPayload, refetch: refetchSubmittedSheets } = useQuery({
    queryKey: ['submitted-grade-sheets-index'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_submitted_grade_sheets')}`),
  });

  const [submittedSheetsStore, setSubmittedSheetsStore] = useState<Record<string, GradeSubmissionRecord>>(() => {
    try {
      const saved = localStorage.getItem('cdms_submitted_grade_sheets');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    const data = Array.isArray(rawSubmittedSheetsPayload) ? rawSubmittedSheetsPayload : (rawSubmittedSheetsPayload?.data ?? rawSubmittedSheetsPayload);
    if (data && typeof data === 'object') {
      setSubmittedSheetsStore(data);
      try { localStorage.setItem('cdms_submitted_grade_sheets', JSON.stringify(data)); } catch (e) {}
    }
  }, [rawSubmittedSheetsPayload]);

  // 9. Load / Store Grade Records for this specific Course & Year
  const [gradeRecords, setGradeRecords] = useState<StudentGradeRecord[]>([]);

  // Synchronize grade records whenever levelStudents, academicYear, or selectedCourseId changes
  useEffect(() => {
    const savedLocal = localStorage.getItem(storageKey);
    const dbGrades = Array.isArray(dbGradesPayload) ? dbGradesPayload : (dbGradesPayload?.data ?? dbGradesPayload);
    let supervisorEvals = (rawEvaluationsPayload && typeof rawEvaluationsPayload === 'object')
      ? (rawEvaluationsPayload.data ?? rawEvaluationsPayload)
      : null;

    if (!supervisorEvals || typeof supervisorEvals !== 'object' || Object.keys(supervisorEvals).length === 0) {
      try {
        const savedLocalEvals = localStorage.getItem('cdms_supervisor_evaluations');
        if (savedLocalEvals) supervisorEvals = JSON.parse(savedLocalEvals);
      } catch (e) {}
    }

    let existingMap: Record<string, StudentGradeRecord> = {};

    if (Array.isArray(dbGrades) && dbGrades.length > 0) {
      dbGrades.forEach(r => {
        if (r.universityNumber) existingMap[r.universityNumber] = r;
      });
    } else if (savedLocal) {
      try {
        const parsed: StudentGradeRecord[] = JSON.parse(savedLocal);
        if (Array.isArray(parsed)) {
          parsed.forEach(r => {
            if (r.universityNumber) existingMap[r.universityNumber] = r;
          });
        }
      } catch (e) {}
    }

    const unified: StudentGradeRecord[] = levelStudents.map(student => {
      const existing = existingMap[student.university_number];

      let clinicalFromSupervisor: number | null = null;
      if (supervisorEvals && typeof supervisorEvals === 'object') {
        const stEvals = supervisorEvals[String(student.id)] || supervisorEvals[student.university_number];
        if (stEvals && typeof stEvals === 'object') {
          const evalEntries = Object.values(stEvals).filter((e: any) => e && typeof e.totalScore === 'number') as any[];
          if (evalEntries.length > 0) {
            const sum = evalEntries.reduce((acc: number, curr: any) => acc + curr.totalScore, 0);
            const avg = sum / evalEntries.length;
            clinicalFromSupervisor = Number(Math.min(20, Math.max(0, avg * 2)).toFixed(2));
          }
        }
      }

      const finalClinicalScore = existing?.clinicalScore ?? clinicalFromSupervisor;

      if (existing) {
        return {
          ...existing,
          nameAr: student.full_name_ar,
          nameEn: student.full_name_en,
          photoUrl: student.photo_url,
          clinicalScore: finalClinicalScore,
        };
      }

      return {
        studentId: student.id,
        universityNumber: student.university_number,
        nameAr: student.full_name_ar,
        nameEn: student.full_name_en,
        photoUrl: student.photo_url,
        clinicalScore: finalClinicalScore,
        osceScore: null,
        writtenScore: null,
        status: 'draft'
      };
    });

    setGradeRecords(unified);
  }, [storageKey, levelStudents, dbGradesPayload, rawEvaluationsPayload]);

  // Helper to persist grade records to LocalStorage & MySQL Database
  const saveRecords = (updated: StudentGradeRecord[]) => {
    setGradeRecords(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));

    apiFetch('/operational/distribution-payload', {
      method: 'POST',
      body: { key: storageKey, payload: updated }
    }).catch(err => console.error('DB Grade Sync Error:', err));
  };

  // Helper to save Submission Record to index
  const updateSubmissionIndex = async (status: 'submitted' | 'approved' | 'returned', reason?: string) => {
    const rtaName = user?.name || (locale === 'ar' ? 'مساعد البحث والتدريس' : 'RTA');
    const newRecord: GradeSubmissionRecord = {
      key: storageKey,
      courseCode: activeCourse.code,
      courseName: activeCourse.name_ar,
      level: selectedLevel,
      academicYear,
      submittedBy: rtaName,
      submittedAt: new Date().toISOString(),
      status,
      returnReason: reason,
      recordsCount: gradeRecords.length
    };

    const updatedStore = {
      ...submittedSheetsStore,
      [storageKey]: newRecord
    };

    setSubmittedSheetsStore(updatedStore);
    try { localStorage.setItem('cdms_submitted_grade_sheets', JSON.stringify(updatedStore)); } catch (e) {}

    try {
      await apiFetch('/operational/distribution-payload', {
        method: 'POST',
        body: { key: 'cdms_submitted_grade_sheets', payload: updatedStore }
      });
      refetchSubmittedSheets();
    } catch (e) {}
  };

  // Helper: Calculate Total Score & Letter Grade
  const calculateTotal = (record: StudentGradeRecord) => {
    const c = record.clinicalScore ?? 0;
    const o = record.osceScore ?? 0;
    const w = record.writtenScore ?? 0;
    const hasAny = record.clinicalScore !== null || record.osceScore !== null || record.writtenScore !== null;
    if (!hasAny) return null;
    return Math.min(100, Math.round((c + o + w) * 10) / 10);
  };

  // Official Letter Grade Scale Converter matching Hebron University Faculty Guidelines
  const getLetterGrade = (total: number | null): string => {
    if (total === null) return '—';
    const rounded = Math.round(total);
    if (rounded >= 95) return 'A+';
    if (rounded >= 90) return 'A';
    if (rounded >= 87) return 'B+';
    if (rounded >= 83) return 'B';
    if (rounded >= 80) return 'B-';
    if (rounded >= 75) return 'C+';
    if (rounded >= 70) return 'C';
    if (rounded >= 67) return 'C-';
    if (rounded >= 64) return 'D+';
    if (rounded >= 60) return 'D';
    return 'E';
  };

  // Dynamic Grade Distribution Statistics & Breakdown Matrix
  const gradeDistributionStats = useMemo(() => {
    const counts: Record<string, number> = {
      'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'B-': 0, 'C+': 0, 'C': 0, 'C-': 0, 'D+': 0, 'D': 0, 'E': 0
    };
    let gradedCount = 0;
    let passedCount = 0;
    let failedCount = 0;

    gradeRecords.forEach(r => {
      const tot = calculateTotal(r);
      if (tot !== null) {
        gradedCount++;
        const g = getLetterGrade(tot);
        if (counts[g] !== undefined) {
          counts[g]++;
        } else {
          counts['E']++;
        }
        if (tot >= 60) passedCount++;
        else failedCount++;
      }
    });

    const percentages: Record<string, string> = {};
    GRADE_SCALE.forEach(item => {
      const cnt = counts[item.code] || 0;
      percentages[item.code] = gradedCount > 0 ? ((cnt / gradedCount) * 100).toFixed(1) + '%' : '0%';
    });

    return {
      counts,
      percentages,
      gradedCount,
      passedCount,
      failedCount,
      passedPercentage: gradedCount > 0 ? ((passedCount / gradedCount) * 100).toFixed(1) + '%' : '0%',
      failedPercentage: gradedCount > 0 ? ((failedCount / gradedCount) * 100).toFixed(1) + '%' : '0%',
    };
  }, [gradeRecords]);

  // Inline Score Input Change Handler
  const handleScoreChange = (
    universityNumber: string,
    field: 'clinicalScore' | 'osceScore' | 'writtenScore',
    valStr: string
  ) => {
    if (isApprover) return;

    let numVal: number | null = valStr === '' ? null : parseFloat(valStr);
    if (numVal !== null) {
      if (isNaN(numVal) || numVal < 0) numVal = 0;
      if (field === 'clinicalScore' && numVal > maxScores.clinical) numVal = maxScores.clinical;
      if (field === 'osceScore' && numVal > maxScores.osce) numVal = maxScores.osce;
      if (field === 'writtenScore' && numVal > maxScores.written) numVal = maxScores.written;
    }

    const updated = gradeRecords.map(r => {
      if (r.universityNumber === universityNumber) {
        return {
          ...r,
          [field]: numVal,
          status: r.status === 'approved' ? 'draft' : r.status,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });

    saveRecords(updated);
  };

  // Submit entire course sheet for Approval
  const handleRtaSubmitCourseSheet = async () => {
    if (!window.confirm(locale === 'ar' ? `تقديم كشف علامات مساق (${activeCourse.name_ar}) لمدير الدائرة والعميد للاعتماد؟` : 'Submit grade sheet to Department Head for approval?')) return;

    const updated = gradeRecords.map(r => ({ ...r, status: 'submitted' as const }));
    saveRecords(updated);
    await updateSubmissionIndex('submitted');

    alert(locale === 'ar' 
      ? `تم تقديم كشف علامات مساق (${activeCourse.name_ar}) بنجاح لمدير الدائرة والعميد للاعتماد الرسمـي ✓` 
      : 'Grade sheet submitted successfully for approval ✓'
    );
  };

  // Approve entire course sheet (Department Head / Dean action)
  const handleApproveCourseSheet = async () => {
    if (!window.confirm(locale === 'ar' ? `الاعتماد النهائي لكافة علامات مساق (${activeCourse.name_ar})؟` : 'Officially approve all grades for this course?')) return;

    const updated = gradeRecords.map(r => ({ ...r, status: 'approved' as const }));
    saveRecords(updated);
    await updateSubmissionIndex('approved');

    alert(locale === 'ar' 
      ? `تم اعتماد كشف علامات مساق (${activeCourse.name_ar}) رسمياً ✓` 
      : 'Grade sheet officially approved ✓'
    );
  };

  // Return course sheet with feedback notes
  const handleConfirmReturnCourseSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReason.trim()) return;

    const updated = gradeRecords.map(r => ({ ...r, status: 'returned' as const, returnReason: returnReason.trim() }));
    saveRecords(updated);
    await updateSubmissionIndex('returned', returnReason.trim());

    setIsBatchReturnModalOpen(false);
    setReturnReason('');

    alert(locale === 'ar' 
      ? `تم إرجاع الكشف لمساعد البحث والتدريس مع إضافة الملاحظات بنجاح ✓` 
      : 'Grade sheet returned with feedback ✓'
    );
  };

  // Export Matrix to Excel
  const handleExportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hebron University - Faculty of Medicine';
    wb.created = new Date();

    const isAr = locale === 'ar';
    const ws = wb.addWorksheet(isAr ? 'كشف العلامات المعتمد' : 'Official Grade Sheet', {
      views: [{ showGridLines: true, rightToLeft: isAr }]
    });

    const totalCols = 8;

    // Row 1: Banner
    ws.mergeCells(1, 1, 1, totalCols);
    const r1 = ws.getCell(1, 1);
    r1.value = isAr ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine';
    r1.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Row 2: Subtitle
    ws.mergeCells(2, 1, 2, totalCols);
    const r2 = ws.getCell(2, 1);
    r2.value = isAr 
      ? `كشف درجات: ${activeCourse.name_ar} (${activeCourse.code}) — العام: ${academicYear}`
      : `Grade Sheet: ${activeCourse.name_en} (${activeCourse.code}) — Year: ${academicYear}`;
    r2.font = { name: 'Segoe UI', size: 11.5, bold: true, color: { argb: 'FFCCFBF1' } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    const headers = [
      isAr ? 'الرقم' : '#',
      isAr ? 'الرقم الجامعي' : 'University ID',
      isAr ? 'اسم الطالب' : 'Student Name',
      isAr ? 'التدريب السريري (20)' : 'Clinical (/20)',
      isAr ? 'امتحان الأوسكي (40)' : 'OSCE Exam (/40)',
      isAr ? 'الامتحان النهائي (40)' : 'Written Final (/40)',
      isAr ? 'المجموع (100)' : 'Total (/100)',
      isAr ? 'التقدير والحالة' : 'Grade'
    ];

    headers.forEach((h, idx) => {
      const cell = ws.getCell(5, idx + 1);
      cell.value = h;
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    gradeRecords.forEach((rec, idx) => {
      const rowNum = 6 + idx;
      const total = calculateTotal(rec);
      const letter = getLetterGrade(total);

      ws.getCell(rowNum, 1).value = idx + 1;
      ws.getCell(rowNum, 2).value = rec.universityNumber;
      ws.getCell(rowNum, 3).value = rec.nameAr;
      ws.getCell(rowNum, 4).value = rec.clinicalScore ?? '—';
      ws.getCell(rowNum, 5).value = rec.osceScore ?? '—';
      ws.getCell(rowNum, 6).value = rec.writtenScore ?? '—';
      ws.getCell(rowNum, 7).value = total ?? '—';
      ws.getCell(rowNum, 8).value = letter;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Grades_${activeCourse.code}_${academicYear.replace('/', '_')}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Grade Records
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return gradeRecords;
    const q = searchQuery.toLowerCase().trim();
    return gradeRecords.filter(r => 
      r.universityNumber.toLowerCase().includes(q) ||
      r.nameAr.toLowerCase().includes(q) ||
      (r.nameEn && r.nameEn.toLowerCase().includes(q))
    );
  }, [gradeRecords, searchQuery]);

  // Submissions List for Approval Hub
  const submissionsList = useMemo(() => {
    return Object.values(submittedSheetsStore);
  }, [submittedSheetsStore]);

  // Restrict Supervisors
  if (isSupervisorOnly) {
    return (
      <div className="mx-auto max-w-[650px] py-16 text-center space-y-5">
        <div className="w-16 h-16 bg-teal-50 text-teal-700 rounded-3xl border border-teal-200 flex items-center justify-center mx-auto shadow-2xs">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">
          {locale === 'ar' ? 'رصد الكشوفات الكلية مخصص لمساعدي التدريس ومديري الدوائر' : 'Full Grading Access Restricted'}
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          {locale === 'ar' 
            ? 'مرحباً دكتور، بصفتك مشرفاً سريرياً، يتم رصد التقييم السريري (من 20) لطلابك من خلال البوابة المخصصة لك، وتنتقل الدرجة آلياً لمساعد البحث والتدريس.'
            : 'Clinical evaluations are managed directly in your Supervisor Portal.'}
        </p>
        <div className="pt-2">
          <a
            href="/supervisor/portal?tab=assessments"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black transition-all shadow-sm shadow-teal-600/25"
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>{locale === 'ar' ? 'الذهاب إلى رصد التقييم السريري (20)' : 'Go to Clinical Evaluation (/20)'}</span>
          </a>
        </div>
      </div>
    );
  }

  // Active course sheet status
  const currentSheetSubmission = submittedSheetsStore[storageKey];

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header & Navigation */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">
            {locale === 'ar' ? 'رصد واعتماد علامات التدريب السريري' : 'Clinical Grade Register & Approval Hub'}
          </h2>
          <p className="text-xs font-medium text-slate-500 mt-1">
            {isApprover 
              ? (locale === 'ar' ? 'بوابة مدير الدائرة والعميد لمراجعة واعتماد كشوفات الدرجات المرفوعة من مساعدي البحث والتدريس' : 'Approval Hub for Department Head & Dean')
              : (locale === 'ar' ? 'بوابة مساعد البحث والتدريس لإدخال درجات الأوسكي والنهائي وتقديم الكشف للاعتماد' : 'RTA Portal for Grade Entry & Submission')
            }
          </p>
        </div>

        {/* Tab Switcher for Approver (Hub vs Inspection Sheet) */}
        {isApprover && (
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveMainTab('approval_hub')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMainTab === 'approval_hub' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>{locale === 'ar' ? 'مركز طلبات الاعتماد' : 'Approval Hub'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMainTab('sheet')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeMainTab === 'sheet' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>{locale === 'ar' ? 'معاينة كشف مساق' : 'Inspect Course Sheet'}</span>
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════ VIEW 1: APPROVER HUB (FOR DEPT HEAD / DEAN) ════════════════════ */}
      {isApprover && activeMainTab === 'approval_hub' && (
        <div className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'كشوفات بانتظار الاعتماد' : 'Pending Approval'}</span>
              <span className="text-2xl font-black text-amber-600 block mt-1">
                {submissionsList.filter(s => s.status === 'submitted').length}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'كشوفات معتمدة رسمياً' : 'Approved Sheets'}</span>
              <span className="text-2xl font-black text-emerald-600 block mt-1">
                {submissionsList.filter(s => s.status === 'approved').length}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'كشوفات مرجعة للمراجعة' : 'Returned Sheets'}</span>
              <span className="text-2xl font-black text-red-600 block mt-1">
                {submissionsList.filter(s => s.status === 'returned').length}
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'إجمالي الكشوفات المرفوعة' : 'Total Submissions'}</span>
              <span className="text-2xl font-black text-slate-900 block mt-1">
                {submissionsList.length}
              </span>
            </div>
          </div>

          {/* Submissions List Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs">{locale === 'ar' ? 'طلبات اعتماد كشوفات العلامات المقدمة من مساعدي التدريس' : 'Submitted Grade Sheets for Approval'}</h3>
            </div>

            {submissionsList.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-600 font-bold uppercase text-[11px]">
                      <th className="p-3.5 text-right">{locale === 'ar' ? 'المساق والدورة' : 'Course'}</th>
                      <th className="p-3.5 text-center">{locale === 'ar' ? 'الدفعة / السنة' : 'Level'}</th>
                      <th className="p-3.5 text-center">{locale === 'ar' ? 'مساعد البحث والتدريس' : 'RTA (Submitted By)'}</th>
                      <th className="p-3.5 text-center">{locale === 'ar' ? 'تاريخ التقديم' : 'Submission Date'}</th>
                      <th className="p-3.5 text-center">{locale === 'ar' ? 'الطلاب' : 'Students'}</th>
                      <th className="p-3.5 text-center">{locale === 'ar' ? 'حالة الاعتماد' : 'Status'}</th>
                      <th className="p-3.5 text-center">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {submissionsList.map(sub => (
                      <tr key={sub.key} className="hover:bg-slate-50">
                        <td className="p-3.5">
                          <span className="font-bold text-slate-900 block">{sub.courseName}</span>
                          <span className="text-[10px] text-slate-400">{sub.courseCode}</span>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-700">
                          {sub.level === 'fourth' ? 'سنة رابعة' : sub.level === 'fifth' ? 'سنة خامسة' : 'سنة سادسة'}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-800">
                          👨‍🏫 {sub.submittedBy}
                        </td>
                        <td className="p-3.5 text-center text-slate-500 font-mono text-[11px]">
                          {new Date(sub.submittedAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US')}
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-900">
                          {sub.recordsCount}
                        </td>
                        <td className="p-3.5 text-center">
                          {sub.status === 'submitted' && (
                            <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 font-bold text-[11px] border border-amber-200">
                              ⏳ قيد الاعتماد
                            </span>
                          )}
                          {sub.status === 'approved' && (
                            <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                              🟢 معتمد رسمياً
                            </span>
                          )}
                          {sub.status === 'returned' && (
                            <span className="px-2.5 py-1 rounded-xl bg-red-100 text-red-800 font-bold text-[11px] border border-red-200">
                              🔴 مرجع للمراجعة
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLevel(sub.level as any);
                                setSelectedCourseId(sub.courseCode);
                                setActiveMainTab('sheet');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{locale === 'ar' ? 'معاينة' : 'Inspect'}</span>
                            </button>

                            {sub.status === 'submitted' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedLevel(sub.level as any);
                                    setSelectedCourseId(sub.courseCode);
                                    handleApproveCourseSheet();
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 cursor-pointer"
                                >
                                  {locale === 'ar' ? 'اعتماد' : 'Approve'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedLevel(sub.level as any);
                                    setSelectedCourseId(sub.courseCode);
                                    setIsBatchReturnModalOpen(true);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-red-50 text-red-700 font-bold text-xs hover:bg-red-100 border border-red-200 cursor-pointer"
                                >
                                  {locale === 'ar' ? 'إرجاع' : 'Return'}
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
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <FileCheck className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-slate-700 text-sm">{locale === 'ar' ? 'لا توجد طلبات اعتماد مرفوعة حالياً' : 'No Submissions Pending'}</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {locale === 'ar' ? 'عندما يقوم مساعد البحث والتدريس بتقديم كشف علامات مساق سيتغير حالته ويظهر في هذه القائمة مباشرة للاعتماد.' : 'When RTAs submit course grade sheets, they will appear here.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════ VIEW 2: COURSE GRADE SHEET INSPECTION & ENTRY ════════════════════ */}
      {(activeMainTab === 'sheet' || !isApprover) && (
        <div className="space-y-5">
          {/* Cohort Tabs */}
          <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto">
              {visibleCohortTabs.map(tab => {
                const isSel = selectedLevel === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSelectedLevel(tab.key)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      isSel ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Course Selector Dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 whitespace-nowrap">{locale === 'ar' ? 'اختر المساق:' : 'Course:'}</label>
              <select
                value={selectedCourseId}
                onChange={e => setSelectedCourseId(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-600"
              >
                {availableCourses.map(c => (
                  <option key={c.id} value={c.id}>{c.name_ar} ({c.code})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Banner for Status & Approver Instructions */}
          {isApprover ? (
            <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-base">
                  👁️
                </div>
                <div>
                  <h3 className="font-bold text-sm">{locale === 'ar' ? `معاينة كشف: ${activeCourse.name_ar}` : `Inspecting: ${activeCourse.name_ar}`}</h3>
                  <span className="text-xs text-slate-300">
                    {currentSheetSubmission 
                      ? locale === 'ar' ? `مقدم من مساعد البحث: ${currentSheetSubmission.submittedBy}` : `Submitted by RTA: ${currentSheetSubmission.submittedBy}`
                      : locale === 'ar' ? 'الشاشة للعرض والاعتماد فقط (القراءة حصراً)' : 'Read-Only Mode for Approvers'
                    }
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApproveCourseSheet}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs cursor-pointer flex items-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{locale === 'ar' ? 'اعتماد الكشف رسمياً' : 'Approve Sheet'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsBatchReturnModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-red-500/20 text-red-200 border border-red-400/40 hover:bg-red-500/30 font-bold text-xs cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{locale === 'ar' ? 'إرجاع لمساعد البحث' : 'Return Sheet'}</span>
                </button>
              </div>
            </div>
          ) : (
            /* RTA Action Bar */
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-slate-400 block">{activeCourse.code} — {locale === 'ar' ? 'إدخال وتقديم العلامات' : 'Grade Entry & Submission'}</span>
                <h3 className="text-base font-bold text-slate-900">{activeCourse.name_ar}</h3>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>{locale === 'ar' ? 'تصدير Excel' : 'Export Excel'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRtaSubmitCourseSheet}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{locale === 'ar' ? 'تقديم الكشف للاعتماد' : 'Submit for Approval'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 📊 OFFICIAL FACULTY GRADES DISTRIBUTION MATRIX (MATCHING HEBRON UNIVERSITY GUIDELINES) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-black text-slate-900 text-xs flex items-center gap-2">
                <span>📊 {locale === 'ar' ? 'سلم وتوزيع التقديرات المعتمد — Grades Distribution Matrix' : 'Official Faculty Grades Matrix'}</span>
              </h4>
              <span className="text-[11px] font-bold text-slate-500">
                {locale === 'ar' ? `إجمالي الطلاب المقيمين: ${gradeDistributionStats.gradedCount}` : `Graded Students: ${gradeDistributionStats.gradedCount}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-black">
                    <td className="p-2 border-r border-slate-300 font-bold bg-slate-200 text-right min-w-[110px]">
                      {locale === 'ar' ? 'التقدير — Grade' : 'Grade'}
                    </td>
                    {GRADE_SCALE.map(g => (
                      <th key={g.code} className="p-2 border-r border-slate-300 min-w-[48px] font-black text-xs">
                        {g.code}
                      </th>
                    ))}
                    <th className="p-2 bg-slate-200 border-r border-slate-300 min-w-[60px] font-black text-xs">
                      Total
                    </th>
                  </tr>

                  <tr className="bg-slate-50 border-b border-slate-300 text-slate-600 font-bold text-[11px]">
                    <td className="p-1.5 border-r border-slate-300 bg-slate-100 text-right font-medium">
                      {locale === 'ar' ? 'مدى العلامة' : 'Range'}
                    </td>
                    {GRADE_SCALE.map(g => (
                      <td key={g.code} className="p-1.5 border-r border-slate-300 font-mono text-[10px]">
                        {g.range}
                      </td>
                    ))}
                    <td className="p-1.5 border-r border-slate-300 bg-slate-100 font-bold">100</td>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-300 font-medium">
                  {/* Row 1: No. of students */}
                  <tr className="hover:bg-slate-50">
                    <td className="p-2 border-r border-slate-300 font-bold bg-slate-50 text-right text-slate-800">
                      No. of students
                    </td>
                    {GRADE_SCALE.map(g => (
                      <td key={g.code} className="p-2 border-r border-slate-300 font-black text-slate-900 text-xs">
                        {gradeDistributionStats.counts[g.code] || 0}
                      </td>
                    ))}
                    <td className="p-2 border-r border-slate-300 bg-slate-100 font-black text-slate-900 text-xs">
                      {gradeDistributionStats.gradedCount}
                    </td>
                  </tr>

                  {/* Row 2: Percentage */}
                  <tr className="hover:bg-slate-50 border-t border-slate-300">
                    <td className="p-2 border-r border-slate-300 font-bold bg-slate-50 text-right text-slate-800">
                      Percentage
                    </td>
                    {GRADE_SCALE.map(g => (
                      <td key={g.code} className="p-2 border-r border-slate-300 text-slate-600 text-[11px] font-bold">
                        {gradeDistributionStats.percentages[g.code]}
                      </td>
                    ))}
                    <td className="p-2 border-r border-slate-300 bg-slate-100 font-black text-slate-900 text-xs">
                      100%
                    </td>
                  </tr>

                  {/* Row 3: Passed vs Failed Summary */}
                  <tr className="bg-slate-100 border-t-2 border-slate-400 font-bold">
                    <td className="p-2 border-r border-slate-300 font-black bg-slate-200 text-right text-slate-900">
                      Passed / Failed
                    </td>
                    <td colSpan={9} className="p-2 border-r border-slate-300 text-right font-bold text-emerald-800 bg-emerald-50/70">
                      ✅ Passed: <span className="font-black">{gradeDistributionStats.passedCount}</span> ({gradeDistributionStats.passedPercentage})
                    </td>
                    <td colSpan={2} className="p-2 border-r border-slate-300 text-center font-bold text-red-800 bg-red-50/70">
                      ❌ Failed: <span className="font-black">{gradeDistributionStats.failedCount}</span> ({gradeDistributionStats.failedPercentage})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Search bar inside sheet */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder={locale === 'ar' ? 'بحث بالاسم أو الرقم الجامعي...' : 'Search student...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-slate-600 bg-white"
              />
            </div>

            <div className="text-xs text-slate-500 font-bold">
              {locale === 'ar' ? `توزيع الدرجات: سريري (${maxScores.clinical}) + أوسكي (${maxScores.osce}) + نهائي (${maxScores.written}) = 100` : `Weights: Clinical (20) + OSCE (40) + Final (40) = 100`}
            </div>
          </div>

          {/* Main Grade Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                    <th className="p-3 text-right">#</th>
                    <th className="p-3 text-right">{locale === 'ar' ? 'اسم الطالب والرقم' : 'Student'}</th>
                    <th className="p-3 text-center bg-slate-100/80 text-slate-900">{locale === 'ar' ? 'التدريب السريري (20)' : 'Clinical (/20)'}</th>
                    <th className="p-3 text-center">{locale === 'ar' ? 'امتحان الأوسكي (40)' : 'OSCE Exam (/40)'}</th>
                    <th className="p-3 text-center">{locale === 'ar' ? 'الامتحان النهائي (40)' : 'Written Final (/40)'}</th>
                    <th className="p-3 text-center bg-slate-100/50">{locale === 'ar' ? 'المجموع (100)' : 'Total (/100)'}</th>
                    <th className="p-3 text-center">{locale === 'ar' ? 'التقدير' : 'Grade'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredRecords.map((rec, idx) => {
                    const total = calculateTotal(rec);
                    const letter = getLetterGrade(total);

                    return (
                      <tr key={rec.universityNumber} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block">{rec.nameAr}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{rec.universityNumber}</span>
                        </td>

                        {/* Clinical Score out of 20 (From Supervisor) */}
                        <td className="p-3 text-center bg-slate-50/50">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-900 border border-slate-200 text-xs inline-block">
                            {rec.clinicalScore !== null ? rec.clinicalScore : '—'}
                          </span>
                        </td>

                        {/* OSCE Score out of 40 */}
                        <td className="p-3 text-center">
                          {isApprover ? (
                            <span className="font-bold text-slate-800">{rec.osceScore !== null ? rec.osceScore : '—'}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={maxScores.osce}
                              step="0.5"
                              value={rec.osceScore !== null ? rec.osceScore : ''}
                              onChange={e => handleScoreChange(rec.universityNumber, 'osceScore', e.target.value)}
                              placeholder="0-40"
                              className="w-16 text-center font-bold text-slate-900 bg-slate-50 rounded-lg border border-slate-200 p-1 text-xs focus:bg-white focus:border-slate-600"
                            />
                          )}
                        </td>

                        {/* Written Score out of 40 */}
                        <td className="p-3 text-center">
                          {isApprover ? (
                            <span className="font-bold text-slate-800">{rec.writtenScore !== null ? rec.writtenScore : '—'}</span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              max={maxScores.written}
                              step="0.5"
                              value={rec.writtenScore !== null ? rec.writtenScore : ''}
                              onChange={e => handleScoreChange(rec.universityNumber, 'writtenScore', e.target.value)}
                              placeholder="0-40"
                              className="w-16 text-center font-bold text-slate-900 bg-slate-50 rounded-lg border border-slate-200 p-1 text-xs focus:bg-white focus:border-slate-600"
                            />
                          )}
                        </td>

                        {/* Total Score out of 100 */}
                        <td className="p-3 text-center bg-slate-50/50">
                          <span className="font-black text-slate-900 text-xs">
                            {total !== null ? total : '—'}
                          </span>
                        </td>

                        {/* Letter Grade */}
                        <td className="p-3 text-center font-bold">
                          <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                            letter === 'E' ? 'bg-red-100 text-red-700' : letter === '—' ? 'text-slate-400' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {letter}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Return Notes Modal */}
      {isBatchReturnModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-2xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">{locale === 'ar' ? 'إرجاع الكشف لمساعد البحث والتدريس' : 'Return Grade Sheet with Notes'}</h3>
            <p className="text-xs text-slate-500">{locale === 'ar' ? 'يرجى كتابة سبب إرجاع الكشف أو الملاحظات المطلوب تعديلها من قبل مساعد البحث:' : 'Provide feedback for the RTA:'}</p>

            <form onSubmit={handleConfirmReturnCourseSheet} className="space-y-4">
              <textarea
                rows={3}
                required
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                placeholder={locale === 'ar' ? 'ملاحظات الإرجاع...' : 'Reason...'}
                className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:ring-1 focus:ring-slate-600"
              />

              <div className="flex items-center justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsBatchReturnModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>

                <button 
                  type="submit" 
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
                >
                  {locale === 'ar' ? 'إرجاع الكشف' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
