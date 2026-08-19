import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import ExcelJS from 'exceljs';
import { 
  Check, Send, CheckCircle2, AlertCircle, FileCheck,
  Search, Upload, Sparkles,
  TrendingUp, Award, Users, AlertTriangle, ShieldCheck,
  Stethoscope, Lock, Unlock, FileSpreadsheet
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
  clinicalScore: number | null; // e.g. / 30
  osceScore: number | null;     // e.g. / 35
  writtenScore: number | null;  // e.g. / 35
  notes?: string;
  status: 'draft' | 'submitted' | 'approved' | 'returned';
  returnReason?: string;
  updatedAt?: string;
}

// Predefined Faculty Clinical Courses per Cohort
const defaultClinicalCourses: CourseItem[] = [
  // 4th Year (Junior Phase)
  { id: 'M1460', code: 'M1460', name_ar: 'مساق الأمراض الباطنية (مبتدئ)', name_en: 'Internal Medicine (Junior)', level: 'fourth', coordinator: 'د. عبدالله قاسم', coordinator_en: 'Dr. Abdallah Qasim', credits: 10 },
  { id: 'M1470', code: 'M1470', name_ar: 'مساق الجراحة العامة (مبتدئ)', name_en: 'General Surgery (Junior)', level: 'fourth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 10 },
  { id: 'M1480', code: 'M1480', name_ar: 'مساق طب الأطفال (مبتدئ)', name_en: 'Pediatrics (Junior)', level: 'fourth', coordinator: 'د. نادية ابو عيشة', coordinator_en: 'Dr. Nadia Abu Eisheh', credits: 8 },
  { id: 'M1490', code: 'M1490', name_ar: 'مساق العيون والأنف والأذن والحنجرة', name_en: 'Ophthalmology & ENT', level: 'fourth', coordinator: 'د. طارق الجعبة', coordinator_en: 'Dr. Tareq Jaaba', credits: 6 },
  
  // 5th Year (Specialties Phase)
  { id: 'M1582', code: 'M1582', name_ar: 'مساق النسائية والتوليد', name_en: 'Obstetrics & Gynecology', level: 'fifth', coordinator: 'د. اياد عفانة', coordinator_en: 'Dr. Iyad Afaneh', credits: 10 },
  { id: 'M1583', code: 'M1583', name_ar: 'مساق طب الأسرة والمجتمع', name_en: 'Family & Community Medicine', level: 'fifth', coordinator: 'د. رامي القواسمة', coordinator_en: 'Dr. Rami Qawasmeh', credits: 6 },
  { id: 'M1584', code: 'M1584', name_ar: 'مساق الطب النفسي وجراحة الأعصاب', name_en: 'Psychiatry & Neurosurgery', level: 'fifth', coordinator: 'د. نهاد مسودة', coordinator_en: 'Dr. Nihad Maswadeh', credits: 6 },
  { id: 'M1585', code: 'M1585', name_ar: 'مساق جراحة العظام والمسالك البولية', name_en: 'Orthopedics & Urology', level: 'fifth', coordinator: 'د. عمار شاهين', coordinator_en: 'Dr. Ammar Shaheen', credits: 6 },

  // 6th Year (Advanced Senior / Internship Phase)
  { id: 'M1688', code: 'M1688', name_ar: 'مساق الأمراض الباطنية (متقدم - سنة سادسة)', name_en: 'Internal Medicine (Advanced)', level: 'sixth', coordinator: 'د. هاني عابدين', coordinator_en: 'Dr. Hani Abdeen', credits: 12 },
  { id: 'M1673', code: 'M1673', name_ar: 'مساق الجراحة العامة والطوارئ (متقدم)', name_en: 'General Surgery & Emergency', level: 'sixth', coordinator: 'د. اياد الجدع', coordinator_en: 'Dr. Iyad Jadaa', credits: 12 },
  { id: 'M1661', code: 'M1661', name_ar: 'مساق أمراض الأطفال (متقدم)', name_en: 'Pediatrics (Advanced)', level: 'sixth', coordinator: 'د. نادية ابو عيشة', coordinator_en: 'Dr. Nadia Abu Eisheh', credits: 10 },
  { id: 'M1699', code: 'M1699', name_ar: 'مساق النسائية والتوليد (متقدم)', name_en: 'Obstetrics & Gynecology (Advanced)', level: 'sixth', coordinator: 'د. عبدالسلام حداد', coordinator_en: 'Dr. Abdulsalam Haddad', credits: 10 },
];

export function GradesPage() {
  const { locale } = useI18n();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Role-Based Access Control
  const isApprover = useMemo(() => {
    if (!user?.roles) return false;
    return user.roles.some(r => ['department_head', 'dean', 'admin'].includes(r.toLowerCase()));
  }, [user]);

  const canEditGrades = !isApprover;
  const canApproveGrades = isApprover;

  // 1. Academic Year (Sync with system-wide years or default 2026/2027)
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
  const [academicYear, setAcademicYear] = useState<string>(academicYears[0] || '2026/2027');

  // 2. Selected Level (fourth, fifth, sixth)
  const [selectedLevel, setSelectedLevel] = useState<'fourth' | 'fifth' | 'sixth'>('fourth');

  // 3. Courses available for this level
  const availableCourses = useMemo(() => {
    return defaultClinicalCourses.filter(c => c.level === selectedLevel);
  }, [selectedLevel]);

  // 4. Selected Course
  const [selectedCourseId, setSelectedCourseId] = useState<string>(availableCourses[0]?.id || 'M1460');

  // Update selected course when level changes
  useEffect(() => {
    if (availableCourses.length > 0 && !availableCourses.some(c => c.id === selectedCourseId)) {
      setSelectedCourseId(availableCourses[0].id);
    }
  }, [availableCourses, selectedCourseId]);

  const activeCourse = useMemo(() => {
    return defaultClinicalCourses.find(c => c.id === selectedCourseId) || availableCourses[0] || defaultClinicalCourses[0];
  }, [selectedCourseId, availableCourses]);

  // 5. Search / Filter query inside the grade table
  const [searchQuery, setSearchQuery] = useState('');

  // 6. Return Modal State
  const [returnModalStudent, setReturnModalStudent] = useState<StudentGradeRecord | null>(null);
  const [returnReason, setReturnReason] = useState('');

  // 7. Max Scores Weighting Configuration (Clinical 30 + OSCE 35 + Written 35 = 100)
  const [maxScores] = useState({
    clinical: 30,
    osce: 35,
    written: 35,
    total: 100
  });

  // 8. Fetch all students from directory
  const { data: studentsData, isLoading: isStudentsLoading } = useQuery({
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

  // 9. Load / Store Grade Records for this specific Course & Year
  const [gradeRecords, setGradeRecords] = useState<StudentGradeRecord[]>([]);

  // Synchronize grade records whenever levelStudents, academicYear, or selectedCourseId changes
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    let existingMap: Record<string, StudentGradeRecord> = {};

    if (saved) {
      try {
        const parsed: StudentGradeRecord[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach(r => {
            existingMap[r.universityNumber] = r;
          });
        }
      } catch (e) {}
    }

    // Build unified records from students of this cohort
    const unified: StudentGradeRecord[] = levelStudents.map(student => {
      const existing = existingMap[student.university_number];
      if (existing) {
        return {
          ...existing,
          nameAr: student.full_name_ar,
          nameEn: student.full_name_en,
          photoUrl: student.photo_url
        };
      }
      return {
        studentId: student.id,
        universityNumber: student.university_number,
        nameAr: student.full_name_ar,
        nameEn: student.full_name_en,
        photoUrl: student.photo_url,
        clinicalScore: null,
        osceScore: null,
        writtenScore: null,
        status: 'draft'
      };
    });

    setGradeRecords(unified);
  }, [storageKey, levelStudents]);

  // Helper to persist grade records
  const saveRecords = (updated: StudentGradeRecord[]) => {
    setGradeRecords(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  // Helper: Calculate Total Score & Letter Grade
  const calculateTotal = (record: StudentGradeRecord) => {
    const c = record.clinicalScore ?? 0;
    const o = record.osceScore ?? 0;
    const w = record.writtenScore ?? 0;
    const hasAny = record.clinicalScore !== null || record.osceScore !== null || record.writtenScore !== null;
    if (!hasAny) return null;
    return Math.round((c + o + w) * 10) / 10;
  };

  const getLetterGrade = (total: number | null) => {
    if (total === null) return '—';
    if (total >= 90) return 'A';
    if (total >= 85) return 'B+';
    if (total >= 80) return 'B';
    if (total >= 75) return 'C+';
    if (total >= 70) return 'C';
    if (total >= 65) return 'D+';
    if (total >= 60) return 'D';
    return 'F';
  };

  // 10. Inline Score Input Change Handler
  const handleScoreChange = (
    universityNumber: string,
    field: 'clinicalScore' | 'osceScore' | 'writtenScore',
    valStr: string
  ) => {
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
          status: r.status === 'approved' ? 'draft' : r.status, // edit resets approved to draft
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });

    saveRecords(updated);
  };

  // 11. Individual Status Changes
  const handleSingleSubmit = (uniNum: string) => {
    const updated = gradeRecords.map(r => r.universityNumber === uniNum ? { ...r, status: 'submitted' as const } : r);
    saveRecords(updated);
  };

  const handleSingleApprove = (uniNum: string) => {
    const updated = gradeRecords.map(r => r.universityNumber === uniNum ? { ...r, status: 'approved' as const } : r);
    saveRecords(updated);
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalStudent) return;
    const updated = gradeRecords.map(r => {
      if (r.universityNumber === returnModalStudent.universityNumber) {
        return {
          ...r,
          status: 'returned' as const,
          returnReason: returnReason.trim() || undefined
        };
      }
      return r;
    });
    saveRecords(updated);
    setReturnModalStudent(null);
    setReturnReason('');
  };

  // 12. Batch Actions (Submit All, Approve All, Unlock All)
  const handleBatchSubmitAll = () => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من تقديم كافة علامات المساق للاعتماد الرسمي؟' : 'Submit all grades for approval?')) {
      const updated = gradeRecords.map(r => ({ ...r, status: 'submitted' as const }));
      saveRecords(updated);
    }
  };

  const handleBatchApproveAll = () => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من الاعتماد النهائي لكافة علامات هذا المساق؟' : 'Approve all grades officially?')) {
      const updated = gradeRecords.map(r => ({ ...r, status: 'approved' as const }));
      saveRecords(updated);
    }
  };

  const handleBatchUnlockAll = () => {
    if (window.confirm(locale === 'ar' ? 'إعادة فتح المساق للتعديل وتحويل العلامات إلى مسودات؟' : 'Unlock grades for editing?')) {
      const updated = gradeRecords.map(r => ({ ...r, status: 'draft' as const }));
      saveRecords(updated);
    }
  };

  // 13. Populate Realistic Sample Grades (Useful for demo & testing if grades empty)
  const handleFillSampleGrades = () => {
    if (window.confirm(locale === 'ar' ? 'سيتم توليد درجات تجريبية واقعية لكافة طلبة المساق لتسهيل الفحص والتجربة، هل تريد المتابعة؟' : 'Fill realistic sample grades for this cohort?')) {
      const updated = gradeRecords.map((r, idx) => {
        // Generate realistic scores: mostly passing with high performance
        const base = 75 + (idx % 18) - ((idx % 5 === 0) ? 20 : 0);
        const clin = Math.min(30, Math.max(15, Math.round((base * 0.3) * 10) / 10));
        const osc = Math.min(35, Math.max(18, Math.round((base * 0.35) * 10) / 10));
        const wrt = Math.min(35, Math.max(18, Math.round((base * 0.35) * 10) / 10));

        return {
          ...r,
          clinicalScore: clin,
          osceScore: osc,
          writtenScore: wrt,
          status: ((idx % 4 === 0) ? 'approved' : (idx % 2 === 0) ? 'submitted' : 'draft') as 'draft' | 'submitted' | 'approved' | 'returned',
          updatedAt: new Date().toISOString()
        };
      });
      saveRecords(updated);
    }
  };

  // 14. Export Matrix to Official Formatted Excel (.xlsx)
  const handleExportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hebron University - Faculty of Medicine';
    wb.created = new Date();

    const isAr = locale === 'ar';
    const ws = wb.addWorksheet(isAr ? 'كشف العلامات المعتمد' : 'Official Grade Sheet', {
      views: [{ showGridLines: true, rightToLeft: isAr }]
    });

    const totalCols = 8;
    const dateStr = new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US');

    // Row 1: University Banner
    ws.mergeCells(1, 1, 1, totalCols);
    const r1 = ws.getCell(1, 1);
    r1.value = isAr ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine';
    r1.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Row 2: Course & Coordinator Subtitle
    ws.mergeCells(2, 1, 2, totalCols);
    const r2 = ws.getCell(2, 1);
    r2.value = isAr 
      ? `كشف درجات: ${activeCourse.name_ar} (${activeCourse.code}) — منسق المساق: ${activeCourse.coordinator} — العام: ${academicYear}`
      : `Grade Sheet: ${activeCourse.name_en} (${activeCourse.code}) — Coordinator: ${activeCourse.coordinator_en} — Year: ${academicYear}`;
    r2.font = { name: 'Segoe UI', size: 11.5, bold: true, color: { argb: 'FFCCFBF1' } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    // Row 3: Meta
    ws.mergeCells(3, 1, 3, totalCols);
    const r3 = ws.getCell(3, 1);
    r3.value = isAr ? `تاريخ التصدير: ${dateStr} • إجمالي الطلبة: ${gradeRecords.length}` : `Export Date: ${dateStr} • Total Students: ${gradeRecords.length}`;
    r3.font = { name: 'Segoe UI', size: 10, bold: false, color: { argb: 'FF475569' } };
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    r3.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

    // Row 4: Blank
    ws.getRow(4).height = 10;

    // Row 5: Table Header
    ws.getRow(5).height = 30;
    const headers = [
      isAr ? 'الرقم' : '#',
      isAr ? 'الرقم الجامعي' : 'University ID',
      isAr ? 'اسم الطالب' : 'Student Name',
      isAr ? 'التدريب والمستشفيات (30)' : 'Clinical In-Training (30)',
      isAr ? 'امتحان الأوسكي (35)' : 'OSCE Exam (35)',
      isAr ? 'الامتحان النهائي (35)' : 'Written Final (35)',
      isAr ? 'المجموع (100)' : 'Total (100)',
      isAr ? 'التقدير والحالة' : 'Grade & Status'
    ];
    const widths = [8, 18, 32, 22, 20, 20, 16, 18];

    headers.forEach((h, idx) => {
      const colNum = idx + 1;
      const cell = ws.getCell(5, colNum);
      cell.value = h;
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F766E' } },
        bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FF0F766E' } },
        right: { style: 'thin', color: { argb: 'FF0F766E' } },
      };
      ws.getColumn(colNum).width = widths[idx];
    });

    const borderStyle = {
      top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    };

    gradeRecords.forEach((rec, idx) => {
      const rowNum = 6 + idx;
      const isEven = idx % 2 === 0;
      ws.getRow(rowNum).height = 24;

      const total = calculateTotal(rec);
      const letter = getLetterGrade(total);

      // 1. Index
      const c1 = ws.getCell(rowNum, 1);
      c1.value = idx + 1;
      c1.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF64748B' } };
      c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      c1.alignment = { horizontal: 'center', vertical: 'middle' };
      c1.border = borderStyle;

      // 2. University ID
      const c2 = ws.getCell(rowNum, 2);
      c2.value = rec.universityNumber;
      c2.font = { name: 'Consolas', size: 10.5, bold: true, color: { argb: 'FF0F766E' } };
      c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c2.alignment = { horizontal: 'center', vertical: 'middle' };
      c2.border = borderStyle;

      // 3. Name
      const c3 = ws.getCell(rowNum, 3);
      c3.value = isAr ? rec.nameAr : (rec.nameEn || rec.nameAr);
      c3.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c3.alignment = { horizontal: isAr ? 'right' : 'left', vertical: 'middle', indent: 1 };
      c3.border = borderStyle;

      // 4. Clinical Score (30)
      const c4 = ws.getCell(rowNum, 4);
      c4.value = rec.clinicalScore ?? '';
      c4.font = { name: 'Consolas', size: 10.5, bold: true, color: { argb: 'FF1E293B' } };
      c4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c4.alignment = { horizontal: 'center', vertical: 'middle' };
      c4.border = borderStyle;

      // 5. OSCE Score (35)
      const c5 = ws.getCell(rowNum, 5);
      c5.value = rec.osceScore ?? '';
      c5.font = { name: 'Consolas', size: 10.5, bold: true, color: { argb: 'FF1E293B' } };
      c5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c5.alignment = { horizontal: 'center', vertical: 'middle' };
      c5.border = borderStyle;

      // 6. Written Score (35)
      const c6 = ws.getCell(rowNum, 6);
      c6.value = rec.writtenScore ?? '';
      c6.font = { name: 'Consolas', size: 10.5, bold: true, color: { argb: 'FF1E293B' } };
      c6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c6.alignment = { horizontal: 'center', vertical: 'middle' };
      c6.border = borderStyle;

      // 7. Total Score (100)
      const c7 = ws.getCell(rowNum, 7);
      c7.value = total ?? '';
      c7.font = { name: 'Consolas', size: 11, bold: true, color: { argb: total !== null && total >= 60 ? 'FF047857' : 'FFB91C1C' } };
      c7.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: total !== null && total >= 60 ? 'FFECFDF5' : isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c7.alignment = { horizontal: 'center', vertical: 'middle' };
      c7.border = borderStyle;

      // 8. Grade & Status
      const c8 = ws.getCell(rowNum, 8);
      c8.value = total !== null ? `${letter} (${rec.status})` : rec.status;
      c8.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF334155' } };
      c8.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      c8.alignment = { horizontal: 'center', vertical: 'middle' };
      c8.border = borderStyle;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كشف_علامات_${activeCourse.code}_${academicYear.replace('/', '-')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 17. Import Grades from Excel (.xlsx)
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];

      if (!ws) {
        alert(locale === 'ar' ? 'الملف لا يحتوي على ورقة عمل صالحة' : 'Invalid worksheet');
        return;
      }

      let matchedCount = 0;
      const updated = [...gradeRecords];

      // Read rows starting from row 6
      ws.eachRow((row, rowNumber) => {
        if (rowNumber >= 5) {
          const uniNum = String(row.getCell(2).value || '').trim();
          const clinRaw = row.getCell(4).value;
          const oscRaw = row.getCell(5).value;
          const wrtRaw = row.getCell(6).value;

          if (uniNum) {
            const matchIdx = updated.findIndex(r => r.universityNumber === uniNum);
            if (matchIdx !== -1) {
              const parseNum = (val: any, max: number) => {
                if (val === null || val === undefined || val === '') return null;
                const num = parseFloat(String(val));
                if (isNaN(num)) return null;
                return Math.min(max, Math.max(0, num));
              };

              const clin = parseNum(clinRaw, maxScores.clinical);
              const osc = parseNum(oscRaw, maxScores.osce);
              const wrt = parseNum(wrtRaw, maxScores.written);

              if (clin !== null || osc !== null || wrt !== null) {
                updated[matchIdx] = {
                  ...updated[matchIdx],
                  clinicalScore: clin !== null ? clin : updated[matchIdx].clinicalScore,
                  osceScore: osc !== null ? osc : updated[matchIdx].osceScore,
                  writtenScore: wrt !== null ? wrt : updated[matchIdx].writtenScore,
                  updatedAt: new Date().toISOString()
                };
                matchedCount++;
              }
            }
          }
        }
      });

      saveRecords(updated);
      alert(locale === 'ar' 
        ? `تم استيراد وتحديث درجات (${matchedCount}) طالباً بنجاح من ملف الإكسل!` 
        : `Successfully imported and updated grades for (${matchedCount}) students!`);
    } catch (err) {
      console.error(err);
      alert(locale === 'ar' ? 'حدث خطأ أثناء قراءة ملف الإكسل، تأكد من مطابقة الأعمدة.' : 'Error reading Excel file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 18. Filtered Grade Records for display
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return gradeRecords;
    const q = searchQuery.toLowerCase().trim();
    return gradeRecords.filter(r => 
      r.universityNumber.toLowerCase().includes(q) ||
      r.nameAr.toLowerCase().includes(q) ||
      (r.nameEn && r.nameEn.toLowerCase().includes(q))
    );
  }, [gradeRecords, searchQuery]);

  // 19. Dynamic Statistics & Metrics
  const stats = useMemo(() => {
    const totalStudents = gradeRecords.length;
    const gradedStudents = gradeRecords.filter(r => calculateTotal(r) !== null);
    
    let sumTotal = 0;
    let passCount = 0;
    let maxScore = 0;
    let minScore = 100;

    gradedStudents.forEach(r => {
      const tot = calculateTotal(r) || 0;
      sumTotal += tot;
      if (tot >= 60) passCount++;
      if (tot > maxScore) maxScore = tot;
      if (tot < minScore) minScore = tot;
    });

    const average = gradedStudents.length ? Math.round((sumTotal / gradedStudents.length) * 10) / 10 : 0;
    const passRate = gradedStudents.length ? Math.round((passCount / gradedStudents.length) * 100) : 0;

    const draftCount = gradeRecords.filter(r => r.status === 'draft').length;
    const submittedCount = gradeRecords.filter(r => r.status === 'submitted').length;
    const approvedCount = gradeRecords.filter(r => r.status === 'approved').length;
    const returnedCount = gradeRecords.filter(r => r.status === 'returned').length;

    return {
      totalStudents,
      gradedCount: gradedStudents.length,
      average,
      passRate,
      maxScore: gradedStudents.length ? maxScore : 0,
      minScore: gradedStudents.length ? minScore : 0,
      draftCount,
      submittedCount,
      approvedCount,
      returnedCount
    };
  }, [gradeRecords]);

  return (
    <div className="space-y-6 pb-20">
      
      {/* 1. Header & Academic Year Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
              {locale === 'ar' ? 'سجل ورصد العلامات ومسار الاعتماد' : 'Clinical Grades & Official Approvals'}
            </h1>
            <span className="bg-teal-50 text-teal-800 text-xs font-black px-2.5 py-1 rounded-xl border border-teal-200 shadow-2xs">
              {academicYear}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {locale === 'ar' 
              ? 'إدارة وتقييم التدريب الميداني، امتحانات الأوسكي، الاختبارات النهائية، ومسار الاعتماد الرسمي لكليات الطب.' 
              : 'Clinical rotations grading matrix, OSCE evaluations, written finals, and official accreditation workflow.'}
          </p>
        </div>

        {/* Academic Year Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl px-3 py-1.5 shadow-2xs">
            <span className="text-xs font-bold text-slate-400">{locale === 'ar' ? 'العام الأكاديمي:' : 'Year:'}</span>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="bg-transparent text-xs font-black text-teal-900 outline-none cursor-pointer"
            >
              {academicYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 2. Cohort Level Tabs (4th, 5th, 6th) */}
      <div className="flex border-b border-slate-200/80 gap-2 overflow-x-auto no-scrollbar">
        {[
          { key: 'fourth', label: locale === 'ar' ? 'السنة الرابعة (المرحلة السريرية الأولى)' : '4th Year (Clinical Phase I)' },
          { key: 'fifth', label: locale === 'ar' ? 'السنة الخامسة (المرحلة السريرية الثانية)' : '5th Year (Clinical Phase II)' },
          { key: 'sixth', label: locale === 'ar' ? 'السنة السادسة (سنة التدريب النهائي)' : '6th Year (Senior Phase)' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedLevel(tab.key as any)}
            className={`pb-3 px-4 text-xs sm:text-sm font-black transition-all border-b-2 whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              selectedLevel === tab.key
                ? 'border-teal-600 text-teal-700 bg-teal-50/40 rounded-t-2xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>{tab.label}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              selectedLevel === tab.key ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {allStudentsList.filter(s => {
                const lvl = (s.academic_level || '').toLowerCase();
                if (tab.key === 'fourth') return lvl.includes('4') || lvl.includes('fourth') || lvl.includes('رابع');
                if (tab.key === 'fifth') return lvl.includes('5') || lvl.includes('fifth') || lvl.includes('خامس');
                if (tab.key === 'sixth') return lvl.includes('6') || lvl.includes('sixth') || lvl.includes('سادس');
                return false;
              }).length} {locale === 'ar' ? 'طالب' : 'students'}
            </span>
          </button>
        ))}
      </div>

      {/* 3. Course Selection Bar & Fast Switcher */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="block text-xs font-bold text-slate-500">
            {locale === 'ar' ? 'اختر المساق السريري لرصد واعتماد العلامات:' : 'Select Clinical Course:'}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {availableCourses.map(c => {
              const isSelected = c.id === selectedCourseId;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-tr from-teal-600 to-teal-500 text-white shadow-md shadow-teal-500/25 border-2 border-teal-400'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? c.name_ar : c.name_en}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {c.code}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Course Info Badge */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-start shrink-0 min-w-[220px]">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>{locale === 'ar' ? 'منسق المساق:' : 'Coordinator:'}</span>
            <span className="text-teal-900 font-black">{locale === 'ar' ? activeCourse.coordinator : (activeCourse.coordinator_en || activeCourse.coordinator)}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>{activeCourse.credits} {locale === 'ar' ? 'ساعات معتمدة' : 'Credits'}</span>
            <span className="font-bold text-blue-700">30% سريري • 35% أوسكي • 35% نهائي</span>
          </div>
        </div>
      </div>

      {/* 4. Statistics KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Total Students */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {locale === 'ar' ? 'إجمالي طلبة المساق' : 'Total Students'}
            </span>
            <span className="text-2xl font-black text-slate-900 block">
              {stats.totalStudents}
            </span>
            <span className="text-[10.5px] text-teal-700 font-bold block">
              {stats.gradedCount} {locale === 'ar' ? 'تم رصدهم' : 'graded'}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shadow-xs">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Cohort Average */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {locale === 'ar' ? 'متوسط علامات المساق' : 'Class Average'}
            </span>
            <span className="text-2xl font-black text-slate-900 block">
              {stats.average} <span className="text-xs text-slate-400 font-normal">/ 100</span>
            </span>
            <span className="text-[10.5px] text-slate-500 font-bold block">
              {locale === 'ar' ? 'أعلى:' : 'Max:'} {stats.maxScore} • {locale === 'ar' ? 'أدنى:' : 'Min:'} {stats.minScore}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-xs">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {locale === 'ar' ? 'نسبة النجاح' : 'Pass Rate'}
            </span>
            <span className="text-2xl font-black text-emerald-700 block">
              {stats.passRate}%
            </span>
            <span className="text-[10.5px] text-emerald-600 font-bold block">
              {stats.passRate >= 60 ? (locale === 'ar' ? 'ضمن المعدل الطبيعي' : 'Normal Curve') : (locale === 'ar' ? 'تتطلب مراجعة' : 'Needs Review')}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-xs">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* Approval Workflow State */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              {locale === 'ar' ? 'حالة مسار الاعتماد' : 'Approval Status'}
            </span>
            <div className="flex items-center gap-1.5 mt-1">
              {stats.approvedCount === stats.totalStudents && stats.totalStudents > 0 ? (
                <span className="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-black border border-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'معتمد نهائياً' : 'Fully Approved'}</span>
                </span>
              ) : stats.submittedCount > 0 ? (
                <span className="px-2.5 py-1 rounded-xl bg-blue-50 text-blue-800 text-xs font-black border border-blue-300 flex items-center gap-1">
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'بانتظار الاعتماد' : 'Pending Approval'}</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-black border border-slate-200 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>{locale === 'ar' ? 'مسودة قيد الرصد' : 'Draft In-Progress'}</span>
                </span>
              )}
            </div>
            <span className="text-[10.5px] text-slate-400 font-bold block">
              {stats.approvedCount} معتمد • {stats.submittedCount} مقدم • {stats.draftCount} مسودة
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shadow-xs">
            <FileCheck className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* 5. Toolbar: Search, Excel Import/Export & Batch Workflow Actions */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className={`w-4 h-4 absolute ${locale === 'ar' ? 'right-3.5' : 'left-3.5'} top-1/2 -translate-y-1/2 text-slate-400`} />
          <input
            type="text"
            placeholder={locale === 'ar' ? 'بحث بالاسم أو الرقم الجامعي...' : 'Search by name or ID...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full rounded-2xl border border-slate-200 ${locale === 'ar' ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 text-xs focus:border-teal-500 font-bold bg-slate-50/60`}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Editor Only Actions (Sample, Import, Submit) */}
          {canEditGrades && (
            <>
              {/* Sample Filler Button (Helps when database is empty) */}
              <button
                type="button"
                onClick={handleFillSampleGrades}
                className="px-3 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/80 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title={locale === 'ar' ? 'توليد علامات تجريبية واقعية للفحص' : 'Fill Sample Grades'}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{locale === 'ar' ? 'تعبئة تجريبية' : 'Sample Data'}</span>
              </button>

              {/* Hidden File Input for Excel Import */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportExcel}
                accept=".xlsx, .xls"
                className="hidden"
              />

              {/* Import Excel Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title={locale === 'ar' ? 'استيراد العلامات من ملف Excel' : 'Import Grades Excel'}
              >
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>{locale === 'ar' ? 'استيراد Excel' : 'Import'}</span>
              </button>
            </>
          )}

          {/* Export Excel Button (Available to all) */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-teal-600/25 cursor-pointer"
            title={locale === 'ar' ? 'تصدير كشف العلامات المعتمد Excel' : 'Export Official Excel'}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{locale === 'ar' ? 'تصدير كشف العلامات' : 'Export Excel'}</span>
          </button>

          {/* Editor Batch Actions */}
          {canEditGrades && stats.draftCount > 0 && (
            <button
              type="button"
              onClick={handleBatchSubmitAll}
              className="px-3.5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-blue-600/25 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'تقديم الكشف للاعتماد' : 'Submit All'}</span>
            </button>
          )}

          {/* Approver Batch Actions */}
          {canApproveGrades && stats.submittedCount > 0 && (
            <button
              type="button"
              onClick={handleBatchApproveAll}
              className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/25 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'الاعتماد النهائي للمساق' : 'Approve All'}</span>
            </button>
          )}

          {/* Approver Unlock / Reset */}
          {canApproveGrades && stats.approvedCount > 0 && (
            <button
              type="button"
              onClick={handleBatchUnlockAll}
              className="px-3 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title={locale === 'ar' ? 'إعادة فتح المساق للتعديل' : 'Unlock'}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>{locale === 'ar' ? 'إلغاء القفل للتعديل' : 'Unlock'}</span>
            </button>
          )}

        </div>

      </div>

      {/* 6. Medical Clinical Grade Sheet Matrix Table */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        
        {isStudentsLoading ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <div className="w-9 h-9 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold">{locale === 'ar' ? 'جاري جلب بيانات طلبة الدفعة...' : 'Loading cohort students...'}</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-3">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="font-bold text-sm text-slate-700">
              {locale === 'ar' ? 'لا يوجد طلبة مسجلين في هذه الدفعة' : 'No students found in this cohort'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {locale === 'ar' ? 'تأكد من إضافة طلبة لهذه السنة في دليل الطلاب أو تغيير الفلترة.' : 'Make sure students are registered in this level.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-black text-[11px] uppercase tracking-wider">
                  <th className="p-3 text-center w-12 border-r border-slate-200">{locale === 'ar' ? 'الرقم' : '#'}</th>
                  <th className="p-3 text-start min-w-[200px] border-r border-slate-200 sticky right-0 bg-slate-50 z-10 shadow-2xs">
                    {locale === 'ar' ? 'بيانات الطالب' : 'Student Info'}
                  </th>
                  <th className="p-3 text-center min-w-[120px] border-r border-slate-200 bg-teal-50/50 text-teal-950">
                    <div>
                      <span className="block font-black">{locale === 'ar' ? 'التدريب السريري' : 'In-Training'}</span>
                      <span className="text-[10px] text-teal-700 font-normal">Max (30)</span>
                    </div>
                  </th>
                  <th className="p-3 text-center min-w-[120px] border-r border-slate-200 bg-blue-50/50 text-blue-950">
                    <div>
                      <span className="block font-black">{locale === 'ar' ? 'امتحان الأوسكي' : 'OSCE Exam'}</span>
                      <span className="text-[10px] text-blue-700 font-normal">Max (35)</span>
                    </div>
                  </th>
                  <th className="p-3 text-center min-w-[120px] border-r border-slate-200 bg-indigo-50/50 text-indigo-950">
                    <div>
                      <span className="block font-black">{locale === 'ar' ? 'الامتحان النهائي' : 'Written Final'}</span>
                      <span className="text-[10px] text-indigo-700 font-normal">Max (35)</span>
                    </div>
                  </th>
                  <th className="p-3 text-center min-w-[110px] border-r border-slate-200 bg-slate-100/70 text-slate-900">
                    <div>
                      <span className="block font-black">{locale === 'ar' ? 'المجموع' : 'Total'}</span>
                      <span className="text-[10px] text-slate-500 font-normal">Max (100)</span>
                    </div>
                  </th>
                  <th className="p-3 text-center min-w-[90px] border-r border-slate-200">{locale === 'ar' ? 'التقدير' : 'Grade'}</th>
                  <th className="p-3 text-center min-w-[130px] border-r border-slate-200">{locale === 'ar' ? 'حالة الاعتماد' : 'Status'}</th>
                  <th className="p-3 text-center min-w-[120px]">{locale === 'ar' ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRecords.map((rec, idx) => {
                  const total = calculateTotal(rec);
                  const letter = getLetterGrade(total);
                  const isApproved = rec.status === 'approved';

                  return (
                    <tr key={rec.universityNumber} className="hover:bg-teal-50/30 transition-colors group">
                      
                      {/* 1. Index */}
                      <td className="p-2.5 text-center font-mono font-bold text-slate-400 border-r border-slate-100 bg-slate-50/40">
                        {idx + 1}
                      </td>

                      {/* 2. Student Info */}
                      <td className="p-2.5 border-r border-slate-200 sticky right-0 bg-white group-hover:bg-teal-50/30 z-10 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                          {rec.photoUrl ? (
                            <img src={rec.photoUrl} alt={rec.nameAr} className="w-8 h-8 rounded-xl object-cover border border-teal-300 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200">
                              {rec.nameAr.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-black text-slate-900 block truncate text-xs">
                              {locale === 'ar' ? rec.nameAr : (rec.nameEn || rec.nameAr)}
                            </span>
                            <span className="font-mono text-[10.5px] text-teal-700 font-bold block">
                              #{rec.universityNumber}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 3. Clinical In-Training Score (Max 30) */}
                      <td className="p-2 text-center border-r border-slate-100 bg-teal-50/20">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={maxScores.clinical}
                          disabled={isApproved || !canEditGrades}
                          value={rec.clinicalScore ?? ''}
                          onChange={(e) => handleScoreChange(rec.universityNumber, 'clinicalScore', e.target.value)}
                          placeholder="0-30"
                          className="w-18 text-center font-mono font-black text-xs py-1.5 px-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:bg-white bg-white/80 transition-all outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 4. OSCE Exam Score (Max 35) */}
                      <td className="p-2 text-center border-r border-slate-100 bg-blue-50/20">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={maxScores.osce}
                          disabled={isApproved || !canEditGrades}
                          value={rec.osceScore ?? ''}
                          onChange={(e) => handleScoreChange(rec.universityNumber, 'osceScore', e.target.value)}
                          placeholder="0-35"
                          className="w-18 text-center font-mono font-black text-xs py-1.5 px-2 rounded-xl border border-slate-200 focus:border-blue-500 focus:bg-white bg-white/80 transition-all outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 5. Written Final Score (Max 35) */}
                      <td className="p-2 text-center border-r border-slate-100 bg-indigo-50/20">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max={maxScores.written}
                          disabled={isApproved || !canEditGrades}
                          value={rec.writtenScore ?? ''}
                          onChange={(e) => handleScoreChange(rec.universityNumber, 'writtenScore', e.target.value)}
                          placeholder="0-35"
                          className="w-18 text-center font-mono font-black text-xs py-1.5 px-2 rounded-xl border border-slate-200 focus:border-indigo-500 focus:bg-white bg-white/80 transition-all outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </td>

                      {/* 6. Total Score (100) */}
                      <td className="p-2.5 text-center font-mono font-black text-sm border-r border-slate-100 bg-slate-50/30">
                        {total !== null ? (
                          <span className={`inline-block px-2.5 py-0.5 rounded-lg ${
                            total >= 60
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-black'
                              : 'bg-red-50 text-red-700 border border-red-200/80 font-black'
                          }`}>
                            {total}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-bold">—</span>
                        )}
                      </td>

                      {/* 7. Letter Grade */}
                      <td className="p-2.5 text-center font-black border-r border-slate-100">
                        {total !== null ? (
                          <span className={`text-xs font-black ${total >= 60 ? 'text-teal-900' : 'text-red-600'}`}>
                            {letter}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* 8. Status Badge */}
                      <td className="p-2.5 text-center border-r border-slate-100">
                        {rec.status === 'approved' ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[10.5px] font-black border border-emerald-200 flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>{locale === 'ar' ? 'معتمد' : 'Approved'}</span>
                          </span>
                        ) : rec.status === 'submitted' ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[10.5px] font-black border border-blue-200 flex items-center justify-center gap-1">
                            <FileCheck className="w-3 h-3 text-blue-600" />
                            <span>{locale === 'ar' ? 'مقدم للاعتماد' : 'Submitted'}</span>
                          </span>
                        ) : rec.status === 'returned' ? (
                          <span 
                            className="px-2 py-0.5 rounded-md bg-red-50 text-red-800 text-[10.5px] font-black border border-red-200 flex items-center justify-center gap-1 cursor-help"
                            title={rec.returnReason || (locale === 'ar' ? 'مُعاد للتعديل' : 'Returned')}
                          >
                            <AlertCircle className="w-3 h-3 text-red-600" />
                            <span>{locale === 'ar' ? 'مُعاد للمراجعة' : 'Returned'}</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10.5px] font-bold">
                            {locale === 'ar' ? 'مسودة' : 'Draft'}
                          </span>
                        )}
                      </td>

                      {/* 9. Action Buttons */}
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEditGrades && (rec.status === 'draft' || rec.status === 'returned') && (
                            <button
                              type="button"
                              onClick={() => handleSingleSubmit(rec.universityNumber)}
                              className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors cursor-pointer"
                              title={locale === 'ar' ? 'تقديم للاعتماد' : 'Submit'}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canApproveGrades && rec.status === 'submitted' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSingleApprove(rec.universityNumber)}
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors cursor-pointer"
                                title={locale === 'ar' ? 'اعتماد العلامة' : 'Approve'}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setReturnModalStudent(rec)}
                                className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors cursor-pointer"
                                title={locale === 'ar' ? 'إعادة للمراجعة' : 'Return with note'}
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {rec.status === 'approved' && (
                            <span className="text-[10.5px] text-emerald-700 font-bold flex items-center gap-0.5">
                              <Lock className="w-3 h-3 text-emerald-600" />
                              <span>{locale === 'ar' ? 'مقفل' : 'Locked'}</span>
                            </span>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Return Modal */}
      {returnModalStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h3 className="text-lg font-black text-slate-900 mb-2">
              {locale === 'ar' ? 'إعادة العلامات للمراجعة' : 'Return Grades for Review'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {locale === 'ar' ? `يرجى إدخال سبب إعادة العلامات للطالب ${returnModalStudent.nameAr}.` : `Please provide a reason for returning grades of ${returnModalStudent.nameEn || returnModalStudent.nameAr}.`}
            </p>
            <form onSubmit={handleConfirmReturn}>
              <textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder={locale === 'ar' ? 'سبب الإعادة (مطلوب)' : 'Reason (Required)'}
                required
                className="w-full rounded-2xl border border-slate-200 p-3 text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 font-bold bg-slate-50 min-h-[100px] mb-4 outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setReturnModalStudent(null); setReturnReason(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  {locale === 'ar' ? 'تأكيد الإعادة' : 'Confirm Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
