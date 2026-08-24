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
  name: string;
  weight?: number | null;
  max_score?: number | null;
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

interface CourseReport {
  id: number; academic_year_id: number; status: 'draft'|'submitted'|'approved'|'returned';
  summary?: string|null; achievements?: string|null; challenges?: string|null;
  improvement_plan?: string|null; review_notes?: string|null;
  academic_year?: { id:number; code:string; is_current:boolean };
  preparer?: { id:number; name:string }; approver?: { id:number; name:string };
}
interface ReportsPayload {
  reports: CourseReport[];
  academic_years: Array<{id:number;code:string;is_current:boolean;status:string}>;
}

export function CourseDetailsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { can } = useAuth();
  const { locale, t } = useI18n();
  const qc = useQueryClient();

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);
  const [isIloModalOpen, setIsIloModalOpen] = useState(false);
  const [isPloModalOpen, setIsPloModalOpen] = useState(false);

  // Edit states
  const [editingComp, setEditingComp] = useState<AssessmentComponent | null>(null);
  const [editingIlo, setEditingIlo] = useState<LearningOutcome | null>(null);

  // Assessment Component Form State
  const [compName, setCompName] = useState('');
  const [compWeight, setCompWeight] = useState('20');
  const [compMaxScore, setCompMaxScore] = useState('100');
  const [compNotes, setCompNotes] = useState('');

  // ILO Form State
  const [iloCode, setIloCode] = useState('');
  const [iloTextAr, setIloTextAr] = useState('');
  const [iloTextEn, setIloTextEn] = useState('');
  const [iloDomain, setIloDomain] = useState('Knowledge');

  // PLO Form State
  const [ploCode, setPloCode] = useState('');
  const [ploLevel, setPloLevel] = useState('High');

  const [reportYearId, setReportYearId] = useState('');
  const [reportSummary, setReportSummary] = useState('');
  const [reportAchievements, setReportAchievements] = useState('');
  const [reportChallenges, setReportChallenges] = useState('');
  const [reportPlan, setReportPlan] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reportError, setReportError] = useState('');
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

  const reportsQuery = useQuery({
    queryKey: ['course-reports', courseId],
    queryFn: () => apiFetch<ReportsPayload>(`/courses/${courseId}/reports`),
    enabled: Boolean(courseId),
  });

  const refreshReports = () => qc.invalidateQueries({ queryKey: ['course-reports', courseId] });
  const selectedReport = reportsQuery.data?.reports.find((report) => String(report.academic_year_id) === reportYearId);
  const loadReport = (yearId: string) => {
    setReportYearId(yearId);
    const report = reportsQuery.data?.reports.find((item) => String(item.academic_year_id) === yearId);
    setReportSummary(report?.summary || '');
    setReportAchievements(report?.achievements || '');
    setReportChallenges(report?.challenges || '');
    setReportPlan(report?.improvement_plan || '');
    setReviewNotes(report?.review_notes || '');
    setReportError('');
  };
  const openReports = () => {
    const current = reportsQuery.data?.academic_years.find((year) => year.is_current)
      || reportsQuery.data?.academic_years[0];
    loadReport(current ? String(current.id) : '');
    setIsReportModalOpen(true);
  };
  const reportAction = useMutation({
    mutationFn: async (action: 'save'|'submit'|'approve'|'return') => {
      if (!reportYearId) throw new Error('اختر العام الأكاديمي.');
      if (action === 'save') return apiFetch(`/courses/${courseId}/reports`, { method:'POST', body:{ academic_year_id:Number(reportYearId), summary:reportSummary, achievements:reportAchievements, challenges:reportChallenges, improvement_plan:reportPlan } });
      if (!selectedReport) throw new Error('احفظ التقرير أولاً.');
      return apiFetch(`/courses/${courseId}/reports/${selectedReport.id}/${action}`, { method:'POST', body: action === 'approve' || action === 'return' ? { review_notes:reviewNotes } : {} });
    },
    onSuccess: async () => { await refreshReports(); setReportError(''); },
    onError: (error: Error) => setReportError(error.message),
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

  // Handlers for Modals
  const handleOpenCompModal = (comp?: AssessmentComponent) => {
    if (comp) {
      setEditingComp(comp);
      setCompName(comp.name);
      setCompWeight(String(comp.weight || 20));
      setCompMaxScore(String(comp.max_score || 100));
      setCompNotes(comp.notes || '');
    } else {
      setEditingComp(null);
      setCompName('');
      setCompWeight('20');
      setCompMaxScore('100');
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
      max_score: Number(compMaxScore),
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
          <button 
            type="button"
            onClick={openReports}
            className="text-xs font-semibold bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100/70 px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4 text-teal-600" />
            <span>{locale === 'ar' ? 'تقرير المساق السنوي' : 'Annual Course Report'}</span>
          </button>

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Main Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* Learning Outcomes (ILOs) Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
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
                <div className="space-y-3">
                  {data.learning_outcomes.map(item => (
                    <div key={item.id} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200/80 hover:border-teal-200 transition-all space-y-2">
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
          </div>

          {/* Program Outcomes Mapping (PLOs) Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {data.program_outcome_mappings.map(item => (
                    <div key={item.id} className="flex items-start justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-slate-800 text-xs">{item.program_outcome_code}</span>
                          <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                            {item.mapping_level || 'High'}
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
          </div>
        </div>

        {/* Sidebar Column (1/3 width) */}
        <div className="space-y-5">
          {/* Assessment Components Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-teal-600" />
                <h2 className="font-bold text-xs text-slate-800">{locale === 'ar' ? 'مكونات التقييم' : 'Assessment Components'}</h2>
              </div>

              {can('courses.manage') && (
                <button
                  type="button"
                  onClick={() => handleOpenCompModal()}
                  className="px-2.5 py-1 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{locale === 'ar' ? 'إضافة تقييم' : 'Add'}</span>
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Progress Bar for Weights */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-600">{locale === 'ar' ? 'إجمالي الوزن النسبي:' : 'Total Weight:'}</span>
                  <span className={totalWeight === 100 ? 'text-emerald-600' : 'text-teal-700'}>
                    {totalWeight}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${totalWeight === 100 ? 'bg-emerald-500' : 'bg-teal-600'}`} 
                    style={{ width: `${Math.min(100, totalWeight)}%` }}
                  />
                </div>
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
                          {locale === 'ar' ? `القصوى: ${item.max_score || 100} درجة` : `Max: ${item.max_score || 100}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded-lg bg-teal-50 text-teal-700 font-bold text-xs border border-teal-100">
                          {item.weight || 0}%
                        </span>

                        {can('courses.manage') && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleOpenCompModal(item)}
                              className="p-1 text-slate-400 hover:text-teal-700 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(locale === 'ar' ? 'حذف هذا التقييم؟' : 'Delete component?')) {
                                  deleteCompMutation.mutate(item.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assessment Component Modal */}
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
                  placeholder="امتحان التقييم السريري OSCE"
                  value={compName}
                  onChange={e => setCompName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2 text-xs font-semibold focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'الوزن النسبي (%):' : 'Weight (%):'}</label>
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{locale === 'ar' ? 'العلامة القصوى:' : 'Max Score:'}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={compMaxScore}
                    onChange={e => setCompMaxScore(e.target.value)}
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
                  placeholder="إتقان الفحص السريري الشامل لجهاز الدوران والقلب..."
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

      {/* Annual Course Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">
                {locale === 'ar' ? `تقرير المساق السنوي: ${data.code} - ${name}` : `Annual Course Report: ${data.code}`}
              </h3>
              <button type="button" onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1">✕</button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {reportError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{reportError}</div>}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="space-y-1"><span className="text-xs font-bold text-slate-600">العام الأكاديمي</span><select value={reportYearId} onChange={e=>loadReport(e.target.value)} className="input"><option value="">اختر العام</option>{reportsQuery.data?.academic_years.map(year=><option key={year.id} value={year.id}>{year.code}{year.is_current?' — الحالي':''}</option>)}</select></label>
                <div className="self-end rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600">{selectedReport ? ({draft:'مسودة',submitted:'مرسل للاعتماد',approved:'معتمد',returned:'معاد للتعديل'} as const)[selectedReport.status] : 'تقرير جديد'}</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-100 text-center">
                  <div className="text-xl font-black text-teal-700">{data.credit_hours}</div>
                  <div className="text-[11px] font-bold text-teal-600 mt-0.5">{locale === 'ar' ? 'ساعات معتمدة' : 'Credits'}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
                  <div className="text-xl font-black text-emerald-700">{data.learning_outcomes?.length || 0}</div>
                  <div className="text-[11px] font-bold text-emerald-600 mt-0.5">{locale === 'ar' ? 'مخرجات تعلم ILOs' : 'ILOs Count'}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <div className="text-xl font-black text-slate-700">{data.assessment_components?.length || 0}</div>
                  <div className="text-[11px] font-bold text-slate-600 mt-0.5">{locale === 'ar' ? 'مكونات تقييم' : 'Assessment Items'}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  {locale === 'ar' ? 'مخرجات التعلم وتطابقها في التقرير السنوي' : 'Learning Outcomes Status'}
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(data.learning_outcomes || []).map((ilo) => (
                    <div key={ilo.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-teal-700 font-mono">{ilo.outcome_code}</span>
                      <span className="font-medium text-slate-700 flex-1 truncate">{ilo.text_ar || ilo.text_en}</span>
                      <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-bold text-[10px] shrink-0">مسجل</span>
                    </div>
                  ))}
                  {(!data.learning_outcomes || data.learning_outcomes.length === 0) && (
                    <p className="text-xs text-slate-400 text-center p-3">{locale === 'ar' ? 'لا يوجد مخرجات مسجلة' : 'No outcomes recorded'}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1"><span className="text-xs font-bold text-slate-700">ملخص تنفيذ المساق *</span><textarea rows={4} value={reportSummary} disabled={!can('course_report.manage')||selectedReport?.status==='submitted'||selectedReport?.status==='approved'} onChange={e=>setReportSummary(e.target.value)} className="input resize-none" placeholder="ملخص التنفيذ والنتائج..."/></label>
                <label className="space-y-1"><span className="text-xs font-bold text-slate-700">الإنجازات</span><textarea rows={4} value={reportAchievements} disabled={!can('course_report.manage')||selectedReport?.status==='submitted'||selectedReport?.status==='approved'} onChange={e=>setReportAchievements(e.target.value)} className="input resize-none" placeholder="أهم الإنجازات..."/></label>
                <label className="space-y-1"><span className="text-xs font-bold text-slate-700">التحديات</span><textarea rows={4} value={reportChallenges} disabled={!can('course_report.manage')||selectedReport?.status==='submitted'||selectedReport?.status==='approved'} onChange={e=>setReportChallenges(e.target.value)} className="input resize-none" placeholder="التحديات والمعيقات..."/></label>
                <label className="space-y-1"><span className="text-xs font-bold text-slate-700">خطة التحسين *</span><textarea rows={4} value={reportPlan} disabled={!can('course_report.manage')||selectedReport?.status==='submitted'||selectedReport?.status==='approved'} onChange={e=>setReportPlan(e.target.value)} className="input resize-none" placeholder="إجراءات محددة للعام القادم..."/></label>
              </div>
              {(can('course_report.approve')||selectedReport?.review_notes)&&<label className="block space-y-1"><span className="text-xs font-bold text-slate-700">ملاحظات المراجعة</span><textarea rows={3} value={reviewNotes} disabled={!can('course_report.approve')||selectedReport?.status!=='submitted'} onChange={e=>setReviewNotes(e.target.value)} className="input resize-none" placeholder="ملاحظات الاعتماد أو الإعادة..."/></label>}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  {locale === 'ar' ? 'إلغاء' : 'Close'}
                </button>
                {can('course_report.manage')&&(!selectedReport||['draft','returned'].includes(selectedReport.status))&&<><button type="button" disabled={reportAction.isPending} onClick={()=>reportAction.mutate('save')} className="px-4 py-2 text-xs font-semibold rounded-xl border border-teal-200 text-teal-700 hover:bg-teal-50">حفظ المسودة</button>{selectedReport&&<button type="button" disabled={reportAction.isPending} onClick={()=>reportAction.mutate('submit')} className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white hover:bg-teal-700">إرسال للاعتماد</button>}</>}
                {can('course_report.approve')&&selectedReport?.status==='submitted'&&<><button type="button" disabled={reportAction.isPending||!reviewNotes.trim()} onClick={()=>reportAction.mutate('return')} className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 text-slate-700">إعادة للتعديل</button><button type="button" disabled={reportAction.isPending} onClick={()=>reportAction.mutate('approve')} className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 text-white">اعتماد التقرير</button></>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
