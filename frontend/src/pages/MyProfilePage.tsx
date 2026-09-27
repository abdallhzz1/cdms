import { useEffect, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Award, BookOpen, Camera, CheckCircle2, Download, FileText, KeyRound, Mail, Pencil, Plus, Save, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useI18n } from '@/i18n/I18nContext';

type Publication = { title: string; journal?: string | null; year?: number | null; doi?: string | null };
type Conference = { name: string; location?: string | null; date?: string | null; role?: string | null };
type ProfileDocument = { id: string; name: string; category?: string | null; file_type?: string | null; file_size?: string | null; created_at?: string | null; download_url: string };
type ProfessionalRecord = { bio?: string | null; publications: Publication[]; conferences: Conference[]; documents: ProfileDocument[] };
type MyProfile = {
  id: number; name: string; full_name_en?: string | null; email: string; phone?: string | null;
  specialty?: string | null; academic_degree?: string | null; bio?: string | null; avatar_url?: string | null;
  roles: string[]; assigned_levels: string[]; staff_code?: string | null; completion_percent: number; missing_fields: string[];
  department?: { name_ar?: string; name_en?: string } | null;
  primary_site?: { name_ar?: string; name_en?: string } | null;
  capabilities: { professional_profile: boolean; clinical_supervisor: boolean; department_head: boolean };
  employment?: { license_number?: string | null; contract_type?: string | null; contract_start?: string | null; contract_end?: string | null; teaching_hours_per_week?: number | null; available_days?: string | null; max_students?: number | null } | null;
  training_sites: Array<{ id: number; name_ar: string; name_en?: string | null; is_primary: boolean }>;
  department_head_assignment?: { department_name_ar?: string | null; department_name_en?: string | null; started_at?: string | null; ended_at?: string | null } | null;
  professional?: ProfessionalRecord | null;
};
type Section = 'overview' | 'professional' | 'documents' | 'security';
const profileSections: Section[] = ['overview', 'professional', 'documents', 'security'];

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

function roleLabel(role: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    SYS_ADMIN: ['مدير النظام', 'System Administrator'], SYSTEM_ADMIN: ['مدير النظام', 'System Administrator'],
    CLINICAL_DIRECTOR: ['مدير الدائرة السريرية', 'Clinical Director'], DEAN: ['عميد كلية الطب', 'Dean of Medicine'],
    VICE_DEAN: ['نائب العميد', 'Vice Dean'], DEPARTMENT_HEAD: ['رئيس قسم', 'Department Head'],
    CLINICAL_SUPERVISOR: ['مشرف سريري', 'Clinical Supervisor'], RTA: ['مساعد بحث وتدريس', 'Research & Teaching Assistant'],
    ADMIN_ASSISTANT: ['مساعد إداري', 'Administrative Assistant'], ACADEMIC_ADVISOR: ['مرشد أكاديمي', 'Academic Advisor'],
  };
  return labels[role]?.[locale === 'ar' ? 0 : 1] ?? role.replaceAll('_', ' ');
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Detail({ label, value, ltr = false }: { label: string; value?: string | number | null; ltr?: boolean }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 border-b border-slate-100 py-3.5 last:border-b-0 sm:grid-cols-[170px_minmax(0,1fr)] sm:py-4"><dt className="text-xs font-medium text-slate-500 sm:text-sm">{label}</dt><dd dir={ltr ? 'ltr' : undefined} className={`min-w-0 break-words text-sm font-bold leading-6 text-slate-800 ${ltr ? 'text-start' : ''}`}>{value || '—'}</dd></div>;
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">{text}</div>;
}

