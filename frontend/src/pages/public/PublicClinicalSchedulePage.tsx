import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import ExcelJS from 'exceljs';
import hebronLogo from '@/assets/hebron.png';
import {
  Search,
  Building2,
  Stethoscope,
  Calendar,
  Users,
  Printer,
  Download,
  GraduationCap,
  Sparkles
} from 'lucide-react';

interface WeekScheduleItem {
  weekNum: number;
  weekDate?: string;
  courseCode: string;
  courseName: string;
  courseName_en?: string;
  doctorName: string;
  doctorName_en?: string;
  hospital: string;
  hospital_en?: string;
  department: string;
  department_en?: string;
  isLecture: boolean;
  rawCode: string;
}

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
  code: string;
  mainGroupLetter: string;
  students: StudentItem[];
  capacity: number;
}

interface MainGroup {
  letter: string;
  name: string;
  subgroups: Subgroup[];
}

interface DoctorScheduleRow {
  id: string;
  doctorName: string;
  doctorName_en?: string;
  department: string;
  department_en?: string;
  hospital?: string;
  hospital_en?: string;
  weeks: { [weekNumber: number]: string };
}

interface CourseSchedule {
  courseCode: string;
  courseName: string;
  courseName_en?: string;
  weeksCount: number;
  weekDates?: string[];
  doctors: DoctorScheduleRow[];
}

interface HospitalDoctor {
  id: string;
  name: string;
  name_en?: string;
}

interface HospitalGroup {
  id: string;
  name: string;
  name_en?: string;
  doctors: HospitalDoctor[];
}

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
      { id: '25', name: 'د. هاني عابدين', name_en: 'Dr. Hani Abdeen' },
      { id: '26', name: 'د. طارق الجعبة', name_en: 'Dr. Tareq Jaaba' },
      { id: '27', name: 'د. محمد الفطافطة', name_en: 'Dr. Mohammad Fatafta' },
      { id: '28', name: 'د. معاذ حلايقة', name_en: 'Dr. Moath Halayqa' },
      { id: '29', name: 'د. نهاد مسودة', name_en: 'Dr. Nihad Maswadeh' },
      { id: '30', name: 'د. عزيز حلايقة', name_en: 'Dr. Aziz Halayqa' },
      { id: '31', name: 'د. هبة ديرية', name_en: 'Dr. Hiba Diriyeh' },
      { id: '32', name: 'د. ايمن دعنا', name_en: 'Dr. Ayman Dana' },
      { id: '33', name: 'د. نادية ابو عيشة', name_en: 'Dr. Nadia Abu Eisheh' },
      { id: '34', name: 'د. اياد الدودة', name_en: 'Dr. Iyad Douda' },
      { id: '35', name: 'د. احمد طهبوب', name_en: 'Dr. Ahmad Tahboub' },
      { id: '36', name: 'د. بشار الكرد', name_en: 'Dr. Bashar Kurd' },
      { id: '37', name: 'د. احمد السيوري', name_en: 'Dr. Ahmad Sayouri' },
      { id: '38', name: 'د. مراد الفروخ', name_en: 'Dr. Murad Faroukh' },
      { id: '39', name: 'د. يوسف التكروري', name_en: 'Dr. Yousef Takruri' },
      { id: '40', name: 'د. اشرف ابو خيران', name_en: 'Dr. Ashraf Abu Kheiran' },
      { id: '41', name: 'د. خالد الجبور', name_en: 'Dr. Khaled Jabour' },
      { id: '42', name: 'د. اياد العزة', name_en: 'Dr. Iyad Azzeh' },
      { id: '43', name: 'د. عمار العطار', name_en: 'Dr. Ammar Attar' },
      { id: '44', name: 'د. معتز التميمي', name_en: 'Dr. Moataz Tamimi' },
      { id: '45', name: 'د. اياد عفانة', name_en: 'Dr. Iyad Afaneh' },
      { id: '46', name: 'د. رامي القواسمة', name_en: 'Dr. Rami Qawasmeh' },
      { id: '47', name: 'د. اسماعيل الحروب', name_en: 'Dr. Ismail Haroub' },
      { id: '48', name: 'د. همام طميزي', name_en: 'Dr. Homam Tmeizi' },
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

