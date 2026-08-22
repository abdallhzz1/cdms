import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import ExcelJS from 'exceljs';
import { 
  ArrowRightLeft, Download, RefreshCw, 
  Settings2, Search, 
  X, MoveRight, Layers,
  Calendar, Stethoscope, Plus, Trash2, Building2,
  Share2, Copy, Check, ExternalLink, GraduationCap
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

interface Subgroup {
  id: string;
  code: string; // e.g. 'Q1'
  mainGroupLetter: string; // e.g. 'Q'
  students: StudentItem[];
  capacity: number;
}

interface MainGroup {
  letter: string; // e.g. 'Q'
  name: string;
  subgroups: Subgroup[];
}

// Hospital Doctor Item
interface HospitalDoctor {
  id: string;
  name: string;
  name_en?: string;
  specialty?: string;
  specialty_en?: string;
}

// Hospital Group Item
interface HospitalGroup {
  id: string;
  name: string;
  name_en?: string;
  doctors: HospitalDoctor[];
}

// Doctor Weekly Rotation Row
interface DoctorScheduleRow {
  id: string;
  doctorName: string;
  doctorName_en?: string;
  hospital?: string;
  hospital_en?: string;
  specialty?: string;
  specialty_en?: string;
  department?: string;
  department_en?: string;
  weeksTrimester?: string;
  weeksYear?: string;
  weeks: { [weekNumber: number]: string };
}

// Clinical Course Configuration
interface CourseSchedule {
  courseCode: string;
  courseName: string;
  courseName_en?: string;
  weeksCount: number;
  weekDates?: string[];
  doctors: DoctorScheduleRow[];
}

// Built-in hospital transliterations
const hospitalTransliterationMap: { [key: string]: string } = {
  'م. الأهلي': 'Al-Ahli Hospital',
  'م. الخليل الحكومي (عالية)': 'Alia Governmental Hospital',
  'م. عالية': 'Alia Governmental Hospital',
  'م. الهلال الأحمر': 'Red Crescent Hospital',
  'م. الهلال': 'Red Crescent Hospital',
  'م. دورا الحكومي': 'Dura Governmental Hospital',
  'م. دورا': 'Dura Governmental Hospital',
  'م. بيت جالا الحكومي': 'Beit Jala Governmental Hospital',
  'م. بيت جالا': 'Beit Jala Governmental Hospital',
  'م. كاريتاس للأطفال': 'Caritas Baby Hospital',
  'م. كاريتاس': 'Caritas Baby Hospital',
  'م. العائلة المقدسة': 'Holy Family Hospital',
  'م. محمود عباس': 'President Mahmoud Abbas Hospital',
  'م. يطا الحكومي': 'Yatta Governmental Hospital',
  'م. يطا': 'Yatta Governmental Hospital',
  'م. الميزان التخصصي': 'Al-Mezan Specialized Hospital',
  'م. الميزان': 'Al-Mezan Specialized Hospital',
};

// Default University Training Hospitals Directory
const defaultHospitalGroups: HospitalGroup[] = [
  {
    id: 'h_ahli',
    name: 'م. الأهلي',
    name_en: 'Al-Ahli Hospital',
    doctors: [
      { id: '1', name: 'د. عبد الله قاسم', name_en: 'Dr. Abdallah Qasim' },
      { id: '2', name: 'د. بدوي انداعور', name_en: 'Dr. Badawi Indaour' },
      { id: '3', name: 'د. حسن الحروب', name_en: 'Dr. Hassan Haroub' },
      { id: '4', name: 'د. رواد عارضة', name_en: 'Dr. Rawad Arda' },
      { id: '5', name: 'د. أنس أبو رميلة', name_en: 'Dr. Anas Abu Rmeileh' },
      { id: '6', name: 'د. صفوت زيدات', name_en: 'Dr. Safwat Zeidat' },
      { id: '7', name: 'د. أحمد العطاونة', name_en: 'Dr. Ahmad Atawneh' },
      { id: '8', name: 'د. محمود الهور', name_en: 'Dr. Mahmoud Al-Hoor' },
      { id: '9', name: 'د. بسام البشيتي', name_en: 'Dr. Bassam Bsheiti' },
      { id: '10', name: 'د. فوزي ابونجمة', name_en: 'Dr. Fawzi Abu Najmeh' },
      { id: '11', name: 'د. علي أبورميش', name_en: 'Dr. Ali Abu Rmeish' },
      { id: '12', name: 'د. تامر قطينة', name_en: 'Dr. Tamer Qteineh' },
      { id: '13', name: 'د. نور الهدى صوالحة', name_en: 'Dr. Nour Al-Huda Sawalha' },
      { id: '14', name: 'د. عامر ابو رميلة', name_en: 'Dr. Amer Abu Rmeileh' },
      { id: '15', name: 'د. احمد ابو يوسف', name_en: 'Dr. Ahmad Abu Yousef' },
      { id: '16', name: 'د. مراد النتشة', name_en: 'Dr. Murad Natsheh' },
      { id: '17', name: 'د. ضرار الزعتري', name_en: 'Dr. Derar Zaatari' },
      { id: '18', name: 'د. عصام شماس', name_en: 'Dr. Issam Shammas' },
      { id: '19', name: 'د. انس شاور', name_en: 'Dr. Anas Shawar' },
      { id: '20', name: 'د. نزار حجة', name_en: 'Dr. Nizar Hijjeh' },
      { id: '21', name: 'د. رشاد الزرو', name_en: 'Dr. Rashad Zaro' },
      { id: '22', name: 'د. بسام ناصر الدين', name_en: 'Dr. Bassam Naser Al-Din' },
      { id: '23', name: 'د. ضرار سميرات', name_en: 'Dr. Derar Smeirat' },
      { id: '24', name: 'د. ممدوح دريدي', name_en: 'Dr. Mamdouh Draidi' },
    ]
  },
  {
    id: 'h_hilal',
    name: 'م. الهلال',
    name_en: 'Red Crescent Hospital',
    doctors: [
      { id: '1', name: 'د. محمد زهور', name_en: 'Dr. Mohammad Zhour' },
      { id: '2', name: 'د. طلب العجلوني', name_en: 'Dr. Talab Ajlouni' },
      { id: '3', name: 'د. رضوان ابو كرش', name_en: 'Dr. Radwan Abu Karsh' },
      { id: '4', name: 'د. شريف حسان', name_en: 'Dr. Sharif Hassan' },
      { id: '5', name: 'د. احمد ابوشرخ', name_en: 'Dr. Ahmad Abu Sharakh' },
      { id: '6', name: 'د. سلامة المحتسب', name_en: 'Dr. Salameh Muhtaseb' },
      { id: '7', name: 'د. محمود قديمات', name_en: 'Dr. Mahmoud Qdeimat' },
      { id: '8', name: 'د. عمار الحداد', name_en: 'Dr. Ammar Haddad' },
      { id: '9', name: 'د. عبيدالله ابو سنينة', name_en: 'Dr. Obaidallah Abu Sneineh' },
      { id: '10', name: 'د. تامر شاور', name_en: 'Dr. Tamer Shawar' },
      { id: '11', name: 'د. خليل ابو زينة', name_en: 'Dr. Khalil Abu Zeina' },
      { id: '12', name: 'د. اسماعيل ارزيقات', name_en: 'Dr. Ismail Rzeigat' },
      { id: '13', name: 'د. الاء عباس', name_en: 'Dr. Alaa Abbas' },
      { id: '14', name: 'د. عبد السلام حداد', name_en: 'Dr. Abdulsalam Haddad' },
    ]
  },
  {
    id: 'h_alia',
    name: 'م. عالية',
    name_en: 'Alia Hospital',
    doctors: [
      { id: '1', name: 'د. اشرف افغانة', name_en: 'Dr. Ashraf Afghaneh' },
      { id: '2', name: 'د. عمر عليان', name_en: 'Dr. Omar Olayan' },
      { id: '3', name: 'د. مهند ابوساكور', name_en: 'Dr. Mohannad Abu Sakour' },
      { id: '4', name: 'د. وائل الجعبري', name_en: 'Dr. Wael Jaabari' },
      { id: '5', name: 'د. عبد الناصر الجنيدي', name_en: 'Dr. Abd Al-Nasser Junaidi' },
      { id: '6', name: 'د. اياد الجدع', name_en: 'Dr. Iyad Jadaa' },
      { id: '7', name: 'د. معتصم ادعيس', name_en: 'Dr. Moatasem Ideis' },
      { id: '8', name: 'د. رائد شواورة', name_en: 'Dr. Raed Shawawreh' },
      { id: '9', name: 'د. زياد رمضان', name_en: 'Dr. Ziad Ramadan' },
      { id: '10', name: 'د. قيصر عوض', name_en: 'Dr. Qaisar Awad' },
      { id: '11', name: 'د. محمد الرجبي', name_en: 'Dr. Mohammad Rajabi' },
      { id: '12', name: 'د. يوسف الحروب', name_en: 'Dr. Yousef Haroub' },
      { id: '13', name: 'د. سعيد الزعتري', name_en: 'Dr. Saeed Zaatari' },
      { id: '14', name: 'د. هشام ابو رميلة', name_en: 'Dr. Hisham Abu Rmeileh' },
    ]
  },
  {
    id: 'h_dura',
    name: 'م. دورا',
    name_en: 'Dura Hospital',
    doctors: [
      { id: '1', name: 'د. صابرين رجوب', name_en: 'Dr. Sabreen Rjoub' },
      { id: '2', name: 'د. حمزة الزهور', name_en: 'Dr. Hamza Zhour' },
    ]
  },
  {
    id: 'h_beitjala',
    name: 'م. بيت جالا',
    name_en: 'Beit Jala Hospital',
    doctors: [
      { id: '1', name: 'د. زيدان زيدان', name_en: 'Dr. Zeidan Zeidan' },
      { id: '2', name: 'د. رامي العيسة', name_en: 'Dr. Rami Aissa' },
      { id: '3', name: 'د. مجد حميدة', name_en: 'Dr. Majd Hmeideh' },
      { id: '4', name: 'د. اسامة كرجة', name_en: 'Dr. Osama Karjeh' },
      { id: '5', name: 'د. عمار شاهين', name_en: 'Dr. Ammar Shaheen' },
    ]
  },
  {
    id: 'h_caritas',
    name: 'م. كاريتاس',
    name_en: 'Caritas Baby Hospital',
    doctors: [
      { id: '1', name: 'د. هيام مرزوقة', name_en: 'Dr. Hiyam Marzouqa' },
    ]
  },
  {
    id: 'h_family',
    name: 'م. العائلة المقدسة',
    name_en: 'Holy Family Hospital',
    doctors: [
      { id: '1', name: 'د. تامر مصلح', name_en: 'Dr. Tamer Musleh' },
      { id: '2', name: 'د. بشار رشماوي', name_en: 'Dr. Bashar Rashmawi' },
    ]
  },
  {
    id: 'h_abbas',
    name: 'م. محمود عباس',
    name_en: 'Mahmoud Abbas Hospital',
    doctors: [
      { id: '1', name: 'د. رواد ابو ريان', name_en: 'Dr. Rawad Abu Rayyan' },
      { id: '2', name: 'د. سامي سويطي', name_en: 'Dr. Sami Sweiti' },
    ]
  },
  {
    id: 'h_yatta',
    name: 'م. يطا',
    name_en: 'Yatta Hospital',
    doctors: [
      { id: '1', name: 'د. نضال بحيص', name_en: 'Dr. Nidal Buhais' },
      { id: '2', name: 'د. محمد زهور', name_en: 'Dr. Mohammad Zhour' },
    ]
  }
];

export function DistributionPage() {
  const { user } = useAuth();
  const { locale } = useI18n();
  const queryClient = useQueryClient();

  const isSupervisorOnly = useMemo(() => {
    if (!user?.roles) return false;
    const roles = user.roles.map(r => r.toUpperCase());
    return roles.includes('CLINICAL_SUPERVISOR') && !roles.some(r => ['DEPARTMENT_HEAD', 'CLINICAL_DIRECTOR', 'ADMIN_ASSISTANT', 'SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'RTA'].includes(r));
  }, [user]);

  // Navigation View: 'rotation_matrix' (جدول الأطباء) vs 'partition' (مجموعات الطلاب) vs 'hospitals' (المستشفيات)
  const [activeMainView, setActiveMainView] = useState<'rotation_matrix' | 'partition' | 'hospitals'>('rotation_matrix');

  // Hospital Management State
  const [hospitalGroups, setHospitalGroups] = useState<HospitalGroup[]>(() => {
    const saved = localStorage.getItem('cdms_hospital_doctors');
    return saved ? JSON.parse(saved) : defaultHospitalGroups;
  });

  // Fetch hospital directory payload from MySQL Database
  const { data: dbHospitalGroupsPayload } = useQuery({
    queryKey: ['db-hospital-groups'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_hospital_doctors')}`),
  });

  useEffect(() => {
    const data = Array.isArray(dbHospitalGroupsPayload) ? dbHospitalGroupsPayload : dbHospitalGroupsPayload?.data;
    if (Array.isArray(data) && data.length > 0) {
      setHospitalGroups(data);
      try { localStorage.setItem('cdms_hospital_doctors', JSON.stringify(data)); } catch (e) {}
    }
  }, [dbHospitalGroupsPayload]);

  // Fetch Group Letters Configuration from DB
  const { data: dbGroupLettersPayload } = useQuery({
    queryKey: ['db-group-letters'],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent('cdms_group_letters')}`),
  });

  useEffect(() => {
    const data = Array.isArray(dbGroupLettersPayload) ? dbGroupLettersPayload : dbGroupLettersPayload?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      setGroupLetters(data);
      try { localStorage.setItem('cdms_group_letters', JSON.stringify(data)); } catch (e) {}
    }
  }, [dbGroupLettersPayload]);

  const [hospitalSearch, setHospitalSearch] = useState('');
  const [isAddHospitalModalOpen, setIsAddHospitalModalOpen] = useState(false);
  const [newHospitalName, setNewHospitalName] = useState('');
  const [newHospitalNameEn, setNewHospitalNameEn] = useState('');
  const [isAddHospDocModalOpen, setIsAddHospDocModalOpen] = useState(false);
  const [targetHospId, setTargetHospId] = useState('');
  const [newHospDocName, setNewHospDocName] = useState('');
  const [newHospDocNameEn, setNewHospDocNameEn] = useState('');
  const [newHospDocSpecialty, setNewHospDocSpecialty] = useState('');
  const [newHospDocSpecialtyEn, setNewHospDocSpecialtyEn] = useState('');
  const [newHospDocEmail, setNewHospDocEmail] = useState('');
  const [newHospDocPassword, setNewHospDocPassword] = useState('password123');

  // Academic Year State (defaults to current year 2026/2027 or user customized)
  const [academicYears, setAcademicYears] = useState<string[]>(() => {
    const savedYears = localStorage.getItem('cdms_academic_years');
    if (savedYears) {
      try {
        const parsed = JSON.parse(savedYears);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return ['2026/2027'];
  });
  const [academicYear, setAcademicYear] = useState<string>('2026/2027');
  const [isAddYearModalOpen, setIsAddYearModalOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  // 1. Cohort Level (4th, 5th, 6th)
  const [levelFilter, setLevelFilter] = useState<string>('fourth');
  
  // 2. Custom Group Letters Configuration
  const [groupLetters, setGroupLetters] = useState<{ [level: string]: [string, string, string] }>(() => {
    const saved = localStorage.getItem('cdms_group_letters');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {}
    }
    return {
      fourth: ['A', 'B', 'C'],
      fifth: ['A', 'B', 'C'],
      sixth: ['Q', 'R', 'S'],
    };
  });

  // 3. Subgroup Target Capacity (5 or 6)
  const [subgroupCapacity, setSubgroupCapacity] = useState<number>(6);

  // 4. Search Filter inside groups
  const [searchQuery, setSearchQuery] = useState('');

  // 5. Active Main Group Tab View
  const [selectedMainGroup, setSelectedMainGroup] = useState<string>('ALL');

  // 6. Swap & Move Modal States
  const [swapStudent, setSwapStudent] = useState<{ student: StudentItem; fromSubgroup: string } | null>(null);
  const [moveStudent, setMoveStudent] = useState<{ student: StudentItem; fromSubgroup: string } | null>(null);
  const [targetSubgroupForMove, setTargetSubgroupForMove] = useState<string>('');
  
  // 7. Edit Letters Modal State
  const [isEditLettersOpen, setIsEditLettersOpen] = useState(false);
  const [tempLetters, setTempLetters] = useState<[string, string, string]>(['A', 'B', 'C']);

  // =========================================================================
  // DOCTOR ROTATION MATRIX STATE (DYNAMIC & EDITABLE FOR ANY YEAR)
  // =========================================================================
  const [selectedCourseIndex, setSelectedCourseIndex] = useState<number>(0);
  
  // Doctor Modals
  const [newDoctorName, setNewDoctorName] = useState('');
  const [newDoctorNameEn, setNewDoctorNameEn] = useState('');
  const [newDoctorDepartment, setNewDoctorDepartment] = useState('');
  const [newDoctorDepartmentEn, setNewDoctorDepartmentEn] = useState('');
  const [newDoctorHospital, setNewDoctorHospital] = useState('');
  const [newDoctorHospitalEn, setNewDoctorHospitalEn] = useState('');
  const [isAddDoctorModalOpen, setIsAddDoctorModalOpen] = useState(false);

  // Course Modals
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [isEditCourseModalOpen, setIsEditCourseModalOpen] = useState(false);
  const [selectedDbCourseId, setSelectedDbCourseId] = useState('');
  const [courseFormCode, setCourseFormCode] = useState('');
  const [courseFormName, setCourseFormName] = useState('');
  const [courseFormNameEn, setCourseFormNameEn] = useState('');
  const [courseFormWeeks, setCourseFormWeeks] = useState(12);

  // Edit Hospital Modal State
  const [isEditHospitalModalOpen, setIsEditHospitalModalOpen] = useState(false);
  const [editingHospitalId, setEditingHospitalId] = useState('');
  const [editHospitalNameAr, setEditHospitalNameAr] = useState('');
  const [editHospitalNameEn, setEditHospitalNameEn] = useState('');

  // Edit Doctor in Hospital Modal State
  const [isEditHospDocModalOpen, setIsEditHospDocModalOpen] = useState(false);
  const [editingHospIdForDoc, setEditingHospIdForDoc] = useState('');
  const [editingDocId, setEditingDocId] = useState('');
  const [editHospDocNameAr, setEditHospDocNameAr] = useState('');
  const [editHospDocNameEn, setEditHospDocNameEn] = useState('');
  const [editHospDocSpecialty, setEditHospDocSpecialty] = useState('');
  const [editHospDocSpecialtyEn, setEditHospDocSpecialtyEn] = useState('');

  // Swap / Replace Doctor in Matrix Modal State
  const [isSwapDoctorModalOpen, setIsSwapDoctorModalOpen] = useState(false);
  const [swappingMatrixDocId, setSwappingMatrixDocId] = useState('');
  const [currentDocToSwap, setCurrentDocToSwap] = useState<DoctorScheduleRow | null>(null);
  const [selectedReplacementDoctorName, setSelectedReplacementDoctorName] = useState('');

  // Share Public Link Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const getDefaultCoursesForLevel = (level: string): CourseSchedule[] => {
    if (level === 'fourth') {
      return [
        {
          courseCode: 'M1460',
          courseName: 'أطباء مساق الأمراض الباطنية (مبتدئ) — سنة دراسية رابعة',
          courseName_en: 'Internal Medicine (Junior) — 4th Year',
          weeksCount: 12,
          weekDates: ['29/8-5/9', '5/9-12/9', '12/9-19/9', '19/9-26/9', '26/9-3/10', '3/10-10/10', '10/10-17/10', '17/10-24/10', '24/10-31/10', '31/10-7/11', '7/11-14/11', '14/11-21/11'],
          doctors: []
        },
        {
          courseCode: 'M1470',
          courseName: 'أطباء مساق جراحة عامة (مبتدئ) — سنة دراسية رابعة',
          courseName_en: 'General Surgery (Junior) — 4th Year',
          weeksCount: 12,
          weekDates: ['29-8', '5-9', '12-9', '19-9', '26-9', '3-10', '10-10', '17-10', '24-10', '31-10', '7-11', '14-11'],
          doctors: []
        },
        {
          courseCode: 'M1462',
          courseName: 'أطباء مساق التخصصات الباطنية الفرعية — سنة دراسية رابعة',
          courseName_en: 'Sub-specialties of Internal Medicine — 4th Year',
          weeksCount: 12,
          weekDates: ['Week 1 29/8', 'Week 2 05/9', 'Week 3 12/9', 'Week 4 19/9', 'Week 5 26/9', 'Week 6 03/10', 'Week 7 10/10', 'Week 8 17/10', 'Week 9 24/10', 'Week 10 31/10', 'Week 11 07/11', 'Week 12 14/11'],
          doctors: []
        }
      ];
    } else if (levelFilter === 'fifth') {
      return [
        {
          courseCode: 'M1582-A',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — First Trimester — مجموعة (A)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (A) — 5th Year',
          weeksCount: 12,
          doctors: []
        },
        {
          courseCode: 'M1582-B',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — Second Trimester — مجموعة (B)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (B) — 5th Year',
          weeksCount: 12,
          doctors: []
        },
        {
          courseCode: 'M1582-C',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — Third Trimester — مجموعة (C)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (C) — 5th Year',
          weeksCount: 12,
          doctors: []
        }
      ];
    } else {
      return [
        {
          courseCode: 'M1673-Q',
          courseName: 'مساق جراحة عامة (متقدم) — مجموعة (Q) — سنة سادسة',
          courseName_en: 'General Surgery & Emergency (Q) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (8-Jan)', '2 (8-Aug)', '3 (15-8)', '4 (22-8)', '5 (29-8)', '6 (9-May)', '7 (9-Dec)', '8 (19-9)', '9 (26-9)', '10 (10-Mar)', '11 (10-Oct)', '12 (17-10)'],
          doctors: []
        },
        {
          courseCode: 'M1673-R',
          courseName: 'مساق جراحة عامة (متقدم) — مجموعة (R) — سنة سادسة',
          courseName_en: 'General Surgery & Emergency (R) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (8-Jan)', '2 (8-Aug)', '3 (15-8)', '4 (22-8)', '5 (29-8)', '6 (9-May)', '7 (9-Dec)', '8 (19-9)', '9 (26-9)', '10 (10-Mar)', '11 (10-Oct)', '12 (17-10)'],
          doctors: []
        },
        {
          courseCode: 'M1673-S',
          courseName: 'مساق جراحة عامة (متقدم) — مجموعة (S) — سنة سادسة',
          courseName_en: 'General Surgery & Emergency (S) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (8-Jan)', '2 (8-Aug)', '3 (15-8)', '4 (22-8)', '5 (29-8)', '6 (9-May)', '7 (9-Dec)', '8 (19-9)', '9 (26-9)', '10 (10-Mar)', '11 (10-Oct)', '12 (17-10)'],
          doctors: []
        },
        {
          courseCode: 'M1661-Q',
          courseName: 'مساق الباطني والجراحات التخصصية الفرعية — مجموعة (Q) — سنة سادسة',
          courseName_en: 'Internal Medicine & Sub-specialties (Q) — 6th Year',
          weeksCount: 12,
          doctors: []
        },
        {
          courseCode: 'M1661-S',
          courseName: 'مساق الباطني والجراحات التخصصية الفرعية — مجموعة (S) — سنة سادسة',
          courseName_en: 'Internal Medicine & Sub-specialties (S) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (01.08-06.08)', '2 (08.08-13.08)', '3 (15.08-20.08)', '4 (22.08-27.08)', '5 (29.08-03.09)', '6 (05.09-10.09)', '7 (12.09-17.09)', '8 (19.09-24.09)', '9 (26.09-01.10)', '10 (03.10-08.10)', '11 (10.10-15.10)', '12 (17.10-22.10)'],
          doctors: []
        },
        {
          courseCode: 'M1688-Q',
          courseName: 'مساق الأطفال والنسائية والتوليد — مجموعة (Q) — سنة سادسة',
          courseName_en: 'Pediatrics & Obs/Gyne (Q) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (1/8-6/8)', '2 (8/8-13/8)', '3 (15/8-20/8)', '4 (22/8-27/8)', '5 (29/8-3/9)', '6 (5/9-10/9)', '7 (12/9-17/9)', '8 (19/9-24/9)', '9 (26/9-1/10)', '10 (1/10-8/10)', '11 (10/10-15/10)', '12 (17/10-22/10)'],
          doctors: []
        },
        {
          courseCode: 'M1688-R',
          courseName: 'مساق الأطفال والنسائية والتوليد — مجموعة (R) — سنة سادسة',
          courseName_en: 'Pediatrics & Obs/Gyne (R) — 6th Year',
          weeksCount: 12,
          doctors: []
        },
        {
          courseCode: 'M1688-S',
          courseName: 'مساق الأطفال والنسائية والتوليد — مجموعة (S) — سنة سادسة',
          courseName_en: 'Pediatrics & Obs/Gyne (S) — 6th Year',
          weeksCount: 12,
          doctors: []
        }
      ];
    }
  };

  // Helper to load courses per specific academic year & level
  const loadCoursesForYearAndLevel = (year: string, level: string): CourseSchedule[] => {
    const isCleared = localStorage.getItem(`cdms_cleared_${year}_${level}`) === 'true';
    if (isCleared) return [];

    const saved = localStorage.getItem(`cdms_course_schedules_${year}_${level}`);
    if (saved !== null) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // fallback
      }
    }
    return [];
  };

  // State holding editable courses schedules (strictly keyed by academicYear + levelFilter)
  const [courseSchedules, setCourseSchedules] = useState<CourseSchedule[]>(() => {
    return loadCoursesForYearAndLevel(academicYear, levelFilter);
  });

  const courseSchedulesKey = `cdms_course_schedules_${academicYear}_${levelFilter}`;

  // Fetch course schedules payload directly from MySQL Database
  const { data: dbCourseSchedulesPayload } = useQuery({
    queryKey: ['db-course-schedules', courseSchedulesKey],
    queryFn: () => apiFetch<any>(`/operational/distribution-payload?key=${encodeURIComponent(courseSchedulesKey)}`),
  });

  // Fetch registered clinical courses live from MySQL DB for dropdown selection
  const { data: rawDbCoursesList } = useQuery({
    queryKey: ['db-courses-all-distribution'],
    queryFn: () => apiFetch<any>('/courses?per_page=100'),
  });

  const availableDbCourses = useMemo(() => {
    const list = Array.isArray(rawDbCoursesList) ? rawDbCoursesList : (rawDbCoursesList?.data ?? rawDbCoursesList?.items ?? []);
    if (!Array.isArray(list)) return [];
    return list.filter((c: any) => !levelFilter || c.academic_level === levelFilter || c.academic_level === 'all');
  }, [rawDbCoursesList, levelFilter]);

  useEffect(() => {
    const data = Array.isArray(dbCourseSchedulesPayload) ? dbCourseSchedulesPayload : dbCourseSchedulesPayload?.data;
    if (Array.isArray(data) && data.length > 0) {
      setCourseSchedules(data);
      try { localStorage.setItem(courseSchedulesKey, JSON.stringify(data)); } catch (e) {}
    } else {
      const saved = localStorage.getItem(courseSchedulesKey);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setCourseSchedules(parsed);
            return;
          }
        } catch (e) {}
      }
      if (data === null || (Array.isArray(data) && data.length === 0)) {
        setCourseSchedules([]);
      }
    }
  }, [dbCourseSchedulesPayload, courseSchedulesKey]);

  // Save courses matrix
  const saveCourseSchedules = (updated: CourseSchedule[]) => {
    setCourseSchedules(updated);
    const key = `cdms_course_schedules_${academicYear}_${levelFilter}`;
    localStorage.setItem(key, JSON.stringify(updated));
    localStorage.removeItem(`cdms_cleared_${academicYear}_${levelFilter}`);

    // Sync directly to MySQL Database!
    apiFetch('/operational/distribution-payload', {
      method: 'POST',
      body: { key, payload: updated }
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['db-course-schedules', key] });
    }).catch(err => console.error('DB Sync Error:', err));
  };

  // Clear and delete all courses and schedules for all cohorts
  const handleClearAllDistributionData = () => {
    if (!window.confirm(locale === 'ar' ? 'هل أنت متأكد من حذف وتفريغ كافة جداول التوزيع والمساقات لجميع الدفعات بالكامل؟' : 'Are you sure you want to delete and clear all course tables for all cohorts?')) return;

    const levels = ['fourth', 'fifth', 'sixth'];
    const years = ['2026/2027'];

    for (const yr of years) {
      for (const lvl of levels) {
        const k = `cdms_course_schedules_${yr}_${lvl}`;
        localStorage.setItem(k, JSON.stringify([]));
        localStorage.setItem(`cdms_course_schedules_${lvl}`, JSON.stringify([]));
        localStorage.setItem(`cdms_cleared_${yr}_${lvl}`, 'true');
        localStorage.removeItem(`cdms_clinical_partition_${yr}_${lvl}`);
        localStorage.removeItem(`cdms_clinical_partition_${lvl}`);

        // Wipe from MySQL Database
        apiFetch('/operational/distribution-payload', {
          method: 'POST',
          body: { key: k, payload: [] }
        }).catch(err => console.error('DB Sync Error:', err));
      }
    }

    setCourseSchedules([]);
    setMainGroups([]);
    setSelectedCourseIndex(0);
    alert(locale === 'ar' ? 'تم حذف وتفريغ كافة جداول المساقات والتوزيع لجميع الدفعات بنجاح من قاعدة البيانات ✓ يمكنك الآن إضافة المساقات أو استيراد القالب.' : 'All courses and tables deleted successfully from database ✓');
  };

  // Import Default Faculty Template into current Year
  const handleImportTemplate = () => {
    const template = getDefaultCoursesForLevel(levelFilter);
    saveCourseSchedules(template);
  };

  // Add Academic Year Handler
  const handleAddYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearInput.trim()) return;
    const formatted = newYearInput.trim();
    if (!academicYears.includes(formatted)) {
      const updatedYears = [...academicYears, formatted];
      setAcademicYears(updatedYears);
      localStorage.setItem('cdms_academic_years', JSON.stringify(updatedYears));
    }
    setAcademicYear(formatted);
    setNewYearInput('');
    setIsAddYearModalOpen(false);
  };

  // Delete Academic Year Handler
  const handleDeleteYear = (yearToDelete: string) => {
    if (academicYears.length <= 1) {
      alert(locale === 'ar' ? 'لا يمكن حذف العام الدراسي الوحيد' : 'Cannot delete the only academic year');
      return;
    }
    if (window.confirm(locale === 'ar' ? `هل أنت متأكد من حذف العام الدراسي (${yearToDelete}) وجميع جداوله؟` : `Delete academic year ${yearToDelete}?`)) {
      const updated = academicYears.filter(y => y !== yearToDelete);
      setAcademicYears(updated);
      localStorage.setItem('cdms_academic_years', JSON.stringify(updated));
      if (academicYear === yearToDelete) {
        setAcademicYear(updated[0]);
      }
    }
  };

  // Localized Course Title Helper
  const getLocalizedCourseTitle = (course: CourseSchedule | undefined) => {
    if (!course) return '';
    if (locale === 'en') {
      if (course.courseName_en) return course.courseName_en;
      const code = course.courseCode || '';
      if (code.startsWith('M1460')) return 'Internal Medicine (Junior) — 4th Year';
      if (code.startsWith('M1470')) return 'General Surgery (Junior) — 4th Year';
      if (code.startsWith('M1462')) return 'Sub-specialties of Internal Medicine — 4th Year';
      if (code.startsWith('M1480')) return 'Pediatrics (Junior) — 4th Year';
      if (code.startsWith('M1582-A')) return 'Obstetrics & Gynecology + Family Medicine (A) — 5th Year';
      if (code.startsWith('M1582-B')) return 'Obstetrics & Gynecology + Family Medicine (B) — 5th Year';
      if (code.startsWith('M1582-C')) return 'Obstetrics & Gynecology + Family Medicine (C) — 5th Year';
      if (code.startsWith('M1673-Q')) return 'General Surgery & Emergency (Q) — 6th Year';
      if (code.startsWith('M1673-R')) return 'General Surgery & Emergency (R) — 6th Year';
      if (code.startsWith('M1673-S')) return 'General Surgery & Emergency (S) — 6th Year';
      if (code.startsWith('M1661-Q')) return 'Internal Medicine & Sub-specialties (Q) — 6th Year';
      if (code.startsWith('M1661-S')) return 'Internal Medicine & Sub-specialties (S) — 6th Year';
      if (code.startsWith('M1688-Q')) return 'Pediatrics & Obs/Gyne (Q) — 6th Year';
      if (code.startsWith('M1688-R')) return 'Pediatrics & Obs/Gyne (R) — 6th Year';
      if (code.startsWith('M1688-S')) return 'Pediatrics & Obs/Gyne (S) — 6th Year';
    }
    return course.courseName;
  };

  // Localized Hospital Name Helper
  const getLocalizedHospitalName = (name: string, name_en?: string) => {
    if (!name) return '';
    if (locale === 'en') {
      if (name_en) return name_en;
      if (name.includes('الأهلي') || name.includes('Ahli')) return 'Al-Ahli Hospital';
      if (name.includes('الهلال') || name.includes('Hilal')) return 'Red Crescent Hospital';
      if (name.includes('عالية') || name.includes('Alia')) return 'Alia Hospital';
      if (name.includes('دورا') || name.includes('Dura')) return 'Dura Hospital';
      if (name.includes('بيت جالا') || name.includes('Beit Jala')) return 'Beit Jala Hospital';
      if (name.includes('كاريتاس') || name.includes('Caritas')) return 'Caritas Baby Hospital';
      if (name.includes('العائلة المقدسة') || name.includes('Holy Family')) return 'Holy Family Hospital';
      if (name.includes('محمود عباس') || name.includes('Abbas')) return 'Mahmoud Abbas Hospital';
      if (name.includes('يطا') || name.includes('Yatta')) return 'Yatta Hospital';
      if (name.includes('الميزان') || name.includes('Mezan')) return 'Al-Mezan Specialized Hospital';
    }
    return name;
  };

  const doctorTransliterationMap: Record<string, string> = {
    'د. عبدالله': 'Dr. Abdallah',
    'د. عبد الله قاسم': 'Dr. Abdallah Qasim',
    'د. مجد': 'Dr. Majd',
    'د. مجد حميدة': 'Dr. Majd Hmeideh',
    'د. رامي': 'Dr. Rami',
    'د. رامي العيسة': 'Dr. Rami Aissa',
    'د. رامي القواسمة': 'Dr. Rami Qawasmeh',
    'د. زيدان': 'Dr. Zeidan',
    'د. زيدان زيدان': 'Dr. Zeidan Zeidan',
    'د. أشرف': 'Dr. Ashraf',
    'د. اشرف افغانة': 'Dr. Ashraf Afghaneh',
    'د. بدوي': 'Dr. Badawi',
    'د. بدوي انداعور': 'Dr. Badawi Indaour',
    'د. حمزة': 'Dr. Hamza',
    'د. حمزة الزهور': 'Dr. Hamza Zhour',
    'د. احمد ابو يوسف': 'Dr. Ahmad Abu Yousef',
    'د. خليل ابو زينة': 'Dr. Khalil Abu Zeina',
    'د. اسماعيل ارزيقات': 'Dr. Ismail Rzeigat',
    'د. اسماعيل الحروب': 'Dr. Ismail Haroub',
    'د. قيصر عوض': 'Dr. Qaisar Awad',
    'طبيب شاغر (1)': 'Vacant Doctor (1)',
    'طبيب شاغر (2)': 'Vacant Doctor (2)',
    'د. رائد شواورة': 'Dr. Raed Shawawreh',
    'د. خالد الجبور': 'Dr. Khaled Jabour',
    'د. اياد العزة': 'Dr. Iyad Azzeh',
    'د. عمار العطار': 'Dr. Ammar Attar',
    'د. انس دويك': 'Dr. Anas Dweik',
    'د. وائل الجعبري': 'Dr. Wael Jaabari',
    'د. معتز التميمي': 'Dr. Moataz Tamimi',
    'د. بسام البشيتي': 'Dr. Bassam Bsheiti',
    'د. اياد عفانة': 'Dr. Iyad Afaneh',
    'د. عبد السلام حداد': 'Dr. Abdulsalam Haddad',
    'د. بشار رشماوي': 'Dr. Bashar Rashmawi',
    'د. بسام ناصر الدين': 'Dr. Bassam Naser Al-Din',
    'د. سعيد الزعتري': 'Dr. Saeed Zaatari',
    'د. نضال بحيص': 'Dr. Nidal Buhais',
    'د. همام طميزي': 'Dr. Homam Tmeizi',
    'د. اياد الجدع': 'Dr. Iyad Jadaa',
    'د. اياد الجدع (رئيس قسم)': 'Dr. Iyad Jadaa (Dept Head)',
    'د. عمار شاهين': 'Dr. Ammar Shaheen',
    'د. طلب العجلوني': 'Dr. Talab Ajlouni',
    'د. عامر ابو رميلة': 'Dr. Amer Abu Rmeileh',
    'د. رضوان ابو كرش': 'Dr. Radwan Abu Karsh',
    'د. عبد الناصر الجنيدي': 'Dr. Abd Al-Nasser Junaidi',
    'د. عمار الحداد': 'Dr. Ammar Haddad',
    'د. عبيدالله أبي سنينة': 'Dr. Obaidallah Abu Sneineh',
    'د. عبيدالله ابو سنينة': 'Dr. Obaidallah Abu Sneineh',
    'د. تامر شاور': 'Dr. Tamer Shawar',
    'د. صفوت زيدات': 'Dr. Safwat Zeidat',
    'د. عمر ابو عليان': 'Dr. Omar Olayan',
    'د. عمر عليان': 'Dr. Omar Olayan',
    'د. روند العارضة': 'Dr. Rawad Arda',
    'د. رواد عارضة': 'Dr. Rawad Arda',
    'د. انس ابو رميلة': 'Dr. Anas Abu Rmeileh',
    'د. حسن الحروب': 'Dr. Hassan Haroub',
    'د. محمود الهور': 'Dr. Mahmoud Al-Hoor',
    'د. احمد عطاونة': 'Dr. Ahmad Atawneh',
    'د. أحمد العطاونة': 'Dr. Ahmad Atawneh',
    'د. هشام نصار': 'Dr. Hisham Nassar',
    'د. انس شاور': 'Dr. Anas Shawar',
    'د. رشاد الزرو': 'Dr. Rashad Zaro',
    'د. نزار حجة': 'Dr. Nizar Hijjeh',
    'د. هيام مرزوقة': 'Dr. Hiyam Marzouqa',
    'د. مهند أبوساكور': 'Dr. Mohannad Abu Sakour',
    'د. مهند ابوساكور': 'Dr. Mohannad Abu Sakour',
    'د. شريف حسان': 'Dr. Sharif Hassan',
    'د. أسامة كرجة': 'Dr. Osama Karjeh',
    'د. اسامة كرجة': 'Dr. Osama Karjeh',
    'د. آلاء عباس': 'Dr. Alaa Abbas',
    'د. الاء عباس': 'Dr. Alaa Abbas',
    'د. تامر مصلح': 'Dr. Tamer Musleh',
    'د. ممدوح دريدي': 'Dr. Mamdouh Draidi',
    'د. هشام ابو رميلة': 'Dr. Hisham Abu Rmeileh',
    'د. ضرار سميرات': 'Dr. Derar Smeirat',
    'د. ضرار الزعتري': 'Dr. Derar Zaatari',
    'د. فوزي ابونجمة': 'Dr. Fawzi Abu Najmeh',
    'د. علي أبورميش': 'Dr. Ali Abu Rmeish',
    'د. تامر قطينة': 'Dr. Tamer Qteineh',
    'د. نور الهدى صوالحة': 'Dr. Nour Al-Huda Sawalha',
    'د. مراد النتشة': 'Dr. Murad Natsheh',
    'د. عصام شماس': 'Dr. Issam Shammas',
    'د. محمد زهور': 'Dr. Mohammad Zhour',
    'د. احمد ابوشرخ': 'Dr. Ahmad Abu Sharakh',
    'د. سلامة المحتسب': 'Dr. Salameh Muhtaseb',
    'د. محمود قديمات': 'Dr. Mahmoud Qdeimat',
    'د. معتصم ادعيس': 'Dr. Moatasem Ideis',
    'د. زياد رمضان': 'Dr. Ziad Ramadan',
    'د. محمد الرجبي': 'Dr. Mohammad Rajabi',
    'د. يوسف الحروب': 'Dr. Yousef Haroub',
    'د. صابرين رجوب': 'Dr. Sabreen Rjoub',
    'د. رواد ابو ريان': 'Dr. Rawad Abu Rayyan',
    'د. سامي سويطي': 'Dr. Sami Sweiti',
  };

  // Localized Doctor Name Helper
  const getDoctorDisplayName = (doc: { doctorName?: string; doctorName_en?: string; name?: string; name_en?: string } | undefined) => {
    if (!doc) return '';
    const arName = (doc.doctorName || doc.name || '').trim();
    const enName = (doc.doctorName_en || doc.name_en || '').trim();
    if (locale === 'en') {
      if (enName) return enName;
      if (doctorTransliterationMap[arName]) return doctorTransliterationMap[arName];
      if (arName.startsWith('د.')) {
        return 'Dr. ' + arName.replace(/^د\.\s*/, '');
      }
      return arName;
    }
    return arName;
  };

  // Add Course Handler (Dropdown-based selection from DB)
  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDbCourseId) {
      alert(locale === 'ar' ? 'يرجى اختيار مساق من القائمة المنسدلة' : 'Please select a course from dropdown');
      return;
    }
    const found = availableDbCourses.find((c: any) => String(c.id) === selectedDbCourseId);
    if (!found) return;

    const newCourse: CourseSchedule = {
      courseCode: found.code,
      courseName: found.name_ar,
      courseName_en: found.name_en || undefined,
      weeksCount: courseFormWeeks || found.credit_hours || 12,
      doctors: []
    };
    const updated = [...courseSchedules, newCourse];
    saveCourseSchedules(updated);
    setSelectedCourseIndex(updated.length - 1);
    setSelectedDbCourseId('');
    setCourseFormName('');
    setCourseFormNameEn('');
    setCourseFormCode('');
    setCourseFormWeeks(12);
    setIsAddCourseModalOpen(false);
  };

  // Edit Course Handler
  const handleEditCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseFormName.trim()) return;
    const updated = [...courseSchedules];
    updated[selectedCourseIndex] = {
      ...updated[selectedCourseIndex],
      courseName: courseFormName.trim(),
      courseName_en: courseFormNameEn.trim() || undefined,
      courseCode: courseFormCode.trim() || updated[selectedCourseIndex].courseCode,
      weeksCount: courseFormWeeks || 12
    };
    saveCourseSchedules(updated);
    setIsEditCourseModalOpen(false);
  };

  // Delete Course Handler
  const handleDeleteCourse = (courseIdx: number) => {
    if (courseSchedules.length <= 1) {
      alert(locale === 'ar' ? 'لا يمكن حذف المساق الوحيد في الجدول' : 'Cannot delete the only course');
      return;
    }
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من حذف هذا المساق بالكامل من جدول الدورة السريرية؟' : 'Delete this course?')) {
      const updated = courseSchedules.filter((_, idx) => idx !== courseIdx);
      saveCourseSchedules(updated);
      setSelectedCourseIndex(0);
    }
  };

  // Helper to dynamically calculate Doctor Workload (Trimester weeks & Year weeks = Trimester * 3)
  const getDoctorWorkload = (doc: DoctorScheduleRow, weeksCount: number) => {
    if (doc.weeksTrimester === 'رئيس قسم' || doc.doctorName.includes('رئيس قسم')) {
      return { trimester: 'رئيس قسم', year: 'رئيس قسم' };
    }
    let activeWeeks = 0;
    for (let w = 1; w <= weeksCount; w++) {
      const val = doc.weeks[w];
      if (val && val.trim() !== '' && val !== '—' && val !== '-') {
        activeWeeks++;
      }
    }
    if (doc.weeksTrimester && (doc.weeksTrimester.includes('day') || doc.weeksTrimester.includes('يوم'))) {
      return { trimester: doc.weeksTrimester, year: doc.weeksYear || String(activeWeeks * 3) };
    }
    return {
      trimester: String(activeWeeks),
      year: String(activeWeeks * 3)
    };
  };

  // Update cell value & Auto-recalculate weeks
  const handleCellChange = (courseIdx: number, doctorId: string, weekNum: number, newValue: string) => {
    const updated = [...courseSchedules];
    const targetCourse = { ...updated[courseIdx] };
    targetCourse.doctors = targetCourse.doctors.map(doc => {
      if (doc.id === doctorId) {
        const updatedWeeks = {
          ...doc.weeks,
          [weekNum]: newValue
        };
        let activeWeeks = 0;
        for (let w = 1; w <= targetCourse.weeksCount; w++) {
          const val = updatedWeeks[w];
          if (val && val.trim() !== '' && val !== '—' && val !== '-') {
            activeWeeks++;
          }
        }
        const isHead = doc.weeksTrimester === 'رئيس قسم' || doc.doctorName.includes('رئيس قسم');
        const isDays = doc.weeksTrimester && (doc.weeksTrimester.includes('day') || doc.weeksTrimester.includes('يوم'));

        return {
          ...doc,
          weeks: updatedWeeks,
          weeksTrimester: isHead ? 'رئيس قسم' : isDays ? doc.weeksTrimester : String(activeWeeks),
          weeksYear: isHead ? 'رئيس قسم' : isDays ? doc.weeksYear : String(activeWeeks * 3)
        };
      }
      return doc;
    });
    updated[courseIdx] = targetCourse;
    saveCourseSchedules(updated);
  };

  // Helper to normalize Arabic names for matching
  const normalizeDocName = (name: string): string => {
    if (!name) return '';
    return name
      .replace(/^د\.\s*/, '')
      .replace(/^Dr\.\s*/i, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/عبد\s+الله/g, 'عبدالله')
      .replace(/ابو\s+/g, 'ابو')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  // Helper to auto-detect Doctor's Hospital from database
  const getDoctorHospital = (doctorName: string): string => {
    if (!doctorName) return '';
    const cleanName = normalizeDocName(doctorName);
    for (const hosp of hospitalGroups) {
      for (const doc of hosp.doctors) {
        const cleanDoc = normalizeDocName(doc.name);
        if (
          cleanDoc === cleanName || 
          cleanName.includes(cleanDoc) || 
          cleanDoc.includes(cleanName) ||
          (cleanName.split(' ')[0] && cleanDoc.split(' ')[0] === cleanName.split(' ')[0] && cleanName.split(' ')[0].length >= 3)
        ) {
          return hosp.name;
        }
      }
    }
    return '';
  };

  // Helper to re-map main group letters and subgroup codes (e.g. Q1 -> A1)
  const remapMainGroupsLetters = (existingGroups: MainGroup[], newLetters: [string, string, string]): MainGroup[] => {
    if (!existingGroups || existingGroups.length === 0) return [];
    return newLetters.map((newLetter, idx) => {
      const oldGroup = existingGroups[idx];
      if (!oldGroup) {
        return {
          letter: newLetter,
          name: locale === 'ar' ? `المجموعة (${newLetter})` : `Group (${newLetter})`,
          subgroups: []
        };
      }
      const updatedSubgroups = oldGroup.subgroups.map((sg, sgIdx) => {
        const newCode = `${newLetter}${sgIdx + 1}`;
        return {
          ...sg,
          id: newCode,
          code: newCode,
          mainGroupLetter: newLetter
        };
      });
      return {
        ...oldGroup,
        letter: newLetter,
        name: locale === 'ar' ? `المجموعة (${newLetter})` : `Group (${newLetter})`,
        subgroups: updatedSubgroups
      };
    });
  };

  // Save custom main group letters
  const handleSaveGroupLetters = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedLetters = {
      ...groupLetters,
      [levelFilter]: tempLetters
    };
    setGroupLetters(updatedLetters);
    try {
      localStorage.setItem('cdms_group_letters', JSON.stringify(updatedLetters));
    } catch (err) {}

    apiFetch('/operational/distribution-payload', {
      method: 'POST',
      body: { key: 'cdms_group_letters', payload: updatedLetters }
    });

    if (mainGroups && mainGroups.length > 0) {
      const remapped = remapMainGroupsLetters(mainGroups, tempLetters);
      setMainGroups(remapped);
      localStorage.setItem(`cdms_clinical_partition_${academicYear}_${levelFilter}`, JSON.stringify(remapped));
    } else if (studentsList.length > 0) {
      partitionStudents(studentsList, tempLetters, subgroupCapacity);
    }

    setIsEditLettersOpen(false);
  };

  // Add New Doctor Row to Course Matrix
  const handleAddDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDoctorName.trim()) return;

    const assignedHosp = newDoctorHospital.trim() || getDoctorHospital(newDoctorName.trim()) || 'م. الأهلي';
    const assignedHospEn = newDoctorHospitalEn.trim() || (hospitalTransliterationMap[assignedHosp] || undefined);

    const updated = [...courseSchedules];
    const targetCourse = { ...updated[selectedCourseIndex] };
    const newDoc: DoctorScheduleRow = {
      id: Date.now().toString(),
      doctorName: newDoctorName.trim(),
      doctorName_en: newDoctorNameEn.trim() || undefined,
      hospital: assignedHosp,
      hospital_en: assignedHospEn,
      department: newDoctorDepartment.trim() || (locale === 'ar' ? 'القسم السريري' : 'Clinical Dept'),
      department_en: newDoctorDepartmentEn.trim() || undefined,
      weeks: {}
    };
    targetCourse.doctors = [...targetCourse.doctors, newDoc];
    updated[selectedCourseIndex] = targetCourse;
    saveCourseSchedules(updated);

    // Auto-sync: ensure doctor exists in that hospital's group
    if (assignedHosp) {
      const hospExists = hospitalGroups.find(h => h.name === assignedHosp || h.name.includes(assignedHosp));
      if (hospExists) {
        const docInHosp = hospExists.doctors.some(d => normalizeDocName(d.name) === normalizeDocName(newDoctorName.trim()));
        if (!docInHosp) {
          const updatedHospGroups = hospitalGroups.map(h => {
            if (h.id === hospExists.id) {
              return {
                ...h,
                doctors: [...h.doctors, {
                  id: Date.now().toString(),
                  name: newDoctorName.trim(),
                  name_en: newDoctorNameEn.trim() || undefined
                }]
              };
            }
            return h;
          });
          saveHospitalGroups(updatedHospGroups);
        }
      }
    }

    setNewDoctorName('');
    setNewDoctorNameEn('');
    setNewDoctorDepartment('');
    setNewDoctorDepartmentEn('');
    setNewDoctorHospital('');
    setNewDoctorHospitalEn('');
    setIsAddDoctorModalOpen(false);
  };

  // Delete Doctor Row from Course Matrix
  const handleDeleteDoctor = (courseIdx: number, doctorId: string) => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من حذف هذا الطبيب من جدول المساق؟' : 'Delete doctor row?')) {
      const updated = [...courseSchedules];
      const targetCourse = { ...updated[courseIdx] };
      targetCourse.doctors = targetCourse.doctors.filter(d => d.id !== doctorId);
      updated[courseIdx] = targetCourse;
      saveCourseSchedules(updated);
    }
  };

  // Save Hospitals Directory
  const saveHospitalGroups = (updated: HospitalGroup[]) => {
    setHospitalGroups(updated);
    localStorage.setItem('cdms_hospital_doctors', JSON.stringify(updated));

    // Sync to MySQL Database & auto-register users/people/sites!
    apiFetch('/operational/distribution-payload', {
      method: 'POST',
      body: { key: 'cdms_hospital_doctors', payload: updated }
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['db-hospital-groups'] });
    }).catch(err => console.error('DB Sync Error:', err));
  };

  // Add Hospital Handler
  const handleAddHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHospitalName.trim()) return;
    const newHosp: HospitalGroup = {
      id: `h_${Date.now()}`,
      name: newHospitalName.trim(),
      name_en: newHospitalNameEn.trim() || undefined,
      doctors: []
    };
    saveHospitalGroups([...hospitalGroups, newHosp]);
    setNewHospitalName('');
    setNewHospitalNameEn('');
    setIsAddHospitalModalOpen(false);
  };

  // Delete Hospital Handler
  const handleDeleteHospital = (hospId: string) => {
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من حذف هذا المستشفى بجميع أطبائه؟' : 'Delete hospital?')) {
      saveHospitalGroups(hospitalGroups.filter(h => h.id !== hospId));
    }
  };

  // Add Doctor to Hospital Handler (with automatic User Account creation)
  const handleAddHospDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHospDocName.trim() || !targetHospId) return;

    // Auto-generate clean email if left empty by admin
    const emailToUse = newHospDocEmail.trim() || `doc.${Date.now()}@hebron.edu`;
    const passwordToUse = newHospDocPassword.trim() || 'password123';

    saveHospitalGroups(hospitalGroups.map(h => {
      if (h.id === targetHospId) {
        return {
          ...h,
          doctors: [...h.doctors, { 
            id: Date.now().toString(), 
            name: newHospDocName.trim(),
            name_en: newHospDocNameEn.trim() || undefined,
            specialty: newHospDocSpecialty.trim() || undefined,
            specialty_en: newHospDocSpecialtyEn.trim() || undefined,
            email: emailToUse,
            password: passwordToUse
          }]
        };
      }
      return h;
    }));

    setNewHospDocName('');
    setNewHospDocNameEn('');
    setNewHospDocSpecialty('');
    setNewHospDocSpecialtyEn('');
    setNewHospDocEmail('');
    setNewHospDocPassword('password123');
    setIsAddHospDocModalOpen(false);
  };

  // Delete Doctor from Hospital
  const handleDeleteHospDoctor = (hospId: string, docId: string) => {
    saveHospitalGroups(hospitalGroups.map(h => {
      if (h.id === hospId) {
        return {
          ...h,
          doctors: h.doctors.filter(d => d.id !== docId)
        };
      }
      return h;
    }));
  };

  // Edit Hospital Handler
  const handleEditHospital = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHospitalNameAr.trim() || !editingHospitalId) return;
    saveHospitalGroups(hospitalGroups.map(h => {
      if (h.id === editingHospitalId) {
        return {
          ...h,
          name: editHospitalNameAr.trim(),
          name_en: editHospitalNameEn.trim() || undefined
        };
      }
      return h;
    }));
    setIsEditHospitalModalOpen(false);
  };

  // Edit Doctor in Hospital Handler
  const handleEditHospDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editHospDocNameAr.trim() || !editingHospIdForDoc || !editingDocId) return;
    saveHospitalGroups(hospitalGroups.map(h => {
      if (h.id === editingHospIdForDoc) {
        return {
          ...h,
          doctors: h.doctors.map(d => {
            if (d.id === editingDocId) {
              return {
                ...d,
                name: editHospDocNameAr.trim(),
                name_en: editHospDocNameEn.trim() || undefined,
                specialty: editHospDocSpecialty.trim() || undefined,
                specialty_en: editHospDocSpecialtyEn.trim() || undefined
              };
            }
            return d;
          })
        };
      }
      return h;
    }));
    setIsEditHospDocModalOpen(false);
  };

  // Swap / Replace Doctor in Matrix Handler
  const handleSwapMatrixDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!swappingMatrixDocId || !selectedReplacementDoctorName) return;
    const matchedNewDoc = allHospitalDoctorsList.find((d: { docNameAr: string; docNameEn?: string; specialty?: string; specialtyEn?: string; hospNameAr: string; hospNameEn?: string }) => d.docNameAr === selectedReplacementDoctorName);
    if (!matchedNewDoc) return;

    const updated = [...courseSchedules];
    const targetCourse = { ...updated[selectedCourseIndex] };
    targetCourse.doctors = targetCourse.doctors.map(d => {
      if (d.id === swappingMatrixDocId) {
        return {
          ...d,
          doctorName: matchedNewDoc.docNameAr,
          doctorName_en: matchedNewDoc.docNameEn || undefined,
          hospital: matchedNewDoc.hospNameAr,
          hospital_en: matchedNewDoc.hospNameEn || undefined,
          specialty: matchedNewDoc.specialty,
          specialty_en: matchedNewDoc.specialtyEn,
        };
      }
      return d;
    });
    updated[selectedCourseIndex] = targetCourse;
    saveCourseSchedules(updated);
    setIsSwapDoctorModalOpen(false);
    setSwappingMatrixDocId('');
    setCurrentDocToSwap(null);
    setSelectedReplacementDoctorName('');
  };

  // Helper to save ExcelJS workbook in browser
  const saveExcelWorkbook = async (wb: ExcelJS.Workbook, fileName: string) => {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Hospitals Distribution to beautifully styled Excel (.xlsx)
  const handleExportHospitalsExcel = async () => {
    const isAr = locale === 'ar';
    const dateStr = new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalCols = Math.max(hospitalGroups.length * 2, 2);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(isAr ? 'المستشفيات' : 'Hospitals', {
      views: [{ rightToLeft: isAr }]
    });

    // Row 1: University Banner
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = isAr ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Row 2: Subtitle
    ws.mergeCells(2, 1, 2, totalCols);
    const subCell = ws.getCell(2, 1);
    subCell.value = isAr ? 'كشف توزيع الأطباء والمشرفين على المستشفيات التدريبية المعتمدة' : 'Clinical Training Hospitals & Supervisors Allocation';
    subCell.font = { name: 'Segoe UI', size: 12.5, bold: true, color: { argb: 'FFCCFBF1' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    // Row 3: Meta
    ws.mergeCells(3, 1, 3, totalCols);
    const metaCell = ws.getCell(3, 1);
    metaCell.value = isAr ? `تاريخ الإصدار: ${dateStr}` : `Issue Date: ${dateStr}`;
    metaCell.font = { name: 'Segoe UI', size: 10, bold: false, color: { argb: 'FF475569' } };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

    // Row 4: Blank
    ws.getRow(4).height = 10;

    // Row 5: Hospital Headers
    ws.getRow(5).height = 30;
    hospitalGroups.forEach((h, hIdx) => {
      const colNum = hIdx * 2 + 1;
      
      // No. header
      const noCell = ws.getCell(5, colNum);
      noCell.value = isAr ? 'الرقم' : 'No.';
      noCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      noCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      noCell.alignment = { horizontal: 'center', vertical: 'middle' };
      noCell.border = {
        top: { style: 'medium', color: { argb: 'FF0F766E' } },
        bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FF0F766E' } },
        right: { style: 'thin', color: { argb: 'FF0F766E' } },
      };

      // Hospital Name header
      const nameCell = ws.getCell(5, colNum + 1);
      nameCell.value = isAr ? h.name : (h.name_en || getLocalizedHospitalName(h.name));
      nameCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
      nameCell.border = {
        top: { style: 'medium', color: { argb: 'FF0F766E' } },
        bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FF0F766E' } },
        right: { style: 'thin', color: { argb: 'FF0F766E' } },
      };

      ws.getColumn(colNum).width = 7;
      ws.getColumn(colNum + 1).width = 28;
    });

    // Rows 6+: Doctors
    let maxDocs = 0;
    hospitalGroups.forEach(h => {
      if (h.doctors.length > maxDocs) maxDocs = h.doctors.length;
    });

    for (let r = 0; r < maxDocs; r++) {
      const rowNum = 6 + r;
      const isEven = r % 2 === 0;
      ws.getRow(rowNum).height = 24;

      hospitalGroups.forEach((h, hIdx) => {
        const colNum = hIdx * 2 + 1;
        const doc = h.doctors[r];

        const noCell = ws.getCell(rowNum, colNum);
        const nameCell = ws.getCell(rowNum, colNum + 1);

        if (doc) {
          noCell.value = r + 1;
          noCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF64748B' } };
          noCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          noCell.alignment = { horizontal: 'center', vertical: 'middle' };

          nameCell.value = doc.specialty ? `${getDoctorDisplayName(doc)} (${doc.specialty})` : getDoctorDisplayName(doc);
          nameCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
          nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
          nameCell.alignment = { horizontal: isAr ? 'right' : 'left', vertical: 'middle', indent: 1 };
        } else {
          noCell.value = '';
          noCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          nameCell.value = '';
          nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        }

        const borderStyle = {
          top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        };
        noCell.border = borderStyle;
        nameCell.border = borderStyle;
      });
    }

    const fileName = isAr 
      ? `كشف_توزيع_الأطباء_على_المستشفيات_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Clinical_Hospitals_Distribution_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await saveExcelWorkbook(wb, fileName);
  };

  // Export Matrix Table to beautifully styled Excel (.xlsx)
  const handleExportMatrixExcel = async () => {
    const isAr = locale === 'ar';
    const currentCourse = courseSchedules[selectedCourseIndex] || courseSchedules[0];
    const levelName = getLevelName(levelFilter);
    const dateStr = new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalCols = 4 + currentCourse.weeksCount;

    const wb = new ExcelJS.Workbook();
    const sheetName = (currentCourse.courseCode || 'Schedule').slice(0, 31);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ rightToLeft: isAr }]
    });

    // Row 1: University Banner
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = isAr ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Row 2: Course & Year
    ws.mergeCells(2, 1, 2, totalCols);
    const subCell = ws.getCell(2, 1);
    subCell.value = `${getLocalizedCourseTitle(currentCourse)} — (${isAr ? `العام الأكاديمي ${academicYear}` : `Academic Year ${academicYear}`})`;
    subCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFCCFBF1' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    // Row 3: Meta
    ws.mergeCells(3, 1, 3, totalCols);
    const metaCell = ws.getCell(3, 1);
    metaCell.value = isAr ? `المستوى: ${levelName} • تاريخ الإصدار: ${dateStr}` : `Level: ${levelName} • Issue Date: ${dateStr}`;
    metaCell.font = { name: 'Segoe UI', size: 10.5, bold: false, color: { argb: 'FF475569' } };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

    // Row 4: Blank
    ws.getRow(4).height = 10;

    // Row 5: Column Headers
    ws.getRow(5).height = 32;
    const headerTitles: string[] = [
      isAr ? 'الأطباء والمشرفون' : 'Doctor / Supervisor',
      isAr ? 'المستشفى' : 'Hospital',
      isAr ? 'أسابيع الفصل' : 'Trimester',
      isAr ? 'الأسابيع سنوياً' : 'Year Total',
    ];

    for (let w = 1; w <= currentCourse.weeksCount; w++) {
      const wDate = currentCourse.weekDates?.[w - 1] ? `\n(${currentCourse.weekDates[w - 1]})` : '';
      headerTitles.push(`Week ${w}${wDate}`);
    }

    const colWidths = [28, 22, 14, 14];
    for (let w = 1; w <= currentCourse.weeksCount; w++) {
      colWidths.push(14);
    }

    headerTitles.forEach((title, idx) => {
      const colNum = idx + 1;
      const cell = ws.getCell(5, colNum);
      cell.value = title;
      cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F766E' } },
        bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
        left: { style: 'thin', color: { argb: 'FF0F766E' } },
        right: { style: 'thin', color: { argb: 'FF0F766E' } },
      };
      ws.getColumn(colNum).width = colWidths[idx];
    });

    // Rows 6+: Doctors
    currentCourse.doctors.forEach((doc, dIdx) => {
      const rowNum = 6 + dIdx;
      const isEven = dIdx % 2 === 0;
      ws.getRow(rowNum).height = 26;

      const borderStyle = {
        top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      };

      // Col 1: Doctor
      const docCell = ws.getCell(rowNum, 1);
      docCell.value = getDoctorDisplayName(doc);
      docCell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      docCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      docCell.alignment = { horizontal: isAr ? 'right' : 'left', vertical: 'middle', indent: 1 };
      docCell.border = borderStyle;

      // Col 2: Hospital
      const hospCell = ws.getCell(rowNum, 2);
      hospCell.value = getLocalizedHospitalName(doc.hospital || getDoctorHospital(doc.doctorName), doc.hospital_en);
      hospCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
      hospCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      hospCell.alignment = { horizontal: 'center', vertical: 'middle' };
      hospCell.border = borderStyle;

      // Col 3: Trimester Workload
      const trimCell = ws.getCell(rowNum, 3);
      const trimVal = getDoctorWorkload(doc, currentCourse.weeksCount).trimester;
      trimCell.value = Number(trimVal) || trimVal;
      trimCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: trimVal === '12' ? 'FF047857' : 'FF334155' } };
      trimCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: trimVal === '12' ? 'FFECFDF5' : 'FFF8FAFC' } };
      trimCell.alignment = { horizontal: 'center', vertical: 'middle' };
      trimCell.border = borderStyle;

      // Col 4: Year Workload
      const yearCell = ws.getCell(rowNum, 4);
      const yearVal = getDoctorWorkload(doc, currentCourse.weeksCount).year;
      yearCell.value = Number(yearVal) || yearVal;
      yearCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F766E' } };
      yearCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
      yearCell.alignment = { horizontal: 'center', vertical: 'middle' };
      yearCell.border = borderStyle;

      // Col 5+: Weeks
      for (let w = 1; w <= currentCourse.weeksCount; w++) {
        const weekCell = ws.getCell(rowNum, 4 + w);
        const val = doc.weeks[w] || '';
        const isFilled = Boolean(val);
        const isLecture = val.toLowerCase().includes('lecture');
        const isGyneBlue = doc.department?.includes('نسائية') && isFilled && (w >= 7 || val.startsWith('Q1') || val.startsWith('R1') || val.startsWith('S1') || val.startsWith('Q2') || val.startsWith('Q3') || val.startsWith('Q4'));

        weekCell.value = val || '—';
        weekCell.border = borderStyle;
        weekCell.alignment = { horizontal: 'center', vertical: 'middle' };

        if (isLecture) {
          weekCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF92400E' } };
          weekCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber
        } else if (isGyneBlue) {
          weekCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E40AF' } };
          weekCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // Blue
        } else if (isFilled) {
          weekCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF831843' } };
          weekCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE7F3' } }; // Pink
        } else {
          weekCell.font = { name: 'Segoe UI', size: 10, bold: false, color: { argb: 'FF94A3B8' } };
          weekCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
        }
      }
    });

    const fileName = `${currentCourse.courseCode}_${levelFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    await saveExcelWorkbook(wb, fileName);
  };

  // Export Student Partition to beautifully styled Excel (.xlsx)
  const handleExportStudentsPartitionExcel = async () => {
    const isAr = locale === 'ar';
    const levelName = getLevelName(levelFilter);
    const dateStr = new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalCols = 6;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(isAr ? 'توزيع_الطلبة' : 'Students_Partition', {
      views: [{ rightToLeft: isAr }]
    });

    // Row 1: University Banner
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = isAr ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine';
    titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Row 2: Subtitle
    ws.mergeCells(2, 1, 2, totalCols);
    const subCell = ws.getCell(2, 1);
    subCell.value = isAr ? `توزيع وتقسيم طلبة التدريب السريري — ${levelName}` : `Clinical Students Subgroups Partition — ${levelName}`;
    subCell.font = { name: 'Segoe UI', size: 12.5, bold: true, color: { argb: 'FFCCFBF1' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    // Row 3: Meta
    ws.mergeCells(3, 1, 3, totalCols);
    const metaCell = ws.getCell(3, 1);
    metaCell.value = isAr ? `العام الدراسي: ${academicYear} • تاريخ الإصدار: ${dateStr}` : `Academic Year: ${academicYear} • Issue Date: ${dateStr}`;
    metaCell.font = { name: 'Segoe UI', size: 10, bold: false, color: { argb: 'FF475569' } };
    metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 22;

    // Row 4: Blank
    ws.getRow(4).height = 10;

    // Row 5: Column Headers
    ws.getRow(5).height = 30;
    const headers = [
      isAr ? 'الرقم الجامعي' : 'University ID',
      isAr ? 'اسم الطالب (عربي)' : 'Student Name (Arabic)',
      isAr ? 'اسم الطالب (إنجليزي)' : 'Student Name (English)',
      isAr ? 'المجموعة الرئيسية' : 'Main Group',
      isAr ? 'المجموعة الفرعية' : 'Subgroup',
      isAr ? 'المدينة' : 'City'
    ];
    const widths = [18, 28, 28, 20, 16, 18];

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

    let currentStudentRow = 6;
    const borderStyle = {
      top: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin' as const, color: { argb: 'FFCBD5E1' } },
    };

    mainGroups.forEach(mg => {
      mg.subgroups.forEach(sg => {
        sg.students.forEach((st, sIdx) => {
          const rowNum = currentStudentRow++;
          const isEven = sIdx % 2 === 0;
          ws.getRow(rowNum).height = 24;

          const idCell = ws.getCell(rowNum, 1);
          idCell.value = st.university_number;
          idCell.font = { name: 'Consolas', size: 10.5, bold: true, color: { argb: 'FF475569' } };
          idCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          idCell.alignment = { horizontal: 'center', vertical: 'middle' };
          idCell.border = borderStyle;

          const arNameCell = ws.getCell(rowNum, 2);
          arNameCell.value = st.full_name_ar;
          arNameCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
          arNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
          arNameCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
          arNameCell.border = borderStyle;

          const enNameCell = ws.getCell(rowNum, 3);
          enNameCell.value = st.full_name_en || '';
          enNameCell.font = { name: 'Segoe UI', size: 10.5, bold: false, color: { argb: 'FF334155' } };
          enNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
          enNameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
          enNameCell.border = borderStyle;

          const mgCell = ws.getCell(rowNum, 4);
          mgCell.value = mg.name;
          mgCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F766E' } };
          mgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
          mgCell.alignment = { horizontal: 'center', vertical: 'middle' };
          mgCell.border = borderStyle;

          const sgCell = ws.getCell(rowNum, 5);
          sgCell.value = sg.code;
          sgCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF047857' } };
          sgCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
          sgCell.alignment = { horizontal: 'center', vertical: 'middle' };
          sgCell.border = borderStyle;

          const cityCell = ws.getCell(rowNum, 6);
          cityCell.value = st.city || '—';
          cityCell.font = { name: 'Segoe UI', size: 10, bold: false, color: { argb: 'FF64748B' } };
          cityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
          cityCell.alignment = { horizontal: 'center', vertical: 'middle' };
          cityCell.border = borderStyle;
        });
      });
    });

    const fileName = isAr
      ? `توزيع_طلبة_${levelFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `Students_Partition_${levelFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    await saveExcelWorkbook(wb, fileName);
  };

  // Fetch real students from API
  const { data: studentsResponse } = useQuery({
    queryKey: ['students-level', levelFilter],
    queryFn: () => apiFetch<any>(`/students?academic_level=${levelFilter}&per_page=300`),
  });

  const studentsList: StudentItem[] = Array.isArray(studentsResponse) 
    ? studentsResponse 
    : studentsResponse?.data || studentsResponse?.items || [];

  // Partitioned Groups State
  const [mainGroups, setMainGroups] = useState<MainGroup[]>([]);

  // Function to partition students into 3 main groups and then subgroups of 5-6 students
  const partitionStudents = (students: StudentItem[], letters: [string, string, string], targetCap: number) => {
    if (!students || students.length === 0) {
      setMainGroups([]);
      return;
    }

    const totalStudents = students.length;
    const chunk1Size = Math.ceil(totalStudents / 3);
    const chunk2Size = Math.ceil((totalStudents - chunk1Size) / 2);
    
    const chunk1 = students.slice(0, chunk1Size);
    const chunk2 = students.slice(chunk1Size, chunk1Size + chunk2Size);
    const chunk3 = students.slice(chunk1Size + chunk2Size);

    const chunks = [chunk1, chunk2, chunk3];

    const result: MainGroup[] = letters.map((letter, idx) => {
      const groupStudents = chunks[idx] || [];
      const subgroups: Subgroup[] = [];
      const numSubgroups = Math.ceil(groupStudents.length / targetCap) || 1;
      
      for (let i = 0; i < numSubgroups; i++) {
        const start = i * targetCap;
        const end = start + targetCap;
        const subStudents = groupStudents.slice(start, end);
        subgroups.push({
          id: `${letter}${i + 1}`,
          code: `${letter}${i + 1}`,
          mainGroupLetter: letter,
          students: subStudents,
          capacity: targetCap,
        });
      }

      return {
        letter: letter,
        name: locale === 'ar' ? `المجموعة (${letter})` : `Group (${letter})`,
        subgroups: subgroups,
      };
    });

    setMainGroups(result);
    localStorage.setItem(`cdms_clinical_partition_${academicYear}_${levelFilter}`, JSON.stringify(result));
  };

  // Create empty subgroups for RTA cohort preparation
  const prepareEmptySubgroupsForCohort = (letters: [string, string, string] = groupLetters[levelFilter] || ['A', 'B', 'C'], cap: number = subgroupCapacity) => {
    const emptyResult: MainGroup[] = letters.map((letter) => ({
      letter: letter,
      name: locale === 'ar' ? `المجموعة (${letter})` : `Group (${letter})`,
      subgroups: [
        { id: `${letter}1`, code: `${letter}1`, mainGroupLetter: letter, students: [], capacity: cap },
        { id: `${letter}2`, code: `${letter}2`, mainGroupLetter: letter, students: [], capacity: cap },
      ]
    }));

    setMainGroups(emptyResult);
    localStorage.setItem(`cdms_clinical_partition_${academicYear}_${levelFilter}`, JSON.stringify(emptyResult));
  };

  useEffect(() => {
    const currentLetters = groupLetters[levelFilter] || ['A', 'B', 'C'];
    setTempLetters(currentLetters);
    
    // Clear old cohort groups first to prevent cross-cohort leakage
    setMainGroups([]);

    const saved = localStorage.getItem(`cdms_clinical_partition_${academicYear}_${levelFilter}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const remapped = remapMainGroupsLetters(parsed, currentLetters);
          setMainGroups(remapped);
          return;
        }
      } catch (e) {
        // fallback
      }
    }

    if (studentsList.length > 0) {
      partitionStudents(studentsList, currentLetters, subgroupCapacity);
    } else {
      // Default RTA prepared empty subgroups for this cohort
      prepareEmptySubgroupsForCohort(currentLetters, subgroupCapacity);
    }
  }, [levelFilter, subgroupCapacity, academicYear, groupLetters]);

  const saveCurrentPartition = (updatedGroups: MainGroup[]) => {
    setMainGroups(updatedGroups);
    localStorage.setItem(`cdms_clinical_partition_${academicYear}_${levelFilter}`, JSON.stringify(updatedGroups));
  };

  const handleConfirmMove = () => {
    if (!moveStudent || !targetSubgroupForMove) return;

    const updated = mainGroups.map((mg) => ({
      ...mg,
      subgroups: mg.subgroups.map((sg) => {
        if (sg.code === moveStudent.fromSubgroup) {
          return {
            ...sg,
            students: sg.students.filter((s) => s.id !== moveStudent.student.id),
          };
        }
        if (sg.code === targetSubgroupForMove) {
          return {
            ...sg,
            students: [...sg.students, moveStudent.student],
          };
        }
        return sg;
      }),
    }));

    saveCurrentPartition(updated);
    setMoveStudent(null);
    setTargetSubgroupForMove('');
  };

  const handleExecuteSwap = (targetStudent: StudentItem, targetSubgroupCode: string) => {
    if (!swapStudent) return;

    const updated = mainGroups.map((mg) => ({
      ...mg,
      subgroups: mg.subgroups.map((sg) => {
        if (sg.code === swapStudent.fromSubgroup) {
          return {
            ...sg,
            students: sg.students.map((s) => (s.id === swapStudent.student.id ? targetStudent : s)),
          };
        }
        if (sg.code === targetSubgroupCode) {
          return {
            ...sg,
            students: sg.students.map((s) => (s.id === targetStudent.id ? swapStudent.student : s)),
          };
        }
        return sg;
      }),
    }));

    saveCurrentPartition(updated);
    setSwapStudent(null);
  };

  const handleSaveLetters = (e: React.FormEvent) => {
    e.preventDefault();
    const newLetters: [string, string, string] = [
      tempLetters[0].trim().toUpperCase() || 'A',
      tempLetters[1].trim().toUpperCase() || 'B',
      tempLetters[2].trim().toUpperCase() || 'C',
    ];

    setGroupLetters((prev) => ({
      ...prev,
      [levelFilter]: newLetters,
    }));

    setIsEditLettersOpen(false);
    partitionStudents(studentsList, newLetters, subgroupCapacity);
  };

  const getLevelName = (lvl: string) => {
    if (lvl === 'fourth') return locale === 'ar' ? 'سنة رابعة' : '4th Year';
    if (lvl === 'fifth') return locale === 'ar' ? 'سنة خامسة' : '5th Year';
    if (lvl === 'sixth') return locale === 'ar' ? 'سنة سادسة' : '6th Year';
    return lvl;
  };

  const cohorts = [
    { value: 'fourth', label_ar: 'الدفعة الرابعة (سنة 4)', label_en: '4th Year' },
    { value: 'fifth', label_ar: 'الدفعة الخامسة (سنة 5)', label_en: '5th Year' },
    { value: 'sixth', label_ar: 'الدفعة السادسة (سنة 6)', label_en: '6th Year' },
  ];

  const allSubgroupsList = mainGroups.flatMap((mg) => mg.subgroups);
  const totalAssigned = mainGroups.reduce((acc, mg) => acc + mg.subgroups.reduce((sAcc, sg) => sAcc + sg.students.length, 0), 0);

  const activeCourse = courseSchedules[selectedCourseIndex] || courseSchedules[0];

  const allHospitalDoctorsList = useMemo(() => {
    const list: {
      id: string;
      docNameAr: string;
      docNameEn?: string;
      specialty?: string;
      specialtyEn?: string;
      hospId: string;
      hospNameAr: string;
      hospNameEn?: string;
    }[] = [];
    hospitalGroups.forEach(h => {
      h.doctors.forEach(d => {
        list.push({
          id: `${h.id}_${d.id}`,
          docNameAr: d.name,
          docNameEn: d.name_en,
          specialty: d.specialty,
          specialtyEn: d.specialty_en,
          hospId: h.id,
          hospNameAr: h.name,
          hospNameEn: h.name_en
        });
      });
    });
    return list;
  }, [hospitalGroups]);

  if (isSupervisorOnly) {
    return (
      <div className="mx-auto max-w-[650px] py-16 text-center space-y-5">
        <div className="w-16 h-16 bg-teal-50 text-teal-700 rounded-3xl border border-teal-200 flex items-center justify-center mx-auto shadow-2xs">
          <Building2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">
          {locale === 'ar' ? 'جدول التوزيع العام مخصص لإدارة الكلية ومدير الدائرة' : 'Full Distribution View Restricted'}
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          {locale === 'ar' 
            ? 'مرحباً دكتور، إدارة برنامج التوزيع الكلي لجميع الأطباء والمجموعات السريرية مخصصة لمدير الدائرة وإدارة الكلية. بصفتك مشرفاً سريرياً، يمكنك الاطلاع حصراً على المجموعات والأسابيع والطلاب المكلف بهم من خلال البوابة المخصصة لك.'
            : 'As a Clinical Supervisor, your assigned groups, students, and rotation weeks are available in your Supervisor Portal.'}
        </p>
        <div className="pt-2">
          <a
            href="/supervisor/portal"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black transition-all shadow-sm shadow-teal-600/25"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>{locale === 'ar' ? 'الذهاب إلى مجموعاتي والطلاب والأسابيع' : 'Go to My Groups & Students'}</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20">
      
      {/* 1. Universal Clean Header & Academic Year Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
              {locale === 'ar' ? 'التوزيع والتدوير السريري' : 'Clinical Rotations & Subgroups'}
            </h1>
            <span className="bg-teal-50 text-teal-800 text-xs font-black px-2.5 py-1 rounded-xl border border-teal-200">
              {academicYear}
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {locale === 'ar' 
              ? `إدارة وتخطيط تدوير المجموعات الطلابية على الأطباء والمشرفين لجميع السنوات الأكاديمية` 
              : `Manage and plan clinical rotation schedules for all academic years`}
          </p>
        </div>

        {/* Global Controls: Academic Year & Level */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Academic Year Dropdown */}
          <div className="flex items-center bg-white rounded-2xl border border-slate-200 p-1 shadow-2xs gap-1">
            <Calendar className="w-4 h-4 text-teal-600 mr-2 ml-1" />
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 border-none focus:ring-0 cursor-pointer py-1 px-1"
            >
              {academicYears.map((yr) => (
                <option key={yr} value={yr}>{locale === 'ar' ? `العام: ${yr}` : `Year: ${yr}`}</option>
              ))}
            </select>
            
            <button
              type="button"
              onClick={() => setIsAddYearModalOpen(true)}
              className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-teal-50 hover:text-teal-700 text-slate-600 flex items-center justify-center transition-colors text-xs font-bold"
              title={locale === 'ar' ? 'إضافة عام دراسي جديد' : 'Add New Academic Year'}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {academicYears.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteYear(academicYear)}
                className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-400 flex items-center justify-center transition-colors"
                title={locale === 'ar' ? 'حذف هذا العام الدراسي' : 'Delete academic year'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Level Switcher (4th, 5th, 6th) */}
          <div className="flex bg-slate-100/90 p-1 rounded-2xl gap-1 border border-slate-200/60">
            {cohorts.map((c) => (
              <button
                key={c.value}
                onClick={() => setLevelFilter(c.value)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  levelFilter === c.value
                    ? 'bg-white text-teal-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {locale === 'ar' ? (c.value === 'fourth' ? 'السنة 4' : c.value === 'fifth' ? 'السنة 5' : 'السنة 6') : c.label_en}
              </button>
            ))}
          </div>

          {/* Share Public Student Lookup Link Button */}
          <button
            type="button"
            onClick={() => {
              setIsShareModalOpen(true);
              setIsCopied(false);
            }}
            className="px-3.5 py-2 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-teal-600/25 transition-all"
            title={locale === 'ar' ? 'مشاركة جدول التوزيع مع الطلاب' : 'Share Student Schedule Link'}
          >
            <Share2 className="w-4 h-4" />
            <span>{locale === 'ar' ? 'مشاركة مع الطلاب' : 'Share Link'}</span>
          </button>

        </div>
      </div>

      {/* 2. Primary Mode Switcher */}
      <div className="flex bg-slate-100/90 p-1.5 rounded-2xl gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveMainView('rotation_matrix')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
            activeMainView === 'rotation_matrix' 
              ? 'bg-white text-slate-900 shadow-sm font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className={`w-4 h-4 ${activeMainView === 'rotation_matrix' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span>{locale === 'ar' ? 'جدول تدوير الأطباء' : 'Doctor Rotations'}</span>
        </button>

        <button
          onClick={() => setActiveMainView('partition')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
            activeMainView === 'partition' 
              ? 'bg-white text-slate-900 shadow-sm font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className={`w-4 h-4 ${activeMainView === 'partition' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span>{locale === 'ar' ? 'توزيع مجموعات الطلبة' : 'Student Subgroups'}</span>
          <span className="px-2 py-0.5 rounded-md text-[11px] bg-slate-200/60 text-slate-700 font-bold">{totalAssigned || studentsList.length}</span>
        </button>

        <button
          onClick={() => setActiveMainView('hospitals')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
            activeMainView === 'hospitals' 
              ? 'bg-white text-slate-900 shadow-sm font-bold' 
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className={`w-4 h-4 ${activeMainView === 'hospitals' ? 'text-teal-600' : 'text-slate-400'}`} />
          <span>{locale === 'ar' ? 'مستشفيات التدريب السريري' : 'Training Hospitals'}</span>
          <span className="px-2 py-0.5 rounded-md text-[11px] bg-teal-100 text-teal-800 font-bold">{hospitalGroups.length}</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: EDITABLE DOCTORS ROTATION MATRIX (LIKE EXCEL) */}
      {/* ========================================================================= */}
      {activeMainView === 'rotation_matrix' && (
        <div className="space-y-4">
          
          {/* If no courses yet for this year and level */}
          {courseSchedules.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-4 shadow-sm">
              <div className="w-14 h-14 rounded-3xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto border border-teal-100 shadow-xs">
                <Calendar className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="font-black text-slate-800 text-sm sm:text-base">
                  {locale === 'ar' ? `لا توجد مساقات مضافة لـ (${getLevelName(levelFilter)}) في العام (${academicYear})` : `No courses yet for ${academicYear}`}
                </h3>
                <p className="text-xs text-slate-500">
                  {locale === 'ar' ? 'هذا العام الدراسي جديد. يمكنك بدء إضافة مساق جديد فارغ أو استيراد القالب النموذجي للكلية.' : 'This academic year is fresh. You can add a new course or import the faculty template.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCourseModalOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-teal-500/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>{locale === 'ar' ? 'إنشاء مساق سريري جديد' : 'Create Course'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleImportTemplate}
                  className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-2 border border-slate-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-teal-600" />
                  <span>{locale === 'ar' ? 'استيراد القالب النموذجي للكلية' : 'Import Faculty Template'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Courses Control & Selector Toolbar */}
              <div className="bg-white p-3 rounded-3xl shadow-sm border border-slate-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-teal-600" />
                      {locale === 'ar' ? 'المساقات السريرية المدرجة:' : 'Clinical Courses:'}
                    </span>
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-lg border border-teal-100">
                      {courseSchedules.length}
                    </span>
                  </div>

                  {/* Course Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsAddCourseModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-teal-200"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{locale === 'ar' ? 'مساق جديد' : 'New Course'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCourseFormName(activeCourse.courseName);
                        setCourseFormNameEn(activeCourse.courseName_en || '');
                        setCourseFormCode(activeCourse.courseCode);
                        setCourseFormWeeks(activeCourse.weeksCount);
                        setIsEditCourseModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>{locale === 'ar' ? 'تعديل المساق' : 'Edit'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCourse(selectedCourseIndex)}
                      className="p-1.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
                      title={locale === 'ar' ? 'حذف هذا المساق' : 'Delete course'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="w-[1px] h-4 bg-slate-200 mx-1" />

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(locale === 'ar' ? 'استعادة القالب النموذجي الافتراضي للكلية؟' : 'Reset to default template?')) {
                          handleImportTemplate();
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-bold flex items-center gap-1 transition-colors"
                      title={locale === 'ar' ? 'استعادة القالب النموذجي' : 'Reset'}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{locale === 'ar' ? 'قالب الكلية' : 'Template'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleClearAllDistributionData}
                      className="px-2.5 py-1.5 rounded-xl text-red-600 hover:bg-red-50 text-xs font-bold flex items-center gap-1 transition-colors border border-red-200"
                      title={locale === 'ar' ? 'حذف كافة المساقات والتوزيع كلياً لجميع الدفعات' : 'Delete all courses & distribution'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{locale === 'ar' ? 'تفريغ وحذف الكل' : 'Clear All'}</span>
                    </button>
                  </div>
                </div>

                {/* Courses Chips */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {courseSchedules.map((course, cIdx) => (
                    <button
                      key={course.courseCode}
                      onClick={() => setSelectedCourseIndex(cIdx)}
                      className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                        selectedCourseIndex === cIdx
                          ? 'bg-teal-50 text-teal-800 border-2 border-teal-500 shadow-xs'
                          : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <span className="font-mono text-[11px] text-teal-700 bg-white px-1.5 py-0.5 rounded border border-teal-200">{course.courseCode}</span>
                      <span className="truncate max-w-[200px] sm:max-w-none">{getLocalizedCourseTitle(course)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Editable Excel Matrix Table */}
              {activeCourse && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-4 sm:p-6 space-y-4">
            
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>{getLocalizedCourseTitle(activeCourse)}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {locale === 'ar' ? '💡 انقر على أي خلية، اسم طبيب، أو قسم لتعديل القيمة مباشرة كما في الإكسيل.' : '💡 Click any cell, doctor name, or department to edit directly like Excel.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddDoctorModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>{locale === 'ar' ? 'إضافة طبيب' : 'Add Doctor'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportMatrixExcel}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-slate-200"
                >
                  <Download className="w-4 h-4 text-teal-600" />
                  <span>{locale === 'ar' ? 'تصدير Excel' : 'Export Excel'}</span>
                </button>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 -mx-1 sm:mx-0">
              <table className="w-full text-xs text-start border-collapse">
                
                {/* Table Header: Weeks & Dates */}
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className={`p-3 text-start min-w-[170px] border-r border-slate-200 bg-slate-100 sticky ${locale === 'ar' ? 'right-0' : 'left-0'} z-10 shadow-2xs`}>
                      {locale === 'ar' ? 'الأخصائي / الطبيب المشرف' : 'Doctor / Supervisor'}
                    </th>
                    <th className="p-2.5 text-center min-w-[120px] border-r border-slate-200 text-[11px] bg-slate-50">
                      {locale === 'ar' ? 'المستشفى' : 'Hospital'}
                    </th>
                    <th className="p-2 text-center w-20 border-r border-slate-200 text-[11px]">
                      {locale === 'ar' ? 'أسابيع الفصل' : 'Trimester'}
                    </th>
                    <th className="p-2 text-center w-20 border-r border-slate-200 text-[11px]">
                      {locale === 'ar' ? 'المجموع السنوي' : 'Year'}
                    </th>

                    {Array.from({ length: activeCourse.weeksCount }, (_, i) => i + 1).map((weekNum) => {
                      const dateSubtitle = activeCourse.weekDates?.[weekNum - 1];
                      return (
                        <th key={weekNum} className="p-2.5 text-center min-w-[80px] border-r border-slate-200">
                          <div className="font-black text-slate-800">Week {weekNum}</div>
                          {dateSubtitle && (
                            <div className="text-[9.5px] text-slate-500 font-normal mt-0.5 whitespace-nowrap">
                              {dateSubtitle}
                            </div>
                          )}
                        </th>
                      );
                    })}

                    <th className="p-2 text-center w-12">{locale === 'ar' ? 'إجراء' : ''}</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-slate-200 bg-white">
                  {activeCourse.doctors.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                      
                      {/* Doctor Name Column (Bilingual Display + Modal Edit) */}
                      <td className={`p-2 font-bold text-slate-800 border-r border-slate-200 bg-white sticky ${locale === 'ar' ? 'right-0' : 'left-0'} z-10 shadow-2xs`}>
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSwappingMatrixDocId(doc.id);
                              setCurrentDocToSwap(doc);
                              setSelectedReplacementDoctorName('');
                              setIsSwapDoctorModalOpen(true);
                            }}
                            className="text-start hover:text-teal-700 transition-colors flex-1 min-w-0 cursor-pointer"
                            title={locale === 'ar' ? 'انقر لتبديل الطبيب بطبيب آخر من دليل المستشفيات' : 'Click to swap doctor'}
                          >
                            <span className="block font-bold text-xs truncate">
                              {locale === 'en' ? (doc.doctorName_en || getDoctorDisplayName(doc)) : doc.doctorName}
                            </span>
                            {locale === 'ar' && doc.doctorName_en && (
                              <span className="block text-[10px] text-slate-400 font-mono truncate">
                                {doc.doctorName_en}
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSwappingMatrixDocId(doc.id);
                              setCurrentDocToSwap(doc);
                              setSelectedReplacementDoctorName('');
                              setIsSwapDoctorModalOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/80 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                            title={locale === 'ar' ? 'تبديل هذا الطبيب بطبيب آخر' : 'Swap Doctor'}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-teal-600" />
                            <span className="text-[10px] font-black">{locale === 'ar' ? 'تبديل' : 'Swap'}</span>
                          </button>
                        </div>
                      </td>

                      {/* Hospital (Directly Localized or Auto-detected) */}
                      <td className="p-1.5 border-r border-slate-200 text-center bg-slate-50/20">
                        <span className="font-bold text-[10.5px] text-blue-800 block truncate max-w-[120px] mx-auto" title={getLocalizedHospitalName(doc.hospital || getDoctorHospital(doc.doctorName))}>
                          {getLocalizedHospitalName(doc.hospital || getDoctorHospital(doc.doctorName))}
                        </span>
                      </td>

                      {/* Weeks in Trimester (Auto-Calculated live) */}
                      <td className="p-2 text-center border-r border-slate-200 font-mono font-bold text-xs bg-slate-50/30">
                        <span className={`inline-block px-2.5 py-0.5 rounded-lg ${
                          getDoctorWorkload(doc, activeCourse.weeksCount).trimester === '12'
                            ? 'bg-emerald-50 text-emerald-700 font-black border border-emerald-200/60 shadow-2xs'
                            : 'text-slate-700 font-bold'
                        }`}>
                          {getDoctorWorkload(doc, activeCourse.weeksCount).trimester}
                        </span>
                      </td>

                      {/* Weeks in Year (Auto-Calculated = Trimester * 3) */}
                      <td className="p-2 text-center border-r border-slate-200 font-mono font-bold text-xs bg-slate-50/30">
                        <span className="inline-block px-2.5 py-0.5 rounded-lg text-teal-900 font-black bg-teal-50 border border-teal-200/60 shadow-2xs">
                          {getDoctorWorkload(doc, activeCourse.weeksCount).year}
                        </span>
                      </td>

                      {/* 12 Weekly Cells (Directly Editable like Excel) */}
                      {Array.from({ length: activeCourse.weeksCount }, (_, i) => i + 1).map((weekNum) => {
                        const cellValue = doc.weeks[weekNum] || '';
                        const isLecture = cellValue.toLowerCase().includes('lecture');
                        const isAssigned = Boolean(cellValue);
                        const isGyneBlue = doc.department?.includes('نسائية') && isAssigned && (weekNum >= 7 || cellValue.startsWith('Q1') || cellValue.startsWith('R1') || cellValue.startsWith('S1') || cellValue.startsWith('Q2') || cellValue.startsWith('Q3') || cellValue.startsWith('Q4'));

                        return (
                          <td 
                            key={weekNum} 
                            className="p-1 border-r border-slate-200 text-center"
                          >
                            <input
                              type="text"
                              value={cellValue}
                              placeholder="—"
                              onChange={(e) => handleCellChange(selectedCourseIndex, doc.id, weekNum, e.target.value.toUpperCase())}
                              className={`w-full text-center font-bold text-xs py-1.5 px-1 rounded-xl transition-all ${
                                isLecture 
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs font-black' 
                                  : isGyneBlue
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300 shadow-2xs font-black'
                                  : isAssigned 
                                  ? 'bg-pink-100 text-pink-900 border border-pink-300 shadow-2xs font-black' 
                                  : 'bg-transparent text-slate-400 hover:bg-slate-100 focus:bg-white focus:border focus:border-teal-500 focus:text-slate-900'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Delete Doctor Action */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteDoctor(selectedCourseIndex, doc.id)}
                          className="p-1 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title={locale === 'ar' ? 'حذف الطبيب' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>
            </div>

            {/* Legend & Guide */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-pink-100 border border-pink-300 inline-block"></span>
                  <span className="text-slate-600">{locale === 'ar' ? 'مجموعة فرعية سريرية (مثال: G1, G2, N1)' : 'Clinical Subgroup'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-amber-100 border border-amber-300 inline-block"></span>
                  <span className="text-slate-600">{locale === 'ar' ? 'محاضرات تمهيدية (Lectures)' : 'Lectures Period'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-slate-100 border border-slate-300 inline-block"></span>
                  <span className="text-slate-600">{locale === 'ar' ? 'فارغ (لا يوجد تدريب)' : 'Off week'}</span>
                </div>
              </div>

              <span className="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100">
                ✓ {locale === 'ar' ? 'يتم حفظ جميع التعديلات تلقائياً' : 'Auto-saved'}
              </span>
            </div>

          </div>
          )}
          </>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: SUBGROUPS & STUDENTS SWAP/MOVE WORKBENCH */}
      {/* ========================================================================= */}
      {activeMainView === 'partition' && (
        <div className="space-y-6">
          
          {/* Swap Active Mode Alert Banner */}
          {swapStudent && (
            <div className="p-4 rounded-3xl bg-teal-50 border-2 border-teal-500/30 shadow-md flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <ArrowRightLeft className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-teal-950">
                    {locale === 'ar' ? 'وضع تبديل الطلاب نشط حالياً (Swap Mode)' : 'Student Swap Active'}
                  </h4>
                  <p className="text-xs text-teal-800 mt-0.5">
                    {locale === 'ar' ? `اخترت الطالب: ` : `Selected: `}
                    <strong className="font-black text-teal-950">{swapStudent.student.full_name_ar}</strong>
                    {locale === 'ar' ? ` من المجموعة (` : ` from (`}<strong>{swapStudent.fromSubgroup}</strong>{`)`}.
                    <span className="block sm:inline text-teal-700 font-semibold sm:mr-2">
                      {locale === 'ar' ? '👈 انقر على أيقونة التبديل 🔄 بجانب أي طالب آخر لإتمام التبادل الفوري!' : 'Click swap on any other student to swap.'}
                    </span>
                  </p>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setSwapStudent(null)}
                className="rounded-xl border-teal-300 text-teal-900 bg-white hover:bg-teal-100 text-xs shrink-0"
              >
                {locale === 'ar' ? 'إلغاء التبديل' : 'Cancel'}
              </Button>
            </div>
          )}

          {/* Cohort Selector Tabs (السنة الرابعة / الخامسة / السادسة) */}
          <div className="flex items-center gap-2 p-2 bg-slate-100/90 rounded-3xl border border-slate-200/80 overflow-x-auto scrollbar-none shadow-2xs">
            <span className="text-xs font-bold text-slate-600 px-3 flex items-center gap-1.5 shrink-0">
              <GraduationCap className="w-4 h-4 text-teal-600" />
              <span>{locale === 'ar' ? 'الدفعة والأقسام السريرية:' : 'Cohort & Level:'}</span>
            </span>

            <button
              type="button"
              onClick={() => setLevelFilter('fourth')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                levelFilter === 'fourth'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              <span>{locale === 'ar' ? 'السنة الرابعة (Clinical Junior)' : '4th Year (Junior)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setLevelFilter('fifth')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                levelFilter === 'fifth'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span>{locale === 'ar' ? 'السنة الخامسة (Clinical Senior)' : '5th Year (Senior)'}</span>
            </button>

            <button
              type="button"
              onClick={() => setLevelFilter('sixth')}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                levelFilter === 'sixth'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
              <span>{locale === 'ar' ? 'السنة السادسة (Advanced Internship)' : '6th Year (Internship)'}</span>
            </button>
          </div>

          {/* Metrics & Capacity Controls Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            
            {/* Metric 1: Total Students */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'إجمالي طلبة الدفعة' : 'Total Students'}</span>
              <span className="text-lg font-black text-slate-800 mt-1 block">{studentsList.length} {locale === 'ar' ? 'طالب' : 'Students'}</span>
            </div>

            {/* Metric 2: 3 Main Groups & Assigned Letters */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'المجموعات الرئيسية (3)' : 'Main Groups'}</span>
                <div className="flex items-center gap-1.5 mt-1">
                  {(groupLetters[levelFilter] || ['A', 'B', 'C']).map((l, i) => (
                    <span key={i} className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 font-black text-xs flex items-center justify-center border border-teal-100">
                      {l}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const current = groupLetters[levelFilter] || ['A', 'B', 'C'];
                  setTempLetters([current[0], current[1], current[2]]);
                  setIsEditLettersOpen(true);
                }}
                className="px-2 py-1 rounded-xl bg-white hover:bg-teal-50 text-teal-700 font-bold text-xs border border-slate-200 flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                title={locale === 'ar' ? 'تعديل أحرف المجموعات الرئيسية' : 'Edit Group Letters'}
              >
                <Settings2 className="w-3.5 h-3.5 text-teal-600" />
                <span>{locale === 'ar' ? 'تعديل' : 'Edit'}</span>
              </button>
            </div>

            {/* Metric 3: Subgroup Target Capacity (5 or 6) */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'سعة المجموعة الفرعية' : 'Subgroup Capacity'}</span>
                <span className="text-sm font-bold text-slate-700 mt-0.5 block">{subgroupCapacity} {locale === 'ar' ? 'طلاب / مجموعة' : 'Students'}</span>
              </div>

              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => {
                    setSubgroupCapacity(5);
                    partitionStudents(studentsList, groupLetters[levelFilter] || ['A', 'B', 'C'], 5);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    subgroupCapacity === 5 ? 'bg-teal-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  5
                </button>
                <button
                  onClick={() => {
                    setSubgroupCapacity(6);
                    partitionStudents(studentsList, groupLetters[levelFilter] || ['A', 'B', 'C'], 6);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    subgroupCapacity === 6 ? 'bg-teal-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  6
                </button>
              </div>
            </div>

            {/* Metric 4: Search inside groups & Export */}
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-2xl bg-slate-50 border border-slate-100 flex items-center px-3 flex-1">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder={locale === 'ar' ? 'بحث عن طالب بالاسم أو الرقم...' : 'Search student...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none text-xs text-slate-800 focus:outline-hidden px-2 py-2"
                />
              </div>

              <button
                type="button"
                onClick={handleExportStudentsPartitionExcel}
                className="p-2.5 rounded-2xl bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200/60 transition-colors flex items-center justify-center shrink-0"
                title={locale === 'ar' ? 'تصدير كشف توزيع الطلبة (Excel)' : 'Export Students Excel'}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>

          </div>

          {/* Filter by Main Group Pills */}
          <div className="flex bg-slate-100/80 p-1.5 rounded-2xl gap-1 overflow-x-auto">
            <button
              onClick={() => setSelectedMainGroup('ALL')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                selectedMainGroup === 'ALL' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className={`w-4 h-4 ${selectedMainGroup === 'ALL' ? 'text-teal-600' : 'text-slate-400'}`} />
              <span>{locale === 'ar' ? 'عرض جميع المجموعات الثلاث' : 'All 3 Groups'}</span>
            </button>

            {mainGroups.map((mg) => {
              const totalGroupStudents = mg.subgroups.reduce((acc, sg) => acc + sg.students.length, 0);
              return (
                <button
                  key={mg.letter}
                  onClick={() => setSelectedMainGroup(mg.letter)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                    selectedMainGroup === mg.letter ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center font-black text-xs ${
                    selectedMainGroup === mg.letter ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {mg.letter}
                  </span>
                  <span>{locale === 'ar' ? mg.name : `Group (${mg.letter})`}</span>
                  <span className="px-1.5 py-0.2 rounded-md text-[11px] bg-slate-200/60 text-slate-600 font-bold">
                    {totalGroupStudents}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Subgroups Cards Display */}
          {mainGroups.length === 0 ? (
            <EmptyState message={locale === 'ar' ? 'لا يوجد طلاب مسجلون في هذه الدفعة لتقسيمهم' : 'No students found in this cohort.'} />
          ) : (
            <div className="space-y-6">
              {mainGroups
                .filter((mg) => selectedMainGroup === 'ALL' || selectedMainGroup === mg.letter)
                .map((mg) => {
                  const groupTotalStudents = mg.subgroups.reduce((acc, sg) => acc + sg.students.length, 0);

                  return (
                    <div key={mg.letter} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
                      
                      {/* Main Group Header Card */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-black text-base flex items-center justify-center shadow-md shadow-teal-500/20">
                            {mg.letter}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm text-slate-900">
                              {locale === 'ar' ? mg.name : `Group (${mg.letter})`}
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {locale === 'ar' 
                                ? `تحتوي على (${mg.subgroups.length}) مجموعات فرعية • إجمالي (${groupTotalStudents}) طالب` 
                                : `Contains ${mg.subgroups.length} subgroups (${groupTotalStudents} students)`}
                            </p>
                          </div>
                        </div>

                        <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-100 self-start sm:self-auto">
                          {mg.subgroups.length} {locale === 'ar' ? 'مجموعات فرعية' : 'Subgroups'} ({mg.letter}1 - {mg.letter}{mg.subgroups.length})
                        </span>
                      </div>

                      {/* Subgroups Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {mg.subgroups.map((sg) => {
                          const filteredStudents = sg.students.filter((s) => {
                            if (!searchQuery.trim()) return true;
                            const q = searchQuery.toLowerCase();
                            return (
                              s.full_name_ar.toLowerCase().includes(q) ||
                              s.university_number.toLowerCase().includes(q) ||
                              (s.full_name_en && s.full_name_en.toLowerCase().includes(q))
                            );
                          });

                          const isFull = sg.students.length >= sg.capacity;

                          return (
                            <div
                              key={sg.code}
                              className="p-4 rounded-3xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-all flex flex-col justify-between space-y-3"
                            >
                              {/* Subgroup Header */}
                              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                                <div className="flex items-center gap-2">
                                  <span className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 font-black text-xs flex items-center justify-center border border-teal-200">
                                    {sg.code}
                                  </span>
                                  <span className="font-bold text-xs text-slate-800">
                                    {locale === 'ar' ? `المجموعة الفرعية ${sg.code}` : `Subgroup ${sg.code}`}
                                  </span>
                                </div>

                                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                                  isFull ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {sg.students.length} / {sg.capacity} {locale === 'ar' ? 'طلاب' : 'Students'}
                                </span>
                              </div>

                              {/* Students List in Subgroup */}
                              <div className="space-y-1.5 min-h-[140px]">
                                {sg.students.length === 0 ? (
                                  <div className="text-center py-6 text-slate-300 text-xs font-semibold">
                                    {locale === 'ar' ? 'لا يوجد طلاب بهذه المجموعة' : 'Empty Subgroup'}
                                  </div>
                                ) : (
                                  filteredStudents.map((student, sIdx) => {
                                    const isSelectedForSwap = swapStudent?.student.id === student.id;

                                    return (
                                      <div
                                        key={student.id}
                                        className={`p-2 rounded-2xl flex items-center justify-between gap-2 text-xs transition-all ${
                                          isSelectedForSwap
                                            ? 'bg-teal-100 border-2 border-teal-500 shadow-sm'
                                            : 'bg-white border border-slate-100 hover:border-teal-200'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-[10px] font-mono text-slate-400 font-bold w-4 text-center shrink-0">
                                            {sIdx + 1}
                                          </span>

                                          <div className="w-6 h-6 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-[10px] shrink-0 border border-teal-100 overflow-hidden">
                                            {student.photo_url || localStorage.getItem(`student_photo_${student.id}`) ? (
                                              <img
                                                src={student.photo_url || localStorage.getItem(`student_photo_${student.id}`)!}
                                                alt=""
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              student.full_name_ar.substring(0, 1)
                                            )}
                                          </div>

                                          <div className="min-w-0">
                                            <p 
                                              className="font-bold text-slate-800 truncate text-[11px]" 
                                              title={locale === 'en' && student.full_name_en ? student.full_name_en : student.full_name_ar}
                                            >
                                              {locale === 'en' && student.full_name_en ? student.full_name_en : student.full_name_ar}
                                            </p>
                                            <span className="text-[10px] font-mono text-slate-400 block">
                                              {student.university_number}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Action Buttons for Student */}
                                        <div className="flex items-center gap-1 shrink-0">
                                          {/* Swap Button */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (swapStudent) {
                                                if (swapStudent.student.id !== student.id) {
                                                  handleExecuteSwap(student, sg.code);
                                                }
                                              } else {
                                                setSwapStudent({ student, fromSubgroup: sg.code });
                                              }
                                            }}
                                            className={`p-1.5 rounded-lg transition-colors ${
                                              isSelectedForSwap
                                                ? 'bg-teal-600 text-white'
                                                : 'text-slate-400 hover:text-teal-600 hover:bg-slate-100'
                                            }`}
                                            title={
                                              swapStudent
                                                ? (locale === 'ar' 
                                                    ? `تبديل هذا الطالب مع ${swapStudent.student.full_name_ar}` 
                                                    : `Swap with ${swapStudent.student.full_name_en || swapStudent.student.full_name_ar}`)
                                                : (locale === 'ar' ? 'بدء تبديل الطالب' : 'Swap student')
                                            }
                                          >
                                            <ArrowRightLeft className="w-3.5 h-3.5" />
                                          </button>

                                          {/* Move to another Subgroup Button */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setMoveStudent({ student, fromSubgroup: sg.code });
                                              setTargetSubgroupForMove('');
                                            }}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                            title={locale === 'ar' ? 'نقل إلى مجموعة أخرى' : 'Move to group'}
                                          >
                                            <MoveRight className="w-3.5 h-3.5 rtl:rotate-180" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>
                  );
                })}
            </div>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: HOSPITALS DIRECTORY & DOCTORS ALLOCATION (EXCEL-LIKE CARDS) */}
      {/* ========================================================================= */}
      {activeMainView === 'hospitals' && (
        <div className="space-y-4">
          
          {/* Header & Controls Bar */}
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  {locale === 'ar' ? 'توزيع الأطباء والمشرفين على المستشفيات التدريبية المعتمدة' : 'Hospitals & Doctors Allocation Directory'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {locale === 'ar' 
                    ? `إجمالي المستشفيات: ${hospitalGroups.length} | إجمالي الأطباء: ${hospitalGroups.reduce((acc, h) => acc + h.doctors.length, 0)} طبيب`
                    : `Hospitals: ${hospitalGroups.length} | Total Doctors: ${hospitalGroups.reduce((acc, h) => acc + h.doctors.length, 0)}`}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={locale === 'ar' ? 'بحث عن طبيب أو مستشفى...' : 'Search doctor or hospital...'}
                  value={hospitalSearch}
                  onChange={(e) => setHospitalSearch(e.target.value)}
                  className="rounded-xl border border-slate-200 pr-9 pl-3 py-1.5 text-xs focus:border-teal-500 w-48 sm:w-60 bg-slate-50/50 font-bold"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsAddHospitalModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>{locale === 'ar' ? 'مستشفى جديد' : 'New Hospital'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportHospitalsExcel}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-slate-200"
              >
                <Download className="w-4 h-4 text-teal-600" />
                <span>{locale === 'ar' ? 'تصدير كشف المستشفيات (Excel)' : 'Export Excel'}</span>
              </button>
            </div>
          </div>

          {/* Hospitals Horizontal Scroll Columns (Exact Mirror of the user's Excel Sheet) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
            {hospitalGroups
              .filter(h => !hospitalSearch || h.name.toLowerCase().includes(hospitalSearch.toLowerCase()) || h.doctors.some(d => d.name.toLowerCase().includes(hospitalSearch.toLowerCase())))
              .map((hosp) => (
                <div key={hosp.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  
                  {/* Hospital Header */}
                  <div className="p-3.5 bg-gradient-to-r from-teal-700 to-teal-800 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-4 h-4 text-teal-200 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-black text-xs text-white truncate block">
                          {locale === 'en' ? (hosp.name_en || getLocalizedHospitalName(hosp.name)) : hosp.name}
                        </span>
                        {locale === 'ar' && hosp.name_en && (
                          <span className="text-[10px] text-teal-200/80 font-mono truncate block">
                            {hosp.name_en}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingHospitalId(hosp.id);
                          setEditHospitalNameAr(hosp.name);
                          setEditHospitalNameEn(hosp.name_en || '');
                          setIsEditHospitalModalOpen(true);
                        }}
                        className="p-1 rounded-lg text-teal-200 hover:text-white hover:bg-teal-900/50 transition-colors"
                        title={locale === 'ar' ? 'تعديل اسم المستشفى باللغتين' : 'Edit Hospital (Bilingual)'}
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-[10px] font-bold bg-teal-900/60 px-2 py-0.5 rounded-full text-teal-100 border border-teal-600">
                        {hosp.doctors.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteHospital(hosp.id)}
                        className="p-1 rounded-lg text-teal-300 hover:text-red-300 hover:bg-teal-900/50 transition-colors"
                        title={locale === 'ar' ? 'حذف المستشفى' : 'Delete hospital'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Table of Doctors */}
                  <div className="p-2 flex-1 flex flex-col">
                    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50">
                      <table className="w-full text-xs text-start border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                            <th className="p-1.5 text-center w-10 border-r border-slate-200">{locale === 'ar' ? 'الرقم' : '#'}</th>
                            <th className="p-1.5 text-start">{locale === 'ar' ? 'اسم الطبيب / المشرف' : 'Doctor / Supervisor'}</th>
                            <th className="p-1.5 text-center w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {hosp.doctors.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="p-4 text-center text-slate-400 text-xs font-medium">
                                {locale === 'ar' ? 'لا يوجد أطباء مضافين بعد' : 'No doctors yet'}
                              </td>
                            </tr>
                          ) : (
                            hosp.doctors
                              .filter(d => !hospitalSearch || d.name.toLowerCase().includes(hospitalSearch.toLowerCase()) || (d.name_en && d.name_en.toLowerCase().includes(hospitalSearch.toLowerCase())))
                              .map((doc, idx) => (
                                <tr key={doc.id} className="hover:bg-teal-50/40 transition-colors group">
                                  <td className="p-1.5 text-center font-mono font-bold text-[11px] text-slate-500 border-r border-slate-100 bg-slate-50/50">
                                    {idx + 1}
                                  </td>
                                  <td className="p-1.5 font-bold text-slate-800">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-bold text-slate-800 block">
                                          {locale === 'en' ? (doc.name_en || getDoctorDisplayName(doc)) : doc.name}
                                        </span>
                                        {doc.specialty && (
                                          <span className="text-[10px] bg-teal-50 text-teal-800 font-bold px-1.5 py-0.2 rounded-md border border-teal-200">
                                            {locale === 'en' ? (doc.specialty_en || doc.specialty) : doc.specialty}
                                          </span>
                                        )}
                                      </div>
                                      {locale === 'ar' && doc.name_en && (
                                        <span className="text-[10px] text-slate-400 font-mono block">
                                          {doc.name_en}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-1 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingHospIdForDoc(hosp.id);
                                          setEditingDocId(doc.id);
                                          setEditHospDocNameAr(doc.name);
                                          setEditHospDocNameEn(doc.name_en || '');
                                          setEditHospDocSpecialty(doc.specialty || '');
                                          setEditHospDocSpecialtyEn(doc.specialty_en || '');
                                          setIsEditHospDocModalOpen(true);
                                        }}
                                        className="p-1 rounded-md text-slate-400 group-hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                                        title={locale === 'ar' ? 'تعديل بيانات وتخصص الطبيب' : 'Edit doctor details & specialty'}
                                      >
                                        <Settings2 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteHospDoctor(hosp.id, doc.id)}
                                        className="p-1 rounded-md text-slate-300 group-hover:text-red-600 hover:bg-red-50 transition-colors"
                                        title={locale === 'ar' ? 'حذف الطبيب من المستشفى' : 'Delete'}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Add Doctor Button inside Card */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetHospId(hosp.id);
                          setIsAddHospDocModalOpen(true);
                        }}
                        className="w-full py-1.5 rounded-xl border border-dashed border-teal-300 hover:border-teal-500 hover:bg-teal-50 text-teal-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{locale === 'ar' ? 'إضافة طبيب للمستشفى' : 'Add Doctor'}</span>
                      </button>
                    </div>
                  </div>

                </div>
              ))}
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD DOCTOR TO MATRIX MODAL */}
      {/* ========================================================================= */}
      {isAddDoctorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'إضافة طبيب جديد لجدول المساق' : 'Add Doctor to Course'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold">
                    {getLocalizedCourseTitle(activeCourse)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAddDoctorModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDoctor} className="p-6 space-y-4">
              
              {/* 1. Doctor Selector from Hospitals Directory */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>{locale === 'ar' ? 'اختر الطبيب من قائمة أطباء المستشفيات *' : 'Select Doctor from Hospitals Directory *'}</span>
                  <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                    {allHospitalDoctorsList.length} {locale === 'ar' ? 'طبيب مسجل' : 'registered doctors'}
                  </span>
                </label>
                
                <select
                  required
                  value={newDoctorName}
                  onChange={(e) => {
                    const selectedVal = e.target.value;
                    setNewDoctorName(selectedVal);
                    const matched = allHospitalDoctorsList.find((d: { docNameAr: string; docNameEn?: string; hospNameAr: string; hospNameEn?: string }) => d.docNameAr === selectedVal);
                    if (matched) {
                      setNewDoctorNameEn(matched.docNameEn || '');
                      setNewDoctorHospital(matched.hospNameAr);
                      setNewDoctorHospitalEn(matched.hospNameEn || '');
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold bg-white"
                >
                  <option value="">{locale === 'ar' ? '-- اختر الطبيب المراد إضافته للجدول --' : '-- Select Doctor to Add --'}</option>
                  {hospitalGroups.map(h => (
                    <optgroup key={h.id} label={`${locale === 'ar' ? h.name : (h.name_en || h.name)} (${h.doctors.length} أطباء)`}>
                      {h.doctors.map(d => (
                        <option key={d.id} value={d.name}>
                          {locale === 'ar' ? `${d.name} — (${h.name})` : `${d.name_en || d.name} — (${h.name_en || h.name})`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* 2. Selected Doctor Summary Card */}
              {newDoctorName && (
                <div className="bg-teal-50/80 border border-teal-200/90 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                      <Stethoscope className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-900 block">
                        {newDoctorName} {newDoctorNameEn && <span className="text-[11px] text-slate-500 font-medium">({newDoctorNameEn})</span>}
                      </span>
                      <span className="text-[10.5px] font-bold text-teal-800 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-teal-600" />
                        <span>{locale === 'ar' ? 'المستشفى المعتمد:' : 'Hospital:'} {newDoctorHospital || 'م. الأهلي'}</span>
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-300 shrink-0">
                    {locale === 'ar' ? '✓ مرتبط بالمستشفى' : '✓ Linked'}
                  </span>
                </div>
              )}



              {/* 4. Quick Shortcut to Hospitals Screen */}
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-3 text-center">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {locale === 'ar' 
                    ? '💡 هل ترغب بإضافة طبيب جديد غير موجود في القائمة؟ أضفه أولاً في شاشة المستشفيات ليظهر هنا فورياً.' 
                    : '💡 Doctor not listed? Add them first in the Hospitals Directory.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddDoctorModalOpen(false);
                    setActiveMainView('hospitals');
                  }}
                  className="mt-1.5 text-xs font-black text-teal-700 hover:text-teal-900 underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'الانتقال إلى دليل المستشفيات وإضافة طبيب' : 'Go to Hospitals Directory'}</span>
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDoctorModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  disabled={!newDoctorName}
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25 disabled:opacity-50"
                >
                  {locale === 'ar' ? 'إضافة الطبيب إلى الجدول' : 'Add to Schedule'}
                </Button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD CLINICAL COURSE MODAL */}
      {/* ========================================================================= */}
      {isAddCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'إنشاء مساق سريري جديد' : 'Add New Clinical Course'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {locale === 'ar' ? `${getLevelName(levelFilter)} — العام: ${academicYear}` : `${getLevelName(levelFilter)} — ${academicYear}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddCourseModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCourse} className="p-6 space-y-4">
              {/* Dropdown to select course directly from live DB courses */}
              <div className="space-y-1.5 bg-teal-50/70 p-3 rounded-2xl border border-teal-200/80">
                <label className="block text-xs font-bold text-teal-900 flex items-center justify-between">
                  <span>{locale === 'ar' ? 'اختر المساق السريري المعتمد من الخطة *' : 'Select Registered Clinical Course *'}</span>
                  <span className="text-[10px] text-teal-700 font-bold bg-white px-2 py-0.5 rounded-md border border-teal-200">
                    {availableDbCourses.length} {locale === 'ar' ? 'مساقاً متاحاً' : 'courses'}
                  </span>
                </label>
                <select
                  required
                  value={selectedDbCourseId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setSelectedDbCourseId(selectedId);
                    const found = availableDbCourses.find((c: any) => String(c.id) === selectedId);
                    if (found) {
                      setCourseFormName(found.name_ar);
                      setCourseFormNameEn(found.name_en || '');
                      setCourseFormCode(found.code);
                      setCourseFormWeeks(found.credit_hours || 12);
                    }
                  }}
                  className="w-full rounded-xl border border-teal-300 px-3.5 py-2.5 text-xs font-bold text-slate-900 bg-white focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="">{locale === 'ar' ? '-- اختر المساق من الخطة السريرية --' : '-- Select Course from List --'}</option>
                  {availableDbCourses.map((c: any) => {
                    const displayName = locale === 'en' ? (c.name_en || c.name_ar) : c.name_ar;
                    const hoursLabel = locale === 'ar' ? 'ساعة / أسابيع' : 'weeks/credits';
                    return (
                      <option key={c.id} value={c.id}>
                        [{c.code}] {displayName} — ({c.credit_hours} {hoursLabel})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Course details preview card when selected */}
              {selectedDbCourseId && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">{locale === 'ar' ? 'اسم المساق:' : 'Course Name:'}</span>
                    <span className="font-black text-slate-900">
                      {locale === 'en' ? (courseFormNameEn || courseFormName) : courseFormName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">{locale === 'ar' ? 'رمز المساق:' : 'Course Code:'}</span>
                    <span className="font-mono font-bold text-slate-700">{courseFormCode}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-bold">{locale === 'ar' ? 'الساعات المعتمدة:' : 'Credit Hours:'}</span>
                    <span className="font-bold text-teal-700">{courseFormWeeks} {locale === 'ar' ? 'ساعة' : 'Credits'}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'عدد الأسابيع في جدول التوزيع السريري' : 'Weeks Count'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={courseFormWeeks}
                  onChange={(e) => setCourseFormWeeks(parseInt(e.target.value) || 12)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddCourseModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'إضافة المساق' : 'Create Course'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT CLINICAL COURSE MODAL */}
      {/* ========================================================================= */}
      {isEditCourseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'تعديل بيانات المساق السريري' : 'Edit Clinical Course'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeCourse.courseCode}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditCourseModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditCourse} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المساق بالعربية *' : 'Course Name in Arabic *'}
                </label>
                <input
                  required
                  type="text"
                  value={courseFormName}
                  onChange={(e) => setCourseFormName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المساق بالإنجليزية (اختياري)' : 'Course Name in English (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Internal Medicine (Junior) — 4th Year"
                  value={courseFormNameEn}
                  onChange={(e) => setCourseFormNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'رمز المساق' : 'Course Code'}
                  </label>
                  <input
                    type="text"
                    value={courseFormCode}
                    onChange={(e) => setCourseFormCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'عدد الأسابيع' : 'Weeks Count'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={courseFormWeeks}
                    onChange={(e) => setCourseFormWeeks(parseInt(e.target.value) || 12)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditCourseModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD ACADEMIC YEAR MODAL */}
      {/* ========================================================================= */}
      {isAddYearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'إضافة عام أكاديمي جديد' : 'Add Academic Year'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {locale === 'ar' ? 'لإنشاء خطط وتوزيعات مستقبلية' : 'For future rotations planning'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddYearModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddYear} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'العام الأكاديمي *' : 'Academic Year *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder="2027/2028"
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-mono font-bold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddYearModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'إضافة وتفعيل' : 'Add & Activate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MOVE STUDENT MODAL */}
      {/* ========================================================================= */}
      {moveStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <MoveRight className="w-5 h-5 rtl:rotate-180" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'نقل الطالب لمجموعة أخرى' : 'Move Student to Subgroup'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold">
                    {locale === 'en' && moveStudent.student.full_name_en ? moveStudent.student.full_name_en : moveStudent.student.full_name_ar} ({moveStudent.student.university_number})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setMoveStudent(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs">
                <span className="text-slate-500">{locale === 'ar' ? 'المجموعة الفرعية الحالية:' : 'Current Subgroup:'} </span>
                <strong className="text-slate-800">{moveStudent.fromSubgroup}</strong>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اختر المجموعة الفرعية المستهدفة' : 'Target Subgroup'}
                </label>
                <select
                  value={targetSubgroupForMove}
                  onChange={(e) => setTargetSubgroupForMove(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs bg-white focus:border-teal-500 font-semibold"
                >
                  <option value="">{locale === 'ar' ? '-- اختر المجموعة الفرعية --' : '-- Select Subgroup --'}</option>
                  {allSubgroupsList
                    .filter((sg) => sg.code !== moveStudent.fromSubgroup)
                    .map((sg) => (
                      <option key={sg.code} value={sg.code}>
                        {sg.code} ({sg.students.length} / {sg.capacity} {locale === 'ar' ? 'طلاب حالياً' : 'students'})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMoveStudent(null)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  disabled={!targetSubgroupForMove}
                  onClick={handleConfirmMove}
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'تأكيد النقل' : 'Confirm Move'}
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT GROUP LETTERS CONFIG MODAL */}
      {/* ========================================================================= */}
      {isEditLettersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'تخصيص أحرف المجموعات الرئيسية' : 'Configure Main Group Letters'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {getLevelName(levelFilter)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditLettersOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLetters} className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                {locale === 'ar' 
                  ? 'يتم تقسيم الدفعة على 3 مجموعات رئيسية. حدد الحرف الرمزي لكل مجموعة (مثال للدفعة السادسة: Q, R, S):' 
                  : 'Specify 3 letter codes for the main groups:'}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">{locale === 'ar' ? 'المجموعة 1' : 'Group 1'}</label>
                  <input
                    required
                    maxLength={2}
                    type="text"
                    value={tempLetters[0]}
                    onChange={(e) => setTempLetters([e.target.value.toUpperCase(), tempLetters[1], tempLetters[2]])}
                    className="w-full text-center font-black text-sm uppercase rounded-xl border border-slate-200 py-2.5 focus:border-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">{locale === 'ar' ? 'المجموعة 2' : 'Group 2'}</label>
                  <input
                    required
                    maxLength={2}
                    type="text"
                    value={tempLetters[1]}
                    onChange={(e) => setTempLetters([tempLetters[0], e.target.value.toUpperCase(), tempLetters[2]])}
                    className="w-full text-center font-black text-sm uppercase rounded-xl border border-slate-200 py-2.5 focus:border-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">{locale === 'ar' ? 'المجموعة 3' : 'Group 3'}</label>
                  <input
                    required
                    maxLength={2}
                    type="text"
                    value={tempLetters[2]}
                    onChange={(e) => setTempLetters([tempLetters[0], tempLetters[1], e.target.value.toUpperCase()])}
                    className="w-full text-center font-black text-sm uppercase rounded-xl border border-slate-200 py-2.5 focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditLettersOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'حفظ وتطبيق الأحرف' : 'Apply Letters'}
                </Button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW HOSPITAL MODAL */}
      {/* ========================================================================= */}
      {isAddHospitalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'إضافة مستشفى تدريبي جديد' : 'Add New Hospital'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {locale === 'ar' ? 'لإدراجه في قائمة مستشفيات الكلية' : 'Add to faculty hospital directory'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddHospitalModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddHospital} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المستشفى بالعربية *' : 'Hospital Name in Arabic *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: م. الميزان التخصصي"
                  value={newHospitalName}
                  onChange={(e) => setNewHospitalName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المستشفى بالإنجليزية (اختياري)' : 'Hospital Name in English (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Al-Mezan Specialized Hospital"
                  value={newHospitalNameEn}
                  onChange={(e) => setNewHospitalNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddHospitalModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'إضافة المستشفى' : 'Add Hospital'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD DOCTOR TO HOSPITAL MODAL */}
      {/* ========================================================================= */}
      {isAddHospDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'إضافة طبيب إلى المستشفى' : 'Add Doctor to Hospital'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold">
                    {getLocalizedHospitalName(hospitalGroups.find(h => h.id === targetHospId)?.name || '')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddHospDocModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddHospDoctor} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم الطبيب بالعربية *' : 'Doctor Name (Arabic) *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: د. محمد التميمي"
                  value={newHospDocName}
                  onChange={(e) => setNewHospDocName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم الطبيب بالإنجليزية (اختياري)' : 'Doctor Name (English)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Mohammad Tamimi"
                  value={newHospDocNameEn}
                  onChange={(e) => setNewHospDocNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'التخصص الطبي / الدقيق (اختياري)' : 'Medical Specialty / Subspecialty'}
                </label>
                <input
                  type="text"
                  placeholder={locale === 'ar' ? 'مثال: باطني قلب / جراحة أوعية دموية / أطفال' : 'e.g. Cardiology / Vascular Surgery'}
                  value={newHospDocSpecialty}
                  onChange={(e) => setNewHospDocSpecialty(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'البريد الإلكتروني / اسم الدخول' : 'Doctor Email / Login'}
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. dr.tamimi@hebron.edu"
                    value={newHospDocEmail}
                    onChange={(e) => setNewHospDocEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start font-mono"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    {locale === 'ar' ? 'كلمة المرور للحساب' : 'Password'}
                  </label>
                  <input
                    type="text"
                    placeholder="password123"
                    value={newHospDocPassword}
                    onChange={(e) => setNewHospDocPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              <p className="text-[11px] text-teal-700 bg-teal-50 p-2.5 rounded-xl border border-teal-200 font-bold">
                {locale === 'ar'
                  ? '💡 سيتم إنشاء حساب مستخدم للنظام تلقائياً بدور (مشرف سريري) وسيظهر الحساب في لوحة مدير النظام.'
                  : '💡 A user account with Clinical Supervisor role will be created automatically.'}
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddHospDocModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'إضافة للمستشفى' : 'Add Doctor'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT HOSPITAL MODAL */}
      {/* ========================================================================= */}
      {isEditHospitalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'تعديل بيانات المستشفى' : 'Edit Hospital'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {locale === 'ar' ? 'تعديل الاسم باللغتين العربية والإنجليزية' : 'Update bilingual hospital names'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditHospitalModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditHospital} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المستشفى بالعربية *' : 'Hospital Name (Arabic) *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: م. الأهلي"
                  value={editHospitalNameAr}
                  onChange={(e) => setEditHospitalNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المستشفى بالإنجليزية' : 'Hospital Name (English)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Al-Ahli Hospital"
                  value={editHospitalNameEn}
                  onChange={(e) => setEditHospitalNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditHospitalModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT DOCTOR IN HOSPITAL */}
      {/* ========================================================================= */}
      {isEditHospDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'تعديل بيانات الطبيب في المستشفى' : 'Edit Doctor in Hospital'}
                  </h3>
                  <p className="text-xs text-slate-400 font-bold">
                    {getLocalizedHospitalName(hospitalGroups.find(h => h.id === editingHospIdForDoc)?.name || '')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditHospDocModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditHospDoctor} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم الطبيب بالعربية *' : 'Doctor Name (Arabic) *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: د. عبد الله قاسم"
                  value={editHospDocNameAr}
                  onChange={(e) => setEditHospDocNameAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم الطبيب بالإنجليزية' : 'Doctor Name (English)'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Abdallah Qasim"
                  value={editHospDocNameEn}
                  onChange={(e) => setEditHospDocNameEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'التخصص الطبي / الدقيق (اختياري)' : 'Medical Specialty / Subspecialty'}
                </label>
                <input
                  type="text"
                  placeholder={locale === 'ar' ? 'مثال: باطني قلب / جراحة أوعية دموية' : 'e.g. Cardiology / Vascular Surgery'}
                  value={editHospDocSpecialty}
                  onChange={(e) => setEditHospDocSpecialty(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold text-start"
                  dir="rtl"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditHospDocModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'حفظ التعديلات' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SWAP / REPLACE DOCTOR IN ROTATION MATRIX */}
      {/* ========================================================================= */}
      {isSwapDoctorModalOpen && currentDocToSwap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'تبديل الطبيب في جدول المساق' : 'Swap Doctor in Course Schedule'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {getLocalizedCourseTitle(courseSchedules[selectedCourseIndex])}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSwapDoctorModalOpen(false);
                  setCurrentDocToSwap(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSwapMatrixDoctor} className="p-6 space-y-4">
              
              {/* Current Doctor Card */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {locale === 'ar' ? 'الطبيب الحالي المراد تبديله:' : 'Current Doctor:'}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-black text-slate-800">
                      {currentDocToSwap.doctorName} {currentDocToSwap.doctorName_en && <span className="text-slate-400 font-normal">({currentDocToSwap.doctorName_en})</span>}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    {getLocalizedHospitalName(currentDocToSwap.hospital || getDoctorHospital(currentDocToSwap.doctorName))}
                  </span>
                </div>
              </div>

              {/* Select Replacement Doctor from Hospital Directory */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>{locale === 'ar' ? 'اختر الطبيب البديل من دليل المستشفيات *' : 'Select Replacement Doctor *'}</span>
                  <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                    {allHospitalDoctorsList.length} {locale === 'ar' ? 'طبيب مسجل' : 'doctors'}
                  </span>
                </label>
                
                <select
                  required
                  value={selectedReplacementDoctorName}
                  onChange={(e) => setSelectedReplacementDoctorName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs focus:border-teal-500 font-bold bg-white"
                >
                  <option value="">{locale === 'ar' ? '-- اختر الطبيب البديل --' : '-- Select Doctor --'}</option>
                  {hospitalGroups.map(h => (
                    <optgroup key={h.id} label={`${locale === 'ar' ? h.name : (h.name_en || h.name)} (${h.doctors.length} أطباء)`}>
                      {h.doctors.map(d => (
                        <option key={d.id} value={d.name}>
                          {locale === 'ar' 
                            ? `${d.name}${d.specialty ? ` [${d.specialty}]` : ''} — (${h.name})` 
                            : `${d.name_en || d.name}${d.specialty_en || d.specialty ? ` [${d.specialty_en || d.specialty}]` : ''} — (${h.name_en || h.name})`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Replacement Doctor Preview Card */}
              {selectedReplacementDoctorName && (
                <div className="bg-teal-50/90 border border-teal-200 rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                      <Stethoscope className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-900 block">
                        {selectedReplacementDoctorName}
                      </span>
                      {allHospitalDoctorsList.find(d => d.docNameAr === selectedReplacementDoctorName) && (
                        <span className="text-[10.5px] font-bold text-teal-800 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-teal-600" />
                          <span>
                            {locale === 'ar' ? 'المستشفى:' : 'Hospital:'} {allHospitalDoctorsList.find(d => d.docNameAr === selectedReplacementDoctorName)?.hospNameAr}
                            {allHospitalDoctorsList.find(d => d.docNameAr === selectedReplacementDoctorName)?.specialty && (
                              <span className="mx-1 text-teal-700">({allHospitalDoctorsList.find(d => d.docNameAr === selectedReplacementDoctorName)?.specialty})</span>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-300 shrink-0">
                    {locale === 'ar' ? '✓ جاهز للتبديل' : '✓ Ready'}
                  </span>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                {locale === 'ar' 
                  ? '💡 سيتم استبدال بيانات الطبيب والمستشفى في هذا الصف مع الحفاظ الكامل على كافة توزيعات الأسابيع المجدولة.' 
                  : '💡 Swapping updates the doctor name and hospital while preserving all weekly scheduled rotation slots.'}
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsSwapDoctorModalOpen(false);
                    setCurrentDocToSwap(null);
                  }}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  disabled={!selectedReplacementDoctorName}
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25 disabled:opacity-50"
                >
                  {locale === 'ar' ? 'تأكيد تبديل الطبيب' : 'Confirm Swap'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SHARE PUBLIC LOOKUP LINK WITH STUDENTS */}
      {/* ========================================================================= */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col">
            
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100 shadow-xs">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'مشاركة جدول التوزيع مع الطلاب' : 'Share Clinical Schedule with Students'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {getLevelName(levelFilter)} • {academicYear}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsShareModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              
              {/* Privacy Notice Box */}
              <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  🔒
                </div>
                <div className="text-xs text-emerald-950 space-y-1">
                  <p className="font-black">
                    {locale === 'ar' ? 'نظام استعلام آمن يحمي الخصوصية بالكامل' : 'Privacy-Preserving Student Lookup'}
                  </p>
                  <p className="text-emerald-800 leading-relaxed text-[11.5px]">
                    {locale === 'ar'
                      ? 'عند مشاركة هذا الرابط مع الدفعة، لن تظهر أي كشوفات عامة. سيقوم كل طالب بإدخال رقمه الجامعي فقط، ليظهر له جدول مناوباته وأطباؤه ومستشفياته الخاصة ومجموعته الفرعية دون الاطلاع على بيانات زملائه.'
                      : 'Students will query their individual schedule by entering their University ID. Full cohort data and other students\' schedules remain private.'}
                  </p>
                </div>
              </div>

              {/* Public URL Input & Copy Button */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'الرابط العام المباشر للدفعة:' : 'Direct Public Portal Link:'}
                </label>
                
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    type="text"
                    value={`${window.location.origin}/portal/clinical-schedule?year=${academicYear}`}
                    className="w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 text-slate-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/portal/clinical-schedule?year=${academicYear}`;
                      navigator.clipboard.writeText(url);
                      setIsCopied(true);
                      setTimeout(() => setIsCopied(false), 2500);
                    }}
                    className={`px-4 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-1.5 transition-all shrink-0 ${
                      isCopied
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                    }`}
                  >
                    {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopied ? (locale === 'ar' ? 'تم النسخ!' : 'Copied!') : (locale === 'ar' ? 'نسخ الرابط' : 'Copy Link')}</span>
                  </button>
                </div>
              </div>

              {/* Quick Actions / Share Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                
                {/* Open In New Tab */}
                <a
                  href={`/portal/clinical-schedule?year=${academicYear}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-2xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 flex items-center justify-center gap-2 text-xs font-bold text-slate-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-teal-600" />
                  <span>{locale === 'ar' ? 'معاينة البوابة كطالب' : 'Preview as Student'}</span>
                </a>

                {/* WhatsApp Direct Share */}
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/portal/clinical-schedule?year=${academicYear}`;
                    const text = locale === 'ar'
                      ? `الزملاء والأطباء الأكارم، تم تفعيل بوابة استعلام التوزيع والمناوبات السريرية لكلية الطب للعام الأكاديمي ${academicYear}. يمكنكم الاستعلام المباشر برقمكم الجامعي عبر الرابط التالي: ${url}`
                      : `Dear Medical Students, Clinical Rotations Schedule for ${academicYear} has been published. Please check your personal schedule using your University ID: ${url}`;
                    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  className="p-3 rounded-2xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center justify-center gap-2 text-xs font-bold transition-colors"
                >
                  <span>💬</span>
                  <span>{locale === 'ar' ? 'مشاركة عبر WhatsApp' : 'Share via WhatsApp'}</span>
                </button>

              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsShareModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إغلاق' : 'Close'}
                </Button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT MAIN GROUP LETTERS (A, B, C -> Custom) */}
      {/* ========================================================================= */}
      {isEditLettersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                  <Settings2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? 'تعديل أحرف المجموعات الرئيسية' : 'Edit Main Group Letters'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {getLevelName(levelFilter)} • {academicYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditLettersOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupLetters} className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                {locale === 'ar' 
                  ? 'حدد الأحرف أو الرموز المطلوبة للمجموعات الرئيسية الثلاث لهذه السنة (مثال: A, B, C أو Q, R, S):' 
                  : 'Specify the letters for the 3 main groups of this cohort (e.g. A, B, C or Q, R, S):'}
              </p>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 text-center">{locale === 'ar' ? 'المجموعة 1' : 'Group 1'}</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={tempLetters[0]}
                    onChange={(e) => setTempLetters([e.target.value.toUpperCase(), tempLetters[1], tempLetters[2]])}
                    className="w-full text-center font-mono font-black text-sm uppercase rounded-xl border border-slate-200 py-2 bg-slate-50 focus:bg-white focus:border-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 text-center">{locale === 'ar' ? 'المجموعة 2' : 'Group 2'}</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={tempLetters[1]}
                    onChange={(e) => setTempLetters([tempLetters[0], e.target.value.toUpperCase(), tempLetters[2]])}
                    className="w-full text-center font-mono font-black text-sm uppercase rounded-xl border border-slate-200 py-2 bg-slate-50 focus:bg-white focus:border-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-600 text-center">{locale === 'ar' ? 'المجموعة 3' : 'Group 3'}</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={tempLetters[2]}
                    onChange={(e) => setTempLetters([tempLetters[0], tempLetters[1], e.target.value.toUpperCase()])}
                    className="w-full text-center font-mono font-black text-sm uppercase rounded-xl border border-slate-200 py-2 bg-slate-50 focus:bg-white focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditLettersOpen(false)}
                  className="rounded-xl text-xs"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  type="submit"
                  className="rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-teal-500/25"
                >
                  {locale === 'ar' ? 'حفظ الأحرف الجديدة' : 'Save Letters'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
