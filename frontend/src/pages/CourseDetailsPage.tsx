import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { 
  ChevronRight, BookOpen, Target, Settings, CheckCircle, 
  Plus, Edit3, Trash2, FileText, Award,
  BarChart2, X
} from 'lucide-react';

interface AssessmentComponent {
  id: number;
  code?: 'clinical' | 'osce' | 'written' | null;
  name: string;
  weight?: number | null;
  max_score?: number | null;
  entry_max_score?: number | null;
  assessment_frequency?: 'weekly' | 'period' | null;
  mini_osce_max_score?: number | null;
  osce_entry_mode?: 'assistant' | 'supervisor' | 'committee' | 'legacy_shared' | null;
  evaluator?: string | null;
  timing?: string | null;
  is_required_to_pass?: boolean;
  notes?: string | null;
}

interface LearningOutcome {
  id: number;
  outcome_code: string;
  text_ar?: string | null;
  text_en?: string | null;
  domain?: string | null;
  program_outcome?: string | null;
  teaching_method?: string | null;
  assessment_method?: string | null;
}

interface ProgramOutcomeMapping {
  id: number;
  program_outcome_code: string;
  mapping_level?: string | null;
}

interface ProgramOutcome {
  id: number;
  code: string;
  name_ar?: string | null;
  name_en?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  domain?: string | null;
}

interface Course {
  id: number;
  code: string;
  name_ar: string;
  name_en?: string | null;
  credit_hours: number;
  academic_level?: string | null;
  is_active?: boolean;
  description?: string | null;
  assessment_components?: AssessmentComponent[];
  learning_outcomes?: LearningOutcome[];
  program_outcome_mappings?: ProgramOutcomeMapping[];
}