// Built-in hospital transliterations
const hospitalTransliterationMap: { [key: string]: string } = {
  'م. الأهلي': 'Al-Ahli Hospital',
  'م. الخليل الحكومي (عالية)': 'Alia Governmental Hospital',
  'م. عالية': 'Alia Governmental Hospital',
  'م. الهلال الأحمر': 'Red Crescent Hospital',
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

// Built-in doctor transliterations
const doctorTransliterationMap: { [key: string]: string } = {
  'د. طارق الجعبة': 'Dr. Tareq Jaaba',
  'د. هاني عابدين': 'Dr. Hani Abdeen',
  'د. محمد الفطافطة': 'Dr. Mohammad Fatafta',
  'د. معاذ حلايقة': 'Dr. Moath Halayqa',
  'د. نهاد مسودة': 'Dr. Nihad Maswadeh',
  'د. عزيز حلايقة': 'Dr. Aziz Halayqa',
  'د. هبة ديرية': 'Dr. Hiba Diriyeh',
  'د. ايمن دعنا': 'Dr. Ayman Dana',
  'د. خليل الشراونة': 'Dr. Khalil Sharawneh',
  'د. يوسف التكروري': 'Dr. Yousef Takruri',
  'د. عماد عابدين': 'Dr. Emad Abdeen',
  'د. بلال طنينة': 'Dr. Bilal Tanineh',
  'د. محمد الدراويش': 'Dr. Mohammad Darawish',
  'د. مراد غنام': 'Dr. Murad Ghannam',
  'د. نضال ابورجب': 'Dr. Nidal Abu Rajab',
  'د. محمد طهبوب': 'Dr. Mohammad Tahboub',
  'د. محمد النتشة': 'Dr. Mohammad Natsheh',
  'د. حازم كرجة': 'Dr. Hazem Karajah',
  'د. صلاح الهشلمون': 'Dr. Salah Hashlamoun',
  'د. محمد شنان': 'Dr. Mohammad Shanan',
  'د. اسامة الرجبي': 'Dr. Osama Rajabi',
  'د. عبد الرحيم السعيد': 'Dr. Abdul Rahim Saeed',
  'د. فخري النتشة': 'Dr. Fakhri Natsheh',
  'د. شاهر ابوخلف': 'Dr. Shaher Abu Khalaf',
  'د. معتز سلطان': 'Dr. Motaz Sultan',
  'د. وسام الرجوب': 'Dr. Wesam Rjoub',
  'د. مجدي الجمل': 'Dr. Majdi Jamal',
  'د. غسان ابوخلف': 'Dr. Ghassan Abu Khalaf',
  'د. مريم العويوي': 'Dr. Maryam Oweiwi',
  'د. مصطفى القواسمي': 'Dr. Mustafa Qawasmi',
  'د. احمد الجولاني': 'Dr. Ahmad Joulani',
  'د. غدير حسونة': 'Dr. Ghadeer Hassouneh',
  'د. ولاء سدر': 'Dr. Walaa Seder',
  'د. فوزي ابوحلاوة': 'Dr. Fawzi Abu Halawa',
  'د. شاهر زلوم': 'Dr. Shaher Zaloum',
  'د. محمد طقاطقة': 'Dr. Mohammad Taqatqa',
  'د. رمزي الشعيبات': 'Dr. Ramzi Shuaibat',
  'د. عبد الغني شنان': 'Dr. Abdul Ghani Shanan',
  'د. محمد قراقع': 'Dr. Mohammad Qaraqe',
  'د. احمد الشواورة': 'Dr. Ahmad Shawawreh',
  'د. محمد عياد': 'Dr. Mohammad Ayyad',
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



export function PublicClinicalSchedulePage() {
  const [searchParams] = useSearchParams();
  const [locale] = useState<'ar' | 'en'>('ar');

  // Academic year automatically derived from shared link or system active year
  const academicYear: string = useMemo(() => {
    const paramYear = searchParams.get('year');
    if (paramYear) return paramYear;
    const saved = localStorage.getItem('cdms_academic_years');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
      } catch (e) {}
    }
    return '2026/2027';
  }, [searchParams]);

  // Search input
  const [searchInput, setSearchInput] = useState<string>(searchParams.get('id') || '');
  const [activeQuery, setActiveQuery] = useState<string>(searchParams.get('id') || '');
  const [hasSearched, setHasSearched] = useState<boolean>(Boolean(searchParams.get('id')));

  // Localized helper
  const getLocalizedHospitalName = (name?: string, name_en?: string): string => {
    if (!name && !name_en) return '';
    if (locale === 'en') {
      if (name_en) return name_en;
      if (name && hospitalTransliterationMap[name]) return hospitalTransliterationMap[name];
      for (const [k, v] of Object.entries(hospitalTransliterationMap)) {
        if (name && (name.includes(k) || k.includes(name))) return v;
      }
    }
    return name || name_en || '';
  };

  const getDoctorDisplayName = (name?: string, name_en?: string): string => {
    if (!name && !name_en) return '';
    const cleanAr = name?.trim() || '';
    if (locale === 'en') {
      if (name_en) return name_en;
      if (doctorTransliterationMap[cleanAr]) return doctorTransliterationMap[cleanAr];
      if (cleanAr.startsWith('د.')) {
        return 'Dr. ' + cleanAr.replace(/^د\.\s*/, '');
      }
      return cleanAr;
    }
    return cleanAr;
  };

  const getLevelDisplayName = (lvl: string) => {
    if (lvl === 'fourth' || lvl === '4th_year') return locale === 'ar' ? 'السنة الرابعة (المرحلة السريرية الأولى)' : '4th Year (Clinical Phase I)';
    if (lvl === 'fifth' || lvl === '5th_year') return locale === 'ar' ? 'السنة الخامسة (المرحلة السريرية الثانية)' : '5th Year (Clinical Phase II)';
    if (lvl === 'sixth' || lvl === '6th_year') return locale === 'ar' ? 'السنة السادسة (سنة الامتياز والتدريب النهائي)' : '6th Year (Final Clinical Phase)';
    return lvl;
  };

  // Fetch all students across all levels
  const { data: allStudentsData, isLoading: isStudentsLoading } = useQuery({
    queryKey: ['public-all-students'],
    queryFn: () => apiFetch<any>('/students?per_page=1000'),
  });

  const allStudentsList: StudentItem[] = useMemo(() => {
    if (Array.isArray(allStudentsData)) return allStudentsData;
    return allStudentsData?.data || allStudentsData?.items || [];
  }, [allStudentsData]);

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

  // Load Hospitals Directory (with automatic fallback to defaultHospitalGroups)
  const hospitalGroups: HospitalGroup[] = useMemo(() => {
    const saved = localStorage.getItem('cdms_hospital_doctors');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // fallback
      }
    }
    return defaultHospitalGroups;
  }, []);

  const getDoctorHospital = (docName: string): string => {
    if (!docName) return 'م. الأهلي';
    const clean = normalizeDocName(docName);
    for (const h of hospitalGroups) {
      for (const d of h.doctors) {
        const cD = normalizeDocName(d.name);
        if (
          cD === clean || 
          clean.includes(cD) || 
          cD.includes(clean) ||
          (clean.split(' ')[0] && cD.split(' ')[0] === clean.split(' ')[0] && clean.split(' ')[0].length >= 3)
        ) {
          return h.name;
        }
      }
    }
    return 'م. الأهلي';
  };

  // Default courses fallback generator
  const getDefaultCourses = (level: string): CourseSchedule[] => {
    if (level === 'fourth') {
      return [
        {
          courseCode: 'M1460',
          courseName: 'أطباء مساق الأمراض الباطنية (مبتدئ) — سنة دراسية رابعة',
          courseName_en: 'Internal Medicine (Junior) — 4th Year',
          weeksCount: 12,
          weekDates: ['29/8-5/9', '5/9-12/9', '12/9-19/9', '19/9-26/9', '26/9-3/10', '3/10-10/10', '10/10-17/10', '17/10-24/10', '24/10-31/10', '31/10-7/11', '7/11-14/11', '14/11-21/11'],
          doctors: [
            { id: '1', doctorName: 'د. عبدالله', doctorName_en: 'Dr. Abdallah', department: 'باطني - 1', department_en: 'Internal Medicine - 1', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G1', 4: '', 5: 'G5', 6: '', 7: 'G3', 8: '', 9: 'G4', 10: '', 11: '', 12: 'G2' } },
            { id: '2', doctorName: 'د. مجد', doctorName_en: 'Dr. Majd', department: 'باطني - 1', department_en: 'Internal Medicine - 1', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G3', 4: 'G2', 5: 'G2', 6: 'G1', 7: 'G1', 8: 'G5', 9: '', 10: 'G4', 11: '', 12: '' } },
            { id: '3', doctorName: 'د. رامي', doctorName_en: 'Dr. Rami', department: 'باطني - 2', department_en: 'Internal Medicine - 2', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G4', 4: '', 5: '', 6: 'G5', 7: 'G5', 8: '', 9: 'G3', 10: 'G3', 11: 'G2', 12: 'G1' } },
            { id: '4', doctorName: 'د. زيدان', doctorName_en: 'Dr. Zeidan', department: 'باطني - 2', department_en: 'Internal Medicine - 2', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G5', 4: 'G5', 5: '', 6: 'G4', 7: 'G4', 8: 'G3', 9: '', 10: 'G2', 11: 'G1', 12: '' } },
            { id: '5', doctorName: 'د. أشرف', doctorName_en: 'Dr. Ashraf', department: 'باطني - 3', department_en: 'Internal Medicine - 3', weeks: { 1: 'Lectures', 2: 'Lectures', 3: 'G2', 4: 'G1', 5: 'G1', 6: '', 7: '', 8: 'G4', 9: 'G5', 10: 'G5', 11: 'G3', 12: 'G3' } },
            { id: '6', doctorName: 'د. بدوي', doctorName_en: 'Dr. Badawi', department: 'باطني - 3', department_en: 'Internal Medicine - 3', weeks: { 1: 'Lectures', 2: 'Lectures', 3: '', 4: 'G3', 5: 'G3', 6: 'G2', 7: 'G2', 8: 'G1', 9: 'G1', 10: '', 11: 'G4', 12: 'G4' } },
            { id: '7', doctorName: 'د. حمزة', doctorName_en: 'Dr. Hamza', department: 'باطني - 4', department_en: 'Internal Medicine - 4', weeks: { 1: 'Lectures', 2: 'Lectures', 3: '', 4: 'G4', 5: 'G4', 6: 'G3', 7: '', 8: 'G2', 9: 'G2', 10: 'G1', 11: 'G5', 12: 'G5' } },
          ]
        },
        {
          courseCode: 'M1470',
          courseName: 'أطباء مساق جراحة عامة (مبتدئ) — سنة دراسية رابعة',
          courseName_en: 'General Surgery (Junior) — 4th Year',
          weeksCount: 12,
          weekDates: ['29-8', '5-9', '12-9', '19-9', '26-9', '3-10', '10-10', '17-10', '24-10', '31-10', '7-11', '14-11'],
          doctors: [
            { id: '1', doctorName: 'د. احمد ابو يوسف', doctorName_en: 'Dr. Ahmad Abu Yousef', department: 'جراحة - 1', department_en: 'Surgery - 1', weeks: { 1: 'N1', 2: 'N1', 3: 'N2', 4: 'N3', 5: 'N4', 6: 'N4', 7: 'N5', 8: 'N3', 9: '', 10: 'N5', 11: '', 12: '' } },
            { id: '2', doctorName: 'د. خليل ابو زينة', doctorName_en: 'Dr. Khalil Abu Zeina', department: 'جراحة - 1', department_en: 'Surgery - 1', weeks: { 1: 'N2', 2: 'N2', 3: 'N1', 4: 'N4', 5: 'N3', 6: 'N3', 7: 'N1', 8: '', 9: 'N5', 10: '', 11: '', 12: '' } },
            { id: '3', doctorName: 'د. اسماعيل ارزيقات', doctorName_en: 'Dr. Ismail Rzeigat', department: 'جراحة - 2', department_en: 'Surgery - 2', weeks: { 1: 'N3', 2: 'N3', 3: 'N4', 4: 'N1', 5: '', 6: '', 7: 'N2', 8: 'N4', 9: 'N1', 10: '', 11: 'N5', 12: 'N5' } },
            { id: '4', doctorName: 'د. قيصر عوض', doctorName_en: 'Dr. Qaisar Awad', department: 'جراحة - 2', department_en: 'Surgery - 2', weeks: { 1: 'N5', 2: 'N5', 3: '', 4: 'N2', 5: 'N2', 6: 'N1', 7: '', 8: 'N1', 9: 'N2', 10: 'N3', 11: 'N4', 12: 'N4' } },
            { id: '5', doctorName: 'د. رائد شواورة', doctorName_en: 'Dr. Raed Shawawreh', department: 'جراحة - 3', department_en: 'Surgery - 3', weeks: { 1: '', 2: '', 3: 'N3', 4: 'N5', 5: 'N5', 6: 'N3', 7: 'N3', 8: 'N4', 9: 'N4', 10: 'N1', 11: 'N2', 12: 'N2' } },
          ]
        },
        {
          courseCode: 'M1462',
          courseName: 'أطباء مساق التخصصات الباطنية الفرعية — سنة دراسية رابعة',
          courseName_en: 'Sub-specialties of Internal Medicine — 4th Year',
          weeksCount: 12,
          weekDates: ['Week 1 29/8', 'Week 2 05/9', 'Week 3 12/9', 'Week 4 19/9', 'Week 5 26/9', 'Week 6 03/10', 'Week 7 10/10', 'Week 8 17/10', 'Week 9 24/10', 'Week 10 31/10', 'Week 11 07/11', 'Week 12 14/11'],
          doctors: [
            { id: '1', doctorName: 'د. خالد الجبور', doctorName_en: 'Dr. Khaled Jabour', department: 'باطني - 1', department_en: 'Internal Medicine - 1', weeks: { 1: 'G2', 2: 'G2', 3: 'G3', 4: 'G3', 5: '', 6: '', 7: 'G5', 8: 'G5', 9: 'G1', 10: 'G1', 11: 'G4', 12: 'G4' } },
            { id: '2', doctorName: 'د. اياد العزة', doctorName_en: 'Dr. Iyad Azzeh', department: 'باطني - 1', department_en: 'Internal Medicine - 1', weeks: { 1: 'G5', 2: 'G5', 3: '', 4: '', 5: 'G1', 6: 'G1', 7: 'G4', 8: 'G4', 9: 'G2', 10: 'G2+G3', 11: 'G2+G3', 12: 'G3' } },
            { id: '3', doctorName: 'د. عمار العطار', doctorName_en: 'Dr. Ammar Attar', department: 'باطني - 2', department_en: 'Internal Medicine - 2', weeks: { 1: '', 2: '', 3: 'G5', 4: 'G5', 5: 'G4', 6: 'G4', 7: 'G1', 8: 'G1', 9: 'G3', 10: '', 11: '', 12: 'G2' } },
            { id: '4', doctorName: 'د. معتز التميمي', doctorName_en: 'Dr. Moataz Tamimi', department: 'باطني - 2', department_en: 'Internal Medicine - 2', weeks: { 1: 'G1', 2: 'G1', 3: 'G4', 4: 'G4', 5: 'G2', 6: 'G2', 7: 'G3', 8: 'G3', 9: 'G5', 10: 'G5', 11: '', 12: '' } },
            { id: '5', doctorName: 'د. بسام البشيتي', doctorName_en: 'Dr. Bassam Bsheiti', department: 'باطني - 3', department_en: 'Internal Medicine - 3', weeks: { 1: 'G4', 2: 'G4', 3: 'G1', 4: 'G1', 5: 'G3', 6: 'G3', 7: 'G2', 8: 'G2', 9: '', 10: '', 11: 'G5', 12: 'G5' } },
          ]
        }
      ];
    } else if (level === 'fifth') {
      return [
        {
          courseCode: 'M1582-A',
          courseName: 'مساق النسائية والتوليد وطب الأسرة — First Trimester — مجموعة (A)',
          courseName_en: 'Obstetrics & Gynecology + Family Medicine (A) — 5th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. اياد عفانة', doctorName_en: 'Dr. Iyad Afaneh', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeks: { 1: 'A7', 2: '', 3: 'A8', 4: 'A7', 5: 'A2', 6: 'A4', 7: 'A3', 8: 'A1', 9: 'A5', 10: '', 11: 'A6', 12: '' } },
            { id: '2', doctorName: 'د. عبد السلام حداد', doctorName_en: 'Dr. Abdulsalam Haddad', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeks: { 1: 'A8', 2: 'A8', 3: 'A7', 4: '', 5: 'A1', 6: 'A1', 7: 'A2', 8: 'A3', 9: 'A4', 10: 'A4', 11: 'A5', 12: 'A6' } },
            { id: '3', doctorName: 'د. بشار رشماوي', doctorName_en: 'Dr. Bashar Rashmawi', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeks: { 1: '', 2: 'A7', 3: 'A3', 4: 'A8', 5: 'A3', 6: 'A5', 7: 'A1', 8: 'A2', 9: 'A6', 10: 'A6', 11: 'A4', 12: 'A7' } },
            { id: '4', doctorName: 'د. بسام ناصر الدين', doctorName_en: 'Dr. Bassam Naser Al-Din', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeks: { 1: 'A1', 2: 'A1', 3: 'A2', 4: 'A3', 5: 'A4', 6: 'A2', 7: 'A5', 8: 'A6', 9: 'A7', 10: 'A8', 11: '', 12: 'A5' } },
            { id: '5', doctorName: 'د. سعيد الزعتري', doctorName_en: 'Dr. Saeed Zaatari', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeks: { 1: 'A2', 2: 'A2', 3: '', 4: 'A1', 5: 'A5', 6: 'A3', 7: 'A6', 8: 'A4', 9: 'A8', 10: 'A5', 11: 'A7', 12: 'A8' } },
            { id: '6', doctorName: 'د. نضال بحيص', doctorName_en: 'Dr. Nidal Buhais', department: 'نسائية و توليد', department_en: 'Obs & Gynecology', weeks: { 1: 'A3', 2: 'A3', 3: 'A1', 4: 'A2', 5: 'A6', 6: 'A6', 7: 'A4', 8: 'A5', 9: '', 10: 'A7', 11: 'A8', 12: 'A4' } },
            { id: '7', doctorName: 'د. رامي القواسمة', doctorName_en: 'Dr. Rami Qawasmeh', department: 'طب الأسرة', department_en: 'Family Medicine', weeks: { 1: 'A5', 2: 'A4', 3: 'A6', 4: 'A5', 5: 'A7', 6: 'A7', 7: '', 8: 'A8', 9: 'A2', 10: 'A1', 11: 'A3', 12: 'A1' } },
            { id: '8', doctorName: 'د. اسماعيل الحروب', doctorName_en: 'Dr. Ismail Haroub', department: 'طب الأسرة', department_en: 'Family Medicine', weeks: { 1: 'A6', 2: 'A6', 3: 'A5', 4: 'A4', 5: 'A8', 6: 'A8', 7: 'A7', 8: '', 9: 'A1', 10: 'A3', 11: 'A2', 12: 'A2' } },
            { id: '9', doctorName: 'د. همام طميزي', doctorName_en: 'Dr. Homam Tmeizi', department: 'طب الأسرة', department_en: 'Family Medicine', weeks: { 1: 'A4', 2: 'A5', 3: 'A4', 4: 'A6', 5: '', 6: '', 7: 'A8', 8: 'A7', 9: 'A3', 10: 'A2', 11: 'A1', 12: 'A3' } },
          ]
        }
      ];
    } else {
      // 6th year
      return [
        {
          courseCode: 'M1673-Q',
          courseName: 'مساق جراحة عامة (متقدم) — مجموعة (Q) — سنة سادسة',
          courseName_en: 'General Surgery & Emergency (Q) — 6th Year',
          weeksCount: 12,
          weekDates: ['1 (8-Jan)', '2 (8-Aug)', '3 (15-8)', '4 (22-8)', '5 (29-8)', '6 (9-May)', '7 (9-Dec)', '8 (19-9)', '9 (26-9)', '10 (10-Mar)', '11 (10-Oct)', '12 (17-10)'],
          doctors: [
            { id: '1', doctorName: 'د. اياد الجدع (رئيس قسم)', doctorName_en: 'Dr. Iyad Jadaa (Dept Head)', department: 'جراحة - 1', department_en: 'Surgery - 1', weeks: { 1: 'Q8', 2: 'Q8', 3: 'Q3', 4: 'Q4', 5: 'Q7', 6: 'Q2', 7: 'Q6', 8: 'Q8', 9: '', 10: 'Q3', 11: 'Q5', 12: 'Q1' } },
            { id: '2', doctorName: 'د. عمار شاهين', doctorName_en: 'Dr. Ammar Shaheen', department: 'جراحة - 1', department_en: 'Surgery - 1', weeks: { 1: 'Q3', 2: 'Q3', 3: 'Q4', 4: 'Q8', 5: '', 6: 'Q7', 7: 'Q7', 8: 'Q6', 9: 'Q1', 10: 'Q1', 11: 'Q2', 12: 'Q5' } },
            { id: '3', doctorName: 'د. طلب العجلوني', doctorName_en: 'Dr. Talab Ajlouni', department: 'جراحة - 1', department_en: 'Surgery - 1', weeks: { 1: 'Q6', 2: 'Q6', 3: 'Q7', 4: 'Q3', 5: 'Q1', 6: 'Q1', 7: 'Q8', 8: 'Q5', 9: 'Q5', 10: 'Q5', 11: 'Q4', 12: 'Q2' } },
            { id: '4', doctorName: 'د. عامر ابو رميلة', doctorName_en: 'Dr. Amer Abu Rmeileh', department: 'جراحة - 1', department_en: 'Surgery - 1', weeks: { 1: 'Q7', 2: 'Q7', 3: 'Q8', 4: 'Q5', 5: 'Q6', 6: 'Q6', 7: 'Q2', 8: 'Q2', 9: 'Q3', 10: '', 11: 'Q1', 12: 'Q4' } },
            { id: '5', doctorName: 'د. رضوان ابو كرش', doctorName_en: 'Dr. Radwan Abu Karsh', department: 'جراحة - 2', department_en: 'Surgery - 2', weeks: { 1: 'Q4', 2: 'Q4', 3: 'Q5', 4: 'Q6', 5: 'Q8', 6: '', 7: 'Q1', 8: 'Q7', 9: 'Q2', 10: 'Q2', 11: 'Q3', 12: '' } },
            { id: '6', doctorName: 'د. عبد الناصر الجنيدي', doctorName_en: 'Dr. Abd Al-Nasser Junaidi', department: 'جراحة - 2', department_en: 'Surgery - 2', weeks: { 1: 'Q5', 2: 'Q5', 3: 'Q6', 4: 'Q7', 5: 'Q2', 6: 'Q8', 7: '', 8: 'Q1', 9: 'Q4', 10: 'Q4', 11: '', 12: 'Q3' } },
            { id: '7', doctorName: 'د. عمار الحداد', doctorName_en: 'Dr. Ammar Haddad', department: 'طوارئ', department_en: 'Emergency', weeks: { 1: 'Q1', 2: 'Q1', 3: 'Q2', 4: '', 5: 'Q4', 6: 'Q3', 7: 'Q3', 8: 'Q5', 9: 'Q6', 10: 'Q8', 11: 'Q8', 12: 'Q7' } },
            { id: '8', doctorName: 'د. عبيدالله أبي سنينة', doctorName_en: 'Dr. Obaidallah Abu Sneineh', department: 'طوارئ', department_en: 'Emergency', weeks: { 1: 'Q2', 2: 'Q2', 3: '', 4: 'Q1', 5: 'Q5', 6: 'Q5', 7: 'Q4', 8: 'Q3', 9: 'Q7', 10: 'Q7', 11: 'Q6', 12: 'Q8' } },
            { id: '9', doctorName: 'د. تامر شاور', doctorName_en: 'Dr. Tamer Shawar', department: 'طوارئ', department_en: 'Emergency', weeks: { 1: '', 2: '', 3: 'Q1', 4: 'Q2', 5: 'Q3', 6: 'Q4', 7: 'Q5', 8: 'Q3', 9: 'Q8', 10: 'Q6', 11: 'Q7', 12: 'Q6' } },
          ]
        },
        {
          courseCode: 'M1661-Q',
          courseName: 'مساق أمراض الأطفال (متقدم) — مجموعة (Q) — سنة سادسة',
          courseName_en: 'Pediatrics (Advanced) (Q) — 6th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. نادية ابو عيشة (رئيس قسم)', doctorName_en: 'Dr. Nadia Abu Eisheh (Dept Head)', department: 'أطفال - 1', department_en: 'Pediatrics - 1', weeks: { 1: 'Q7', 2: 'Q7', 3: 'Q8', 4: 'Q2', 5: 'Q3', 6: 'Q1', 7: 'Q5', 8: 'Q7', 9: '', 10: 'Q8', 11: 'Q6', 12: 'Q4' } },
            { id: '2', doctorName: 'د. اياد الدودة', doctorName_en: 'Dr. Iyad Douda', department: 'أطفال - 1', department_en: 'Pediatrics - 1', weeks: { 1: 'Q2', 2: 'Q2', 3: 'Q3', 4: 'Q7', 5: 'Q8', 6: 'Q6', 7: 'Q1', 8: 'Q2', 9: 'Q4', 10: 'Q7', 11: 'Q5', 12: 'Q3' } },
            { id: '3', doctorName: 'د. احمد طهبوب', doctorName_en: 'Dr. Ahmad Tahboub', department: 'أطفال - 2', department_en: 'Pediatrics - 2', weeks: { 1: 'Q8', 2: 'Q8', 3: 'Q1', 4: 'Q3', 5: 'Q2', 6: 'Q7', 7: 'Q6', 8: 'Q8', 9: 'Q5', 10: 'Q2', 11: 'Q4', 12: 'Q1' } },
            { id: '4', doctorName: 'د. بشار الكرد', doctorName_en: 'Dr. Bashar Kurd', department: 'أطفال - 2', department_en: 'Pediatrics - 2', weeks: { 1: 'Q1', 2: 'Q1', 3: 'Q2', 4: 'Q8', 5: 'Q7', 6: 'Q3', 7: 'Q4', 8: 'Q1', 9: 'Q6', 10: 'Q3', 11: 'Q8', 12: 'Q5' } },
            { id: '5', doctorName: 'د. احمد السيوري', doctorName_en: 'Dr. Ahmad Sayouri', department: 'أطفال - 3', department_en: 'Pediatrics - 3', weeks: { 1: 'Q4', 2: 'Q4', 3: 'Q5', 4: 'Q6', 5: 'Q1', 6: 'Q8', 7: 'Q7', 8: 'Q4', 9: 'Q2', 10: 'Q5', 11: 'Q3', 12: 'Q8' } },
            { id: '6', doctorName: 'د. مراد الفروخ', doctorName_en: 'Dr. Murad Faroukh', department: 'أطفال - 3', department_en: 'Pediatrics - 3', weeks: { 1: 'Q5', 2: 'Q5', 3: 'Q6', 4: 'Q1', 5: 'Q4', 6: 'Q2', 7: 'Q8', 8: 'Q5', 9: 'Q3', 10: 'Q6', 11: 'Q1', 12: 'Q7' } },
            { id: '7', doctorName: 'د. يوسف التكروري', doctorName_en: 'Dr. Yousef Takruri', department: 'أطفال - 4', department_en: 'Pediatrics - 4', weeks: { 1: 'Q3', 2: 'Q3', 3: 'Q4', 4: 'Q5', 5: 'Q6', 6: 'Q4', 7: 'Q2', 8: 'Q3', 9: 'Q1', 10: 'Q4', 11: 'Q7', 12: 'Q2' } },
            { id: '8', doctorName: 'د. اشرف ابو خيران', doctorName_en: 'Dr. Ashraf Abu Kheiran', department: 'أطفال - 4', department_en: 'Pediatrics - 4', weeks: { 1: 'Q6', 2: 'Q6', 3: 'Q7', 4: 'Q4', 5: 'Q5', 6: 'Q5', 7: 'Q3', 8: 'Q6', 9: 'Q7', 10: 'Q1', 11: 'Q2', 12: 'Q6' } },
          ]
        },
        {
          courseCode: 'M1688-Q',
          courseName: 'مساق الأمراض الباطنية (متقدم) — مجموعة (Q) — سنة سادسة',
          courseName_en: 'Internal Medicine (Advanced) (Q) — 6th Year',
          weeksCount: 12,
          doctors: [
            { id: '1', doctorName: 'د. هاني عابدين (رئيس قسم)', doctorName_en: 'Dr. Hani Abdeen (Dept Head)', department: 'باطني - 1', department_en: 'Internal Medicine - 1', weeks: { 1: 'Q1', 2: 'Q1', 3: 'Q2', 4: 'Q2', 5: 'Q4', 6: 'Q4', 7: 'Q3', 8: 'Q3', 9: 'Q6', 10: 'Q6', 11: 'Q5', 12: 'Q5' } },
            { id: '2', doctorName: 'د. طارق الجعبة', doctorName_en: 'Dr. Tareq Jaaba', department: 'باطني - 1', department_en: 'Internal Medicine - 1', weeks: { 1: 'Q2', 2: 'Q2', 3: 'Q1', 4: 'Q1', 5: 'Q3', 6: 'Q3', 7: 'Q4', 8: 'Q4', 9: 'Q5', 10: 'Q5', 11: 'Q6', 12: 'Q6' } },
            { id: '3', doctorName: 'د. محمد الفطافطة', doctorName_en: 'Dr. Mohammad Fatafta', department: 'باطني - 2', department_en: 'Internal Medicine - 2', weeks: { 1: 'Q3', 2: 'Q3', 3: 'Q4', 4: 'Q4', 5: 'Q1', 6: 'Q1', 7: 'Q2', 8: 'Q2', 9: 'Q7', 10: 'Q7', 11: 'Q8', 12: 'Q8' } },
            { id: '4', doctorName: 'د. معاذ حلايقة', doctorName_en: 'Dr. Moath Halayqa', department: 'باطني - 2', department_en: 'Internal Medicine - 2', weeks: { 1: 'Q4', 2: 'Q4', 3: 'Q3', 4: 'Q3', 5: 'Q2', 6: 'Q2', 7: 'Q1', 8: 'Q1', 9: 'Q8', 10: 'Q8', 11: 'Q7', 12: 'Q7' } },
            { id: '5', doctorName: 'د. نهاد مسودة', doctorName_en: 'Dr. Nihad Maswadeh', department: 'باطني - 3', department_en: 'Internal Medicine - 3', weeks: { 1: 'Q5', 2: 'Q5', 3: 'Q6', 4: 'Q6', 5: 'Q7', 6: 'Q7', 7: 'Q8', 8: 'Q8', 9: 'Q1', 10: 'Q1', 11: 'Q2', 12: 'Q2' } },
            { id: '6', doctorName: 'د. عزيز حلايقة', doctorName_en: 'Dr. Aziz Halayqa', department: 'باطني - 3', department_en: 'Internal Medicine - 3', weeks: { 1: 'Q6', 2: 'Q6', 3: 'Q5', 4: 'Q5', 5: 'Q8', 6: 'Q8', 7: 'Q7', 8: 'Q7', 9: 'Q2', 10: 'Q2', 11: 'Q1', 12: 'Q1' } },
            { id: '7', doctorName: 'د. هبة ديرية', doctorName_en: 'Dr. Hiba Diriyeh', department: 'باطني - 4', department_en: 'Internal Medicine - 4', weeks: { 1: 'Q7', 2: 'Q7', 3: 'Q8', 4: 'Q8', 5: 'Q5', 6: 'Q5', 7: 'Q6', 8: 'Q6', 9: 'Q3', 10: 'Q3', 11: 'Q4', 12: 'Q4' } },
            { id: '8', doctorName: 'د. ايمن دعنا', doctorName_en: 'Dr. Ayman Dana', department: 'باطني - 4', department_en: 'Internal Medicine - 4', weeks: { 1: 'Q8', 2: 'Q8', 3: 'Q7', 4: 'Q7', 5: 'Q6', 6: 'Q6', 7: 'Q5', 8: 'Q5', 9: 'Q4', 10: 'Q4', 11: 'Q3', 12: 'Q3' } },
          ]
        }
      ];
    }
  };

  // Search execution
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setActiveQuery(searchInput.trim());
    setHasSearched(true);
  };

  // Multi-Cohort Automatic Student Search
  const searchResult = useMemo(() => {
    if (!activeQuery) return null;
    const cleanQuery = activeQuery.toLowerCase().trim();

    // Check all clinical levels: fourth, fifth, sixth
    const levels = ['sixth', 'fifth', 'fourth'];

    for (const level of levels) {
      // 1. Try to load saved partition from localStorage
      let partition: MainGroup[] = [];
      const savedPartition = localStorage.getItem(`cdms_clinical_partition_${academicYear}_${level}`);
      if (savedPartition) {
        try {
          const parsed = JSON.parse(savedPartition);
          if (Array.isArray(parsed) && parsed.length > 0) {
            partition = parsed;
          }
        } catch (e) {
          // fallback
        }
      }

      // 2. If no saved partition, generate on the fly from students belonging to this level
      if (partition.length === 0 && allStudentsList.length > 0) {
        const levelStudents = allStudentsList.filter(s => {
          const lvl = (s.academic_level || '').toLowerCase();
          if (level === 'fourth') return lvl.includes('4') || lvl.includes('fourth') || lvl.includes('رابع');
          if (level === 'fifth') return lvl.includes('5') || lvl.includes('fifth') || lvl.includes('خامس');
          if (level === 'sixth') return lvl.includes('6') || lvl.includes('sixth') || lvl.includes('سادس');
          return false;
        });

        if (levelStudents.length > 0) {
          const letters: [string, string, string] = level === 'sixth' ? ['Q', 'R', 'S'] : ['A', 'B', 'C'];
          const total = levelStudents.length;
          const c1 = Math.ceil(total / 3);
          const c2 = Math.ceil((total - c1) / 2);
          const chunks = [levelStudents.slice(0, c1), levelStudents.slice(c1, c1 + c2), levelStudents.slice(c1 + c2)];

          partition = letters.map((ltr, idx) => {
            const grpStudents = chunks[idx] || [];
            const subgrps: Subgroup[] = [];
            const numSg = Math.ceil(grpStudents.length / 5) || 1;
            for (let i = 0; i < numSg; i++) {
              subgrps.push({
                id: `${ltr}${i + 1}`,
                code: `${ltr}${i + 1}`,
                mainGroupLetter: ltr,
                students: grpStudents.slice(i * 5, i * 5 + 5),
                capacity: 5
              });
            }
            return {
              letter: ltr,
              name: `المجموعة (${ltr})`,
              subgroups: subgrps
            };
          });
        }
      }

      // 3. Search in this partition
      for (const mg of partition) {
        for (const sg of mg.subgroups) {
          for (const st of sg.students) {
            const stId = (st.university_number || '').toLowerCase().trim();
            const stNameAr = (st.full_name_ar || '').toLowerCase().trim();
            const stNameEn = (st.full_name_en || '').toLowerCase().trim();

            const isMatch = stId === cleanQuery || stId.includes(cleanQuery) || stNameAr.includes(cleanQuery) || (stNameEn && stNameEn.includes(cleanQuery));

            if (isMatch) {
              // Found target student in this cohort!
              const peers = sg.students.filter(s => s.university_number !== st.university_number);

              // Load Course Schedules for this level
              let courses: CourseSchedule[] = [];
              const savedCourses = localStorage.getItem(`cdms_course_schedules_${academicYear}_${level}`);
              if (savedCourses) {
                try {
                  const parsed = JSON.parse(savedCourses);
                  if (Array.isArray(parsed) && parsed.length > 0) courses = parsed;
                } catch (e) {
                  // fallback
                }
              }
              if (courses.length === 0) {
                courses = getDefaultCourses(level);
              }

              // Build 12-week schedule
              const weeksSchedule: WeekScheduleItem[] = [];

              for (let w = 1; w <= 12; w++) {
                let matchedEntry: (typeof weeksSchedule)[0] | null = null;

                for (const course of courses) {
                  const wDate = course.weekDates?.[w - 1];
                  for (const doc of course.doctors) {
                    const cell = (doc.weeks[w] || '').trim();
                    const isLecture = cell.toLowerCase().includes('lecture');
                    const isMatch = cell === sg.code || cell.includes(sg.code) || (isLecture && cell.includes(mg.letter));

                    if (isMatch) {
                      const detectedHosp = doc.hospital || getDoctorHospital(doc.doctorName);
                      matchedEntry = {
                        weekNum: w,
                        weekDate: wDate,
                        courseCode: course.courseCode,
                        courseName: course.courseName,
                        courseName_en: course.courseName_en,
                        doctorName: doc.doctorName,
                        doctorName_en: doc.doctorName_en,
                        hospital: detectedHosp,
                        hospital_en: doc.hospital_en || hospitalTransliterationMap[detectedHosp] || detectedHosp,
                        department: doc.department || '',
                        department_en: doc.department_en,
                        isLecture: isLecture,
                        rawCode: cell,
                      };
                      break;
                    }
                  }
                  if (matchedEntry) break;
                }

                if (matchedEntry) {
                  weeksSchedule.push(matchedEntry);
                } else {
                  weeksSchedule.push({
                    weekNum: w,
                    courseCode: courses[0]?.courseCode || 'CLINICAL',
                    courseName: locale === 'ar' ? 'تدريب سريري مجدول' : 'Scheduled Clinical Rotation',
                    doctorName: locale === 'ar' ? 'طبيب مشرف سريري' : 'Clinical Supervisor',
                    hospital: locale === 'ar' ? 'المستشفى التدريبي المعتمد' : 'Affiliated Hospital',
                    department: locale === 'ar' ? 'القسم السريري' : 'Clinical Dept',
                    isLecture: false,
                    rawCode: sg.code,
                  });
                }
              }

              return {
                student: st,
                level: level,
                mainGroup: mg,
                subgroup: sg,
                peers,
                weeksSchedule,
              };
            }
          }
        }
      }
    }

    // 4. Fallback search directly in allStudentsList if student wasn't in any partition
    if (allStudentsList.length > 0) {
      for (const st of allStudentsList) {
        const stId = (st.university_number || '').toLowerCase().trim();
        const stNameAr = (st.full_name_ar || '').toLowerCase().trim();
        const isMatch = stId === cleanQuery || stId.includes(cleanQuery) || stNameAr.includes(cleanQuery);

        if (isMatch) {
          // Identify level from student record
          const lvl = (st.academic_level || '').toLowerCase();
          const identifiedLevel = lvl.includes('4') ? 'fourth' : lvl.includes('5') ? 'fifth' : 'sixth';
          const defaultLetter = identifiedLevel === 'sixth' ? 'Q' : 'A';
          const courses = getDefaultCourses(identifiedLevel);

          return {
            student: st,
            level: identifiedLevel,
            mainGroup: { letter: defaultLetter, name: `المجموعة (${defaultLetter})`, subgroups: [] },
            subgroup: { id: `${defaultLetter}1`, code: `${defaultLetter}1`, mainGroupLetter: defaultLetter, students: [st], capacity: 5 },
            peers: [],
            weeksSchedule: Array.from({ length: 12 }, (_, i) => ({
              weekNum: i + 1,
              weekDate: courses[0]?.weekDates?.[i] || `Week ${i + 1}`,
              courseCode: courses[0]?.courseCode || 'CLINICAL',
              courseName: courses[0]?.courseName || (locale === 'ar' ? 'تدريب سريري' : 'Clinical Rotation'),
              courseName_en: courses[0]?.courseName_en || 'Clinical Rotation',
              doctorName: courses[0]?.doctors[0]?.doctorName || (locale === 'ar' ? 'طبيب مشرف' : 'Supervisor'),
              doctorName_en: courses[0]?.doctors[0]?.doctorName_en || 'Clinical Supervisor',
              hospital: courses[0]?.doctors[0]?.hospital || 'م. الأهلي',
              hospital_en: courses[0]?.doctors[0]?.hospital_en || 'Al-Ahli Hospital',
              department: courses[0]?.doctors[0]?.department || 'القسم السريري',
              department_en: courses[0]?.doctors[0]?.department_en || 'Clinical Dept',
              isLecture: false,
              rawCode: `${defaultLetter}1`,
            }))
          };
        }
      }
    }

    return null;
  }, [activeQuery, academicYear, allStudentsList, locale]);

  // Export Student Schedule to Excel
  const handleExportMyScheduleExcel = async () => {
    if (!searchResult) return;
    const isAr = locale === 'ar';
    const st = searchResult.student;
    const sg = searchResult.subgroup;
    const mg = searchResult.mainGroup;
    const dateStr = new Date().toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(isAr ? 'جدولي_السريري' : 'My_Clinical_Schedule', {
      views: [{ rightToLeft: isAr }]
    });

    const totalCols = 5;

    // Banner 1: University
    ws.mergeCells(1, 1, 1, totalCols);
    const title = ws.getCell(1, 1);
    title.value = isAr ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine';
    title.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Banner 2: Student Name
    ws.mergeCells(2, 1, 2, totalCols);
    const sub = ws.getCell(2, 1);
    sub.value = `${isAr ? 'كشف التوزيع والمناوبات السريرية للطالب:' : 'Clinical Rotation Schedule for:'} ${st.full_name_ar} (${st.university_number})`;
    sub.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFCCFBF1' } };
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF115E59' } };
    sub.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    // Banner 3: Group Details
    ws.mergeCells(3, 1, 3, totalCols);
    const meta = ws.getCell(3, 1);
    meta.value = `${isAr ? 'المجموعة الرئيسية:' : 'Main Group:'} ${mg.name}  |  ${isAr ? 'المجموعة الفرعية:' : 'Subgroup:'} ${sg.code}  |  ${isAr ? 'المستوى:' : 'Level:'} ${getLevelDisplayName(searchResult.level)}  |  ${isAr ? 'تاريخ الإصدار:' : 'Date:'} ${dateStr}`;
    meta.font = { name: 'Segoe UI', size: 10.5, bold: false, color: { argb: 'FF475569' } };
    meta.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
    meta.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 24;

    ws.getRow(4).height = 10;

    // Table Headers
    ws.getRow(5).height = 30;
    const headers = [
      isAr ? 'الأسبوع' : 'Week',
      isAr ? 'رمز المساق' : 'Course Code',
      isAr ? 'اسم المساق' : 'Course Name',
      isAr ? 'الطبيب / المشرف' : 'Doctor / Supervisor',
      isAr ? 'المستشفى التدريبي' : 'Hospital'
    ];
    const widths = [14, 16, 32, 28, 26];

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

    searchResult.weeksSchedule.forEach((wItem, idx) => {
      const rowNum = 6 + idx;
      const isEven = idx % 2 === 0;
      ws.getRow(rowNum).height = 26;

      const wCell = ws.getCell(rowNum, 1);
      wCell.value = `Week ${wItem.weekNum}`;
      wCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F766E' } };
      wCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } };
      wCell.alignment = { horizontal: 'center', vertical: 'middle' };
      wCell.border = borderStyle;

      const codeCell = ws.getCell(rowNum, 2);
      codeCell.value = wItem.courseCode;
      codeCell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: 'FF334155' } };
      codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      codeCell.alignment = { horizontal: 'center', vertical: 'middle' };
      codeCell.border = borderStyle;

      const nameCell = ws.getCell(rowNum, 3);
      nameCell.value = isAr ? wItem.courseName : (wItem.courseName_en || wItem.courseName);
      nameCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      nameCell.alignment = { horizontal: isAr ? 'right' : 'left', vertical: 'middle', indent: 1 };
      nameCell.border = borderStyle;

      const docCell = ws.getCell(rowNum, 4);
      docCell.value = getDoctorDisplayName(wItem.doctorName, wItem.doctorName_en);
      docCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
      docCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' } };
      docCell.alignment = { horizontal: isAr ? 'right' : 'left', vertical: 'middle', indent: 1 };
      docCell.border = borderStyle;

      const hospCell = ws.getCell(rowNum, 5);
      hospCell.value = getLocalizedHospitalName(wItem.hospital, wItem.hospital_en);
      hospCell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1E40AF' } };
      hospCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      hospCell.alignment = { horizontal: 'center', vertical: 'middle' };
      hospCell.border = borderStyle;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `جدول_تدريب_${st.university_number}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const profileStudent = useMemo(() => {
    if (!searchResult) return null;
    return allStudentsList.find(s => s.university_number === searchResult.student.university_number) || searchResult.student;
  }, [searchResult, allStudentsList]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-teal-50/20 to-slate-100 text-slate-900 font-sans" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Top Navbar */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          
          {/* Logo & University branding */}
          <div className="flex items-center gap-3">
            <img 
              src={hebronLogo} 
              alt="Hebron University" 
              className="h-10 sm:h-12 w-auto object-contain shrink-0" 
            />
            <div>
              <h1 className="font-black text-xs sm:text-sm text-slate-900 leading-tight">
                {locale === 'ar' ? 'جامعة الخليل — كلية الطب البشري' : 'Hebron University — Faculty of Medicine'}
              </h1>
              <p className="text-[10.5px] sm:text-xs text-teal-700 font-bold">
                {locale === 'ar' ? 'بوابة استعلام التوزيع السريري للطلبة' : 'Clinical Rotation Student Portal'}
              </p>
            </div>
          </div>

          {/* Active Academic Year Badge */}
          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 rounded-xl bg-teal-50 text-teal-800 text-xs font-black border border-teal-200 shadow-2xs">
              {academicYear}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Welcome & Search Section */}
        <section className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200/80 shadow-sm relative overflow-hidden print:hidden">
          <div className="absolute -top-16 -left-16 w-48 h-48 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-4">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-50 border border-teal-200/60 text-teal-800 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>{locale === 'ar' ? `العام الأكاديمي: ${academicYear}` : `Academic Year: ${academicYear}`}</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {locale === 'ar' ? 'استعلام الجدول والتوزيع السريري' : 'Search Your Clinical Rotation Schedule'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
              {locale === 'ar' 
                ? 'أدخل رقمك الجامعي أو اسمك للاستعلام عن جدول التدريب السريري والمجموعة الخاصة بك.'
                : 'Enter your University ID or name to view your clinical rotation schedule and group details.'}
            </p>

            {/* Big Search Form */}
            <form onSubmit={handleSearchSubmit} className="pt-2 max-w-xl mx-auto flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className={`w-5 h-5 absolute ${locale === 'ar' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400`} />
                <input
                  type="text"
                  required
                  placeholder={locale === 'ar' ? 'أدخل الرقم الجامعي أو الاسم...' : 'Enter University ID or Name...'}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className={`w-full rounded-2xl border-2 border-slate-200 ${locale === 'ar' ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3 text-sm focus:border-teal-500 focus:bg-white bg-slate-50/70 font-bold transition-all shadow-xs`}
                />
              </div>

              <button
                type="submit"
                className="px-6 py-3 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-bold text-sm shadow-md shadow-teal-500/25 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>{locale === 'ar' ? 'استعلام' : 'Search'}</span>
              </button>
            </form>

          </div>
        </section>

        {/* Loading State */}
        {isStudentsLoading && (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 text-slate-400">
            <div className="w-8 h-8 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-bold">{locale === 'ar' ? 'جاري جلب وتحديث جدول التوزيع...' : 'Loading clinical distribution data...'}</p>
          </div>
        )}

        {/* Search Results Display */}
        {hasSearched && !isStudentsLoading && searchResult && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            
            {/* Student ID & Group Card Header */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-sm space-y-5">
              
              {/* Top Row: Photo + Name + University Number + Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 sm:gap-4">
                  {profileStudent?.photo_url ? (
                    <img 
                      src={profileStudent.photo_url} 
                      alt={profileStudent.full_name_ar} 
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-teal-500 shadow-md shrink-0 bg-slate-100" 
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-teal-600/25 shrink-0 border-2 border-teal-400/40">
                      <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base sm:text-xl font-black text-slate-900 leading-snug">
                        {locale === 'ar' ? searchResult.student.full_name_ar : (searchResult.student.full_name_en || searchResult.student.full_name_ar)}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-700 font-mono font-bold text-xs border border-teal-200 shrink-0">
                        #{searchResult.student.university_number}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {getLevelDisplayName(searchResult.level)} • {academicYear}
                    </p>
                  </div>
                </div>

                {/* Print & Export buttons */}
                <div className="flex items-center gap-2 print:hidden self-end sm:self-center w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    title={locale === 'ar' ? 'طباعة الجدول' : 'Print Schedule'}
                  >
                    <Printer className="w-4 h-4 text-slate-600" />
                    <span>{locale === 'ar' ? 'طباعة' : 'Print'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportMyScheduleExcel}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    title={locale === 'ar' ? 'تصدير جدولي Excel' : 'Export Excel'}
                  >
                    <Download className="w-4 h-4" />
                    <span>{locale === 'ar' ? 'تصدير Excel' : 'Excel'}</span>
                  </button>
                </div>
              </div>

              {/* Bottom Row: Group Badges Equal Grid */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                <div className="bg-teal-50/80 border border-teal-200/80 rounded-2xl p-3 sm:p-3.5 text-center flex flex-col justify-center">
                  <span className="text-[10.5px] font-bold text-teal-600 uppercase tracking-wider block">
                    {locale === 'ar' ? 'المجموعة الرئيسية' : 'Main Group'}
                  </span>
                  <span className="text-base sm:text-lg font-black text-teal-900 block mt-0.5">
                    {searchResult.mainGroup.name}
                  </span>
                </div>

                <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-3 sm:p-3.5 text-center flex flex-col justify-center">
                  <span className="text-[10.5px] font-bold text-emerald-600 uppercase tracking-wider block">
                    {locale === 'ar' ? 'المجموعة الفرعية' : 'Subgroup'}
                  </span>
                  <span className="text-base sm:text-lg font-black text-emerald-900 block mt-0.5">
                    {searchResult.subgroup.code}
                  </span>
                </div>
              </div>

            </div>

            {/* Subgroup Peers Section (Who is rotating with me) */}
            {searchResult.subgroup.students.length > 0 && (
              <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                  <Users className="w-5 h-5 text-teal-600" />
                  <h4 className="font-bold text-sm text-slate-800">
                    {locale === 'ar' ? `زملاء المجموعة الفرعية (${searchResult.subgroup.code})` : `Subgroup Peers (${searchResult.subgroup.code})`}
                  </h4>
                  <span className="text-xs text-slate-400">
                    ({searchResult.subgroup.students.length} {locale === 'ar' ? 'طلاب في المجموعة' : 'students'})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {searchResult.subgroup.students.map((peer, idx) => {
                    const isCurrent = peer.university_number === searchResult.student.university_number;
                    const peerProfile = allStudentsList.find(s => s.university_number === peer.university_number);
                    return (
                      <div
                        key={peer.id || idx}
                        className={`p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                          isCurrent
                            ? 'bg-teal-50/90 border-teal-300 shadow-xs ring-1 ring-teal-400/30'
                            : 'bg-slate-50/70 border-slate-200/80'
                        }`}
                      >
                        {peerProfile?.photo_url ? (
                          <img 
                            src={peerProfile.photo_url} 
                            alt={peer.full_name_ar} 
                            className="w-9 h-9 rounded-xl object-cover border border-teal-300 shrink-0" 
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isCurrent ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {idx + 1}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className={`text-xs font-bold truncate block ${isCurrent ? 'text-teal-950 font-black' : 'text-slate-800'}`}>
                            {locale === 'ar' ? peer.full_name_ar : (peer.full_name_en || peer.full_name_ar)}
                            {isCurrent && <span className="text-[10px] text-teal-700 font-bold mx-1">({locale === 'ar' ? 'أنت' : 'You'})</span>}
                          </span>
                          <span className="text-[10.5px] font-mono text-slate-400 block">
                            #{peer.university_number}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 12-Week Rotation Schedule Cards Grid / Table */}
            <div className="bg-white rounded-3xl p-5 sm:p-8 border border-slate-200/80 shadow-sm space-y-6">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-600" />
                  <span>{locale === 'ar' ? 'جدول التدريب والتدوير السريري الأسبوعي' : 'Weekly Clinical Rotation Schedule'}</span>
                </h4>
              </div>

              {/* Responsive Cards / Table */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                {searchResult.weeksSchedule.map((item) => (
                  <div
                    key={item.weekNum}
                    className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between gap-3 transition-all hover:shadow-md ${
                      item.isLecture
                        ? 'bg-amber-50/70 border-amber-200/90'
                        : 'bg-white border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    
                    {/* Card Top: Week Badge & Course */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-xl bg-teal-600 text-white font-black text-xs flex items-center justify-center shadow-xs shrink-0">
                          {item.weekNum}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">
                            {locale === 'ar' ? `الأسبوع ${item.weekNum}` : `Week ${item.weekNum}`}
                          </span>
                          {item.weekDate && (
                            <span className="text-[10.5px] text-slate-400 font-mono block">
                              {item.weekDate}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="text-[10.5px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                        {item.courseCode}
                      </span>
                    </div>

                    {/* Course Title */}
                    <div>
                      <h5 className="font-bold text-xs text-slate-800 line-clamp-2 leading-relaxed">
                        {locale === 'ar' ? item.courseName : (item.courseName_en || item.courseName)}
                      </h5>
                    </div>

                    {/* Doctor & Hospital Details */}
                    <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                      
                      {/* Doctor */}
                      <div className="flex items-center gap-2 text-slate-700 font-bold">
                        <Stethoscope className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="truncate">
                          {getDoctorDisplayName(item.doctorName, item.doctorName_en)}
                        </span>
                      </div>

                      {/* Hospital */}
                      <div className="flex items-center gap-2 text-blue-700 font-bold">
                        <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">
                          {getLocalizedHospitalName(item.hospital, item.hospital_en)}
                        </span>
                      </div>

                    </div>

                  </div>
                ))}
              </div>

            </div>

          </div>
        )}

        {/* Not Found State */}
        {hasSearched && !isStudentsLoading && !searchResult && (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-3 animate-in fade-in">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-sm text-slate-800">
              {locale === 'ar' ? 'لم يتم العثور على طالب مطابق' : 'No matching student found'}
            </h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {locale === 'ar' 
                ? `لم نتمكن من العثور على نتائج للبحث عن "${activeQuery}". يرجى التأكد من كتابة الرقم الجامعي بشكل صحيح.`
                : `No results found for "${activeQuery}". Please make sure the University ID is typed correctly.`}
            </p>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-slate-400 print:hidden">
        <p>
          {locale === 'ar'
            ? `© ${new Date().getFullYear()} كلية الطب البشري — جامعة الخليل • نظام إدارة الدائرة السريرية (CDMS)`
            : `© ${new Date().getFullYear()} Faculty of Medicine — Hebron University • Clinical Department Management System`}
        </p>
      </footer>

    </div>
  );
}
