import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import ExcelJS from 'exceljs';
import { 
  ArrowRightLeft, Download, RefreshCw, 
  Settings2, Search, 
  X, MoveRight, Layers,
  Calendar, Stethoscope, Plus, Trash2, Building2,
  Share2, Copy, Check, ExternalLink
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
  const { can } = useAuth();
  const { locale } = useI18n();

  // Navigation View: 'rotation_matrix' (جدول الأطباء) vs 'partition' (مجموعات الطلاب) vs 'hospitals' (المستشفيات)
  const [activeMainView, setActiveMainView] = useState<'rotation_matrix' | 'partition' | 'hospitals'>('rotation_matrix');

  // Hospital Management State
  const [hospitalGroups, setHospitalGroups] = useState<HospitalGroup[]>(() => {
    const saved = localStorage.getItem('cdms_hospital_doctors');
    return saved ? JSON.parse(saved) : defaultHospitalGroups;
  });
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
  const [groupLetters, setGroupLetters] = useState<{ [level: string]: [string, string, string] }>({
    fourth: ['A', 'B', 'C'],
    fifth: ['A', 'B', 'C'],
    sixth: ['Q', 'R', 'S'],
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

  // Default Course Schedules per Cohort matching real university curriculum
  const getDefaultCoursesForLevel = (level: string): CourseSchedule[] => {
    if (level === 'fourth') {
      return [
        {
          courseCode: 'M1460',
          courseName: 'أطباء مساق الأمراض الباطنية (مبتدئ) — سنة دراسية رابعة',
          courseName_en: 'Internal Medicine (Junior) — 4th Year',
          weeksCount: 12,
          weekDates: ['29/8-5/9', '5/9-12/9', '12/9-19/9', '19/9-26/9', '26/9-3/10', '3/10-10/10', '10/10-17/10', '17/10-24/10', '24/10-31/10', '31/10-7/11', '7/11-14/11', '14/11-21/11'],
          doctors: [
            { id: '1', doctorName: 'د. عبدالله', doctorName_en: 'Dr. Abdallah', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G1', 4: '', 5: 'G5', 6: '', 7: 'G3', 8: '', 9: 'G4', 10: '', 11: '', 12: 'G2' } },
            { id: '2', doctorName: 'د. مجد', doctorName_en: 'Dr. Majd', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G3', 4: 'G2', 5: 'G2', 6: 'G1', 7: 'G1', 8: 'G5', 9: '', 10: 'G4', 11: '', 12: '' } },
            { id: '3', doctorName: 'د. رامي', doctorName_en: 'Dr. Rami', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G4', 4: '', 5: '', 6: 'G5', 7: 'G5', 8: '', 9: 'G3', 10: 'G3', 11: 'G2', 12: 'G1' } },
            { id: '4', doctorName: 'د. زيدان', doctorName_en: 'Dr. Zeidan', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G5', 4: 'G5', 5: '', 6: 'G4', 7: 'G4', 8: 'G3', 9: '', 10: 'G2', 11: 'G1', 12: '' } },
            { id: '5', doctorName: 'د. أشرف', doctorName_en: 'Dr. Ashraf', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G2', 4: 'G1', 5: 'G1', 6: '', 7: '', 8: 'G4', 9: 'G5', 10: 'G5', 11: 'G3', 12: 'G3' } },
            { id: '6', doctorName: 'د. بدوي', doctorName_en: 'Dr. Badawi', weeks: { 1: 'Lectures', 2: 'Lectures', 3: '', 4: 'G3', 5: 'G3', 6: 'G2', 7: 'G2', 8: 'G1', 9: 'G1', 10: '', 11: 'G4', 12: 'G4' } },
            { id: '7', doctorName: 'د. حمزة', doctorName_en: 'Dr. Hamza', weeks: { 1: 'Lectures', 2: 'Lectures', 3: '', 4: 'G4', 5: 'G4', 6: 'G3', 7: '', 8: 'G2', 9: 'G2', 10: 'G1', 11: 'G5', 12: 'G5' } },
          ]
        },
        {
          courseCode: 'M1470',
          courseName: 'أطباء مساق جراحة عامة (مبتدئ) — سنة دراسية رابعة',
          courseName_en: 'General Surgery (Junior) — 4th Year',
          weeksCount: 12,
          weekDates: ['29-8', '5-9', '12-9', '19-9', '26-9', '3-10', '10-10', '17-10', '24-10', '31-10', '7-11', '14-11'],
          doctors: [
            { id: '1', doctorName: 'د. احمد ابو يوسف', doctorName_en: 'Dr. Ahmad Abu Yousef', weeks: { 1: 'N1', 2: 'N1', 3: 'N2', 4: 'N3', 5: 'N4', 6: 'N4', 7: 'N5', 8: 'N3', 9: '', 10: 'N5', 11: '', 12: '' } },
            { id: '2', doctorName: 'د. خليل ابو زينة', doctorName_en: 'Dr. Khalil Abu Zeina', weeks: { 1: 'N2', 2: 'N2', 3: 'N1', 4: 'N4', 5: 'N3', 6: 'N3', 7: 'N1', 8: '', 9: 'N5', 10: '', 11: '', 12: '' } },
            { id: '3', doctorName: 'د. اسماعيل ارزيقات', doctorName_en: 'Dr. Ismail Rzeigat', weeks: { 1: 'N3', 2: 'N3', 3: 'N4', 4: 'N1', 5: '', 6: '', 7: 'N2', 8: 'N4', 9: 'N1', 10: '', 11: 'N5', 12: 'N5' } },
            { id: '4', doctorName: 'د. قيصر عوض', doctorName_en: 'Dr. Qaisar Awad', weeks: { 1: 'N5', 2: 'N5', 3: '', 4: 'N2', 5: 'N2', 6: 'N1', 7: '', 8: 'N1', 9: 'N2', 10: 'N3', 11: 'N4', 12: 'N4' } },
            { id: '5', doctorName: 'طبيب شاغر (1)', doctorName_en: 'Vacant Doctor (1)', weeks: { 1: '', 2: '', 3: 'N5', 4: '', 5: 'N1', 6: 'N2', 7: '', 8: '', 9: '', 10: 'N4', 11: 'N3', 12: 'N3' } },
            { id: '6', doctorName: 'د. رائد شواورة', doctorName_en: 'Dr. Raed Shawawreh', weeks: { 1: '', 2: '', 3: 'N3', 4: 'N5', 5: 'N5', 6: 'N3', 7: 'N3', 8: 'N4', 9: 'N4', 10: 'N1', 11: 'N2', 12: 'N2' } },
            { id: '7', doctorName: 'طبيب شاغر (2)', doctorName_en: 'Vacant Doctor (2)', weeks: { 1: 'N4', 2: 'N4', 3: '', 4: '', 5: '', 6: '', 7: 'N4', 8: 'N5', 9: '', 10: 'N2', 11: 'N1', 12: 'N1' } },
          ]
        },
        {
          courseCode: 'M1462',
          courseName: 'أطباء مساق التخصصات الباطنية الفرعية — سنة دراسية رابعة',
          courseName_en: 'Sub-specialties of Internal Medicine — 4th Year',
          weeksCount: 12,
          weekDates: ['Week 1 29/8', 'Week 2 05/9', 'Week 3 12/9', 'Week 4 19/9', 'Week 5 26/9', 'Week 6 03/10', 'Week 7 10/10', 'Week 8 17/10', 'Week 9 24/10', 'Week 10 31/10', 'Week 11 07/11', 'Week 12 14/11'],
          doctors: [
            { id: '1', doctorName: 'د. خالد الجبور', doctorName_en: 'Dr. Khaled Jabour', weeks: { 1: 'G2', 2: 'G2', 3: 'G3', 4: 'G3', 5: '', 6: '', 7: 'G5', 8: 'G5', 9: 'G1', 10: 'G1', 11: 'G4', 12: 'G4' } },
            { id: '2', doctorName: 'د. اياد العزة', doctorName_en: 'Dr. Iyad Azzeh', weeks: { 1: 'G5', 2: 'G5', 3: '', 4: '', 5: 'G1', 6: 'G1', 7: 'G4', 8: 'G4', 9: 'G2', 10: 'G2+G3', 11: 'G2+G3', 12: 'G3' } },
            { id: '3', doctorName: 'د. عمار العطار', doctorName_en: 'Dr. Ammar Attar', weeks: { 1: '', 2: '', 3: 'G5', 4: 'G5', 5: 'G4', 6: 'G4', 7: 'G1', 8: 'G1', 9: 'G3', 10: '', 11: '', 12: 'G2' } },
            { id: '4', doctorName: 'د. انس دويك', doctorName_en: 'Dr. Anas Dweik', weeks: { 1: '', 2: 'G3', 3: '', 4: 'G2', 5: 'G5', 6: '', 7: '', 8: '', 9: 'G4', 10: '', 11: 'G1', 12: '' } },
            { id: '5', doctorName: 'د. وائل الجعبري', doctorName_en: 'Dr. Wael Jaabari', weeks: { 1: 'G3', 2: '', 3: 'G2', 4: '', 5: '', 6: 'G5', 7: '', 8: '', 9: '', 10: 'G4', 11: '', 12: 'G1' } },
            { id: '6', doctorName: 'د. معتز التميمي', doctorName_en: 'Dr. Moataz Tamimi', weeks: { 1: 'G1', 2: 'G1', 3: 'G4', 4: 'G4', 5: 'G2', 6: 'G2', 7: 'G3', 8: 'G3', 9: 'G5', 10: 'G5', 11: '', 12: '' } },
            { id: '7', doctorName: 'د. بسام البشيتي', doctorName_en: 'Dr. Bassam Bsheiti', weeks: { 1: 'G4', 2: 'G4', 3: 'G1', 4: 'G1', 5: 'G3', 6: 'G3', 7: 'G2', 8: 'G2', 9: '', 10: '', 11: 'G5', 12: 'G5' } },
          ]
        }
      ];
    } else if (levelFilter === 'fifth') {
      return [
        {
          courseCode: 'M1582-A',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — First Trimester — مجموعة (A)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (A) — 5th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. اياد عفانة', doctorName_en: 'Dr. Iyad Afaneh', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'A7', 2: '', 3: 'A8', 4: 'A7', 5: 'A2', 6: 'A4', 7: 'A3', 8: 'A1', 9: 'A5', 10: '', 11: 'A6', 12: '' } },
            { id: '2', doctorName: 'د. عبد السلام حداد', doctorName_en: 'Dr. Abdulsalam Haddad', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'A8', 2: 'A8', 3: 'A7', 4: '', 5: 'A1', 6: 'A1', 7: 'A2', 8: 'A3', 9: 'A4', 10: 'A4', 11: 'A5', 12: 'A6' } },
            { id: '3', doctorName: 'د. بشار رشماوي', doctorName_en: 'Dr. Bashar Rashmawi', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: '', 2: 'A7', 3: 'A3', 4: 'A8', 5: 'A3', 6: 'A5', 7: 'A1', 8: 'A2', 9: 'A6', 10: 'A6', 11: 'A4', 12: 'A7' } },
            { id: '4', doctorName: 'د. بسام ناصر الدين', doctorName_en: 'Dr. Bassam Naser Al-Din', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'A1', 2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A2', 7: 'A5', 8: 'A6', 9: 'A7', 10: 'A8', 11: '', 12: 'A5' } },
            { id: '5', doctorName: 'د. سعيد الزعتري', doctorName_en: 'Dr. Saeed Zaatari', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'A2', 2: 'A2', 3: '', 4: 'A1', 5: 'A5', 6: 'A3', 7: 'A6', 8: 'A4', 9: 'A8', 10: 'A5', 11: 'A7', 12: 'A8' } },
            { id: '6', doctorName: 'د. نضال بحيص', doctorName_en: 'Dr. Nidal Buhais', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'A3', 2: 'A3', 3: 'A1', 4: 'A2', 5: 'A6', 6: 'A6', 7: 'A4', 8: 'A5', 9: '', 10: 'A7', 11: 'A8', 12: 'A4' } },
            { id: '7', doctorName: 'د. رامي القواسمة', doctorName_en: 'Dr. Rami Qawasmeh', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'A5', 2: 'A4', 3: 'A6', 4: 'A5', 5: 'A7', 6: 'A7', 7: '', 8: 'A8', 9: 'A2', 10: 'A1', 11: 'A3', 12: 'A1' } },
            { id: '8', doctorName: 'د. اسماعيل الحروب', doctorName_en: 'Dr. Ismail Haroub', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'A6', 2: 'A6', 3: 'A5', 4: 'A4', 5: 'A8', 6: 'A8', 7: 'A7', 8: '', 9: 'A1', 10: 'A3', 11: 'A2', 12: 'A2' } },
            { id: '9', doctorName: 'د. همام طميزي', doctorName_en: 'Dr. Homam Tmeizi', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'A4', 2: 'A5', 3: 'A4', 4: 'A6', 5: '', 6: '', 7: 'A8', 8: 'A7', 9: 'A3', 10: 'A2', 11: 'A1', 12: 'A3' } },
          ]
        },
        {
          courseCode: 'M1582-B',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — Second Trimester — مجموعة (B)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (B) — 5th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. اياد عفانة', doctorName_en: 'Dr. Iyad Afaneh', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'B7', 2: '', 3: 'B8', 4: 'B7', 5: 'B2', 6: 'B4', 7: 'B3', 8: 'B1', 9: 'B5', 10: '', 11: 'B6', 12: '' } },
            { id: '2', doctorName: 'د. عبد السلام حداد', doctorName_en: 'Dr. Abdulsalam Haddad', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'B8', 2: 'B8', 3: 'B7', 4: '', 5: 'B1', 6: 'B1', 7: 'B2', 8: 'B3', 9: 'B4', 10: 'B4', 11: 'B5', 12: 'B6' } },
            { id: '3', doctorName: 'د. بشار رشماوي', doctorName_en: 'Dr. Bashar Rashmawi', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: '', 2: 'B7', 3: 'B3', 4: 'B8', 5: 'B3', 6: 'B5', 7: 'B1', 8: 'B2', 9: 'B6', 10: 'B6', 11: 'B4', 12: 'B7' } },
            { id: '4', doctorName: 'د. بسام ناصر الدين', doctorName_en: 'Dr. Bassam Naser Al-Din', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'B1', 2: 'B1', 3: 'B2', 4: 'B3', 5: 'B4', 6: 'B2', 7: 'B5', 8: 'B6', 9: 'B7', 10: 'B8', 11: '', 12: 'B5' } },
            { id: '5', doctorName: 'د. سعيد الزعتري', doctorName_en: 'Dr. Saeed Zaatari', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'B2', 2: 'B2', 3: '', 4: 'B1', 5: 'B5', 6: 'B3', 7: 'B6', 8: 'B4', 9: 'B8', 10: 'B5', 11: 'B7', 12: 'B8' } },
            { id: '6', doctorName: 'د. نضال بحيص', doctorName_en: 'Dr. Nidal Buhais', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'B3', 2: 'B3', 3: 'B1', 4: 'B2', 5: 'B6', 6: 'B6', 7: 'B4', 8: 'B5', 9: '', 10: 'B7', 11: 'B8', 12: 'B4' } },
            { id: '7', doctorName: 'د. رامي القواسمة', doctorName_en: 'Dr. Rami Qawasmeh', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'B5', 2: 'B4', 3: 'B6', 4: 'B5', 5: 'B7', 6: 'B7', 7: '', 8: 'B8', 9: 'B2', 10: 'B1', 11: 'B3', 12: 'B1' } },
            { id: '8', doctorName: 'د. اسماعيل الحروب', doctorName_en: 'Dr. Ismail Haroub', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'B6', 2: 'B6', 3: 'B5', 4: 'B4', 5: 'B8', 6: 'B8', 7: 'B7', 8: '', 9: 'B1', 10: 'B3', 11: 'B2', 12: 'B2' } },
            { id: '9', doctorName: 'د. همام طميزي', doctorName_en: 'Dr. Homam Tmeizi', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'B4', 2: 'B5', 3: 'B4', 4: 'B6', 5: '', 6: '', 7: 'B8', 8: 'B7', 9: 'B3', 10: 'B2', 11: 'B1', 12: 'B3' } },
          ]
        },
        {
          courseCode: 'M1582-C',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — Third Trimester — مجموعة (C)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (C) — 5th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. اياد عفانة', doctorName_en: 'Dr. Iyad Afaneh', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'C7', 2: '', 3: 'C8', 4: 'C7', 5: 'C2', 6: 'C4', 7: 'C3', 8: 'C1', 9: 'C5', 10: '', 11: 'C6', 12: '' } },
            { id: '2', doctorName: 'د. عبد السلام حداد', doctorName_en: 'Dr. Abdulsalam Haddad', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'C8', 2: 'C8', 3: 'C7', 4: '', 5: 'C1', 6: 'C1', 7: 'C2', 8: 'C3', 9: 'C4', 10: 'C4', 11: 'C5', 12: 'C6' } },
            { id: '3', doctorName: 'د. بشار رشماوي', doctorName_en: 'Dr. Bashar Rashmawi', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: '', 2: 'C7', 3: 'C3', 4: 'C8', 5: 'C3', 6: 'C5', 7: 'C1', 8: 'C2', 9: 'C6', 10: 'C6', 11: 'C4', 12: 'C7' } },
            { id: '4', doctorName: 'د. بسام ناصر الدين', doctorName_en: 'Dr. Bassam Naser Al-Din', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'C1', 2: 'C1', 3: 'C2', 4: 'C3', 5: 'C4', 6: 'C2', 7: 'C5', 8: 'C6', 9: 'C7', 10: 'C8', 11: '', 12: 'C5' } },
            { id: '5', doctorName: 'د. سعيد الزعتري', doctorName_en: 'Dr. Saeed Zaatari', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'C2', 2: 'C2', 3: '', 4: 'C1', 5: 'C5', 6: 'C3', 7: 'C6', 8: 'C4', 9: 'C8', 10: 'C5', 11: 'C7', 12: 'C8' } },
            { id: '6', doctorName: 'د. نضال بحيص', doctorName_en: 'Dr. Nidal Buhais', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'C3', 2: 'C3', 3: 'C1', 4: 'C2', 5: 'C6', 6: 'C6', 7: 'C4', 8: 'C5', 9: '', 10: 'C7', 11: 'C8', 12: 'C4' } },
            { id: '7', doctorName: 'د. رامي القواسمة', doctorName_en: 'Dr. Rami Qawasmeh', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'C5', 2: 'C4', 3: 'C6', 4: 'C5', 5: 'C7', 6: 'C7', 7: '', 8: 'C8', 9: 'C2', 10: 'C1', 11: 'C3', 12: 'C1' } },
            { id: '8', doctorName: 'د. اسماعيل الحروب', doctorName_en: 'Dr. Ismail Haroub', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'C6', 2: 'C6', 3: 'C5', 4: 'C4', 5: 'C8', 6: 'C8', 7: 'C7', 8: '', 9: 'C1', 10: 'C3', 11: 'C2', 12: 'C2' } },
            { id: '9', doctorName: 'د. همام طميزي', doctorName_en: 'Dr. Homam Tmeizi', department: 'طب الأسرة', department_en: 'Family Medicine', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'C4', 2: 'C5', 3: 'C4', 4: 'C6', 5: '', 6: '', 7: 'C8', 8: 'C7', 9: 'C3', 10: 'C2', 11: 'C1', 12: 'C3' } },
          ]
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
          doctors: [
            { id: '1', doctorName: 'د. اياد الجدع (رئيس قسم)', doctorName_en: 'Dr. Iyad Jadaa (Dept Head)', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: 'رئيس قسم', weeksYear: 'رئيس قسم', weeks: { 1: 'Q8', 2: 'Q8', 3: 'Q3', 4: 'Q4', 5: 'Q7', 6: 'Q2', 7: 'Q6', 8: 'Q8', 9: '', 10: 'Q3', 11: 'Q5', 12: 'Q1' } },
            { id: '2', doctorName: 'د. عمار شاهين', doctorName_en: 'Dr. Ammar Shaheen', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'Q3', 2: 'Q3', 3: 'Q4', 4: 'Q8', 5: '', 6: 'Q7', 7: 'Q7', 8: 'Q6', 9: 'Q1', 10: 'Q1', 11: 'Q2', 12: 'Q5' } },
            { id: '3', doctorName: 'د. طلب العجلوني', doctorName_en: 'Dr. Talab Ajlouni', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'Q6', 2: 'Q6', 3: 'Q7', 4: 'Q3', 5: 'Q1', 6: 'Q1', 7: 'Q8', 8: 'Q5', 9: 'Q5', 10: 'Q5', 11: 'Q4', 12: 'Q2' } },
            { id: '4', doctorName: 'د. عامر ابو رميلة', doctorName_en: 'Dr. Amer Abu Rmeileh', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'Q7', 2: 'Q7', 3: 'Q8', 4: 'Q5', 5: 'Q6', 6: 'Q6', 7: 'Q2', 8: 'Q2', 9: 'Q3', 10: '', 11: 'Q1', 12: 'Q4' } },
            { id: '5', doctorName: 'د. رضوان ابو كرش', doctorName_en: 'Dr. Radwan Abu Karsh', department: 'جراحة - 2', department_en: 'Surgery - 2', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'Q4', 2: 'Q4', 3: 'Q5', 4: 'Q6', 5: 'Q8', 6: '', 7: 'Q1', 8: 'Q7', 9: 'Q2', 10: 'Q2', 11: 'Q3', 12: '' } },
            { id: '6', doctorName: 'د. عبد الناصر الجنيدي', doctorName_en: 'Dr. Abd Al-Nasser Junaidi', department: 'جراحة - 2', department_en: 'Surgery - 2', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'Q5', 2: 'Q5', 3: 'Q6', 4: 'Q7', 5: 'Q2', 6: 'Q8', 7: '', 8: 'Q1', 9: 'Q4', 10: 'Q4', 11: '', 12: 'Q3' } },
            { id: '7', doctorName: 'د. عمار الحداد', doctorName_en: 'Dr. Ammar Haddad', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'Q1', 2: 'Q1', 3: 'Q2', 4: '', 5: 'Q4', 6: 'Q3', 7: 'Q3', 8: 'Q5', 9: 'Q6', 10: 'Q8', 11: 'Q8', 12: 'Q7' } },
            { id: '8', doctorName: 'د. عبيدالله أبي سنينة', doctorName_en: 'Dr. Obaidallah Abu Sneineh', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'Q2', 2: 'Q2', 3: '', 4: 'Q1', 5: 'Q5', 6: 'Q5', 7: 'Q4', 8: 'Q3', 9: 'Q7', 10: 'Q7', 11: 'Q6', 12: 'Q8' } },
            { id: '9', doctorName: 'د. تامر شاور', doctorName_en: 'Dr. Tamer Shawar', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '10', weeksYear: '30', weeks: { 1: '', 2: '', 3: 'Q1', 4: 'Q2', 5: 'Q3', 6: 'Q4', 7: 'Q5', 8: 'Q3', 9: 'Q8', 10: 'Q6', 11: 'Q7', 12: 'Q6' } },
          ]
        },
        {
          courseCode: 'M1673-R',
          courseName: 'مساق جراحة عامة (متقدم) — مجموعة (R) — سنة سادسة',
          courseName_en: 'General Surgery & Emergency (R) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (8-Jan)', '2 (8-Aug)', '3 (15-8)', '4 (22-8)', '5 (29-8)', '6 (9-May)', '7 (9-Dec)', '8 (19-9)', '9 (26-9)', '10 (10-Mar)', '11 (10-Oct)', '12 (17-10)'],
          doctors: [
            { id: '1', doctorName: 'د. اياد الجدع (رئيس قسم)', doctorName_en: 'Dr. Iyad Jadaa (Dept Head)', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: 'رئيس قسم', weeksYear: 'رئيس قسم', weeks: { 1: 'R8', 2: 'R8', 3: 'R3', 4: 'R4', 5: 'R7', 6: 'R2', 7: 'R6', 8: 'R8', 9: '', 10: 'R3', 11: 'R5', 12: 'R1' } },
            { id: '2', doctorName: 'د. عمار شاهين', doctorName_en: 'Dr. Ammar Shaheen', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'R3', 2: 'R3', 3: 'R4', 4: 'R8', 5: '', 6: 'R7', 7: 'R7', 8: 'R6', 9: 'R1', 10: 'R1', 11: 'R2', 12: 'R5' } },
            { id: '3', doctorName: 'د. طلب العجلوني', doctorName_en: 'Dr. Talab Ajlouni', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'R6', 2: 'R6', 3: 'R7', 4: 'R3', 5: 'R1', 6: 'R1', 7: 'R8', 8: 'R5', 9: 'R5', 10: 'R5', 11: 'R4', 12: 'R2' } },
            { id: '4', doctorName: 'د. عامر ابو رميلة', doctorName_en: 'Dr. Amer Abu Rmeileh', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'R7', 2: 'R7', 3: 'R8', 4: 'R5', 5: 'R6', 6: 'R6', 7: 'R2', 8: 'R2', 9: 'R3', 10: '', 11: 'R1', 12: 'R4' } },
            { id: '5', doctorName: 'د. رضوان ابو كرش', doctorName_en: 'Dr. Radwan Abu Karsh', department: 'جراحة - 2', department_en: 'Surgery - 2', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'R4', 2: 'R4', 3: 'R5', 4: 'R6', 5: 'R8', 6: '', 7: 'R1', 8: 'R7', 9: 'R2', 10: 'R2', 11: 'R3', 12: '' } },
            { id: '6', doctorName: 'د. عبد الناصر الجنيدي', doctorName_en: 'Dr. Abd Al-Nasser Junaidi', department: 'جراحة - 2', department_en: 'Surgery - 2', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'R5', 2: 'R5', 3: 'R6', 4: 'R7', 5: 'R2', 6: 'R8', 7: '', 8: 'R1', 9: 'R4', 10: 'R4', 11: '', 12: 'R3' } },
            { id: '7', doctorName: 'د. عمار الحداد', doctorName_en: 'Dr. Ammar Haddad', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'R1', 2: 'R1', 3: 'R2', 4: '', 5: 'R4', 6: 'R3', 7: 'R3', 8: 'R5', 9: 'R6', 10: 'R8', 11: 'R8', 12: 'R7' } },
            { id: '8', doctorName: 'د. عبيدالله أبي سنينة', doctorName_en: 'Dr. Obaidallah Abu Sneineh', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'R2', 2: 'R2', 3: '', 4: 'R1', 5: 'R5', 6: 'R5', 7: 'R4', 8: 'R3', 9: 'R7', 10: 'R7', 11: 'R6', 12: 'R8' } },
            { id: '9', doctorName: 'د. تامر شاور', doctorName_en: 'Dr. Tamer Shawar', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '10', weeksYear: '30', weeks: { 1: '', 2: '', 3: 'R1', 4: 'R2', 5: 'R3', 6: 'R4', 7: 'R5', 8: 'R3', 9: 'R8', 10: 'R6', 11: 'R7', 12: 'R6' } },
          ]
        },
        {
          courseCode: 'M1673-S',
          courseName: 'مساق جراحة عامة (متقدم) — مجموعة (S) — سنة سادسة',
          courseName_en: 'General Surgery & Emergency (S) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (8-Jan)', '2 (8-Aug)', '3 (15-8)', '4 (22-8)', '5 (29-8)', '6 (9-May)', '7 (9-Dec)', '8 (19-9)', '9 (26-9)', '10 (10-Mar)', '11 (10-Oct)', '12 (17-10)'],
          doctors: [
            { id: '1', doctorName: 'د. اياد الجدع (رئيس قسم)', doctorName_en: 'Dr. Iyad Jadaa (Dept Head)', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: 'رئيس قسم', weeksYear: 'رئيس قسم', weeks: { 1: 'S8', 2: 'S8', 3: 'S3', 4: 'S4', 5: 'S7', 6: 'S2', 7: 'S6', 8: 'S8', 9: '', 10: 'S3', 11: 'S5', 12: 'S1' } },
            { id: '2', doctorName: 'د. عمار شاهين', doctorName_en: 'Dr. Ammar Shaheen', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'S3', 2: 'S3', 3: 'S4', 4: 'S8', 5: '', 6: 'S7', 7: 'S7', 8: 'S6', 9: 'S1', 10: 'S1', 11: 'S2', 12: 'S5' } },
            { id: '3', doctorName: 'د. طلب العجلوني', doctorName_en: 'Dr. Talab Ajlouni', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'S6', 2: 'S6', 3: 'S7', 4: 'S3', 5: 'S1', 6: 'S1', 7: 'S8', 8: 'S5', 9: 'S5', 10: 'S5', 11: 'S4', 12: 'S2' } },
            { id: '4', doctorName: 'د. عامر ابو رميلة', doctorName_en: 'Dr. Amer Abu Rmeileh', department: 'جراحة - 1', department_en: 'Surgery - 1', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'S7', 2: 'S7', 3: 'S8', 4: 'S5', 5: 'S6', 6: 'S6', 7: 'S2', 8: 'S2', 9: 'S3', 10: '', 11: 'S1', 12: 'S4' } },
            { id: '5', doctorName: 'د. رضوان ابو كرش', doctorName_en: 'Dr. Radwan Abu Karsh', department: 'جراحة - 2', department_en: 'Surgery - 2', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'S4', 2: 'S4', 3: 'S5', 4: 'S6', 5: 'S8', 6: '', 7: 'S1', 8: 'S7', 9: 'S2', 10: 'S2', 11: 'S3', 12: '' } },
            { id: '6', doctorName: 'د. عبد الناصر الجنيدي', doctorName_en: 'Dr. Abd Al-Nasser Junaidi', department: 'جراحة - 2', department_en: 'Surgery - 2', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'S5', 2: 'S5', 3: 'S6', 4: 'S7', 5: 'S2', 6: 'S8', 7: '', 8: 'S1', 9: 'S4', 10: 'S4', 11: '', 12: 'S3' } },
            { id: '7', doctorName: 'د. عمار الحداد', doctorName_en: 'Dr. Ammar Haddad', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'S1', 2: 'S1', 3: 'S2', 4: '', 5: 'S4', 6: 'S3', 7: 'S3', 8: 'S5', 9: 'S6', 10: 'S8', 11: 'S8', 12: 'S7' } },
            { id: '8', doctorName: 'د. عبيدالله أبي سنينة', doctorName_en: 'Dr. Obaidallah Abu Sneineh', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '11', weeksYear: '33', weeks: { 1: 'S2', 2: 'S2', 3: '', 4: 'S1', 5: 'S5', 6: 'S5', 7: 'S4', 8: 'S3', 9: 'S7', 10: 'S7', 11: 'S6', 12: 'S8' } },
            { id: '9', doctorName: 'د. تامر شاور', doctorName_en: 'Dr. Tamer Shawar', department: 'طوارئ', department_en: 'Emergency', weeksTrimester: '10', weeksYear: '30', weeks: { 1: '', 2: '', 3: 'S1', 4: 'S2', 5: 'S3', 6: 'S4', 7: 'S5', 8: 'S3', 9: 'S8', 10: 'S6', 11: 'S7', 12: 'S6' } },
          ]
        },
        {
          courseCode: 'M1661-Q',
          courseName: 'مساق الباطني والجراحات التخصصية الفرعية — مجموعة (Q) — سنة سادسة',
          courseName_en: 'Internal Medicine & Sub-specialties (Q) — 6th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. صفوت زيدات', doctorName_en: 'Dr. Safwat Zeidat', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'Q5', 2: 'Q5', 3: '', 4: 'Q6', 5: 'Q2', 6: 'Q3', 7: 'Q1', 8: '', 9: 'Q8', 10: 'Q7', 11: '', 12: 'Q4' } },
            { id: '2', doctorName: 'د. عمر ابو عليان', doctorName_en: 'Dr. Omar Olayan', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'Q4', 2: 'Q4', 3: 'Q6', 4: 'Q3', 5: '', 6: 'Q1', 7: 'Q2', 8: '', 9: 'Q7', 10: '', 11: 'Q8', 12: 'Q5' } },
            { id: '3', doctorName: 'د. روند العارضة', doctorName_en: 'Dr. Rawad Arda', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'Q3', 2: 'Q3', 3: 'Q1', 4: 'Q5', 5: '', 6: 'Q2', 7: 'Q8', 8: 'Q7', 9: '', 10: 'Q6', 11: 'Q4', 12: '' } },
            { id: '4', doctorName: 'د. انس ابو رميلة', doctorName_en: 'Dr. Anas Abu Rmeileh', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'Q6', 2: 'Q2', 3: 'Q2', 4: '', 5: 'Q1', 6: '', 7: 'Q3', 8: 'Q8', 9: '', 10: 'Q4', 11: 'Q5', 12: 'Q7' } },
            { id: '5', doctorName: 'د. حسن الحروب', doctorName_en: 'Dr. Hassan Haroub', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: '', 2: '', 3: 'Q5', 4: 'Q2', 5: 'Q3', 6: '', 7: 'Q7', 8: 'Q1', 9: 'Q4', 10: 'Q8', 11: 'Q6', 12: 'Q6' } },
            { id: '6', doctorName: 'د. محمود الهور', doctorName_en: 'Dr. Mahmoud Al-Hoor', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'Q1', 2: 'Q1', 3: 'Q3', 4: 'Q4', 5: 'Q8', 6: 'Q8', 7: '', 8: 'Q2', 9: 'Q6', 10: 'Q5', 11: 'Q7', 12: '' } },
            { id: '7', doctorName: 'د. احمد عطاونة', doctorName_en: 'Dr. Ahmad Atawneh', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'Q2', 2: 'Q6', 3: 'Q4', 4: 'Q1', 5: 'Q7', 6: 'Q7', 7: '', 8: 'Q3', 9: 'Q5', 10: '', 11: '', 12: 'Q8' } },
            { id: '8', doctorName: 'د. هشام نصار', doctorName_en: 'Dr. Hisham Nassar', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '4', weeksYear: '12', weeks: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '', 7: 'Q5', 8: 'Q4', 9: '', 10: '', 11: 'Q2', 12: 'Q1' } },
            { id: '9', doctorName: 'د. انس شاور', doctorName_en: 'Dr. Anas Shawar', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'Q8', 2: 'Q8', 3: 'Q7', 4: 'Q7', 5: 'Q6', 6: 'Q6', 7: 'Q4', 8: 'Q5', 9: 'Q3', 10: 'Q3', 11: 'Q1', 12: 'Q2' } },
            { id: '10', doctorName: 'د. رشاد الزرو', doctorName_en: 'Dr. Rashad Zaro', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '3 days', weeksYear: '29', weeks: { 1: '', 2: 'Q7', 3: 'Q8', 4: '', 5: 'Q5', 6: 'Q4', 7: 'Q6', 8: '', 9: 'Q2', 10: 'Q1', 11: '', 12: 'Q3' } },
            { id: '11', doctorName: 'د. نزار حجة', doctorName_en: 'Dr. Nizar Hijjeh', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '2 days', weeksYear: '19', weeks: { 1: 'Q7', 2: '', 3: '', 4: 'Q8', 5: 'Q5', 6: 'Q4', 7: 'Q6', 8: '', 9: 'Q2', 10: 'Q1', 11: 'Q3', 12: '' } },
          ]
        },
        {
          courseCode: 'M1661-S',
          courseName: 'مساق الباطني والجراحات التخصصية الفرعية — مجموعة (S) — سنة سادسة',
          courseName_en: 'Internal Medicine & Sub-specialties (S) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (01.08-06.08)', '2 (08.08-13.08)', '3 (15.08-20.08)', '4 (22.08-27.08)', '5 (29.08-03.09)', '6 (05.09-10.09)', '7 (12.09-17.09)', '8 (19.09-24.09)', '9 (26.09-01.10)', '10 (03.10-08.10)', '11 (10.10-15.10)', '12 (17.10-22.10)'],
          doctors: [
            { id: '1', doctorName: 'د. صفوت زيدات', doctorName_en: 'Dr. Safwat Zeidat', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'G4', 2: '', 3: 'G7', 4: 'G8', 5: '', 6: 'G1', 7: 'G3', 8: 'G2', 9: '', 10: 'G6', 11: 'G5', 12: 'G5' } },
            { id: '2', doctorName: 'د. عمر ابو عليان', doctorName_en: 'Dr. Omar Olayan', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'G5', 2: 'G8', 3: '', 4: 'G7', 5: '', 6: 'G2', 7: 'G1', 8: '', 9: 'G3', 10: 'G6', 11: 'G4', 12: 'G4' } },
            { id: '3', doctorName: 'د. روند العارضة', doctorName_en: 'Dr. Rawad Arda', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: '', 2: 'G4', 3: 'G6', 4: '', 5: 'G7', 6: 'G8', 7: 'G2', 8: '', 9: 'G5', 10: 'G1', 11: 'G3', 12: 'G3' } },
            { id: '4', doctorName: 'د. انس ابو رميلة', doctorName_en: 'Dr. Anas Abu Rmeileh', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'G7', 2: 'G5', 3: 'G4', 4: '', 5: 'G8', 6: 'G3', 7: '', 8: 'G1', 9: '', 10: 'G2', 11: 'G2', 12: 'G6' } },
            { id: '5', doctorName: 'د. حسن الحروب', doctorName_en: 'Dr. Hassan Haroub', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'G6', 2: 'G6', 3: 'G8', 4: 'G4', 5: 'G1', 6: 'G7', 7: '', 8: 'G3', 9: '', 10: 'G2', 11: 'G5', 12: '' } },
            { id: '6', doctorName: 'د. محمود الهور', doctorName_en: 'Dr. Mahmoud Al-Hoor', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '10', weeksYear: '30', weeks: { 1: '', 2: 'G7', 3: 'G5', 4: 'G6', 5: 'G2', 6: '', 7: 'G8', 8: 'G8', 9: 'G4', 10: 'G3', 11: 'G1', 12: 'G1' } },
            { id: '7', doctorName: 'د. احمد عطاونة', doctorName_en: 'Dr. Ahmad Atawneh', department: 'الباطني', department_en: 'Internal Medicine', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'G8', 2: '', 3: '', 4: 'G5', 5: 'G3', 6: '', 7: 'G7', 8: 'G7', 9: 'G1', 10: 'G4', 11: 'G6', 12: 'G2' } },
            { id: '8', doctorName: 'د. هشام نصار', doctorName_en: 'Dr. Hisham Nassar', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '4', weeksYear: '12', weeks: { 1: 'G1', 2: 'G2', 3: '', 4: '', 5: 'G4', 6: 'G5', 7: '', 8: '', 9: '', 10: '', 11: '', 12: '' } },
            { id: '9', doctorName: 'د. انس شاور', doctorName_en: 'Dr. Anas Shawar', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'G2', 2: 'G1', 3: 'G3', 4: 'G3', 5: 'G5', 6: 'G4', 7: 'G6', 8: 'G6', 9: 'G7', 10: 'G7', 11: 'G8', 12: 'G8' } },
            { id: '10', doctorName: 'د. رشاد الزرو', doctorName_en: 'Dr. Rashad Zaro', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '8', weeksYear: '24', weeks: { 1: 'G3', 2: '', 3: 'G1', 4: 'G2', 5: '', 6: 'G6', 7: 'G4', 8: 'G5', 9: '', 10: 'G8', 11: 'G7', 12: '' } },
            { id: '11', doctorName: 'د. نزار حجة', doctorName_en: 'Dr. Nizar Hijjeh', department: 'جراحات تخصصية فرعية', department_en: 'Sub-specialty Surgeries', weeksTrimester: '8', weeksYear: '24', weeks: { 1: '', 2: 'G3', 3: 'G1', 4: 'G2', 5: 'G6', 6: '', 7: 'G4', 8: 'G5', 9: 'G8', 10: '', 11: '', 12: 'G7' } },
          ]
        },
        {
          courseCode: 'M1688-Q',
          courseName: 'مساق الأطفال والنسائية والتوليد — مجموعة (Q) — سنة سادسة',
          courseName_en: 'Pediatrics & Obs/Gyne (Q) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (1/8-6/8)', '2 (8/8-13/8)', '3 (15/8-20/8)', '4 (22/8-27/8)', '5 (29/8-3/9)', '6 (5/9-10/9)', '7 (12/9-17/9)', '8 (19/9-24/9)', '9 (26/9-1/10)', '10 (1/10-8/10)', '11 (10/10-15/10)', '12 (17/10-22/10)'],
          doctors: [
            { id: '1', doctorName: 'د. هيام مرزوقة', doctorName_en: 'Dr. Hiyam Marzouqa', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'Q1', 2: 'Q1', 3: 'Q3', 4: 'Q3', 5: 'Q2', 6: 'Q4', 7: 'Q5', 8: 'Q5', 9: 'Q7', 10: 'Q7', 11: 'Q6', 12: 'Q8' } },
            { id: '2', doctorName: 'د. مهند أبوساكور', doctorName_en: 'Dr. Mohannad Abu Sakour', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'Q4', 2: 'Q4', 3: 'Q2', 4: 'Q2', 5: 'Q3', 6: 'Q1', 7: 'Q6', 8: 'Q6', 9: 'Q8', 10: 'Q8', 11: 'Q5', 12: 'Q7' } },
            { id: '3', doctorName: 'د. شريف حسان', doctorName_en: 'Dr. Sharif Hassan', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'Q2', 2: 'Q2', 3: 'Q4', 4: 'Q4', 5: 'Q1', 6: 'Q3', 7: 'Q7', 8: 'Q7', 9: 'Q5', 10: 'Q5', 11: 'Q8', 12: 'Q6' } },
            { id: '4', doctorName: 'د. أسامة كرجة', doctorName_en: 'Dr. Osama Karjeh', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'Q3', 2: 'Q3', 3: 'Q1', 4: 'Q1', 5: 'Q4', 6: 'Q2', 7: 'Q8', 8: 'Q8', 9: 'Q6', 10: 'Q6', 11: 'Q7', 12: 'Q5' } },
            { id: '5', doctorName: 'د. آلاء عباس', doctorName_en: 'Dr. Alaa Abbas', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'Q5', 2: 'Q6', 3: '', 4: 'Q5', 5: 'Q8', 6: 'Q7', 7: 'Q2', 8: 'Q3', 9: '', 10: 'Q4', 11: 'Q1', 12: 'Q1' } },
            { id: '6', doctorName: 'د. تامر مصلح', doctorName_en: 'Dr. Tamer Musleh', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'Q6', 2: 'Q7', 3: 'Q8', 4: 'Q8', 5: '', 6: 'Q5', 7: 'Q3', 8: 'Q1', 9: 'Q4', 10: '', 11: 'Q2', 12: '' } },
            { id: '7', doctorName: 'د. ممدوح دريدي', doctorName_en: 'Dr. Mamdouh Draidi', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: '', 2: 'Q8', 3: 'Q7', 4: '', 5: 'Q5', 6: 'Q6', 7: 'Q4', 8: '', 9: 'Q2', 10: 'Q1', 11: 'Q3', 12: 'Q3' } },
            { id: '8', doctorName: 'د. هشام ابو رميلة', doctorName_en: 'Dr. Hisham Abu Rmeileh', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'Q7', 2: '', 3: 'Q5', 4: 'Q6', 5: 'Q6', 6: 'Q8', 7: 'Q1', 8: 'Q4', 9: 'Q1', 10: 'Q3', 11: 'Q4', 12: 'Q2' } },
            { id: '9', doctorName: 'د. ضرار سميرات', doctorName_en: 'Dr. Derar Smeirat', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'Q8', 2: 'Q5', 3: 'Q6', 4: 'Q7', 5: 'Q7', 6: '', 7: 'Q1', 8: 'Q2', 9: 'Q3', 10: 'Q2', 11: '', 12: 'Q4' } },
          ]
        },
        {
          courseCode: 'M1688-R',
          courseName: 'مساق الأطفال والنسائية والتوليد — مجموعة (R) — سنة سادسة',
          courseName_en: 'Pediatrics & Obs/Gyne (R) — 6th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. هيام مرزوقة', doctorName_en: 'Dr. Hiyam Marzouqa', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'R1', 2: 'R1', 3: 'R3', 4: 'R3', 5: 'R2', 6: 'R4', 7: 'R5', 8: 'R5', 9: 'R7', 10: 'R7', 11: 'R6', 12: 'R8' } },
            { id: '2', doctorName: 'د. مهند أبوساكور', doctorName_en: 'Dr. Mohannad Abu Sakour', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'R4', 2: 'R4', 3: 'R2', 4: 'R2', 5: 'R3', 6: 'R1', 7: 'R6', 8: 'R6', 9: 'R8', 10: 'R8', 11: 'R5', 12: 'R7' } },
            { id: '3', doctorName: 'د. شريف حسان', doctorName_en: 'Dr. Sharif Hassan', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'R2', 2: 'R2', 3: 'R4', 4: 'R4', 5: 'R1', 6: 'R3', 7: 'R7', 8: 'R7', 9: 'R5', 10: 'R5', 11: 'R8', 12: 'R6' } },
            { id: '4', doctorName: 'د. أسامة كرجة', doctorName_en: 'Dr. Osama Karjeh', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'R3', 2: 'R3', 3: 'R1', 4: 'R1', 5: 'R4', 6: 'R2', 7: 'R8', 8: 'R8', 9: 'R6', 10: 'R6', 11: 'R7', 12: 'R5' } },
            { id: '5', doctorName: 'د. آلاء عباس', doctorName_en: 'Dr. Alaa Abbas', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'R5', 2: 'R6', 3: '', 4: 'R5', 5: 'R8', 6: 'R7', 7: 'R2', 8: 'R3', 9: '', 10: 'R4', 11: 'R1', 12: 'R1' } },
            { id: '6', doctorName: 'د. تامر مصلح', doctorName_en: 'Dr. Tamer Musleh', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'R6', 2: 'R7', 3: 'R8', 4: 'R8', 5: '', 6: 'R5', 7: 'R3', 8: 'R1', 9: 'R4', 10: '', 11: 'R2', 12: '' } },
            { id: '7', doctorName: 'د. ممدوح دريدي', doctorName_en: 'Dr. Mamdouh Draidi', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: '', 2: 'R8', 3: 'R7', 4: '', 5: 'R5', 6: 'R6', 7: 'R4', 8: '', 9: 'R2', 10: 'R1', 11: 'R3', 12: 'R3' } },
            { id: '8', doctorName: 'د. هشام ابو رميلة', doctorName_en: 'Dr. Hisham Abu Rmeileh', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'R7', 2: '', 3: 'R5', 4: 'R6', 5: 'R6', 6: 'R8', 7: 'R1', 8: 'R4', 9: 'R1', 10: 'R3', 11: 'R4', 12: 'R2' } },
            { id: '9', doctorName: 'د. ضرار سميرات', doctorName_en: 'Dr. Derar Smeirat', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'R8', 2: 'R5', 3: 'R6', 4: 'R7', 5: 'R7', 6: '', 7: 'R1', 8: 'R2', 9: 'R3', 10: 'R2', 11: '', 12: 'R4' } },
          ]
        },
        {
          courseCode: 'M1688-S',
          courseName: 'مساق الأطفال والنسائية والتوليد — مجموعة (S) — سنة سادسة',
          courseName_en: 'Pediatrics & Obs/Gyne (S) — 6th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. هيام مرزوقة', doctorName_en: 'Dr. Hiyam Marzouqa', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'S1', 2: 'S1', 3: 'S3', 4: 'S3', 5: 'S2', 6: 'S4', 7: 'S5', 8: 'S5', 9: 'S7', 10: 'S7', 11: 'S6', 12: 'S8' } },
            { id: '2', doctorName: 'د. مهند أبوساكور', doctorName_en: 'Dr. Mohannad Abu Sakour', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'S4', 2: 'S4', 3: 'S2', 4: 'S2', 5: 'S3', 6: 'S1', 7: 'S6', 8: 'S6', 9: 'S8', 10: 'S8', 11: 'S5', 12: 'S7' } },
            { id: '3', doctorName: 'د. شريف حسان', doctorName_en: 'Dr. Sharif Hassan', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'S2', 2: 'S2', 3: 'S4', 4: 'S4', 5: 'S1', 6: 'S3', 7: 'S7', 8: 'S7', 9: 'S5', 10: 'S5', 11: 'S8', 12: 'S6' } },
            { id: '4', doctorName: 'د. أسامة كرجة', doctorName_en: 'Dr. Osama Karjeh', department: 'الأطفال', department_en: 'Pediatrics', weeksTrimester: '12', weeksYear: '36', weeks: { 1: 'S3', 2: 'S3', 3: 'S1', 4: 'S1', 5: 'S4', 6: 'S2', 7: 'S8', 8: 'S8', 9: 'S6', 10: 'S6', 11: 'S7', 12: 'S5' } },
            { id: '5', doctorName: 'د. آلاء عباس', doctorName_en: 'Dr. Alaa Abbas', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'S5', 2: 'S6', 3: '', 4: 'S5', 5: 'S8', 6: 'S7', 7: 'S2', 8: 'S3', 9: '', 10: 'S4', 11: 'S1', 12: 'S1' } },
            { id: '6', doctorName: 'د. تامر مصلح', doctorName_en: 'Dr. Tamer Musleh', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: 'S6', 2: 'S7', 3: 'S8', 4: 'S8', 5: '', 6: 'S5', 7: 'S3', 8: 'S1', 9: 'S4', 10: '', 11: 'S2', 12: '' } },
            { id: '7', doctorName: 'د. ممدوح دريدي', doctorName_en: 'Dr. Mamdouh Draidi', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '9', weeksYear: '27', weeks: { 1: '', 2: 'S8', 3: 'S7', 4: '', 5: 'S5', 6: 'S6', 7: 'S4', 8: '', 9: 'S2', 10: 'S1', 11: 'S3', 12: 'S3' } },
            { id: '8', doctorName: 'د. هشام ابو رميلة', doctorName_en: 'Dr. Hisham Abu Rmeileh', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'S7', 2: '', 3: 'S5', 4: 'S6', 5: 'S6', 6: 'S8', 7: 'S1', 8: 'S4', 9: 'S1', 10: 'S3', 11: 'S4', 12: 'S2' } },
            { id: '9', doctorName: 'د. ضرار سميرات', doctorName_en: 'Dr. Derar Smeirat', department: 'النسائية والتوليد', department_en: 'Obs & Gynecology', weeksTrimester: '10', weeksYear: '30', weeks: { 1: 'S8', 2: 'S5', 3: 'S6', 4: 'S7', 5: 'S7', 6: '', 7: 'S1', 8: 'S2', 9: 'S3', 10: 'S2', 11: '', 12: 'S4' } },
          ]
        }
      ];
    }
  };

  // Helper to load courses per specific academic year & level
  const loadCoursesForYearAndLevel = (year: string, level: string): CourseSchedule[] => {
    const saved = localStorage.getItem(`cdms_course_schedules_${year}_${level}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // fallback
      }
    }
    // Only default initial year 2026/2027 gets default faculty seeds. Any new academic year starts completely clean!
    if (year === '2026/2027') {
      const legacy = localStorage.getItem(`cdms_course_schedules_${level}`);
      if (legacy) {
        try {
          return JSON.parse(legacy);
        } catch (e) {}
      }
      return getDefaultCoursesForLevel(level);
    }
    return [];
  };

  // State holding editable courses schedules (strictly keyed by academicYear + levelFilter)
  const [courseSchedules, setCourseSchedules] = useState<CourseSchedule[]>(() => {
    return loadCoursesForYearAndLevel(academicYear, levelFilter);
  });

  // Re-sync course schedules when level or academicYear changes
  useEffect(() => {
    setCourseSchedules(loadCoursesForYearAndLevel(academicYear, levelFilter));
    setSelectedCourseIndex(0);
  }, [levelFilter, academicYear]);

  // Save courses matrix
  const saveCourseSchedules = (updated: CourseSchedule[]) => {
    setCourseSchedules(updated);
    localStorage.setItem(`cdms_course_schedules_${academicYear}_${levelFilter}`, JSON.stringify(updated));
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

  // Add Course Handler
  const handleAddCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseFormName.trim()) return;
    const newCourse: CourseSchedule = {
      courseCode: courseFormCode.trim() || `CRS-${Date.now().toString().slice(-4)}`,
      courseName: courseFormName.trim(),
      courseName_en: courseFormNameEn.trim() || undefined,
      weeksCount: courseFormWeeks || 12,
      doctors: []
    };
    const updated = [...courseSchedules, newCourse];
    saveCourseSchedules(updated);
    setSelectedCourseIndex(updated.length - 1);
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

  // Add Doctor to Hospital Handler
  const handleAddHospDoctor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHospDocName.trim() || !targetHospId) return;
    saveHospitalGroups(hospitalGroups.map(h => {
      if (h.id === targetHospId) {
        return {
          ...h,
          doctors: [...h.doctors, { 
            id: Date.now().toString(), 
            name: newHospDocName.trim(),
            name_en: newHospDocNameEn.trim() || undefined,
            specialty: newHospDocSpecialty.trim() || undefined,
            specialty_en: newHospDocSpecialtyEn.trim() || undefined
          }]
        };
      }
      return h;
    }));
    setNewHospDocName('');
    setNewHospDocNameEn('');
    setNewHospDocSpecialty('');
    setNewHospDocSpecialtyEn('');
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
  const { data: studentsResponse, isLoading, isError, refetch } = useQuery({
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

  useEffect(() => {
    const currentLetters = groupLetters[levelFilter] || ['A', 'B', 'C'];
    setTempLetters(currentLetters);
    
    const saved = localStorage.getItem(`cdms_clinical_partition_${academicYear}_${levelFilter}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3) {
          setMainGroups(parsed);
          return;
        }
      } catch (e) {
        // fallback
      }
    }

    if (studentsList.length > 0) {
      partitionStudents(studentsList, currentLetters, subgroupCapacity);
    }
  }, [studentsList, levelFilter, subgroupCapacity, academicYear]);

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

  if (!can('distribution.view')) return <ErrorState title="Access Denied" message="You do not have permission to view clinical distribution." />;
  if (isLoading && studentsList.length === 0) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

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

          {/* Metrics & Capacity Controls Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            
            {/* Metric 1: Total Students */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'إجمالي طلبة الدفعة' : 'Total Students'}</span>
              <span className="text-lg font-black text-slate-800 mt-1 block">{studentsList.length} {locale === 'ar' ? 'طالب' : 'Students'}</span>
            </div>

            {/* Metric 2: 3 Main Groups & Assigned Letters */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 block">{locale === 'ar' ? 'المجموعات الرئيسية (3)' : 'Main Groups'}</span>
              <div className="flex items-center gap-1.5 mt-1">
                {(groupLetters[levelFilter] || ['A', 'B', 'C']).map((l, i) => (
                  <span key={i} className="w-7 h-7 rounded-lg bg-teal-50 text-teal-700 font-black text-xs flex items-center justify-center border border-teal-100">
                    {l}
                  </span>
                ))}
              </div>
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
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {locale === 'ar' ? 'اسم المساق بالعربية *' : 'Course Name in Arabic *'}
                </label>
                <input
                  required
                  type="text"
                  placeholder="مثال: أطباء مساق التخصصات الباطنية الفرعية — سنة رابعة"
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
                  placeholder="e.g. Sub-specialties of Internal Medicine — 4th Year"
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
                    placeholder="M1673-A"
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

    </div>
  );
}
