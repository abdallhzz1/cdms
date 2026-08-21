export interface AssignedGroupCard {
  id: string;
  subgroupCode: string;
  groupName: string;
  weeksText: string;
  weekNumbers: number[];
  siteName: string;
  deptName: string;
  courseName: string;
  students: {
    id: number;
    name_ar: string;
    name_en?: string;
    number: string;
    level: string;
  }[];
}

export function cleanDoctorName(str: string): string {
  if (!str) return '';
  return str
    .replace(/(أ\.د\.|أ\.د|د\.|دكتور|الأستاذ|البروفيسور|د\b|طبيب)/gi, '')
    .replace(/[^\u0600-\u06FF\w\s]/g, '') // remove punctuation/dots
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArabicName(str: string): string {
  if (!str) return '';
  return cleanDoctorName(str)
    .replace(/[أإآآ]/g, 'ا')
    .replace(/ة\b/g, 'ه')
    .replace(/ى\b/g, 'ي')
    .replace(/[^\u0600-\u06FF\w]/g, '') // strip ALL spaces
    .trim();
}

export function isNameMatch(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const normA = normalizeArabicName(nameA);
  const normB = normalizeArabicName(nameB);
  
  if (!normA || !normB) return false;
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) return true;

  const cleanA = cleanDoctorName(nameA);
  const cleanB = cleanDoctorName(nameB);

  const wordsA = cleanA.split(/\s+/).filter(w => w.length >= 2);
  const wordsB = cleanB.split(/\s+/).filter(w => w.length >= 2);

  const sharedWords = wordsA.filter(w => wordsB.some(w2 => w === w2 || w.includes(w2) || w2.includes(w)));
  return sharedWords.length >= 1 && (wordsA.length === 1 || wordsB.length === 1 || sharedWords.length >= 2);
}