export function CourseDetailsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  // Modals state
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState({ clinical: '20', osce: '40', written: '40' });
  const [clinicalEntryMode, setClinicalEntryMode] = useState<'ten' | 'direct'>('ten');
  const [assessmentFrequency, setAssessmentFrequency] = useState<'weekly' | 'period'>('weekly');
  const [miniOsceMax, setMiniOsceMax] = useState('0');
  const [osceEntryMode, setOsceEntryMode] = useState<'assistant' | 'supervisor' | 'committee' | 'legacy_shared'>('legacy_shared');
  const [isIloModalOpen, setIsIloModalOpen] = useState(false);
  const [isPloModalOpen, setIsPloModalOpen] = useState(false);
  const [activeSection,setActiveSection]=useState<'outcomes'|'assessment'>('outcomes');

  // Edit states
  const [editingComp, setEditingComp] = useState<AssessmentComponent | null>(null);
  const [editingIlo, setEditingIlo] = useState<LearningOutcome | null>(null);

  // Assessment Component Form State
  const [compName, setCompName] = useState('');
  const [compWeight, setCompWeight] = useState('20');
  const [compNotes, setCompNotes] = useState('');

  // ILO Form State
  const [iloCode, setIloCode] = useState('');
  const [iloTextAr, setIloTextAr] = useState('');
  const [iloTextEn, setIloTextEn] = useState('');
  const [iloDomain, setIloDomain] = useState('Knowledge');

  // PLO Form State
  const [ploCode, setPloCode] = useState('');
  const [ploLevel, setPloLevel] = useState('High');

  const [actionError, setActionError] = useState('');

  // Fetch course details live from MySQL DB
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => apiFetch<Course>(`/courses/${courseId}`),
    enabled: Boolean(courseId),
  });

  const { data: plosList } = useQuery({
    queryKey: ['program-outcomes'],
    queryFn: () => apiFetch<ProgramOutcome[]>('/program-outcomes'),
  });

  // Assessment Component Mutations
  const compMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingComp) {
        return apiFetch(`/courses/${courseId}/assessment-components/${editingComp.id}`, { method: 'PUT', body: payload });
      }
      return apiFetch(`/courses/${courseId}/assessment-components`, { method: 'POST', body: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setIsCompModalOpen(false);
      setActionError('');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const planMutation = useMutation({
    mutationFn: (components: { clinical: number; osce: number; written: number; clinical_entry_max_score: number; assessment_frequency: 'weekly' | 'period'; mini_osce_max_score: number; osce_entry_mode: 'assistant' | 'supervisor' | 'committee' | 'legacy_shared' }) => apiFetch(`/courses/${courseId}/assessment-plan`, { method: 'PUT', body: components }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['course', courseId] }); await qc.invalidateQueries({ queryKey: ['grade-options'] }); setPlanOpen(false); setActionError(''); },
    onError: (error: Error) => setActionError(error.message),
  });

  const deleteCompMutation = useMutation({
    mutationFn: (compId: number) => apiFetch(`/courses/${courseId}/assessment-components/${compId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
    onError: (error: Error) => setActionError(error.message),
  });

  // ILO Mutations
  const iloMutation = useMutation({
    mutationFn: (payload: any) => {
      if (editingIlo) {
        return apiFetch(`/courses/${courseId}/learning-outcomes/${editingIlo.id}`, { method: 'PUT', body: payload });
      }
      return apiFetch(`/courses/${courseId}/learning-outcomes`, { method: 'POST', body: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setIsIloModalOpen(false);
      setActionError('');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const deleteIloMutation = useMutation({
    mutationFn: (iloId: number) => apiFetch(`/courses/${courseId}/learning-outcomes/${iloId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
    onError: (error: Error) => setActionError(error.message),
  });

  // PLO Mapping Mutations
  const ploMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/courses/${courseId}/program-outcome-mappings`, { method: 'POST', body: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setIsPloModalOpen(false);
      setActionError('');
    },
    onError: (error: Error) => setActionError(error.message),
  });

  const deletePloMutation = useMutation({
    mutationFn: (ploId: number) => apiFetch(`/courses/${courseId}/program-outcome-mappings/${ploId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
    onError: (error: Error) => setActionError(error.message),
  });

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState onRetry={() => refetch()} />;

  const name = locale === 'ar' ? data.name_ar : data.name_en || data.name_ar;
  const getPloText = (code: string) => {
    const outcome = plosList?.find((item) => item.code === code);
    return outcome
      ? (locale === 'ar'
          ? outcome.description_ar || outcome.name_ar || outcome.description_en || outcome.name_en
          : outcome.description_en || outcome.name_en || outcome.description_ar || outcome.name_ar)
      : null;
  };

  // Calculate total weights
  const totalWeight = (data.assessment_components || []).reduce((acc, item) => acc + (Number(item.weight) || 0), 0);
  const totalMaxScore = (data.assessment_components || []).reduce((acc, item) => acc + (Number(item.max_score) || 0), 0);
  const openPlan = () => {
    const score = (code: 'clinical'|'osce'|'written', fallback: string) => String(data.assessment_components?.find(item => item.code === code)?.max_score ?? fallback);
    setPlanDraft({ clinical: score('clinical', '20'), osce: score('osce', '40'), written: score('written', '40') });
    const clinical = data.assessment_components?.find(item => item.code === 'clinical');
    const osce = data.assessment_components?.find(item => item.code === 'osce');
    setClinicalEntryMode(clinical?.entry_max_score != null && Number(clinical.entry_max_score) === Number(clinical.max_score) ? 'direct' : 'ten');
    setAssessmentFrequency(clinical?.assessment_frequency === 'period' ? 'period' : 'weekly');
    setMiniOsceMax(String(clinical?.mini_osce_max_score ?? 0));
    setOsceEntryMode(osce?.osce_entry_mode ?? 'legacy_shared');
    setActionError('');
    setPlanOpen(true);
  };
  const planDraftTotal = Number(planDraft.clinical) + Number(planDraft.osce) + Number(planDraft.written);
  const mappingLevelLabel = (value?: string | null) => {
    const level = value || 'High';
    if (locale !== 'ar') return level;
    return ({ High: 'مرتفع', Medium: 'متوسط', Low: 'منخفض' } as Record<string, string>)[level] || level;
  };

  // Handlers for Modals
  const handleOpenCompModal = (comp?: AssessmentComponent) => {
    if (comp) {
      setEditingComp(comp);
      setCompName(comp.name);
      setCompWeight(String(comp.weight || 20));
      setCompNotes(comp.notes || '');
    } else {
      setEditingComp(null);
      setCompName('');
      setCompWeight('20');
      setCompNotes('');
    }
    setIsCompModalOpen(true);
  };

  const handleSaveComp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return;
    compMutation.mutate({
      name: compName.trim(),
      weight: Number(compWeight),
      max_score: Number(compWeight),
      notes: compNotes.trim() || null,
    });
  };

  const handleOpenIloModal = (ilo?: LearningOutcome) => {
    if (ilo) {
      setEditingIlo(ilo);
      setIloCode(ilo.outcome_code);
      setIloTextAr(ilo.text_ar || '');
      setIloTextEn(ilo.text_en || '');
      setIloDomain(ilo.domain || 'Knowledge');
    } else {
      setEditingIlo(null);
      setIloCode(`ILO-${(data.learning_outcomes?.length || 0) + 1}`);
      setIloTextAr('');
      setIloTextEn('');
      setIloDomain('Knowledge');
    }
    setIsIloModalOpen(true);
  };

  const handleSaveIlo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!iloCode.trim() || (!iloTextAr.trim() && !iloTextEn.trim())) return;
    iloMutation.mutate({
      outcome_code: iloCode.trim(),
      text_ar: iloTextAr.trim() || null,
      text_en: iloTextEn.trim() || null,
      domain: iloDomain,
    });
  };

  const handleSavePlo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ploCode.trim()) return;
    ploMutation.mutate({
      program_outcome_code: ploCode.trim(),
      mapping_level: ploLevel,
    });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 pb-16 px-2 sm:px-0">
      {actionError && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700"><span>{actionError}</span><button onClick={()=>setActionError('')}>✕</button></div>}
      {/* Breadcrumbs & Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <Link 
            to="/courses" 
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-teal-700 transition-colors bg-slate-50 hover:bg-teal-50 px-3 py-1.5 rounded-xl border border-slate-200"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180 text-teal-600" />
            <span>{t('nav.courses', 'مساقات الدائرة السريرية')}</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-bold font-mono text-teal-800 bg-teal-50 border border-teal-100 px-2.5 py-1 rounded-lg">
            {data.code}
          </span>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/v1/courses/${courseId}/report.pdf`}
            className="text-xs font-semibold bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100/70 px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-teal-600" />
            <span>{locale === 'ar' ? 'تصدير تقرير المساق PDF' : 'Export Course Report PDF'}</span>
          </a>

          {can('grades.view') && <Link
            to={`/grades?course_id=${courseId}`} 
            className="text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-3.5 py-2 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
          >
            <BarChart2 className="w-4 h-4" />
            <span>{locale === 'ar' ? 'سجل العلامات' : 'Grades Log'}</span>
          </Link>}
        </div>
      </div>

      {/* Hero Course Profile Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="bg-teal-50 p-6 relative">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white border border-teal-100 flex items-center justify-center shrink-0">
                <BookOpen className="w-7 h-7 text-teal-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-white text-teal-700 font-mono font-bold text-xs px-2.5 py-0.5 rounded-md border border-teal-100">
                    {data.code}
                  </span>
                  <span className="bg-white text-slate-600 font-semibold text-[11px] px-2.5 py-0.5 rounded-md border border-slate-200">
                    {data.academic_level === 'fifth' ? (locale === 'ar' ? 'السنة الخامسة' : '5th Year') : data.academic_level === 'sixth' ? (locale === 'ar' ? 'السنة السادسة' : '6th Year') : (locale === 'ar' ? 'السنة الرابعة' : '4th Year')}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{name}</h1>
                {locale === 'ar' && data.name_en && (
                  <p className="text-slate-500 text-xs mt-0.5 font-medium">{data.name_en}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-teal-100 self-start sm:self-center">
              <Award className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-bold text-teal-800">
                {data.credit_hours} {locale === 'ar' ? 'ساعات معتمدة' : 'Credit Hours'}
              </span>
            </div>
          </div>
        </div>

        {data.description && (
          <div className="p-4 bg-slate-50/70 border-t border-slate-100 text-xs text-slate-700 font-medium leading-relaxed">
            <span className="font-bold text-slate-900 ml-1">{locale === 'ar' ? 'وصف المساق:' : 'Description:'}</span>
            {data.description}
          </div>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <button onClick={()=>setActiveSection('outcomes')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${activeSection==='outcomes'?'bg-teal-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-50'}`}><Target className="h-4 w-4"/>{locale==='ar'?'مخرجات التعلم والبرنامج':'Learning outcomes'}<span className={`rounded-md px-1.5 py-0.5 text-[9px] ${activeSection==='outcomes'?'bg-white/20':'bg-slate-100'}`}>{(data.learning_outcomes?.length||0)+(data.program_outcome_mappings?.length||0)}</span></button>
        <button onClick={()=>setActiveSection('assessment')} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${activeSection==='assessment'?'bg-teal-600 text-white shadow-sm':'text-slate-500 hover:bg-slate-50'}`}><Settings className="h-4 w-4"/>{locale==='ar'?'خطة التقييم':'Assessment plan'}<span className={`rounded-md px-1.5 py-0.5 text-[9px] ${activeSection==='assessment'?'bg-white/20':'bg-slate-100'}`}>{data.assessment_components?.length||0}</span></button>
      </nav>

      <div>
        
        {/* Main Column (2/3 width) */}
        {activeSection==='outcomes'&&<div className="space-y-4">
          
          {/* Learning Outcomes (ILOs) Card */}
          <section className="overflow-hidden border-y border-slate-200 bg-white">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-600" />
                <h2 className="font-bold text-xs text-slate-800">{locale === 'ar' ? 'مخرجات التعلم المستهدفة (ILOs)' : 'Learning Outcomes (ILOs)'}</h2>
                <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full">
                  {data.learning_outcomes?.length || 0}
                </span>
              </div>

              {can('courses.manage') && (
                <button
                  type="button"
                  onClick={() => handleOpenIloModal()}
                  className="px-2.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'إضافة مخرج' : 'Add ILO'}</span>
                </button>
              )}
            </div>

            <div className="p-4">
              {!data.learning_outcomes?.length ? (
                <EmptyState message={locale === 'ar' ? 'لم يتم إضافة مخرجات تعلم (ILOs) لهذا المساق بعد' : 'No learning outcomes added yet'} />
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.learning_outcomes.map(item => (
                    <div key={item.id} className="space-y-2 px-1 py-3.5 transition-colors hover:bg-slate-50/70 sm:px-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-teal-700 font-mono bg-teal-50 border border-teal-100 px-2.5 py-0.5 rounded-md text-xs">
                            {item.outcome_code}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                            {item.domain === 'Skills' ? (locale === 'ar' ? 'المهارات السريرية' : 'Clinical Skills') : item.domain === 'Competencies' ? (locale === 'ar' ? 'الكفايات السريرية' : 'Competencies') : (locale === 'ar' ? 'المعرفة والمفاهيم' : 'Knowledge')}
                          </span>
                        </div>

                        {can('courses.manage') && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenIloModal(item)}
                              className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(locale === 'ar' ? 'حذف هذا المخرج؟' : 'Delete this ILO?')) {
                                  deleteIloMutation.mutate(item.id);
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs font-medium text-slate-800 leading-relaxed">
                        {locale === 'ar' ? (item.text_ar || item.text_en) : (item.text_en || item.text_ar || '—')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Program Outcomes Mapping (PLOs) Card */}
          <section className="overflow-hidden border-y border-slate-200 bg-white">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-teal-600" />
                <h2 className="font-bold text-xs text-slate-800">{locale === 'ar' ? 'ارتباط المخرجات بمخرجات البرنامج (PLOs)' : 'Program Outcome Mappings (PLOs)'}</h2>
              </div>

              {can('courses.manage') && (
                <button
                  type="button"
                  onClick={() => setIsPloModalOpen(true)}
                  className="px-2.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'ربط PLO' : 'Map PLO'}</span>
                </button>
              )}
            </div>

            <div className="p-4">
              {!data.program_outcome_mappings?.length ? (
                <EmptyState message={locale === 'ar' ? 'لا يوجد ارتباط بمخرجات البرنامج العامة حالياً' : 'No program outcome mappings defined'} />
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.program_outcome_mappings.map(item => (
                    <div key={item.id} className="flex items-start justify-between gap-3 px-1 py-3.5 transition-colors hover:bg-slate-50/70 sm:px-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-slate-800 text-xs">{item.program_outcome_code}</span>
                          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                            {mappingLevelLabel(item.mapping_level)}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] font-medium leading-5 text-slate-600">
                          {getPloText(item.program_outcome_code) || (locale === 'ar' ? 'نص مخرج البرنامج غير متوفر' : 'Program outcome text is unavailable')}
                        </p>
                      </div>

                      {can('courses.manage') && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(locale === 'ar' ? 'حذف هذا الارتباط؟' : 'Remove mapping?')) {
                              deletePloMutation.mutate(item.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>}

        {/* Sidebar Column (1/3 width) */}
        {activeSection==='assessment'&&<div className="space-y-4">
          {/* Assessment Components Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-600" />
                <h2 className="font-bold text-xs text-slate-800">{locale === 'ar' ? 'مكونات التقييم' : 'Assessment Components'}</h2>
              </div>

              {can('courses.manage') ? <button type="button" onClick={openPlan} className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-[11px] font-bold text-teal-800 hover:bg-teal-50">{locale === 'ar' ? 'ضبط خطة المساق' : 'Edit course plan'}</button> : <span className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">{locale === 'ar' ? 'مرتبطة بكشف العلامات' : 'Linked to grade sheet'}</span>}
            </div>

            <div className="p-4 space-y-4">
              {/* Progress Bar for Weights */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-600">{locale === 'ar' ? 'إجمالي الوزن النسبي:' : 'Total Weight:'}</span>
                  <span className={totalWeight === 100 ? 'text-emerald-600' : 'text-amber-700'}>
                    {totalWeight}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${totalWeight === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, totalWeight)}%` }}
                  />
                </div>
                {totalWeight !== 100 && <p className="text-[10px] font-bold text-amber-700">{locale === 'ar' ? `المتبقي لاعتماد الخطة: ${Math.max(0, 100-totalWeight)}%` : `Remaining to complete the plan: ${Math.max(0, 100-totalWeight)}%`}</p>}
                <p className={`text-[10px] font-bold ${totalMaxScore === 100 ? 'text-emerald-700' : 'text-amber-700'}`}>{locale === 'ar' ? `مجموع العلامات القصوى: ${totalMaxScore}/100` : `Maximum scores total: ${totalMaxScore}/100`}</p>
              </div>

              {!data.assessment_components?.length ? (
                <EmptyState message={locale === 'ar' ? 'لم يتم ضبط مكونات التقييم لهذا المساق بعد' : 'No assessment components added'} />
              ) : (
                <div className="space-y-2.5">
                  {data.assessment_components.map(item => (
                    <div key={item.id} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-800 text-xs truncate mb-0.5">{item.name}</span>
                        <span className="block text-[10px] text-slate-500 font-semibold">
                          {locale === 'ar' ? `القصوى: ${item.max_score ?? 100} درجة` : `Max: ${item.max_score ?? 100}`}
                        </span>
                        {item.code === 'clinical' && <span className="mt-1 block text-[10px] font-bold text-teal-700">{locale === 'ar' ? `إدخال المشرف: من ${item.entry_max_score ?? 10}${Number(item.entry_max_score ?? 10) === Number(item.max_score) ? ' مباشرة' : ` ← تحويل إلى ${item.max_score}`} · ${item.assessment_frequency === 'period' ? 'مرة لكل فترة' : 'أسبوعياً'}${Number(item.mini_osce_max_score) > 0 ? ` · ميني أوسكي من ${item.mini_osce_max_score}` : ''}` : `Supervisor entry: out of ${item.entry_max_score ?? 10}${Number(item.entry_max_score ?? 10) === Number(item.max_score) ? ' directly' : ` → scaled to ${item.max_score}`} · ${item.assessment_frequency === 'period' ? 'once per period' : 'weekly'}${Number(item.mini_osce_max_score) > 0 ? ` · mini OSCE /${item.mini_osce_max_score}` : ''}`}</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 font-bold text-xs border border-teal-100">
                          {item.weight || 0}%
                        </span>

                        {can('courses.manage') && (
                          <div className="flex items-center gap-0.5">
                            {!item.code && <button
                              type="button"
                              onClick={() => handleOpenCompModal(item)}
                              className="p-1 text-slate-400 hover:text-teal-700 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>}
                            {!item.code && <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(locale === 'ar' ? 'حذف هذا التقييم؟' : 'Delete component?')) {
                                  deleteCompMutation.mutate(item.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>}
      </div>

      {/* Assessment Component Modal */}
      {planOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPlanOpen(false); }}>
        <form onSubmit={event => { event.preventDefault(); if (planDraftTotal !== 100 || !Number.isFinite(Number(miniOsceMax)) || Number(miniOsceMax) < 0 || Number(miniOsceMax) >= Number(planDraft.clinical) || Object.entries(planDraft).some(([code, value]) => !Number.isFinite(Number(value)) || Number(value) < (code === 'osce' ? 0 : 0.01))) return; planMutation.mutate({ clinical: Number(planDraft.clinical), osce: Number(planDraft.osce), written: Number(planDraft.written), clinical_entry_max_score: clinicalEntryMode === 'direct' ? Number(planDraft.clinical) : 10, assessment_frequency: assessmentFrequency, mini_osce_max_score: Number(miniOsceMax), osce_entry_mode: osceEntryMode }); }} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" aria-label={locale === 'ar' ? 'خطة تقييم المساق' : 'Course assessment plan'}>
          <div><h3 className="text-lg font-black text-slate-900">{locale === 'ar' ? 'خطة تقييم المساق' : 'Course assessment plan'}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{locale === 'ar' ? 'حدد تقسيمة الـ100 لكل مساق. اجعل الأوسكي النهائي صفراً إذا لم يكن ضمن الخطة.' : 'Set this course’s 100-point plan. Set final OSCE to zero when it is not part of the course.'}</p></div>
          {([['clinical', 'التقييم السريري', 'Clinical assessment'], ['osce', 'OSCE النهائي', 'Final OSCE'], ['written', 'الامتحان الكتابي النهائي', 'Final written exam']] as const).map(([code, arabic, english]) => <label key={code} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3 text-sm"><span className="font-bold text-slate-800">{locale === 'ar' ? arabic : english}</span><span className="flex shrink-0 items-center gap-1"><input type="number" min={code === 'osce' ? '0' : '0.01'} max="100" step="0.01" required value={planDraft[code]} onChange={event => setPlanDraft(current => ({ ...current, [code]: event.target.value }))} className="w-20 rounded-lg border border-slate-200 px-2 py-2 text-center font-bold"/><span className="text-xs text-slate-500">/100</span></span></label>)}
          <label className="block text-sm font-bold text-slate-800">{locale === 'ar' ? 'موعد تقييم المشرف' : 'Supervisor assessment frequency'}<select value={assessmentFrequency} onChange={event => setAssessmentFrequency(event.target.value as 'weekly' | 'period')} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="weekly">{locale === 'ar' ? 'كل أسبوع' : 'Every week'}</option><option value="period">{locale === 'ar' ? 'مرة واحدة لكل فترة تدريب' : 'Once per training period'}</option></select></label>
          <label className="block text-sm font-bold text-slate-800">{locale === 'ar' ? 'ميني أوسكي لكل فترة تدريب، ضمن السريري' : 'Mini OSCE per training period, within clinical'}<input type="number" min="0" max={Number(planDraft.clinical) - 0.01} step="0.01" value={miniOsceMax} onChange={event => setMiniOsceMax(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2"/></label>
          {Number(planDraft.osce) > 0 && <label className="block text-sm font-bold text-slate-800">{locale === 'ar' ? 'من يُدخل الأوسكي النهائي؟' : 'Who enters final OSCE?'}<select value={osceEntryMode} onChange={event => setOsceEntryMode(event.target.value as 'assistant' | 'supervisor' | 'committee' | 'legacy_shared')} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="legacy_shared">{locale === 'ar' ? 'الإعداد السابق: المشرف أو المساعد' : 'Previous setting: supervisor or assistant'}</option><option value="assistant">{locale === 'ar' ? 'مساعد البحث والتدريس' : 'Research and teaching assistant'}</option><option value="supervisor">{locale === 'ar' ? 'المشرف السريري' : 'Clinical supervisor'}</option><option value="committee">{locale === 'ar' ? 'لجنة مشرفين؛ واحد يُدخل العلامة المتفق عليها' : 'Supervisor panel; one records the agreed mark'}</option></select></label>}
          <label className="block rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm"><span className="mb-2 block font-bold text-slate-800">{locale === 'ar' ? 'طريقة إدخال التقييم السريري عند المشرف' : 'Supervisor clinical score entry'}</span><select aria-label={locale === 'ar' ? 'طريقة إدخال التقييم السريري عند المشرف' : 'Supervisor clinical score entry'} value={clinicalEntryMode} onChange={event => setClinicalEntryMode(event.target.value as 'ten' | 'direct')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold"><option value="ten">{locale === 'ar' ? `من 10 ← يُحوّل إلى ${planDraft.clinical || '…'}` : `Out of 10 → scaled to ${planDraft.clinical || '…'}`}</option><option value="direct">{locale === 'ar' ? `مباشرة من ${planDraft.clinical || '…'} دون تحويل` : `Directly out of ${planDraft.clinical || '…'} without scaling`}</option></select><span className="mt-2 block text-[11px] leading-5 text-slate-600">{locale === 'ar' ? 'ينطبق على التقييمات الجديدة؛ العلامات المحفوظة سابقًا تبقى بسقف إدخالها الأصلي.' : 'Applies to new assessments; saved marks retain their original entry scale.'}</span></label>
          <p className={`rounded-lg px-3 py-2 text-xs font-bold ${planDraftTotal === 100 ? 'bg-teal-50 text-teal-800' : 'bg-amber-50 text-amber-800'}`}>{locale === 'ar' ? `المجموع: ${planDraftTotal} / 100` : `Total: ${planDraftTotal} / 100`}</p>
          {actionError && <p className="text-xs font-bold text-red-700">{actionError}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setPlanOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="submit" disabled={planMutation.isPending || planDraftTotal !== 100 || Number(miniOsceMax) < 0 || Number(miniOsceMax) >= Number(planDraft.clinical) || Object.entries(planDraft).some(([code, value]) => Number(value) < (code === 'osce' ? 0 : 0.01))} className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{locale === 'ar' ? 'حفظ الخطة' : 'Save plan'}</button></div>
        </form>
      </div>}
      {isCompModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingComp ? (locale === 'ar' ? 'تعديل مكون التقييم' : 'Edit Assessment Component') : (locale === 'ar' ? 'إضافة مكون تقييم جديد' : 'Add Assessment Component')}
              </h3>
              <button type="button" onClick={() => setIsCompModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveComp} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'اسم التقييم (مثال: امتحان OSCE / التقييم السريري):' : 'Component Name:'}</label>
                <input
                  type="text"
                  required
                  placeholder={locale === 'ar' ? 'امتحان التقييم السريري OSCE' : 'OSCE clinical assessment'}
                  value={compName}
                  onChange={e => setCompName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'العلامة والوزن من 100:' : 'Score and weight out of 100:'}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    max="100"
                    value={compWeight}
                    onChange={e => setCompWeight(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>

              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsCompModalOpen(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={compMutation.isPending} className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs">
                  {compMutation.isPending ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ البيانات' : 'Save Component')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ILO Modal */}
      {isIloModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-slate-800 text-sm">
                {editingIlo ? (locale === 'ar' ? 'تعديل مخرج التعلم' : 'Edit Learning Outcome') : (locale === 'ar' ? 'إضافة مخرج تعلم جديد (ILO)' : 'Add Learning Outcome (ILO)')}
              </h3>
              <button type="button" onClick={() => setIsIloModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveIlo} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'رمز المخرج:' : 'Outcome Code:'}</label>
                  <input
                    type="text"
                    required
                    placeholder="ILO-1"
                    value={iloCode}
                    onChange={e => setIloCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-mono font-semibold focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'المجال (Domain):' : 'Domain:'}</label>
                  <select
                    value={iloDomain}
                    onChange={e => setIloDomain(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 bg-white"
                  >
                    <option value="Knowledge">{locale === 'ar' ? 'المعرفة والمفاهيم (Knowledge)' : 'Knowledge'}</option>
                    <option value="Skills">{locale === 'ar' ? 'المهارات السريرية (Clinical Skills)' : 'Clinical Skills'}</option>
                    <option value="Competencies">{locale === 'ar' ? 'الكفايات السريرية (Competencies)' : 'Competencies'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الوصف بالعربية:' : 'Description (Arabic):'}</label>
                <textarea
                  rows={2}
                  placeholder={locale === 'ar' ? 'إتقان الفحص السريري الشامل لجهاز الدوران والقلب...' : 'Demonstrates comprehensive cardiovascular examination skills...'}
                  value={iloTextAr}
                  onChange={e => setIloTextAr(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الوصف بالإنجليزية:' : 'Description (English):'}</label>
                <textarea
                  rows={2}
                  placeholder="Master comprehensive clinical examination of the cardiovascular system..."
                  value={iloTextEn}
                  onChange={e => setIloTextEn(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsIloModalOpen(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={iloMutation.isPending} className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs">
                  {iloMutation.isPending ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ المخرج' : 'Save Outcome')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLO Mapping Modal */}
      {isPloModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="font-bold text-slate-800 text-sm">{locale === 'ar' ? 'ربط بمخرج البرنامج (PLO)' : 'Map Program Outcome'}</h3>
              <button type="button" onClick={() => setIsPloModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <form onSubmit={handleSavePlo} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'مخرج البرنامج (PLO):' : 'Program Outcome (PLO):'}</label>
                <select
                  required
                  value={ploCode}
                  onChange={e => setPloCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 bg-white"
                >
                  <option value="" disabled>{locale === 'ar' ? 'اختر مخرج البرنامج' : 'Select Program Outcome'}</option>
                  {plosList?.map(plo => (
                    <option key={plo.id} value={plo.code}>
                      {plo.code} - {locale === 'ar' ? plo.name_ar : plo.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'مستوى المساهمة والارتباط:' : 'Mapping Level:'}</label>
                <select
                  value={ploLevel}
                  onChange={e => setPloLevel(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600 bg-white"
                >
                  <option value="High">{locale === 'ar' ? 'عالي (High)' : 'High'}</option>
                  <option value="Medium">{locale === 'ar' ? 'متوسط (Medium)' : 'Medium'}</option>
                  <option value="Low">{locale === 'ar' ? 'منخفض (Low)' : 'Low'}</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsPloModalOpen(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button>
                <button type="submit" disabled={ploMutation.isPending} className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs">
                  {ploMutation.isPending ? (locale === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (locale === 'ar' ? 'حفظ الارتباط' : 'Save Mapping')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