export function MyProfilePage() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const requestedSection = profileSections.includes(sectionParam as Section) ? sectionParam as Section : null;
  const [activeSection, setActiveSection] = useState<Section>(requestedSection || 'overview');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [professionalEditing, setProfessionalEditing] = useState(false);
  const [deleteDocument, setDeleteDocument] = useState<ProfileDocument | null>(null);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', full_name_en: '', phone: '' });
  const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [professionalForm, setProfessionalForm] = useState<ProfessionalRecord>({ bio: '', publications: [], conferences: [], documents: [] });
  const [newPublication, setNewPublication] = useState({ title: '', journal: '', year: String(new Date().getFullYear()), doi: '' });
  const [newConference, setNewConference] = useState({ name: '', location: '', date: '', role: '' });
  const [documentMeta, setDocumentMeta] = useState({ name: '', category: 'academic_degree' });

  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiFetch<MyProfile>('/profile/me') });
  const profile = profileQuery.data;
  useEffect(() => {
    if (!profile) return;
    setForm({ name: profile.name || '', full_name_en: profile.full_name_en || '', phone: profile.phone || '' });
    setProfessionalForm(profile.professional || { bio: '', publications: [], conferences: [], documents: [] });
  }, [profile]);
  useEffect(() => { setActiveSection(requestedSection || 'overview'); }, [requestedSection]);

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(current => current === text ? '' : current), 5000);
  };
  const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : tr('تعذر حفظ التحديث. حاول مرة أخرى.', 'Could not save the update. Please try again.');
  const saveMutation = useMutation({
    mutationFn: () => apiFetch<MyProfile>('/profile/me', { method: 'PUT', body: { name: form.name, full_name_en: form.full_name_en || null, phone: form.phone || null, bio: profile?.bio || null } }),
    onSuccess: async data => { queryClient.setQueryData(['my-profile'], data); await refreshUser(); setProfileModalOpen(false); showNotice(tr('تم تحديث بياناتك الشخصية.', 'Your personal details have been updated.')); },
  });
  const avatarMutation = useMutation({
    mutationFn: (avatar_base64: string) => apiFetch<MyProfile>('/profile/me/avatar', { method: 'POST', body: { avatar_base64 } }),
    onSuccess: async data => { queryClient.setQueryData(['my-profile'], data); await refreshUser(); showNotice(tr('تم تحديث الصورة الشخصية في جميع أجزاء النظام.', 'Your photo has been updated across the system.')); },
  });
  const professionalMutation = useMutation({
    mutationFn: () => apiFetch<MyProfile>('/profile/me/professional', { method: 'PUT', body: { bio: professionalForm.bio || null, publications: professionalForm.publications, conferences: professionalForm.conferences } }),
    onSuccess: data => { queryClient.setQueryData(['my-profile'], data); setProfessionalEditing(false); showNotice(tr('تم تحديث السجل المهني.', 'Your professional record has been updated.')); },
  });
  const documentMutation = useMutation({
    mutationFn: (file: File) => { const body = new FormData(); body.append('file', file); body.append('name', documentMeta.name || file.name.replace(/\.[^.]+$/, '')); body.append('category', documentMeta.category); return apiFetch<MyProfile>('/profile/me/documents', { method: 'POST', body }); },
    onSuccess: data => { queryClient.setQueryData(['my-profile'], data); setDocumentMeta({ name: '', category: 'academic_degree' }); showNotice(tr('تم رفع الوثيقة وحفظها بأمان.', 'The document was uploaded securely.')); },
  });
  const deleteDocumentMutation = useMutation({
    mutationFn: (id: string) => apiFetch<MyProfile>(`/profile/me/documents/${id}`, { method: 'DELETE' }),
    onSuccess: data => { queryClient.setQueryData(['my-profile'], data); setDeleteDocument(null); showNotice(tr('تم حذف الوثيقة.', 'Document deleted.')); },
  });
  const passwordMutation = useMutation({
    mutationFn: () => apiFetch<null>('/profile/me/password', { method: 'PUT', body: passwords }),
    onSuccess: () => { setPasswordOpen(false); setPasswords({ current_password: '', password: '', password_confirmation: '' }); showNotice(tr('تم تغيير كلمة المرور بنجاح.', 'Password changed successfully.')); },
  });

  const contractTypeLabel = (value?: string | null) => ({
    full_time: tr('دوام كامل', 'Full time'),
    part_time: tr('دوام جزئي', 'Part time'),
    visiting: tr('زائر', 'Visiting'),
    honorary: tr('فخري', 'Honorary'),
  })[value || ''] || value;
  if (profileQuery.isLoading) return <LoadingState />;
  if (profileQuery.isError || !profile) return <ErrorState title={tr('تعذر تحميل الملف الشخصي', 'Unable to load profile')} onRetry={() => profileQuery.refetch()} />;
  const roleNames = profile.roles.map(role => roleLabel(role, locale));
  const specialty = profile.specialty?.trim();
  const showSpecialty = specialty && !roleNames.includes(specialty);
  const academicDegree = profile.academic_degree?.trim();
  const showAcademicDegree = academicDegree && academicDegree !== specialty && !roleNames.includes(academicDegree);
  const employmentDetails = [
    { label: tr('التخصص', 'Specialty'), value: showSpecialty ? specialty : null },
    { label: tr('الدرجة الأكاديمية', 'Academic degree'), value: showAcademicDegree ? academicDegree : null },
    { label: tr('رقم الترخيص', 'License number'), value: profile.employment?.license_number, ltr: true },
    { label: tr('نوع العقد', 'Contract type'), value: contractTypeLabel(profile.employment?.contract_type) },
    { label: tr('بداية العقد', 'Contract start'), value: profile.employment?.contract_start },
    { label: tr('نهاية العقد', 'Contract end'), value: profile.employment?.contract_end },
  ].filter(detail => detail.value !== null && detail.value !== undefined && String(detail.value).trim() !== '');

  const sectionOptions: Array<{ id: Section; label: string; icon: typeof UserRound; visible: boolean; count?: number }> = [
    { id: 'overview', label: tr('نظرة عامة', 'Overview'), icon: UserRound, visible: true },
    { id: 'professional', label: tr('السجل المهني', 'Professional record'), icon: Award, visible: profile.capabilities.professional_profile },
    { id: 'documents', label: tr('الوثائق', 'Documents'), icon: FileText, visible: profile.capabilities.professional_profile, count: profile.professional?.documents.length || 0 },
    { id: 'security', label: tr('الحساب والأمان', 'Account & security'), icon: ShieldCheck, visible: true },
  ];
  const sections = sectionOptions.filter(section => section.visible);
  const selectSection = (section: Section) => { setActiveSection(section); setSearchParams(section === 'overview' ? {} : { section }, { replace: true }); };
  const onPhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { showNotice(tr('اختر صورة JPG أو PNG أو WebP بحجم لا يزيد عن 2MB.', 'Choose a JPG, PNG, or WebP image up to 2 MB.')); return; }
    avatarMutation.mutate(await toBase64(file));
  };
  return <div className="mx-auto w-full min-w-0 max-w-6xl pb-8">
    {notice && <div className="fixed start-1/2 top-20 z-40 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl border border-teal-200 bg-white px-4 py-3 text-sm font-bold text-teal-800 shadow-xl"><CheckCircle2 className="h-5 w-5 shrink-0" /><span className="flex-1">{notice}</span><button onClick={() => setNotice('')} className="text-xs text-slate-500">{tr('إغلاق', 'Close')}</button></div>}
    <div className="space-y-4 sm:space-y-5">
      <header className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex min-w-0 items-start gap-3.5 p-4 sm:items-center sm:gap-5 sm:p-6">
          <div className="relative shrink-0">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-teal-50 text-xl font-black text-teal-700 sm:h-20 sm:w-20">
              {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} className="h-full w-full object-cover" /> : profile.name.slice(0, 1)}
            </div>
            <label className="absolute -bottom-1 -end-1 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-white bg-teal-700 text-white shadow-sm hover:bg-teal-800" title={tr('تحديث الصورة', 'Update photo')} aria-label={tr('تحديث الصورة', 'Update photo')}>
              <Camera className="h-4 w-4" />
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPhotoSelect} disabled={avatarMutation.isPending} aria-label={tr('تحديث الصورة', 'Update photo')} />
            </label>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-base font-black leading-6 text-slate-900 sm:text-xl">{profile.name}</h1>
            {profile.roles[0] && <p className="mt-1 text-xs font-bold text-teal-700 sm:text-sm">{roleLabel(profile.roles[0], locale)}{profile.roles.length > 1 && <span className="ms-1.5 text-slate-400">+{profile.roles.length - 1}</span>}</p>}
            <p dir="ltr" className="mt-1.5 break-all text-start text-xs text-slate-500 sm:text-sm">{profile.email}</p>
          </div>
        </div>
        {avatarMutation.isError && <p className="px-4 pb-3 text-xs font-bold text-rose-600 sm:px-6">{errorMessage(avatarMutation.error)}</p>}
        <nav className="grid grid-cols-2 gap-1.5 border-t border-slate-100 bg-slate-50/40 p-2 sm:grid-cols-4 sm:p-2.5" aria-label={tr('أقسام الملف الشخصي', 'Profile sections')}>
          {sections.map(section => <button key={section.id} type="button" onClick={() => selectSection(section.id)} aria-current={activeSection === section.id ? 'page' : undefined} className={`flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition sm:text-sm ${activeSection === section.id ? 'border border-teal-100 bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:bg-white'}`}><section.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{section.label}</span>{section.count !== undefined && section.count > 0 && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{section.count}</span>}</button>)}
        </nav>
      </header>

      <main className="min-w-0 w-full">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3 sm:mb-5">
          <h2 className="min-w-0 text-lg font-black text-slate-900 sm:text-xl">{sections.find(section => section.id === activeSection)?.label}</h2>
          {activeSection === 'overview' && <Button variant="outline" onClick={() => setProfileModalOpen(true)} className="shrink-0"><Pencil className="me-1.5 h-4 w-4" />{tr('تعديل بياناتي', 'Edit details')}</Button>}
        </div>

    {activeSection === 'overview' && <div className="space-y-4">
      <Card className="min-w-0 border border-slate-200 p-4 shadow-none sm:p-6"><h3 className="text-sm font-black text-slate-900 sm:text-base">{tr('البيانات الشخصية', 'Personal details')}</h3><dl className="mt-2"><Detail label={tr('الاسم بالعربية', 'Arabic name')} value={profile.name} />{profile.full_name_en && <Detail label={tr('الاسم بالإنجليزية', 'English name')} value={profile.full_name_en} ltr />}{profile.phone && <Detail label={tr('رقم الهاتف', 'Phone number')} value={profile.phone} ltr />}</dl></Card>
      {employmentDetails.length > 0 && <Card className="min-w-0 border border-slate-200 p-4 shadow-none sm:p-6"><h3 className="text-sm font-black text-slate-900 sm:text-base">{tr('المعلومات الوظيفية', 'Employment information')}</h3><dl className="mt-2">{employmentDetails.map(detail => <Detail key={detail.label} label={detail.label} value={detail.value} ltr={detail.ltr} />)}</dl></Card>}
    </div>}

    {activeSection === 'professional' && profile.professional && <Card className="border border-slate-200 p-5 sm:p-6"><div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Award className="h-5 w-5 text-teal-600" />{tr('السجل المهني', 'Professional record')}</h2><p className="mt-1 text-sm text-slate-500">{tr('سجل واحد يظهر في ملف المشرف ورئيس القسم.', 'One record shared across supervisor and department-head profiles.')}</p></div><Button variant={professionalEditing ? 'outline' : 'primary'} onClick={() => { setProfessionalForm(profile.professional!); setProfessionalEditing(value => !value); }}><Pencil className="me-2 h-4 w-4" />{professionalEditing ? tr('إلغاء التعديل', 'Cancel editing') : tr('تعديل السجل', 'Edit record')}</Button></div><section className="mt-5"><h3 className="text-sm font-black text-slate-800">{tr('النبذة المهنية', 'Professional summary')}</h3>{professionalEditing ? <textarea rows={4} className={`${inputClass} resize-none`} value={professionalForm.bio || ''} onChange={event => setProfessionalForm(current => ({ ...current, bio: event.target.value }))} placeholder={tr('اكتب نبذة مختصرة عن الخبرة ومجال العمل...', 'Write a concise summary of experience and practice...')} /> : <p className="mt-2 min-h-24 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{profile.professional.bio || tr('لم تُضف نبذة مهنية بعد.', 'No professional summary added yet.')}</p>}</section><div className="mt-5 grid gap-5 lg:grid-cols-2"><ProfessionalList type="publications" editing={professionalEditing} ar={ar} items={professionalForm.publications} draft={newPublication} setDraft={setNewPublication} onChange={items => setProfessionalForm(current => ({ ...current, publications: items as Publication[] }))} /><ProfessionalList type="conferences" editing={professionalEditing} ar={ar} items={professionalForm.conferences} draft={newConference} setDraft={setNewConference} onChange={items => setProfessionalForm(current => ({ ...current, conferences: items as Conference[] }))} /></div>{professionalEditing && <div className="mt-5 flex justify-end border-t border-slate-100 pt-5"><Button onClick={() => professionalMutation.mutate()} isLoading={professionalMutation.isPending}><Save className="me-2 h-4 w-4" />{tr('حفظ السجل المهني', 'Save professional record')}</Button></div>}{professionalMutation.isError && <p className="mt-3 text-sm font-semibold text-red-600">{errorMessage(professionalMutation.error)}</p>}</Card>}

    {activeSection === 'documents' && profile.professional && <div className="grid gap-5 lg:grid-cols-[340px_1fr]"><Card className="h-fit border border-slate-200 p-5"><h2 className="flex items-center gap-2 text-base font-black text-slate-900"><Plus className="h-5 w-5 text-teal-600" />{tr('رفع وثيقة', 'Upload document')}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{tr('الوثائق خاصة ولا تظهر في دليل الموظفين.', 'Documents are private and hidden from the staff directory.')}</p><label className="mt-5 block text-sm font-bold text-slate-700">{tr('اسم الوثيقة', 'Document name')}<input className={inputClass} value={documentMeta.name} onChange={event => setDocumentMeta(current => ({ ...current, name: event.target.value }))} placeholder={tr('مثال: شهادة البورد', 'Example: Board certificate')} /></label><label className="mt-4 block text-sm font-bold text-slate-700">{tr('تصنيف الوثيقة', 'Document category')}<select className={inputClass} value={documentMeta.category} onChange={event => setDocumentMeta(current => ({ ...current, category: event.target.value }))}><option value="academic_degree">{tr('شهادة أكاديمية', 'Academic degree')}</option><option value="medical_license">{tr('ترخيص مزاولة', 'Medical license')}</option><option value="certificate">{tr('شهادة مهنية', 'Professional certificate')}</option><option value="other">{tr('أخرى', 'Other')}</option></select></label><label className="mt-5 flex h-11 cursor-pointer items-center justify-center rounded-xl bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700"><Plus className="me-2 h-4 w-4" />{documentMutation.isPending ? tr('جارٍ الرفع...', 'Uploading...') : tr('اختيار الملف ورفعه', 'Choose and upload file')}<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" disabled={documentMutation.isPending} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) documentMutation.mutate(file); }} /></label>{documentMutation.isError && <p className="mt-3 text-sm font-semibold text-red-600">{errorMessage(documentMutation.error)}</p>}</Card><Card className="border border-slate-200 p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-base font-black text-slate-900"><FileText className="h-5 w-5 text-teal-600" />{tr('وثائقي المهنية', 'My professional documents')}</h2><p className="mt-1 text-sm text-slate-500">{tr('يمكنك تنزيل الوثيقة أو حذفها من هنا.', 'Download or remove your documents here.')}</p></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{profile.professional.documents.length}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{profile.professional.documents.length ? profile.professional.documents.map(document => <article key={document.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><FileText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{document.name}</p><p className="mt-1 text-xs text-slate-500">{[document.file_type?.toUpperCase(), document.file_size, document.created_at].filter(Boolean).join(' · ')}</p></div><div className="flex shrink-0"><a href={document.download_url} className="grid h-9 w-9 place-items-center rounded-lg text-teal-700 hover:bg-teal-50" title={tr('تنزيل', 'Download')}><Download className="h-4 w-4" /></a><button onClick={() => setDeleteDocument(document)} className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" title={tr('حذف', 'Delete')}><Trash2 className="h-4 w-4" /></button></div></article>) : <div className="sm:col-span-2"><EmptyBlock text={tr('لم ترفع وثائق مهنية بعد.', 'No professional documents uploaded yet.')} /></div>}</div></Card></div>}

    {activeSection === 'security' && <div className="grid gap-5 md:grid-cols-2"><Card className="border border-slate-200 p-5 sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Mail className="h-5 w-5" /></span><h2 className="mt-4 text-base font-black text-slate-900">{tr('البريد المؤسسي', 'Institutional email')}</h2><p dir="ltr" className="mt-3 rounded-xl bg-slate-50 p-3 text-start text-sm font-bold text-slate-800">{profile.email}</p><p className="mt-3 text-sm leading-6 text-slate-500">{tr('يستخدم للدخول والإشعارات، ويُعدّل من إدارة النظام فقط.', 'Used for login and notifications and managed by system administration.')}</p></Card><Card className="border border-slate-200 p-5 sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-800 text-white"><KeyRound className="h-5 w-5" /></span><h2 className="mt-4 text-base font-black text-slate-900">{tr('كلمة المرور', 'Password')}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{tr('استخدم كلمة مرور قوية ولا تشاركها مع أي شخص.', 'Use a strong password and never share it with anyone.')}</p><Button className="mt-5" onClick={() => setPasswordOpen(true)}>{tr('تغيير كلمة المرور', 'Change password')}</Button></Card></div>}

      </main>
    </div>

    <Modal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} title={tr('تعديل البيانات الشخصية', 'Edit personal details')} footer={<><Button variant="outline" onClick={() => setProfileModalOpen(false)}>{tr('إلغاء', 'Cancel')}</Button><Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}><Save className="me-2 h-4 w-4" />{tr('حفظ التعديلات', 'Save changes')}</Button></>}><div className="space-y-4"><label className="block text-sm font-bold text-slate-700">{tr('الاسم بالعربية', 'Arabic name')}<input className={inputClass} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label><label className="block text-sm font-bold text-slate-700">{tr('الاسم بالإنجليزية', 'English name')}<input dir="ltr" className={inputClass} value={form.full_name_en} onChange={event => setForm(current => ({ ...current, full_name_en: event.target.value }))} /></label><label className="block text-sm font-bold text-slate-700">{tr('رقم الهاتف', 'Phone number')}<input dir="ltr" className={inputClass} value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label>{saveMutation.isError && <p className="text-sm font-semibold text-red-600">{errorMessage(saveMutation.error)}</p>}</div></Modal>
    <Modal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} title={tr('تغيير كلمة المرور', 'Change password')} footer={<><Button variant="outline" onClick={() => setPasswordOpen(false)}>{tr('إلغاء', 'Cancel')}</Button><Button onClick={() => passwordMutation.mutate()} isLoading={passwordMutation.isPending}>{tr('حفظ كلمة المرور', 'Save password')}</Button></>}><div className="space-y-4"><p className="text-sm text-slate-500">{tr('يجب أن تتكون كلمة المرور الجديدة من 8 خانات على الأقل.', 'The new password must contain at least 8 characters.')}</p>{[['current_password', tr('كلمة المرور الحالية', 'Current password')], ['password', tr('كلمة المرور الجديدة', 'New password')], ['password_confirmation', tr('تأكيد كلمة المرور الجديدة', 'Confirm new password')]].map(([key, label]) => <label key={key} className="block text-sm font-bold text-slate-700">{label}<input type="password" className={inputClass} value={(passwords as Record<string, string>)[key]} onChange={event => setPasswords(current => ({ ...current, [key]: event.target.value }))} autoComplete={key === 'current_password' ? 'current-password' : 'new-password'} /></label>)}{passwordMutation.isError && <p className="text-sm font-semibold text-red-600">{errorMessage(passwordMutation.error)}</p>}</div></Modal>
    <ConfirmDialog isOpen={Boolean(deleteDocument)} onClose={() => setDeleteDocument(null)} onConfirm={() => deleteDocument && deleteDocumentMutation.mutate(deleteDocument.id)} title={tr('حذف الوثيقة', 'Delete document')} message={tr(`هل تريد حذف وثيقة «${deleteDocument?.name || ''}»؟ لا يمكن التراجع عن الحذف.`, `Delete “${deleteDocument?.name || ''}”? This action cannot be undone.`)} confirmLabel={tr('حذف الوثيقة', 'Delete document')} isDanger isConfirming={deleteDocumentMutation.isPending} />
  </div>;
}