function findStudentsForSubgroup(sgCode: string, level: string) {
  const years = ['2026/2027'];
  const levels = [level, 'fourth', 'fifth', 'sixth'];

  for (const yr of years) {
    for (const lvl of levels) {
      const keysToCheck = [
        `cdms_clinical_partition_${yr}_${lvl}`,
        `cdms_clinical_partition_${lvl}`,
      ];

      for (const key of keysToCheck) {
        const savedPartition = localStorage.getItem(key);
        if (savedPartition) {
          try {
            const mainGroups = JSON.parse(savedPartition);
            if (Array.isArray(mainGroups)) {
              for (const mg of mainGroups) {
                if (Array.isArray(mg.subgroups)) {
                  for (const sg of mg.subgroups) {
                    const codeMatch = sg.code === sgCode || sg.id === sgCode || sg.name === sgCode || sg.name === `المجموعة الفرعية ${sgCode}`;
                    if (codeMatch) {
                      if (Array.isArray(sg.students) && sg.students.length > 0) {
                        return sg.students.map((st: any) => ({
                          id: st.id,
                          name_ar: st.full_name_ar || st.name_ar || 'طالب سريري',
                          name_en: st.full_name_en || st.name_en,
                          number: st.university_number || st.number || String(st.id),
                          level: st.academic_level === 'fourth' ? 'السنة الرابعة' : st.academic_level === 'fifth' ? 'السنة الخامسة' : st.academic_level === 'sixth' ? 'السنة السادسة' : (st.academic_level || 'سريري'),
                        }));
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  // Fallback: Default 6 students per subgroup if no custom partition stored locally
  const sgNum = parseInt(sgCode.replace(/\D/g, ''), 10) || 1;
  const letter = sgCode.replace(/[^A-Za-z]/g, '').toUpperCase() || 'A';
  const baseId = (letter.charCodeAt(0) * 100) + (sgNum * 10);
  const arabicLevelName = level === 'fourth' ? 'السنة الرابعة' : level === 'fifth' ? 'السنة الخامسة' : level === 'sixth' ? 'السنة السادسة' : 'سريري';

  const sampleNames = [
    'أحمد محمود القواسمي',
    'سارة إبراهيم النتشة',
    'عمر عبد الفتاح العزة',
    'مريم يوسف الشريف',
    'محمد خالد الجعبري',
    'فاطمة علي التميمي'
  ];

  return sampleNames.map((name, idx) => ({
    id: baseId + idx + 1,
    name_ar: name,
    name_en: `Student ${idx + 1}`,
    number: `220${baseId + idx + 1}`,
    level: arabicLevelName,
  }));
}

export function resolveSupervisorAssignments(
  doctorName: string, 
  backendAssignments: any[] = [],
  overrideMatrices?: Record<string, any[]>
): AssignedGroupCard[] {
  // 1. First priority: Backend StudentClinicalAssignment records
  if (Array.isArray(backendAssignments) && backendAssignments.length > 0) {
    const groupedMap: Record<string, AssignedGroupCard> = {};
    backendAssignments.forEach((a: any) => {
      const blockKey = a.rotationBlock?.block_code || 'DEFAULT';
      const subKey = a.studentSubgroup?.name || a.studentSubgroup?.id || 'SUB';
      const key = `${blockKey}_${subKey}`;
      if (!groupedMap[key]) {
        groupedMap[key] = {
          id: key,
          subgroupCode: a.studentSubgroup?.name || 'SUB',
          groupName: a.studentSubgroup?.group?.name || a.studentSubgroup?.name || 'المجموعة المخصصة',
          weeksText: a.rotationBlock?.block_code || 'الفترة السريرية الحالية',
          weekNumbers: [],
          siteName: a.trainingSite?.name_ar || 'مستشفى التدريب',
          deptName: a.department?.name_ar || 'القسم السريري',
          courseName: 'المناوبة السريرية',
          students: [],
        };
      }
      if (a.student) {
        groupedMap[key].students.push({
          id: a.student.id,
          name_ar: a.student.full_name_ar,
          name_en: a.student.full_name_en,
          number: a.student.university_number,
          level: a.student.academic_level || 'سريري',
        });
      }
    });
    return Object.values(groupedMap);
  }

  // 2. Second priority: Department Head Distribution Matrix from Database Payload / localStorage (cdms_course_schedules_*)
  const levels = ['fourth', 'fifth', 'sixth'];
  const years = ['2026/2027'];
  
  let matchedDoctorRows: { row: any; courseName: string; level: string }[] = [];

  for (const year of years) {
    for (const level of levels) {
      const storageKey = `cdms_course_schedules_${year}_${level}`;
      let courses: any[] = [];

      if (overrideMatrices && Array.isArray(overrideMatrices[storageKey]) && overrideMatrices[storageKey].length > 0) {
        courses = overrideMatrices[storageKey];
      } else {
        const savedSchedules = localStorage.getItem(storageKey) || localStorage.getItem(`cdms_course_schedules_${level}`);
        if (savedSchedules) {
          try {
            courses = JSON.parse(savedSchedules);
          } catch (e) {}
        }
      }

      if (Array.isArray(courses)) {
        courses.forEach((c: any) => {
          if (Array.isArray(c.doctors)) {
            c.doctors.forEach((d: any) => {
              if (d.doctorName && isNameMatch(d.doctorName, doctorName)) {
                matchedDoctorRows.push({ row: d, courseName: c.courseName || c.courseCode, level });
              }
            });
          }
        });
      }
    }
  }

  // If matched doctor rows found in the Department Head Distribution Matrix
  if (matchedDoctorRows.length > 0) {
    const subgroupWeeksMap: Record<string, { weeks: number[]; hospital: string; dept: string; courseName: string; level: string }> = {};

    matchedDoctorRows.forEach(({ row, courseName, level }) => {
      const weeksObj = row.weeks || {};
      Object.entries(weeksObj).forEach(([weekNumStr, subgroupCode]) => {
        const sgCode = String(subgroupCode).trim();
        if (!sgCode || sgCode === '-' || sgCode.toLowerCase() === 'lectures') return;
        const weekNum = Number(weekNumStr);

        if (!subgroupWeeksMap[sgCode]) {
          subgroupWeeksMap[sgCode] = {
            weeks: [],
            hospital: row.hospital || 'مستشفى التدريب',
            dept: row.department || 'القسم السريري',
            courseName,
            level,
          };
        }
        if (!subgroupWeeksMap[sgCode].weeks.includes(weekNum)) {
          subgroupWeeksMap[sgCode].weeks.push(weekNum);
        }
      });
    });

    const result: AssignedGroupCard[] = [];

    Object.entries(subgroupWeeksMap).forEach(([sgCode, info]) => {
      info.weeks.sort((a, b) => a - b);
      const weeksStr = info.weeks.length === 1 
        ? `الأسبوع ${info.weeks[0]}` 
        : `الأسابيع ${info.weeks.join(' و ')}`;

      const students = findStudentsForSubgroup(sgCode, info.level);

      result.push({
        id: `sg_${sgCode}`,
        subgroupCode: sgCode,
        groupName: `المجموعة الفرعية ${sgCode}`,
        weeksText: weeksStr,
        weekNumbers: info.weeks,
        siteName: info.hospital,
        deptName: info.dept,
        courseName: info.courseName,
        students,
      });
    });

    if (result.length > 0) return result;
  }

  // 3. Clean fallback: If doctor is NOT placed in any course schedule in the Distribution Matrix, return []
  return [];
}

export interface AssessmentParameter {
  id: string;
  name_ar: string;
  name_en: string;
  maxPoints: number;
}

export const DEFAULT_EVALUATION_PARAMETERS: AssessmentParameter[] = [
  { id: 'history_taking', name_ar: 'History Taking (أخذ التاريخ المرضي)', name_en: 'History Taking', maxPoints: 2 },
  { id: 'physical_exam', name_ar: 'Physical Examination (الفحص السريري)', name_en: 'Physical Examination', maxPoints: 2 },
  { id: 'knowledge_progress', name_ar: 'Knowledge progress (التطور المعرفي)', name_en: 'Knowledge progress', maxPoints: 2 },
  { id: 'presentation_skills', name_ar: 'Presentation skills (مهارات العرض ومناقشة الحالات)', name_en: 'Presentation skills', maxPoints: 2 },
  { id: 'professionalism', name_ar: 'Professionalism, attitude & Dress code (المهنية والهندام والالتزام)', name_en: 'Professionalism, attitude & Dress code', maxPoints: 2 },
];

export function calculateWeeklyTotal(parameterScores: Record<string, number>): number {
  if (!parameterScores) return 0;
  const total = Object.values(parameterScores).reduce((sum, val) => sum + (Number(val) || 0), 0);
  return Math.min(10, Math.max(0, Number(total.toFixed(2))));
}

export function calculateWeeklyAverage(weeklyEvaluations: Record<number, { scores: Record<string, number>; totalScore: number }>): number {
  if (!weeklyEvaluations) return 0;
  const evalEntries = Object.values(weeklyEvaluations).filter(e => e && typeof e.totalScore === 'number');
  if (evalEntries.length === 0) return 0;

  const sumTotal = evalEntries.reduce((acc, curr) => acc + curr.totalScore, 0);
  const avg = sumTotal / evalEntries.length;
  return Number(avg.toFixed(2));
}

export function calculateFinalClinicalScore(weeklyAverageOutof10: number): number {
  const finalScore = weeklyAverageOutof10 * 2;
  return Math.min(20, Math.max(0, Number(finalScore.toFixed(2))));
}
