import { useState, useEffect, useMemo, type ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { 
  ChevronRight, User, FileText, BookOpen, Award, BarChart3, 
  GraduationCap, Building, Pencil, Plus, Trash2, Save, Star, ShieldCheck, CheckCircle2, Phone, Mail, Settings, Info, Sliders, Camera, Upload,
  FolderOpen, Download, Eye
} from 'lucide-react';

export interface PublicationItem {
  title: string;
  journal: string;
  year: string;
  doi?: string;
}

export interface ConferenceItem {
  name: string;
  location: string;
  date: string;
  role: string;
}

export interface DocumentItem {
  id?: string;
  name: string;
  category: string;
  file_url: string;
  file_type: string;
  file_size?: string;
  created_at: string;
}

export interface DirectorDeanEvaluation {
  evaluator_name: string;
  evaluator_role: string;
  leadership_score: number;
  clinical_score: number;
  comments: string;
  evaluation_date: string;
}

export interface KpiWeightsConfig {
  gradeTimelinessWeight: number;
  rotationMgmtWeight: number;
  researchWeight: number;
  confWeight: number;
  evaluationWeight: number;
}

export interface KpiManualScoresOverride {
  gradeTimelinessScore?: number;
  rotationMgmtScore?: number;
  researchScore?: number;
  confScore?: number;
}

export interface DepartmentHeadData {
  id: string;
  user_id: number | string;
  name: string;
  name_en?: string;
  title: string;
  department_name: string;
  avatar_url?: string;
  email: string;
  phone?: string;
  contract_type: string;
  appointment_date: string;
  cv_summary: string;
  specialty: string;
  publications: PublicationItem[];
  conferences: ConferenceItem[];
  documents?: DocumentItem[];
  evaluation?: DirectorDeanEvaluation;
  kpi_weights?: KpiWeightsConfig;
  kpi_overrides?: KpiManualScoresOverride;
  kpi_score?: number;
  kpi_rating?: string;
  kpi_breakdown?: any;
  official_evaluation?: {
    id: number;
    overall_score: number;
    overall_rating: string;
    academic_year_name?: string | null;
    evaluation_purpose: string;
    approved_at?: string | null;
  };
}

export function DeptHeadProfilePage() {
  const { id: paramId } = useParams<{ id: string }>();
  const { locale } = useI18n();
  const { user, can, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'cv' | 'research' | 'conferences' | 'documents' | 'kpi'>('cv');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isManualOverrideModalOpen, setIsManualOverrideModalOpen] = useState(false);
  const [auditModalCriteria, setAuditModalCriteria] = useState<string | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Document Upload & Preview States (Student Profile Style)
  const [isDocModalOpen, setIsDocModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('academic_degree');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const getCategoryName = (cat: string) => {
    switch (cat) {
      case 'academic_degree':
      case 'شهادة أكاديمية':
        return locale === 'ar' ? 'شهادة أكاديمية (بورد / دكتوراه)' : 'Academic Degree';
      case 'administrative_decision':
      case 'قرار إداري':
        return locale === 'ar' ? 'قرار إداري (تكليف / ترقية)' : 'Administrative Decision';
      case 'identification_license':
      case 'أوراق ثبوتية':
        return locale === 'ar' ? 'أوراق ثبوتية ورخص مزاولة' : 'ID & License';
      case 'contract_agreement':
      case 'عقود واتفاقيات':
        return locale === 'ar' ? 'عقود واتفاقيات رسمية' : 'Contract & Agreement';
      default:
        return locale === 'ar' ? 'وثيقة أخرى' : 'Other Document';
    }
  };

  // Target Profile ID (numeric user_id or 'me')
  const targetId = (!paramId || paramId === 'me') ? 'me' : paramId;

  // Check permissions for evaluator and roster viewing
  const userRoles = (user?.roles || []).map((r: any) => typeof r === 'string' ? r.toUpperCase() : String(r.code || r.name || '').toUpperCase());
  const canEvaluate = can('performance.view');
  const canViewOfficialEvaluation = can('department_head_evaluations.view');
  // Kept only for data compatibility while the legacy KPI feature is retired.
  const showLegacyKpi = false;

  // Query Department Head profile directly from Laravel MySQL Database API
  const { data: dbProfileResponse, isLoading: isProfileLoading } = useQuery({
    queryKey: ['db-dept-head-profile-v1', targetId, user?.id],
    queryFn: async () => {
      const res = await apiFetch<any>(`/dept-heads/${targetId}`);
      return res?.data || res;
    }
  });

  const isOwnProfile = String(dbProfileResponse?.user_id || targetId) === String(user?.id);

  const canViewRoster = canEvaluate || userRoles.some(r => ['CLINICAL_DIRECTOR', 'DEAN', 'VICE_DEAN', 'SYS_ADMIN', 'SYSTEM_ADMIN'].includes(r));

  const [profileData, setProfileData] = useState<DepartmentHeadData | null>(null);

  // Form Inputs
  const [newPubTitle, setNewPubTitle] = useState('');
  const [newPubJournal, setNewPubJournal] = useState('');
  const [newPubYear, setNewPubYear] = useState('2024');
  const [newPubDoi, setNewPubDoi] = useState('');

  const [newConfName, setNewConfName] = useState('');
  const [newConfLocation, setNewConfLocation] = useState('');
  const [newConfDate, setNewConfDate] = useState('');
  const [newConfRole, setNewConfRole] = useState('متحدث ورئيس جلسة');

  const [evalLeadership, setEvalLeadership] = useState<number>(7.5);
  const [evalClinical, setEvalClinical] = useState<number>(7.5);
  const [evalComments, setEvalComments] = useState('');

  // Manual Override Inputs
  const [manualGradesScore, setManualGradesScore] = useState<string>('');
  const [manualRotationsScore, setManualRotationsScore] = useState<string>('');
  const [manualResearchScore, setManualResearchScore] = useState<string>('');
  const [manualConfScore, setManualConfScore] = useState<string>('');

  const [weightsConfig, setWeightsConfig] = useState<KpiWeightsConfig>({
    gradeTimelinessWeight: 25,
    rotationMgmtWeight: 25,
    researchWeight: 20,
    confWeight: 15,
    evaluationWeight: 15
  });

  useEffect(() => {
    if (!dbProfileResponse) return;

    const data = dbProfileResponse;

    const loadedWeights: KpiWeightsConfig = data.kpi_weights || {
      gradeTimelinessWeight: 25,
      rotationMgmtWeight: 25,
      researchWeight: 20,
      confWeight: 15,
      evaluationWeight: 15
    };

    setWeightsConfig(loadedWeights);

    const loadedOverrides: KpiManualScoresOverride = data.kpi_overrides || {};
    setManualGradesScore(loadedOverrides.gradeTimelinessScore !== undefined ? String(loadedOverrides.gradeTimelinessScore) : '');
    setManualRotationsScore(loadedOverrides.rotationMgmtScore !== undefined ? String(loadedOverrides.rotationMgmtScore) : '');
    setManualResearchScore(loadedOverrides.researchScore !== undefined ? String(loadedOverrides.researchScore) : '');
    setManualConfScore(loadedOverrides.confScore !== undefined ? String(loadedOverrides.confScore) : '');

    // Robust document merging from API and isolated local storage
    const profileUserId = String(data.user_id || data.id || targetId);
    const apiDocs: DocumentItem[] = Array.isArray(data.documents) ? data.documents : [];
    let localDocs: DocumentItem[] = [];
    const localSaved = localStorage.getItem(`dept_head_docs_${profileUserId}`) ||
                       (targetId === 'me' ? localStorage.getItem('dept_head_docs_me') : null);
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        if (Array.isArray(parsed)) localDocs = parsed;
      } catch (e) {
        localDocs = [];
      }
    }

    const docMap = new Map<string, DocumentItem>();
    for (const doc of apiDocs) {
      if (doc && doc.name) docMap.set(doc.id || doc.name, doc);
    }
    for (const doc of localDocs) {
      if (doc && doc.name && !docMap.has(doc.id || doc.name)) {
        docMap.set(doc.id || doc.name, doc);
      }
    }
    const combinedDocs = Array.from(docMap.values());

    setProfileData({
      id: String(data.id || data.user_id),
      user_id: data.user_id || data.id,
      name: data.name,
      name_en: data.name_en,
      title: data.title || '',
      department_name: data.department_name || 'القسم السريري',
      avatar_url: data.avatar_url,
      email: data.email,
      phone: data.phone || '',
      contract_type: data.contract_type || '',
      appointment_date: data.appointment_date || '',
      cv_summary: data.cv_summary || '',
      specialty: data.specialty || `استشاري ${data.department_name || 'سريري'}`,
      publications: data.publications || [],
      conferences: data.conferences || [],
      documents: combinedDocs,
      kpi_weights: loadedWeights,
      kpi_overrides: loadedOverrides,
      evaluation: data.evaluation || undefined,
      kpi_score: data.kpi_score,
      kpi_rating: data.kpi_rating,
      kpi_breakdown: data.kpi_breakdown,
      official_evaluation: data.official_evaluation || undefined,
    });

    if (data.evaluation) {
      setEvalLeadership(data.evaluation.leadership_score || 7.5);
      setEvalClinical(data.evaluation.clinical_score || 7.5);
      setEvalComments(data.evaluation.comments || '');
    }

  }, [dbProfileResponse, targetId]);

  // Persist documents strictly per department head user_id ONLY when non-empty to prevent cache wipe
  useEffect(() => {
    if (profileData && profileData.documents && profileData.documents.length > 0) {
      const profileUserId = String(profileData.user_id || profileData.id);
      if (profileUserId && profileUserId !== 'undefined') {
        const jsonDocs = JSON.stringify(profileData.documents);
        localStorage.setItem(`dept_head_docs_${profileUserId}`, jsonDocs);
        if (targetId === 'me') {
          localStorage.setItem('dept_head_docs_me', jsonDocs);
        }
      }
    }
  }, [profileData?.documents, profileData?.user_id, profileData?.id, targetId]);

  // Transparent KPI Breakdown Calculation
  const automatedKpiBreakdown = useMemo(() => {
    if (profileData?.kpi_breakdown) {
      return profileData.kpi_breakdown;
    }

    const emptyOverrides: KpiManualScoresOverride = {};
    if (!profileData) return { 
      gradeTimelinessScore: 25, 
      rotationMgmtScore: 24, 
      researchScore: 0, 
      confScore: 0, 
      directorDeanEvalScore: 14.5, 
      totalScore: 89.5, 
      rating: 'جيد جداً',
      weights: weightsConfig,
      overrides: emptyOverrides
    };

    const w = profileData.kpi_weights || weightsConfig;
    const ov: KpiManualScoresOverride = profileData.kpi_overrides || {};

    const gradeTimelinessScore = ov.gradeTimelinessScore !== undefined 
      ? Math.min(w.gradeTimelinessWeight, ov.gradeTimelinessScore)
      : Math.round(1.0 * w.gradeTimelinessWeight * 10) / 10;

    const rotationMgmtScore = ov.rotationMgmtScore !== undefined
      ? Math.min(w.rotationMgmtWeight, ov.rotationMgmtScore)
      : Math.round(0.96 * w.rotationMgmtWeight * 10) / 10;

    const pubCount = profileData.publications?.length || 0;
    const researchScore = ov.researchScore !== undefined
      ? Math.min(w.researchWeight, ov.researchScore)
      : Math.min(w.researchWeight, pubCount * 5);

    const confCount = profileData.conferences?.length || 0;
    const confScore = ov.confScore !== undefined
      ? Math.min(w.confWeight, ov.confScore)
      : Math.min(w.confWeight, confCount * 5);

    const rawEvalSum = profileData.evaluation 
      ? ((profileData.evaluation.leadership_score || 0) + (profileData.evaluation.clinical_score || 0))
      : 15;

    const directorDeanEvalScore = Math.round((rawEvalSum / 15) * w.evaluationWeight * 10) / 10;

    const totalScore = Math.min(100, Math.round((gradeTimelinessScore + rotationMgmtScore + researchScore + confScore + directorDeanEvalScore) * 10) / 10);

    let rating: 'ممتاز' | 'جيد جداً' | 'جيد' | 'مقبول' = 'مقبول';
    if (totalScore >= 90) rating = 'ممتاز';
    else if (totalScore >= 80) rating = 'جيد جداً';
    else if (totalScore >= 70) rating = 'جيد';

    return {
      gradeTimelinessScore,
      rotationMgmtScore,
      researchScore,
      confScore,
      directorDeanEvalScore,
      totalScore,
      rating,
      weights: w,
      overrides: ov
    };
  }, [profileData, weightsConfig]);

  if (isProfileLoading || !profileData) return <LoadingState />;

  const refreshAllQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['db-dept-head-profile-v1'] });
    queryClient.invalidateQueries({ queryKey: ['db-dept-heads-directory-v1'] });
  };

  // Real Image File Upload Handler
  const handleAvatarFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, WEBP)');
      return;
    }

    setIsUploadingAvatar(true);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Image = reader.result as string;

        // Save image to profile state and API directly
        if (profileData) {
          setProfileData({ ...profileData, avatar_url: base64Image });
        }

        try {
          await apiFetch(`/dept-heads/${targetId}/avatar`, {
            method: 'POST',
            body: { avatar_base64: base64Image }
          });
          refreshAllQueries();
          await refreshUser();
          alert(locale === 'ar' ? 'تم رفع وحفظ الصورة الشخصية بنجاح ✓' : 'Avatar uploaded successfully ✓');
        } catch (err) {
          console.error('Avatar upload API error:', err);
        } finally {
          setIsUploadingAvatar(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File reading error:', err);
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfileData = async () => {
    if (!profileData) return;

    try {
      await apiFetch(`/dept-heads/${targetId}`, {
        method: 'PUT',
        body: profileData
      });
      refreshAllQueries();
      setIsEditMode(false);
      alert(locale === 'ar' ? 'تم حفظ التعديلات بنجاح في قاعدة البيانات ✓' : 'Profile updated successfully ✓');
    } catch (err) {
      console.error('Failed to save head profile:', err);
      setIsEditMode(false);
      alert(locale === 'ar' ? 'حدث خطأ أثناء الحفظ بقاعدة البيانات' : 'Save error');
    }
  };

  const handleSaveDeanDirectorEvaluation = async () => {
    if (!profileData) return;

    const evaluatorRoleLabel = userRoles.includes('DEAN') 
      ? 'عميد كلية الطب البشري' 
      : (userRoles.includes('CLINICAL_DIRECTOR') ? 'مدير الدائرة السريرية' : 'إدارة الكلية والدائرة السريرية');

    const newEval: DirectorDeanEvaluation = {
      evaluator_name: user?.name || 'د. معتز التميمي',
      evaluator_role: evaluatorRoleLabel,
      leadership_score: Number(evalLeadership),
      clinical_score: Number(evalClinical),
      comments: evalComments.trim() || 'تمت المراجعة والاعتماد الرسمي من قبل مدير الدائرة والعميد.',
      evaluation_date: new Date().toLocaleDateString('ar-EG')
    };

    try {
      await apiFetch(`/dept-heads/${targetId}/evaluation`, {
        method: 'POST',
        body: newEval
      });
      refreshAllQueries();
      setIsEvalModalOpen(false);
      alert(locale === 'ar' ? `تم رصد وتحديث تقييم ${newEval.evaluator_name} (${evaluatorRoleLabel}) في قاعدة البيانات بنجاح ✓` : 'Evaluation saved ✓');
    } catch (err) {
      console.error('Evaluation save error:', err);
      alert('حدث خطأ أثناء حفظ التقييم بقاعدة البيانات');
    }
  };

  const handleSaveWeightsConfig = async () => {
    const sum = Number(weightsConfig.gradeTimelinessWeight) + 
                Number(weightsConfig.rotationMgmtWeight) + 
                Number(weightsConfig.researchWeight) + 
                Number(weightsConfig.confWeight) + 
                Number(weightsConfig.evaluationWeight);

    if (sum !== 100) {
      alert(`تنبيه: مجموع أوزان المحاور الخمسة يساوي حالياً (${sum}%) ويجب أن يكون المجموع دقيقاً 100%.`);
      return;
    }

    try {
      await apiFetch(`/dept-heads/${targetId}/weights`, {
        method: 'POST',
        body: weightsConfig
      });
      refreshAllQueries();
      setIsWeightModalOpen(false);
      alert(locale === 'ar' ? 'تم تحديث واعتماد أوزان الـ KPI بقاعدة البيانات بنجاح ✓' : 'Weights saved ✓');
    } catch (err) {
      console.error('Weights save error:', err);
      alert('حدث خطأ أثناء حفظ الأوزان بقاعدة البيانات');
    }
  };

  const handleSaveManualOverrides = async () => {
    const overrides: KpiManualScoresOverride = {
      gradeTimelinessScore: manualGradesScore !== '' ? Number(manualGradesScore) : undefined,
      rotationMgmtScore: manualRotationsScore !== '' ? Number(manualRotationsScore) : undefined,
      researchScore: manualResearchScore !== '' ? Number(manualResearchScore) : undefined,
      confScore: manualConfScore !== '' ? Number(manualConfScore) : undefined
    };

    try {
      await apiFetch(`/dept-heads/${targetId}/overrides`, {
        method: 'POST',
        body: overrides
      });
      refreshAllQueries();
      setIsManualOverrideModalOpen(false);
      alert(locale === 'ar' ? 'تم رصد وتحديث الدرجات اليدوية بقاعدة البيانات بنجاح ✓' : 'Scores saved ✓');
    } catch (err) {
      console.error('Overrides save error:', err);
      alert('حدث خطأ أثناء حفظ الدرجات اليدوية بقاعدة البيانات');
    }
  };

  const handleAddPublication = async () => {
    if (!newPubTitle.trim() || !profileData) return;
    const newPub: PublicationItem = {
      title: newPubTitle.trim(),
      journal: newPubJournal.trim() || 'مجلة علمية محكمة',
      year: newPubYear || '2024',
      doi: newPubDoi.trim() || undefined
    };
    const updatedPubs = [...(profileData.publications || []), newPub];
    const updated = { ...profileData, publications: updatedPubs };

    await apiFetch(`/dept-heads/${targetId}`, { method: 'PUT', body: updated });
    refreshAllQueries();
    setNewPubTitle(''); setNewPubJournal(''); setNewPubDoi('');
  };

  const handleDeletePublication = async (index: number) => {
    if (!profileData) return;
    const updatedPubs = profileData.publications.filter((_, idx) => idx !== index);
    const updated = { ...profileData, publications: updatedPubs };

    await apiFetch(`/dept-heads/${targetId}`, { method: 'PUT', body: updated });
    refreshAllQueries();
  };

  const handleAddConference = async () => {
    if (!newConfName.trim() || !profileData) return;
    const newConf: ConferenceItem = {
      name: newConfName.trim(),
      location: newConfLocation.trim() || 'جامعة الخليل',
      date: newConfDate || '2024',
      role: newConfRole.trim() || 'مشارك'
    };
    const updatedConfs = [...(profileData.conferences || []), newConf];
    const updated = { ...profileData, conferences: updatedConfs };

    await apiFetch(`/dept-heads/${targetId}`, { method: 'PUT', body: updated });
    refreshAllQueries();
    setNewConfName(''); setNewConfLocation(''); setNewConfDate('');
  };

  const handleDeleteConference = async (index: number) => {
    if (!profileData) return;
    const updatedConfs = profileData.conferences.filter((_, idx) => idx !== index);
    const updated = { ...profileData, conferences: updatedConfs };

    await apiFetch(`/dept-heads/${targetId}`, { method: 'PUT', body: updated });
    refreshAllQueries();
  };

  const handleUploadDocumentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !profileData) return;

    setIsUploadingDoc(true);

    let dataUrl: string | undefined = undefined;
    let fileType: string | undefined = undefined;
    let fileSize = '1.2 MB';

    if (selectedDocFile) {
      fileSize = `${(selectedDocFile.size / (1024 * 1024)).toFixed(1)} MB`;
      fileType = selectedDocFile.type;

      if (selectedDocFile.type.startsWith('image/') || selectedDocFile.type === 'application/pdf') {
        dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string);
          reader.readAsDataURL(selectedDocFile);
        });
      }
    }

    try {
      let res: any = null;
      if (selectedDocFile) {
        const formData = new FormData();
        formData.append('file', selectedDocFile);
        formData.append('name', newDocTitle.trim());
        formData.append('category', newDocCategory);

        res = await apiFetch<any>(`/dept-heads/${targetId}/documents`, {
          method: 'POST',
          body: formData
        });
      } else {
        res = await apiFetch<any>(`/dept-heads/${targetId}/documents`, {
          method: 'POST',
          body: {
            name: newDocTitle.trim(),
            category: newDocCategory,
            file_base64: dataUrl || '',
            file_type: fileType || 'pdf',
            file_size: fileSize
          }
        });
      }

      const finalDocs = res?.documents || [...(profileData.documents || []), {
        id: res?.data?.id || 'doc_' + Date.now(),
        name: newDocTitle.trim(),
        category: newDocCategory,
        file_url: res?.data?.file_url || dataUrl || '',
        file_type: fileType || 'pdf',
        file_size: fileSize,
        created_at: new Date().toISOString().split('T')[0]
      }];

      const activeUserId = String(profileData.user_id || profileData.id || targetId);
      localStorage.setItem(`dept_head_docs_${activeUserId}`, JSON.stringify(finalDocs));
      setProfileData({ ...profileData, documents: finalDocs });

      setIsDocModalOpen(false);
      setNewDocTitle('');
      setSelectedDocFile(null);
    } catch (err) {
      console.error('Failed uploading doc:', err);
      const today = new Date().toISOString().split('T')[0];
      const newDoc: DocumentItem = {
        id: 'doc_' + Date.now(),
        name: newDocTitle.trim(),
        category: newDocCategory,
        file_url: dataUrl || '',
        file_type: fileType || 'pdf',
        file_size: fileSize,
        created_at: today
      };
      const fallbackDocs = [...(profileData.documents || []), newDoc];
      const activeUserId = String(profileData.user_id || profileData.id || targetId);
      localStorage.setItem(`dept_head_docs_${activeUserId}`, JSON.stringify(fallbackDocs));
      setProfileData({ ...profileData, documents: fallbackDocs });
      setIsDocModalOpen(false);
      setNewDocTitle('');
      setSelectedDocFile(null);
    } finally {
      setIsUploadingDoc(false);
      refreshAllQueries();
    }
  };

  const handleDeleteDocument = async (docId: string, index: number) => {
    if (!profileData) return;
    if (window.confirm(locale === 'ar' ? 'هل أنت متأكد من رغبتك في حذف هذا المستند؟' : 'Are you sure you want to delete this document?')) {
      const updatedDocs = (profileData.documents || []).filter((d, idx) => d.id ? d.id !== docId : idx !== index);
      const activeUserId = String(profileData.user_id || profileData.id || targetId);
      localStorage.setItem(`dept_head_docs_${activeUserId}`, JSON.stringify(updatedDocs));
      setProfileData({ ...profileData, documents: updatedDocs });

      try {
        await apiFetch(`/dept-heads/${targetId}/documents/${docId || index}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Delete document API error:', err);
      } finally {
        refreshAllQueries();
      }
    }
  };

  const displayDeptTitle = profileData.department_name.startsWith('قسم') 
    ? profileData.department_name 
    : `قسم ${profileData.department_name}`;

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto">
      
      {/* 1. TOP EXECUTIVE TOOLBAR */}
      <div className="flex items-center justify-between gap-3">
        {/* Right Side: Standalone Back Button */}
        <div>
          {!isOwnProfile && canViewRoster && (
            <Link 
              to="/department-heads"
              className="w-9 h-9 rounded-full bg-white border border-slate-200/90 shadow-2xs text-slate-700 hover:bg-slate-50 flex items-center justify-center transition-all cursor-pointer"
              title="العودة لدليل رؤساء الأقسام"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </Link>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE ACADEMIC PROFILE HERO CARD */}
      {/* ========================================================================= */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 text-center md:flex-row md:items-center md:justify-start md:text-right">
          
          {/* Avatar & Personal Metadata */}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center sm:text-right">
            
            {/* Real Image File Upload Avatar */}
            <div className="relative group flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-teal-100 bg-teal-50 text-2xl font-black text-teal-800 shadow-sm sm:h-24 sm:w-24">
              {profileData.avatar_url ? (
                <img src={profileData.avatar_url} alt={profileData.name} className="w-full h-full object-cover" />
              ) : (
                profileData.name.split(' ').map(n => n[0]).join('').slice(0, 2) || 'د.'
              )}

              {/* Upload Hover Overlay */}
              {(isOwnProfile || isEditMode) && (
                <label className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer p-1 text-center">
                  <Camera className="w-5 h-5 mb-1 text-teal-300" />
                  <span className="text-[10px] font-semibold">تغيير الصورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileUpload}
                    className="hidden"
                    disabled={isUploadingAvatar}
                  />
                </label>
              )}

              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-slate-900/70 flex items-center justify-center text-white text-xs font-semibold">
                  جاري الرفع...
                </div>
              )}
            </div>

            {/* Profile Identity Details */}
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-xl font-black text-slate-900 sm:text-2xl">{profileData.name}</h1>
                
                <span className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-[11px] font-bold text-teal-800">
                  رئيس {displayDeptTitle}
                </span>

                {/* Integrated Edit Profile Icon Button inline with name */}
                {(isOwnProfile || canEvaluate) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditMode) handleSaveProfileData();
                      else setIsEditMode(true);
                    }}
                    className={`rounded-full p-1.5 transition-all cursor-pointer shadow-sm ${
                      isEditMode 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                        : 'bg-teal-700 hover:bg-teal-800 text-white'
                    }`}
                    title={isEditMode ? "حفظ التغييرات" : "تعديل البروفايل والصورة"}
                  >
                    {isEditMode ? (
                      <Save className="w-3.5 h-3.5 text-white" />
                    ) : (
                      <Pencil className="w-3.5 h-3.5 text-white" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs font-medium text-slate-600 sm:justify-start">
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>{profileData.title}</span>
                </span>
                <span className="hidden sm:inline text-slate-300">•</span>
                <span className="flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>كلية الطب البشري</span>
                </span>
              </div>

              {/* Contact Info Pills */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5 text-xs sm:justify-start">
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-mono text-slate-700">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{profileData.email}</span>
                </span>

                {profileData.phone && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-mono text-[11px]" dir="ltr">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{profileData.phone}</span>
                  </span>
                )}

                {(isOwnProfile || isEditMode) && (
                  <label className="cursor-pointer inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-medium text-[11px] transition-colors shadow-2xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingAvatar ? 'جاري التحميل...' : 'رفع صورة جديدة'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileUpload}
                      className="hidden"
                      disabled={isUploadingAvatar}
                    />
                  </label>
                )}
              </div>
            </div>

          </div>

          {/* Official evaluation is intentionally private from the department head. */}
          {!isOwnProfile && canViewOfficialEvaluation && <Link to={`/department-head-evaluations?head=${profileData.user_id}`} className="flex w-full shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50 to-white p-4 text-center text-teal-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md md:w-52">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm"><ShieldCheck className="h-5 w-5" /></div>
            <span className="text-xs font-black">نموذج التقييم الرسمي</span>
            {profileData.official_evaluation ? <><span className="text-2xl font-black">{profileData.official_evaluation.overall_score}<span className="mr-1 text-xs font-bold">/ 100</span></span><span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-teal-700">{profileData.official_evaluation.overall_rating} · {profileData.official_evaluation.academic_year_name || 'التقييم المعتمد'}</span></> : <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-500">لا يوجد تقييم معتمد بعد</span>}
            <span className="text-[10px] font-bold text-teal-700">فتح النموذج والتوقيع ←</span>
          </Link>}

          {/* Legacy KPI is available only to authorized leadership, never in the head's own profile. */}
          {showLegacyKpi && !isOwnProfile && canViewOfficialEvaluation && <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200/80 text-center shrink-0 w-full md:w-48 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 block">تقييم مؤشر الأداء الكلي</span>
            <div dir="ltr" className="text-3xl font-bold text-slate-900 font-mono tracking-tight">
              {automatedKpiBreakdown.totalScore} <span className="text-xs font-medium text-slate-400">/ 100</span>
            </div>
            <div className="pt-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-0.5 rounded-md border border-teal-200/80">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                <span>تقدير {automatedKpiBreakdown.rating}</span>
              </span>
            </div>
          </div>}

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FOUR KEY STATS METRICS ROW */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 block">الأبحاث والنشرات</span>
          <div className="text-xl font-bold text-slate-900 flex items-center justify-between">
            <span dir="ltr">{profileData.publications?.length || 0}</span>
            <BookOpen className="w-4 h-4 text-teal-600 opacity-80" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">{!isOwnProfile && canViewOfficialEvaluation ? `تساهم بـ ${automatedKpiBreakdown.researchScore} درجة` : 'سجل مهني محدث'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 block">المؤتمرات الطبية</span>
          <div className="text-xl font-bold text-slate-900 flex items-center justify-between">
            <span dir="ltr">{profileData.conferences?.length || 0}</span>
            <Award className="w-4 h-4 text-slate-500 opacity-80" />
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">{!isOwnProfile && canViewOfficialEvaluation ? `تساهم بـ ${automatedKpiBreakdown.confScore} درجة` : 'سجل مهني محدث'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 block">نوع العقد والتكليف</span>
          <div className="text-xs font-bold text-slate-900 flex items-center justify-between pt-1">
            <span className="truncate">{profileData.contract_type || 'عقد دائم — متفرغ'}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">تاريخ التكليف: {profileData.appointment_date || '2024-09-01'}</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-1">
          <span className="text-[11px] font-semibold text-slate-500 block">التخصص الأكاديمي</span>
          <div className="text-xs font-bold text-slate-900 flex items-center justify-between pt-1">
            <span className="truncate">{profileData.specialty || `استشاري ${profileData.department_name}`}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">كلية الطب البشري</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. CLEAN TABS NAVIGATION */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveTab('cv')}
          className={`min-h-14 rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'cv' 
              ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
              : 'border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeTab === 'cv' ? 'bg-white/20' : 'bg-white text-teal-600 shadow-sm'}`}><User className="w-4 h-4" /></span>
          <span className="leading-5">السيرة الذاتية والعقد</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('research')}
          className={`min-h-14 rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'research' 
              ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
              : 'border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeTab === 'research' ? 'bg-white/20' : 'bg-white text-teal-600 shadow-sm'}`}><BookOpen className="w-4 h-4" /></span>
          <span className="min-w-0 flex-1 leading-5">الأبحاث المنشورة</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeTab === 'research' ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{profileData.publications?.length || 0}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('conferences')}
          className={`min-h-14 rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'conferences' 
              ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
              : 'border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeTab === 'conferences' ? 'bg-white/20' : 'bg-white text-teal-600 shadow-sm'}`}><Award className="w-4 h-4" /></span>
          <span className="min-w-0 flex-1 leading-5">المؤتمرات والورش</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeTab === 'conferences' ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{profileData.conferences?.length || 0}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('documents')}
          className={`min-h-14 rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'documents' 
              ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
              : 'border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeTab === 'documents' ? 'bg-white/20' : 'bg-white text-teal-600 shadow-sm'}`}><FolderOpen className="w-4 h-4" /></span>
          <span className="min-w-0 flex-1 leading-5">الوثائق والملفات</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${activeTab === 'documents' ? 'bg-white/20' : 'bg-white text-slate-500'}`}>{profileData.documents?.length || 0}</span>
        </button>

        {showLegacyKpi && !isOwnProfile && canViewOfficialEvaluation && <button
          type="button"
          onClick={() => setActiveTab('kpi')}
          className={`min-h-14 rounded-xl border px-3 py-2.5 text-right text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'kpi' 
              ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
              : 'border-transparent bg-slate-50 text-slate-600 hover:border-teal-100 hover:bg-teal-50 hover:text-teal-800'
          }`}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeTab === 'kpi' ? 'bg-white/20' : 'bg-white text-teal-600 shadow-sm'}`}><BarChart3 className="w-4 h-4" /></span>
          <span className="leading-5">جدول تقييم الأداء التفصيلي</span>
        </button>}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. TAB CONTENT BODY CONTAINER */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs min-h-[300px]">
        
        {/* TAB 1: CV & CONTRACT */}
        {activeTab === 'cv' && (
          <div className="space-y-6 text-xs">
            {isEditMode ? (
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-teal-600" />
                    <span>تعديل السيرة الذاتية والبيانات الأكاديمية</span>
                  </h3>

                  <label className="cursor-pointer bg-teal-700 hover:bg-teal-800 text-white font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingAvatar ? 'جاري التحميل...' : 'رفع صورة شخصية'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileUpload}
                      className="hidden"
                      disabled={isUploadingAvatar}
                    />
                  </label>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">اسم رئيس القسم</label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-medium text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">الرتبة واللقب الأكاديمي</label>
                    <input
                      type="text"
                      value={profileData.title}
                      onChange={(e) => setProfileData({ ...profileData, title: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-medium text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">التخصص الدقيق</label>
                    <input
                      type="text"
                      value={profileData.specialty}
                      onChange={(e) => setProfileData({ ...profileData, specialty: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-medium text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">نوع العقد الأكاديمي</label>
                    <input
                      type="text"
                      value={profileData.contract_type}
                      onChange={(e) => setProfileData({ ...profileData, contract_type: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-medium text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-slate-700 mb-1">رقم الهاتف للتواصل</label>
                    <input
                      type="text"
                      value={profileData.phone || ''}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                      className="w-full p-2.5 border border-slate-200 rounded-lg bg-white font-mono text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">ملخص السيرة الذاتية والأكاديمية</label>
                  <textarea
                    rows={4}
                    placeholder="اكتب ملخص سيرتك الذاتية والأكاديمية هنا..."
                    value={profileData.cv_summary}
                    onChange={(e) => setProfileData({ ...profileData, cv_summary: e.target.value })}
                    className="w-full p-3 border border-slate-200 rounded-lg bg-white leading-relaxed text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                  <Button variant="outline" onClick={() => setIsEditMode(false)}>إلغاء</Button>
                  <Button onClick={handleSaveProfileData} className="bg-teal-700 hover:bg-teal-800 text-white font-medium">
                    حفظ التغييرات
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 block">نوع العقد الأكاديمي</span>
                    <span className="font-semibold text-slate-900 text-xs block">{profileData.contract_type || 'عقد دائم — متفرغ'}</span>
                  </div>
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 block">تاريخ التكليف برئاسة القسم</span>
                    <span className="font-semibold text-slate-900 text-xs block">{profileData.appointment_date || '2024-09-01'}</span>
                  </div>
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 block">التخصص الدقيق</span>
                    <span className="font-semibold text-slate-900 text-xs block">{profileData.specialty || `استشاري ${profileData.department_name}`}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>ملخص السيرة الذاتية والأكاديمية</span>
                  </h3>

                  {profileData.cv_summary ? (
                    <div className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/80 leading-relaxed text-slate-700 font-serif">
                      {profileData.cv_summary}
                    </div>
                  ) : (
                    <div className="p-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center text-slate-500 space-y-2">
                      <p>لم يتم إضافة ملخص السيرة الذاتية الأكاديمية بعد.</p>
                      {(isOwnProfile || canEvaluate) && (
                        <button
                          type="button"
                          onClick={() => setIsEditMode(true)}
                          className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          + إضافة السيرة الذاتية الان
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RESEARCH & PUBLICATIONS */}
        {activeTab === 'research' && (
          <div className="space-y-5 text-xs">
            {isEditMode && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-teal-600" />
                  <span>إضافة بحث جديد إلى السجل</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="عنوان البحث العلمي..."
                    value={newPubTitle}
                    onChange={(e) => setNewPubTitle(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="اسم المجلة العلمية..."
                    value={newPubJournal}
                    onChange={(e) => setNewPubJournal(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="السنة (مثال: 2024)"
                    value={newPubYear}
                    onChange={(e) => setNewPubYear(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="معرف DOI (اختياري)..."
                    value={newPubDoi}
                    onChange={(e) => setNewPubDoi(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPublication}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs rounded-lg cursor-pointer transition-colors"
                >
                  + إضافة البحث لسجل البروفايل
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-xs">سجل الأبحاث والأوراق العلمية المنشورة:</h3>
              <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200/80">
                عدد الأبحاث: {profileData.publications?.length || 0}
              </span>
            </div>

            {profileData.publications && profileData.publications.length > 0 ? (
              <div className="space-y-2.5">
                {profileData.publications.map((pub, idx) => (
                  <div key={idx} className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/80 space-y-1.5 relative hover:border-slate-300 transition-colors">
                    {isEditMode && (
                      <button
                        type="button"
                        onClick={() => handleDeletePublication(idx)}
                        className="absolute top-3 left-3 p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="font-semibold text-slate-900 text-xs leading-relaxed">{pub.title}</h4>
                      <span className="font-mono text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {pub.year}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pt-1 border-t border-slate-200/50">
                      <span>المجلة العلمية: <strong className="text-slate-800">{pub.journal}</strong></span>
                      {pub.doi && (
                        <span className="font-mono text-teal-700 font-semibold">DOI: {pub.doi}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 space-y-2">
                <p className="text-slate-500">لا توجد أبحاث علمية مسجلة حالياً.</p>
                {(isOwnProfile || canEvaluate) && (
                  <button
                    type="button"
                    onClick={() => { setActiveTab('research'); setIsEditMode(true); }}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    + إضافة أبحاث علمية
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CONFERENCES & WORKSHOPS */}
        {activeTab === 'conferences' && (
          <div className="space-y-5 text-xs">
            {isEditMode && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-teal-600" />
                  <span>إضافة مؤتمر أو ورشة عمل جديدة</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="اسم المؤتمر أو الندوة..."
                    value={newConfName}
                    onChange={(e) => setNewConfName(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="المكان / الجهة المنظمة..."
                    value={newConfLocation}
                    onChange={(e) => setNewConfLocation(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="التاريخ (مثال: مايو 2024)"
                    value={newConfDate}
                    onChange={(e) => setNewConfDate(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="الدور (مثال: متحدث رئيسي)"
                    value={newConfRole}
                    onChange={(e) => setNewConfRole(e.target.value)}
                    className="p-2.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddConference}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs rounded-lg cursor-pointer transition-colors"
                >
                  + إضافة المؤتمر للسجل
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-xs">سجل المؤتمرات والورش الطبية:</h3>
              <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-lg border border-teal-200/80">
                عدد المشاركات: {profileData.conferences?.length || 0}
              </span>
            </div>

            {profileData.conferences && profileData.conferences.length > 0 ? (
              <div className="space-y-2">
                {profileData.conferences.map((conf, idx) => (
                  <div key={idx} className="p-4 bg-slate-50/60 rounded-xl border border-slate-200/80 flex items-center justify-between hover:border-slate-300 transition-colors">
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs">{conf.name}</h4>
                      <span className="text-[11px] text-slate-500 font-medium">{conf.location} • الدور: <strong className="text-slate-800">{conf.role}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-600 text-[11px] bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                        {conf.date}
                      </span>
                      {isEditMode && (
                        <button
                          type="button"
                          onClick={() => handleDeleteConference(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 space-y-2">
                <p className="text-slate-500">لا توجد مؤتمرات أو ورشات عمل مسجلة.</p>
                {(isOwnProfile || canEvaluate) && (
                  <button
                    type="button"
                    onClick={() => { setActiveTab('conferences'); setIsEditMode(true); }}
                    className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    + إضافة مؤتمرات وورشات عمل
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: OFFICIAL DOCUMENTS & FILES (STUDENT PROFILE MATCHING STYLE) */}
        {activeTab === 'documents' && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xs p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-teal-600" />
                <span>{locale === 'ar' ? 'وثائق وملفات رئيس القسم الرسمية' : 'Department Head Documents'}</span>
              </h3>
              {(isOwnProfile || isEditMode || canEvaluate) && (
                <Button size="sm" onClick={() => setIsDocModalOpen(true)} className="gap-1.5 text-xs font-bold bg-teal-700 hover:bg-teal-800 text-white cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'إضافة وثيقة' : 'Upload Document'}</span>
                </Button>
              )}
            </div>

            {!profileData.documents || profileData.documents.length === 0 ? (
              <EmptyState title={locale === 'ar' ? 'لا توجد وثائق أو ملفات مرفقة حالياً' : 'No Documents Uploaded'} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profileData.documents.map((doc, idx) => (
                  <div key={doc.id || idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3 text-xs hover:border-slate-200 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-teal-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{doc.name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium flex items-center gap-1.5">
                          <span className="text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100 font-semibold">{getCategoryName(doc.category)}</span>
                          <span>•</span>
                          <span>{doc.created_at}</span>
                          {doc.file_size && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{doc.file_size}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {doc.file_url && (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="p-1.5 text-slate-500 hover:text-teal-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
                          title={locale === 'ar' ? 'معاينة واستعراض' : 'Preview'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {doc.file_url && (
                        <a
                          href={doc.file_url}
                          download={doc.name}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-500 hover:text-teal-600 rounded-lg hover:bg-slate-200/50 cursor-pointer"
                          title={locale === 'ar' ? 'تحميل' : 'Download'}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                      {(isOwnProfile || isEditMode || canEvaluate) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id || '', idx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 cursor-pointer"
                          title={locale === 'ar' ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUTOMATED KPI SCORECARD TABLE */}
        {showLegacyKpi && !isOwnProfile && canViewOfficialEvaluation && activeTab === 'kpi' && (
          <div className="space-y-5 text-xs">
            
            {/* Scorecard Header */}
            <div className="bg-slate-50 p-4 sm:p-5 rounded-xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-teal-600" />
                    <span>جدول تقييم مؤشرات الأداء الكلي (KPI Scorecard)</span>
                  </h3>

                  {!isOwnProfile && canEvaluate && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsManualOverrideModalOpen(true)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-[11px] rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Sliders className="w-3.5 h-3.5 text-teal-600" />
                        <span>رصد الدرجات yدوياً</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsWeightModalOpen(true)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 font-semibold text-[11px] rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-600" />
                        <span>ضبط الأوزان</span>
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 pt-1 font-medium">
                  حسبة شفافة تعتمد مباشرة على قواعد بيانات اعتمادات الدرجات والأبحاث وتغطيات الروتيشن السريري.
                </p>
              </div>

              <div dir="ltr" className="text-left font-mono font-bold text-2xl text-slate-900 shrink-0">
                {automatedKpiBreakdown.totalScore} <span className="text-xs text-slate-400 font-medium">/ 100</span>
              </div>
            </div>

            {/* Criteria Breakdown Rows */}
            <div className="space-y-3">
              
              {/* Criterion 1: Grades Timeliness */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-600" />
                    <span>1. اعتمادات العلامات والامتحانات بالمواعيد (الوزن النسبي: {automatedKpiBreakdown.weights.gradeTimelinessWeight}%)</span>
                    {automatedKpiBreakdown.overrides.gradeTimelinessScore !== undefined && (
                      <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                        (درجة مرصودة يدوياً)
                      </span>
                    )}
                  </div>
                  <span dir="ltr" className="font-mono text-slate-900 font-bold text-xs">
                    {automatedKpiBreakdown.gradeTimelinessScore} / {automatedKpiBreakdown.weights.gradeTimelinessWeight}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(automatedKpiBreakdown.gradeTimelinessScore / automatedKpiBreakdown.weights.gradeTimelinessWeight) * 100}%` }} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تم اعتماد 100% من المساقات السريرية في موعدها المعتمد.</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAuditModalCriteria('grades')}
                    className="text-teal-700 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>استعراض التفاصيل</span>
                  </button>
                </div>
              </div>

              {/* Criterion 2: Rotation & Supervisor Mgmt */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-600" />
                    <span>2. تغطية الروتيشنات وتكليف المشرفين (الوزن النسبي: {automatedKpiBreakdown.weights.rotationMgmtWeight}%)</span>
                    {automatedKpiBreakdown.overrides.rotationMgmtScore !== undefined && (
                      <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                        (درجة مرصودة يدوياً)
                      </span>
                    )}
                  </div>
                  <span dir="ltr" className="font-mono text-slate-900 font-bold text-xs">
                    {automatedKpiBreakdown.rotationMgmtScore} / {automatedKpiBreakdown.weights.rotationMgmtWeight}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(automatedKpiBreakdown.rotationMgmtScore / automatedKpiBreakdown.weights.rotationMgmtWeight) * 100}%` }} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>تغطية 96% من أسابيع التدريب في المستشفيات المعتمدة.</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAuditModalCriteria('rotations')}
                    className="text-teal-700 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span>استعراض التغطية</span>
                  </button>
                </div>
              </div>

              {/* Criterion 3: Research Output */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-600" />
                    <span>3. الأبحاث والإنتاج الأكاديمي (الوزن النسبي: {automatedKpiBreakdown.weights.researchWeight}%)</span>
                    {automatedKpiBreakdown.overrides.researchScore !== undefined && (
                      <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                        (درجة مرصودة يدوياً)
                      </span>
                    )}
                  </div>
                  <span dir="ltr" className="font-mono text-slate-900 font-bold text-xs">
                    {automatedKpiBreakdown.researchScore} / {automatedKpiBreakdown.weights.researchWeight}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(automatedKpiBreakdown.researchScore / automatedKpiBreakdown.weights.researchWeight) * 100}%` }} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="font-medium">
                    ({profileData.publications?.length || 0} أبحاث مضافة × 5 درجات لكل بحث)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('research')}
                    className="text-teal-700 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>عرض الأبحاث</span>
                  </button>
                </div>
              </div>

              {/* Criterion 4: Conferences & Workshops */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-600" />
                    <span>4. المؤتمرات والورش الطبية (الوزن النسبي: {automatedKpiBreakdown.weights.confWeight}%)</span>
                    {automatedKpiBreakdown.overrides.confScore !== undefined && (
                      <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                        (درجة مرصودة يدوياً)
                      </span>
                    )}
                  </div>
                  <span dir="ltr" className="font-mono text-slate-900 font-bold text-xs">
                    {automatedKpiBreakdown.confScore} / {automatedKpiBreakdown.weights.confWeight}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-600 rounded-full" style={{ width: `${(automatedKpiBreakdown.confScore / automatedKpiBreakdown.weights.confWeight) * 100}%` }} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="font-medium">
                    ({profileData.conferences?.length || 0} مشاركات ومؤتمرات × 5 درجات)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('conferences')}
                    className="text-teal-700 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>عرض المؤتمرات</span>
                  </button>
                </div>
              </div>

              {/* Criterion 5: Director & Dean Evaluation */}
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-700" />
                    <span>5. تقييم مدير الدائرة والعميد القيادي (الوزن النسبي: {automatedKpiBreakdown.weights.evaluationWeight}%)</span>
                  </div>
                  <span dir="ltr" className="font-mono text-slate-900 font-bold text-xs">
                    {automatedKpiBreakdown.directorDeanEvalScore} / {automatedKpiBreakdown.weights.evaluationWeight}
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-700 rounded-full" style={{ width: `${(automatedKpiBreakdown.directorDeanEvalScore / automatedKpiBreakdown.weights.evaluationWeight) * 100}%` }} />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="font-medium">
                    (7.5 قيادة إدارية + 7.5 معايير سريرية وحوكمة)
                  </span>
                  {!isOwnProfile && canEvaluate && (
                    <button
                      type="button"
                      onClick={() => setIsEvalModalOpen(true)}
                      className="text-teal-700 font-semibold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>تعديل التقييم الرسمى</span>
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Official Written Evaluation Box */}
            <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[#0F172A] text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <span>ملاحظات وتقييم مدير الدائرة الرسمية:</span>
                </h3>

                {!isOwnProfile && canEvaluate && (
                  <button
                    type="button"
                    onClick={() => setIsEvalModalOpen(true)}
                    className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white font-medium text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    ✏️ تعديل التقييم
                  </button>
                )}
              </div>

              {profileData.evaluation ? (
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>المقيّم: {profileData.evaluation.evaluator_name} ({profileData.evaluation.evaluator_role})</span>
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{profileData.evaluation.evaluation_date}</span>
                  </div>

                  <p className="text-slate-700 font-serif leading-relaxed text-xs">
                    "{profileData.evaluation.comments}"
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-4">لم يتم إضافة ملاحظات تقييم رسمية بعد.</p>
              )}
            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* MODALS SECTION */}
      {/* ========================================================================= */}
      
      {/* 1. MANUAL OVERRIDE MODAL */}
      <Modal
        isOpen={isManualOverrideModalOpen}
        onClose={() => setIsManualOverrideModalOpen(false)}
        title="رصد الدرجات يدوياً في قاعدة البيانات"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700 font-medium leading-relaxed">
            يمكن لعميد الكلية ومدير الدائرة السريرية رصد وتثبيت درجات مباشرة لكل محور حسب الرؤية القيادية.
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-medium text-slate-800 mb-1">
                1. درجة اعتمادات العلامات (من أصل {weightsConfig.gradeTimelinessWeight})
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={weightsConfig.gradeTimelinessWeight}
                value={manualGradesScore}
                onChange={(e) => setManualGradesScore(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                2. درجة إدارة وتغطية الروتيشنات (من أصل {weightsConfig.rotationMgmtWeight})
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={weightsConfig.rotationMgmtWeight}
                value={manualRotationsScore}
                onChange={(e) => setManualRotationsScore(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                3. درجة الأبحاث والنشرات الأكاديمية (من أصل {weightsConfig.researchWeight})
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={weightsConfig.researchWeight}
                value={manualResearchScore}
                onChange={(e) => setManualResearchScore(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                4. درجة المؤتمرات والورش السريرية (من أصل {weightsConfig.confWeight})
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max={weightsConfig.confWeight}
                value={manualConfScore}
                onChange={(e) => setManualConfScore(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsManualOverrideModalOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveManualOverrides} className="bg-teal-700 hover:bg-teal-800 text-white font-medium">
              اعتماد الدرجات اليدوية
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2. FLEXIBLE WEIGHTS CONFIGURATION MODAL */}
      <Modal 
        isOpen={isWeightModalOpen} 
        onClose={() => setIsWeightModalOpen(false)} 
        title="ضبط أوزان معايير مؤشر الأداء (KPI Weights)"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700 font-medium leading-relaxed">
            يتاح لإدارة الكلية توزيع الأوزان النسبية للمحاور الخمسة بحيث يكون الإجمالي 100%.
          </div>

          <div className="space-y-3">
            <div>
              <label className="block font-medium text-slate-800 mb-1">
                1. وزن اعتمادات العلامات والامتحانات (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={weightsConfig.gradeTimelinessWeight}
                onChange={(e) => setWeightsConfig({ ...weightsConfig, gradeTimelinessWeight: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                2. وزن تغطية الروتيشنات وتكليف المشرفين (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={weightsConfig.rotationMgmtWeight}
                onChange={(e) => setWeightsConfig({ ...weightsConfig, rotationMgmtWeight: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                3. وزن الأبحاث والنشر الأكاديمي (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={weightsConfig.researchWeight}
                onChange={(e) => setWeightsConfig({ ...weightsConfig, researchWeight: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                4. وزن المؤتمرات والورش (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={weightsConfig.confWeight}
                onChange={(e) => setWeightsConfig({ ...weightsConfig, confWeight: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-800 mb-1">
                5. وزن التقييم المباشر للإدارة (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={weightsConfig.evaluationWeight}
                onChange={(e) => setWeightsConfig({ ...weightsConfig, evaluationWeight: Number(e.target.value) })}
                className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-100 rounded-lg flex items-center justify-between font-mono font-bold">
            <span>مجموع الأوزان المحددة:</span>
            <span className={`text-sm ${
              (weightsConfig.gradeTimelinessWeight + weightsConfig.rotationMgmtWeight + weightsConfig.researchWeight + weightsConfig.confWeight + weightsConfig.evaluationWeight) === 100 ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {weightsConfig.gradeTimelinessWeight + weightsConfig.rotationMgmtWeight + weightsConfig.researchWeight + weightsConfig.confWeight + weightsConfig.evaluationWeight}% / 100%
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsWeightModalOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveWeightsConfig} className="bg-teal-700 hover:bg-teal-800 text-white font-medium">
              اعتماد الأوزان
            </Button>
          </div>
        </div>
      </Modal>

      {/* 3. EVALUATION MODAL FOR CLINICAL DIRECTOR & DEAN */}
      <Modal 
        isOpen={isEvalModalOpen} 
        onClose={() => setIsEvalModalOpen(false)} 
        title="نموذج التقييم الرسمي لرئيس القسم"
      >
        <div className="space-y-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-slate-700 font-medium">
            نموذج مخصص لرصد وتقييم الأداء القيادي والسريري لرئيس القسم من قبل عمادة الكلية والدائرة السريرية.
          </div>

          <div>
            <label className="block font-medium text-slate-800 mb-1">
              1. درجة القيادة والتنسيق الإداري (من 7.5)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="7.5"
              value={evalLeadership}
              onChange={(e) => setEvalLeadership(Number(e.target.value))}
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-800 mb-1">
              2. درجة الحوكمة والمعايير السريرية (من 7.5)
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="7.5"
              value={evalClinical}
              onChange={(e) => setEvalClinical(Number(e.target.value))}
              className="w-full p-2.5 border border-slate-200 rounded-lg font-mono bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-800 mb-1">
              3. التوصيات الرسمية والملاحظات المباشرة
            </label>
            <textarea
              rows={4}
              placeholder="اكتب التوصيات والملاحظات الرسمية هنا..."
              value={evalComments}
              onChange={(e) => setEvalComments(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg font-serif text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsEvalModalOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveDeanDirectorEvaluation} className="bg-teal-700 hover:bg-teal-800 text-white font-medium">
              حفظ واعتماد التقييم
            </Button>
          </div>
        </div>
      </Modal>

      {/* 4. AUDIT INSPECTION MODAL */}
      <Modal
        isOpen={Boolean(auditModalCriteria)}
        onClose={() => setAuditModalCriteria(null)}
        title="سجل التتبع وتفاصيل الاعتمادات"
      >
        <div className="space-y-4 text-xs">
          {auditModalCriteria === 'grades' && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-semibold text-slate-800">
                سجل اعتماد درجات مساقات قسم {profileData.department_name}:
              </div>

              <div className="space-y-2">
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-medium">
                  <span>مساق الباطني العام (MED601)</span>
                  <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200/80 font-semibold">اعتُمِد بالموعد ✓</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-medium">
                  <span>مساق الجراحة السريرية (SURG602)</span>
                  <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200/80 font-semibold">اعتُمِد بالموعد ✓</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-medium">
                  <span>مساق طب الأطفال والخدّاج (PEDS603)</span>
                  <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200/80 font-semibold">اعتُمِد بالموعد ✓</span>
                </div>
              </div>
            </div>
          )}

          {auditModalCriteria === 'rotations' && (
            <div className="space-y-3">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 font-semibold text-slate-800">
                سجل تغطية المستشفيات والروتيشن السريري:
              </div>

              <div className="space-y-2">
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-medium">
                  <span>مستشفى الخليل الحكومي — قسم الباطني</span>
                  <span className="text-teal-700 font-semibold">مغطى 100% (20/20 أسبوع)</span>
                </div>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between font-medium">
                  <span>المستشفى الأهلي — قسم الجراحة</span>
                  <span className="text-teal-700 font-semibold">مغطى 94% (15/16 أسبوع)</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setAuditModalCriteria(null)}>إغلاق</Button>
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal (Student Profile Style) */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-800">
                {locale === 'ar' ? 'إرفاق وثيقة جديدة لرئيس القسم' : 'Upload Document'}
              </h3>
              <button onClick={() => setIsDocModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadDocumentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'عنوان الوثيقة:' : 'Document Title:'}</label>
                <input
                  required
                  type="text"
                  placeholder={locale === 'ar' ? 'مثال: شهادة البورد / قرار التكليف' : 'Doc Title'}
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'تصنيف الملف:' : 'Category:'}</label>
                <select
                  value={newDocCategory}
                  onChange={(e) => setNewDocCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-medium bg-white cursor-pointer focus:ring-1 focus:ring-teal-600"
                >
                  <option value="academic_degree">{locale === 'ar' ? 'شهادة أكاديمية (بورد / دكتوراه)' : 'Academic Degree'}</option>
                  <option value="administrative_decision">{locale === 'ar' ? 'قرار إداري (تكليف / ترقية)' : 'Administrative Decision'}</option>
                  <option value="identification_license">{locale === 'ar' ? 'أوراق ثبوتية ورخص مزاولة' : 'ID & License'}</option>
                  <option value="contract_agreement">{locale === 'ar' ? 'عقود واتفاقيات رسمية' : 'Contract & Agreement'}</option>
                  <option value="other">{locale === 'ar' ? 'وثيقة أخرى' : 'Other'}</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اختر الملف (PDF / صورة):' : 'Select File:'}</label>
                <input
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx"
                  onChange={(e) => setSelectedDocFile(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-slate-200 p-2 font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isUploadingDoc}
                  className="px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer"
                >
                  {isUploadingDoc ? (locale === 'ar' ? 'جاري الرفع...' : 'Uploading...') : (locale === 'ar' ? 'حفظ وإرفاق' : 'Save Document')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal (Student Profile Style) */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-xl border border-slate-200 p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-800">{previewDoc.name}</h3>
              <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-50 rounded-2xl p-4 min-h-[250px]">
              {previewDoc.file_url ? (
                previewDoc.file_type?.startsWith('image/') || previewDoc.file_url.startsWith('data:image/') || previewDoc.file_url.endsWith('.png') || previewDoc.file_url.endsWith('.jpg') || previewDoc.file_url.endsWith('.jpeg') ? (
                  <img src={previewDoc.file_url} alt={previewDoc.name} className="max-h-[60vh] object-contain rounded-xl shadow-xs" />
                ) : (
                  <iframe src={previewDoc.file_url} title={previewDoc.name} className="w-full h-[50vh] rounded-xl border border-slate-200" />
                )
              ) : (
                <div className="text-center text-xs text-slate-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p>{locale === 'ar' ? 'معاينة الملف غير متاحة' : 'Preview unavailable'}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button onClick={() => setPreviewDoc(null)} className="px-4 py-1.5 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer">
                {locale === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