function ProfessionalList({ type, editing, ar, items, draft, setDraft, onChange }: { type: 'publications' | 'conferences'; editing: boolean; ar: boolean; items: Publication[] | Conference[]; draft: Record<string, string>; setDraft: React.Dispatch<React.SetStateAction<any>>; onChange: (items: Publication[] | Conference[]) => void }) {
  const publication = type === 'publications';
  const title = publication ? (ar ? 'الأبحاث والمنشورات' : 'Research & publications') : (ar ? 'المؤتمرات والورش' : 'Conferences & workshops');
  const add = () => {
    if (publication) {
      if (!draft.title?.trim()) return;
      onChange([...(items as Publication[]), { title: draft.title.trim(), journal: draft.journal || null, year: draft.year ? Number(draft.year) : null, doi: draft.doi || null }]);
      setDraft({ title: '', journal: '', year: String(new Date().getFullYear()), doi: '' });
    } else {
      if (!draft.name?.trim()) return;
      onChange([...(items as Conference[]), { name: draft.name.trim(), location: draft.location || null, date: draft.date || null, role: draft.role || null }]);
      setDraft({ name: '', location: '', date: '', role: '' });
    }
  };
  return <section className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-black text-slate-800">{publication ? <BookOpen className="h-4 w-4 text-teal-600" /> : <Award className="h-4 w-4 text-teal-600" />}{title}</h3><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold">{items.length}</span></div>{editing && <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">{publication ? <><input className={inputClass} value={draft.title} onChange={e => setDraft((v: any) => ({ ...v, title: e.target.value }))} placeholder={ar ? 'عنوان البحث *' : 'Publication title *'} /><input className={inputClass} value={draft.journal} onChange={e => setDraft((v: any) => ({ ...v, journal: e.target.value }))} placeholder={ar ? 'المجلة' : 'Journal'} /><input type="number" className={inputClass} value={draft.year} onChange={e => setDraft((v: any) => ({ ...v, year: e.target.value }))} placeholder={ar ? 'السنة' : 'Year'} /><input className={inputClass} value={draft.doi} onChange={e => setDraft((v: any) => ({ ...v, doi: e.target.value }))} placeholder="DOI" /></> : <><input className={inputClass} value={draft.name} onChange={e => setDraft((v: any) => ({ ...v, name: e.target.value }))} placeholder={ar ? 'اسم المؤتمر *' : 'Conference name *'} /><input className={inputClass} value={draft.location} onChange={e => setDraft((v: any) => ({ ...v, location: e.target.value }))} placeholder={ar ? 'المكان' : 'Location'} /><input type="date" className={inputClass} value={draft.date} onChange={e => setDraft((v: any) => ({ ...v, date: e.target.value }))} /><input className={inputClass} value={draft.role} onChange={e => setDraft((v: any) => ({ ...v, role: e.target.value }))} placeholder={ar ? 'صفة المشاركة' : 'Participation role'} /></>}<Button className="sm:col-span-2" disabled={publication ? !draft.title?.trim() : !draft.name?.trim()} onClick={add}><Plus className="me-2 h-4 w-4" />{publication ? (ar ? 'إضافة البحث' : 'Add publication') : (ar ? 'إضافة المشاركة' : 'Add participation')}</Button></div>}<div className="mt-4 space-y-2">{items.length ? items.map((raw, index) => { const item = raw as any; const primary = publication ? item.title : item.name; const meta = publication ? [item.journal, item.year, item.doi] : [item.location, item.date, item.role]; return <article key={`${primary}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3.5"><div><p className="text-sm font-bold text-slate-800">{primary}</p><p className="mt-1 text-xs text-slate-500">{meta.filter(Boolean).join(' · ')}</p></div>{editing && <button className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={() => onChange(items.filter((_, i) => i !== index) as Publication[] | Conference[])} aria-label={ar ? 'حذف' : 'Delete'}><Trash2 className="h-4 w-4" /></button>}</article>; }) : <EmptyBlock text={publication ? (ar ? 'لا توجد أبحاث مسجلة.' : 'No publications recorded.') : (ar ? 'لا توجد مشاركات مسجلة.' : 'No participation recorded.')} />}</div></section>;
}
