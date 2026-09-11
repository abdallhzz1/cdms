import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { Award, BriefcaseBusiness, Camera, CheckCircle2, Download, FileText, GraduationCap, KeyRound, Mail, MapPin, Pencil, Plus, Save, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/i18n/I18nContext';

type MyProfile = {
  id: number;
  name: string;
  full_name_en?: string | null;
  email: string;
  phone?: string | null;
  specialty?: string | null;
  academic_degree?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  roles: string[];
  assigned_levels: string[];
  department?: { name_ar?: string; name_en?: string } | null;
  primary_site?: { name_ar?: string; name_en?: string } | null;
  staff_code?: string | null;
  completion_percent: number;
  missing_fields: string[];
  capabilities: { professional_profile: boolean; clinical_supervisor: boolean; department_head: boolean };
  employment?: { license_number?: string | null; contract_type?: string | null; contract_start?: string | null; contract_end?: string | null; teaching_hours_per_week?: number | null; available_days?: string | null; max_students?: number | null } | null;
  training_sites: Array<{ id: number; name_ar: string; name_en?: string | null; is_primary: boolean }>;
  department_head_assignment?: { department_name_ar?: string | null; department_name_en?: string | null; started_at?: string | null; ended_at?: string | null } | null;
  professional?: {
    bio?: string | null;
    publications: Array<{ title: string; journal?: string | null; year?: number | null; doi?: string | null }>;
    conferences: Array<{ name: string; location?: string | null; date?: string | null; role?: string | null }>;
    documents: Array<{ id: string; name: string; category?: string | null; file_type?: string | null; file_size?: string | null; created_at?: string | null; download_url: string }>;
  } | null;
};

type ProfessionalForm = NonNullable<MyProfile['professional']>;

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100';

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

export function MyProfilePage() {
  const { locale } = useI18n();
  const { refreshUser } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<MyProfile>>({});
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [notice, setNotice] = useState('');
  const [professionalEditing, setProfessionalEditing] = useState(false);
  const [professionalForm, setProfessionalForm] = useState<ProfessionalForm>({ bio: '', publications: [], conferences: [], documents: [] });
  const [newPublication, setNewPublication] = useState({ title: '', journal: '', year: String(new Date().getFullYear()), doi: '' });
  const [newConference, setNewConference] = useState({ name: '', location: '', date: '', role: '' });
  const [documentMeta, setDocumentMeta] = useState({ name: '', category: 'academic_degree' });

  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiFetch<MyProfile>('/profile/me') });
  const profile = profileQuery.data;

  useEffect(() => {
    if (profile) {
      setForm(profile);
      setProfessionalForm(profile.professional || { bio: '', publications: [], conferences: [], documents: [] });
    }
  }, [profile]);

  useEffect(() => {
    if (!profile || new URLSearchParams(location.search).get('section') !== 'professional') return;
    window.requestAnimationFrame(() => document.getElementById('professional-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [location.search, profile]);

  const saveMutation = useMutation({
    mutationFn: () => apiFetch<MyProfile>('/profile/me', {
      method: 'PUT', body: {
        name: form.name || '', full_name_en: form.full_name_en || null, phone: form.phone || null,
        bio: form.bio || null,
      },
    }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['my-profile'], data);
      await refreshUser();
      setEditing(false);
      setNotice(locale === 'ar' ? 'تم حفظ معلوماتك وتحديثها في النظام.' : 'Your profile has been updated across the system.');
    },
  });

  const professionalMutation = useMutation({
    mutationFn: () => apiFetch<MyProfile>('/profile/me/professional', {
      method: 'PUT',
      body: { bio: professionalForm.bio || null, publications: professionalForm.publications, conferences: professionalForm.conferences },
    }),
    onSuccess: (data) => {
      queryClient.setQueryData(['my-profile'], data);
      setProfessionalEditing(false);
      setNotice(locale === 'ar' ? 'تم تحديث سجلك المهني.' : 'Your professional record has been updated.');
    },
  });

  const documentMutation = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      body.append('name', documentMeta.name || file.name.replace(/\.[^.]+$/, ''));
      body.append('category', documentMeta.category);
      return apiFetch<MyProfile>('/profile/me/documents', { method: 'POST', body });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['my-profile'], data);
      setDocumentMeta({ name: '', category: 'academic_degree' });
      setNotice(locale === 'ar' ? 'تم رفع الوثيقة وحفظها في قاعدة البيانات.' : 'The document was uploaded and stored securely.');
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (id: string) => apiFetch<MyProfile>(`/profile/me/documents/${id}`, { method: 'DELETE' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['my-profile'], data);
      setNotice(locale === 'ar' ? 'تم حذف الوثيقة.' : 'Document deleted.');
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (avatar_base64: string) => apiFetch<MyProfile>('/profile/me/avatar', { method: 'POST', body: { avatar_base64 } }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['my-profile'], data);
      await refreshUser();
      setNotice(locale === 'ar' ? 'تم تحديث الصورة الشخصية في جميع المواضع المرتبطة بالحساب.' : 'Your photo has been updated everywhere it is used.');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => apiFetch<null>('/profile/me/password', { method: 'PUT', body: passwords }),
    onSuccess: () => {
      setPasswordOpen(false);
      setPasswords({ current_password: '', password: '', password_confirmation: '' });
      setNotice(locale === 'ar' ? 'تم تغيير كلمة المرور بنجاح.' : 'Password changed successfully.');
    },
  });

  const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : (locale === 'ar' ? 'تعذر حفظ التحديث. حاول مرة أخرى.' : 'Could not save the update. Please try again.');
  const displayDepartment = useMemo(() => locale === 'ar' ? profile?.department?.name_ar : (profile?.department?.name_en || profile?.department?.name_ar), [profile, locale]);
  const displaySite = useMemo(() => locale === 'ar' ? profile?.primary_site?.name_ar : (profile?.primary_site?.name_en || profile?.primary_site?.name_ar), [profile, locale]);

  if (profileQuery.isLoading) return <LoadingState />;
  if (profileQuery.isError || !profile) return <ErrorState title={locale === 'ar' ? 'تعذر تحميل الملف الشخصي' : 'Unable to load profile'} onRetry={() => profileQuery.refetch()} />;

  const onPhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setNotice(locale === 'ar' ? 'اختر صورة JPG أو PNG أو WebP بحجم لا يزيد عن 2MB.' : 'Choose a JPG, PNG, or WebP image up to 2 MB.');
      return;
    }
    avatarMutation.mutate(await toBase64(file));
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <PageHeader title={locale === 'ar' ? 'ملفي الشخصي' : 'My Profile'} description={locale === 'ar' ? 'بياناتك المهنية وصورتك الموحدة في نظام الدائرة السريرية.' : 'Your professional details and shared photo across the clinical system.'}>
      <Button variant="outline" onClick={() => setPasswordOpen(true)}><KeyRound className="ml-2 h-4 w-4" />{locale === 'ar' ? 'تغيير كلمة المرور' : 'Change password'}</Button>
      <Button onClick={() => { setForm(profile); setEditing(value => !value); }}><Pencil className="ml-2 h-4 w-4" />{editing ? (locale === 'ar' ? 'إلغاء التعديل' : 'Cancel') : (locale === 'ar' ? 'تعديل المعلومات' : 'Edit profile')}</Button>
    </PageHeader>

    {notice && <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800"><span>{notice}</span><button onClick={() => setNotice('')} className="text-xs underline">{locale === 'ar' ? 'إخفاء' : 'Dismiss'}</button></div>}

    <Card className="overflow-hidden rounded-3xl border-slate-200 p-0 shadow-sm">
      <div className="h-24 bg-teal-50 sm:h-28" />
      <div className="relative px-5 pb-5 sm:px-7 sm:pb-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative -mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-teal-50 text-2xl font-black text-teal-700 shadow-sm">
              {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name} className="h-full w-full object-cover" /> : profile.name.slice(0, 1)}
              <label className="absolute inset-x-1 bottom-1 flex h-8 cursor-pointer items-center justify-center rounded-xl bg-slate-900/65 text-white transition hover:bg-slate-900/80" title={locale === 'ar' ? 'تحديث الصورة' : 'Update photo'}><Camera className="h-4 w-4" /><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPhotoSelect} disabled={avatarMutation.isPending} /></label>
            </div>
            <div className="min-w-0"><h2 className="truncate text-xl font-black text-slate-800">{profile.name}</h2>{profile.full_name_en && <p dir="ltr" className="mt-1 truncate text-xs text-slate-500">{profile.full_name_en}</p>}<p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Mail className="h-3.5 w-3.5 text-teal-600" /><span dir="ltr">{profile.email}</span></p></div>
          </div>
          <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-center"><p className="text-lg font-black text-teal-800">{profile.completion_percent}%</p><p className="text-[11px] font-semibold text-teal-700">{locale === 'ar' ? 'اكتمال الملف' : 'Profile complete'}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{profile.roles.map(role => <span key={role} className="rounded-xl bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{roleLabel(role, locale)}</span>)}</div>
      </div>
    </Card>

    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <Card className="rounded-3xl border-slate-200 p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-600" /><div><h3 className="font-black text-slate-800">{locale === 'ar' ? 'البيانات المهنية' : 'Professional details'}</h3><p className="mt-1 text-xs text-slate-500">{locale === 'ar' ? 'هذه البيانات تظهر تلقائيًا في الأدلة والمواضع المرتبطة بحسابك.' : 'These details are reflected in directories and relevant account views.'}</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[['name', locale === 'ar' ? 'الاسم بالعربية' : 'Arabic name'], ['full_name_en', locale === 'ar' ? 'الاسم بالإنجليزية' : 'English name'], ['phone', locale === 'ar' ? 'رقم الهاتف' : 'Phone number']].map(([key, label]) => <label key={key} className={key === 'phone' ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{editing ? <input className={inputClass} value={String((form as any)[key] || '')} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /> : <p className="min-h-11 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700">{String((profile as any)[key] || '—')}</p>}</label>)}
        </div>
        {editing && <div className="mt-5 flex justify-end"><Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}><Save className="ml-2 h-4 w-4" />{locale === 'ar' ? 'حفظ التحديثات' : 'Save changes'}</Button></div>}
        {saveMutation.isError && <p className="mt-3 text-sm font-semibold text-red-600">{errorMessage(saveMutation.error)}</p>}
      </Card>

      <div className="space-y-5">
        <Card className="rounded-3xl border-slate-200 p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-600" /><h3 className="font-black text-slate-800">{locale === 'ar' ? 'معلومات النظام' : 'System information'}</h3></div><dl className="mt-4 space-y-3 text-sm"><div className="flex items-start justify-between gap-4"><dt className="text-slate-500">{locale === 'ar' ? 'البريد المؤسسي' : 'Institutional email'}</dt><dd dir="ltr" className="text-left font-semibold text-slate-700">{profile.email}</dd></div><p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">{locale === 'ar' ? 'يُعدّل البريد المؤسسي من إدارة النظام لأنه يستخدم في الدخول والإشعارات.' : 'Institutional email is managed by system administration because it is used for access and notifications.'}</p>{profile.staff_code && <div className="flex justify-between gap-4"><dt className="text-slate-500">{locale === 'ar' ? 'الرقم الوظيفي' : 'Staff code'}</dt><dd className="font-semibold text-slate-700">{profile.staff_code}</dd></div>}</dl></Card>
        <Card className="rounded-3xl border-slate-200 p-5"><div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-teal-600" /><h3 className="font-black text-slate-800">{locale === 'ar' ? 'الارتباطات الأكاديمية' : 'Academic assignments'}</h3></div><div className="mt-4 space-y-3 text-sm">{displayDepartment && <div className="flex items-center gap-2 text-slate-700"><GraduationCap className="h-4 w-4 text-teal-600" />{displayDepartment}</div>}{displaySite && <div className="flex items-center gap-2 text-slate-700"><MapPin className="h-4 w-4 text-teal-600" />{displaySite}</div>}{profile.training_sites.map(site => <div key={site.id} className="flex items-center gap-2 text-slate-700"><MapPin className="h-4 w-4 text-teal-600" />{locale === 'ar' ? site.name_ar : (site.name_en || site.name_ar)}{site.is_primary && <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">{locale === 'ar' ? 'أساسي' : 'Primary'}</span>}</div>)}{profile.assigned_levels.length > 0 && <div className="flex flex-wrap gap-1.5">{profile.assigned_levels.map(level => <span key={level} className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700">{locale === 'ar' ? `دفعة ${level === 'fourth' ? 'رابعة' : level === 'fifth' ? 'خامسة' : 'سادسة'}` : `${level} cohort`}</span>)}</div>}{!displayDepartment && !displaySite && !profile.assigned_levels.length && !profile.training_sites.length && <p className="text-sm text-slate-500">{locale === 'ar' ? 'لا توجد ارتباطات أكاديمية مسندة لهذا الحساب.' : 'No academic assignments are linked to this account.'}</p>}</div></Card>
        {profile.employment && <Card className="rounded-3xl border-slate-200 p-5"><div className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-teal-600" /><h3 className="font-black text-slate-800">{locale === 'ar' ? 'البيانات الوظيفية' : 'Employment details'}</h3></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs">{[[locale === 'ar' ? 'التخصص' : 'Specialty', profile.specialty], [locale === 'ar' ? 'الدرجة الأكاديمية' : 'Academic degree', profile.academic_degree], [locale === 'ar' ? 'رقم الترخيص' : 'License number', profile.employment.license_number], [locale === 'ar' ? 'نوع العقد' : 'Contract type', profile.employment.contract_type], [locale === 'ar' ? 'بداية العقد' : 'Contract start', profile.employment.contract_start], [locale === 'ar' ? 'نهاية العقد' : 'Contract end', profile.employment.contract_end]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-700">{value || '—'}</dd></div>)}</dl><p className="mt-3 text-[10px] leading-5 text-slate-400">{locale === 'ar' ? 'هذه معلومات إدارية للعرض فقط، وتُحدّث من إدارة الكادر.' : 'These are administrative read-only fields managed by staff administration.'}</p></Card>}
        <Card className="rounded-3xl border-teal-100 bg-teal-50/50 p-5"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" /><p className="text-xs leading-6 text-teal-800">{locale === 'ar' ? 'يمكنك تحديث صورتك وبياناتك المهنية بنفسك. أما الصلاحيات والأدوار والقسم والبريد المؤسسي فتُدار من إدارة النظام لضمان صحة الصلاحيات.' : 'You can keep your photo and professional information current. Roles, permissions, department, and institutional email are managed by system administration.'}</p></div></Card>
      </div>
    </div>

    {profile.capabilities.professional_profile && profile.professional && <Card id="professional-profile" className="scroll-mt-24 rounded-3xl border-slate-200 p-5 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Award className="h-5 w-5" /></span><div><h3 className="font-black text-slate-800">{locale === 'ar' ? 'السجل المهني الموحد' : 'Unified professional record'}</h3><p className="mt-1 text-xs text-slate-500">{locale === 'ar' ? 'يُستخدم للمشرف السريري ورئيس القسم دون تكرار البيانات.' : 'Used for clinical-supervisor and department-head profiles without duplicate data.'}</p></div></div>
        <Button variant={professionalEditing ? 'outline' : undefined} onClick={() => { setProfessionalForm(profile.professional!); setProfessionalEditing(value => !value); }}><Pencil className="ml-2 h-4 w-4" />{professionalEditing ? (locale === 'ar' ? 'إلغاء' : 'Cancel') : (locale === 'ar' ? 'تعديل السجل' : 'Edit record')}</Button>
      </div>

      <div className="mt-5">
        <label className="text-xs font-bold text-slate-600">{locale === 'ar' ? 'النبذة المهنية' : 'Professional summary'}</label>
        {professionalEditing ? <textarea rows={4} className={`${inputClass} mt-2 resize-none`} value={professionalForm.bio || ''} onChange={event => setProfessionalForm(current => ({ ...current, bio: event.target.value }))} placeholder={locale === 'ar' ? 'نبذة مختصرة عن الخبرة ومجال العمل...' : 'A concise summary of experience and practice...'} /> : <p className="mt-2 min-h-20 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">{profile.professional.bio || (locale === 'ar' ? 'لم تُضف نبذة مهنية بعد.' : 'No professional summary added yet.')}</p>}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between"><h4 className="flex items-center gap-2 text-sm font-black text-slate-800"><FileText className="h-4 w-4 text-teal-600" />{locale === 'ar' ? 'الأبحاث والمنشورات' : 'Research & publications'}</h4><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{professionalForm.publications.length}</span></div>
          {professionalEditing && <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"><input className={inputClass} value={newPublication.title} onChange={event => setNewPublication(current => ({ ...current, title: event.target.value }))} placeholder={locale === 'ar' ? 'عنوان البحث *' : 'Publication title *'} /><input className={inputClass} value={newPublication.journal} onChange={event => setNewPublication(current => ({ ...current, journal: event.target.value }))} placeholder={locale === 'ar' ? 'المجلة' : 'Journal'} /><input type="number" className={inputClass} value={newPublication.year} onChange={event => setNewPublication(current => ({ ...current, year: event.target.value }))} placeholder={locale === 'ar' ? 'السنة' : 'Year'} /><input className={inputClass} value={newPublication.doi} onChange={event => setNewPublication(current => ({ ...current, doi: event.target.value }))} placeholder="DOI" /><Button className="sm:col-span-2" disabled={!newPublication.title.trim()} onClick={() => { setProfessionalForm(current => ({ ...current, publications: [...current.publications, { ...newPublication, year: newPublication.year ? Number(newPublication.year) : null }] })); setNewPublication({ title: '', journal: '', year: String(new Date().getFullYear()), doi: '' }); }}><Plus className="ml-1 h-4 w-4" />{locale === 'ar' ? 'إضافة البحث' : 'Add publication'}</Button></div>}
          <div className="mt-3 space-y-2">{professionalForm.publications.length ? professionalForm.publications.map((item, index) => <article key={`${item.title}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-bold text-slate-800">{item.title}</p><p className="mt-1 text-[10px] text-slate-500">{[item.journal, item.year, item.doi].filter(Boolean).join(' · ')}</p></div>{professionalEditing && <button className="text-rose-500" onClick={() => setProfessionalForm(current => ({ ...current, publications: current.publications.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></button>}</article>) : <p className="py-5 text-center text-xs text-slate-400">{locale === 'ar' ? 'لا توجد أبحاث مسجلة.' : 'No publications recorded.'}</p>}</div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between"><h4 className="flex items-center gap-2 text-sm font-black text-slate-800"><Award className="h-4 w-4 text-teal-600" />{locale === 'ar' ? 'المؤتمرات والورش' : 'Conferences & workshops'}</h4><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{professionalForm.conferences.length}</span></div>
          {professionalEditing && <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"><input className={inputClass} value={newConference.name} onChange={event => setNewConference(current => ({ ...current, name: event.target.value }))} placeholder={locale === 'ar' ? 'اسم المؤتمر *' : 'Conference name *'} /><input className={inputClass} value={newConference.location} onChange={event => setNewConference(current => ({ ...current, location: event.target.value }))} placeholder={locale === 'ar' ? 'المكان' : 'Location'} /><input type="date" className={inputClass} value={newConference.date} onChange={event => setNewConference(current => ({ ...current, date: event.target.value }))} /><input className={inputClass} value={newConference.role} onChange={event => setNewConference(current => ({ ...current, role: event.target.value }))} placeholder={locale === 'ar' ? 'صفة المشاركة' : 'Participation role'} /><Button className="sm:col-span-2" disabled={!newConference.name.trim()} onClick={() => { setProfessionalForm(current => ({ ...current, conferences: [...current.conferences, { ...newConference }] })); setNewConference({ name: '', location: '', date: '', role: '' }); }}><Plus className="ml-1 h-4 w-4" />{locale === 'ar' ? 'إضافة المشاركة' : 'Add participation'}</Button></div>}
          <div className="mt-3 space-y-2">{professionalForm.conferences.length ? professionalForm.conferences.map((item, index) => <article key={`${item.name}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"><div><p className="text-xs font-bold text-slate-800">{item.name}</p><p className="mt-1 text-[10px] text-slate-500">{[item.location, item.date, item.role].filter(Boolean).join(' · ')}</p></div>{professionalEditing && <button className="text-rose-500" onClick={() => setProfessionalForm(current => ({ ...current, conferences: current.conferences.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" /></button>}</article>) : <p className="py-5 text-center text-xs text-slate-400">{locale === 'ar' ? 'لا توجد مشاركات مسجلة.' : 'No participation recorded.'}</p>}</div>
        </section>
      </div>

      {professionalEditing && <div className="mt-5 flex justify-end"><Button onClick={() => professionalMutation.mutate()} isLoading={professionalMutation.isPending}><Save className="ml-2 h-4 w-4" />{locale === 'ar' ? 'حفظ السجل المهني' : 'Save professional record'}</Button></div>}
      {professionalMutation.isError && <p className="mt-3 text-sm font-semibold text-red-600">{errorMessage(professionalMutation.error)}</p>}

      <section className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-teal-600" /><div><h4 className="text-sm font-black text-slate-800">{locale === 'ar' ? 'الوثائق المهنية الخاصة' : 'Private professional documents'}</h4><p className="mt-1 text-[10px] text-slate-500">{locale === 'ar' ? 'محفوظة في قاعدة البيانات ولا تظهر في دليل الموظفين العام.' : 'Stored securely and hidden from the public staff directory.'}</p></div></div>
        <div className="mt-3 grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-[1fr_180px_auto]"><input className={inputClass} value={documentMeta.name} onChange={event => setDocumentMeta(current => ({ ...current, name: event.target.value }))} placeholder={locale === 'ar' ? 'اسم الوثيقة' : 'Document name'} /><select className={inputClass} value={documentMeta.category} onChange={event => setDocumentMeta(current => ({ ...current, category: event.target.value }))}><option value="academic_degree">{locale === 'ar' ? 'شهادة أكاديمية' : 'Academic degree'}</option><option value="medical_license">{locale === 'ar' ? 'ترخيص مزاولة' : 'Medical license'}</option><option value="certificate">{locale === 'ar' ? 'شهادة مهنية' : 'Professional certificate'}</option><option value="other">{locale === 'ar' ? 'أخرى' : 'Other'}</option></select><label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-800"><Plus className="ml-1 h-4 w-4" />{locale === 'ar' ? 'رفع وثيقة' : 'Upload'}<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" disabled={documentMutation.isPending} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) documentMutation.mutate(file); }} /></label></div>
        {documentMutation.isError && <p className="mt-2 text-sm font-semibold text-red-600">{errorMessage(documentMutation.error)}</p>}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{profile.professional.documents.map(document => <article key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{document.name}</p><p className="mt-1 text-[10px] text-slate-400">{[document.file_type?.toUpperCase(), document.file_size, document.created_at].filter(Boolean).join(' · ')}</p></div><div className="flex shrink-0 gap-1"><a href={document.download_url} className="grid h-8 w-8 place-items-center rounded-lg text-teal-700 hover:bg-teal-50" title={locale === 'ar' ? 'تنزيل' : 'Download'}><Download className="h-4 w-4" /></a><button onClick={() => deleteDocumentMutation.mutate(document.id)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" title={locale === 'ar' ? 'حذف' : 'Delete'}><Trash2 className="h-4 w-4" /></button></div></article>)}</div>
      </section>
    </Card>}

    <Modal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} title={locale === 'ar' ? 'تغيير كلمة المرور' : 'Change password'} footer={<><Button variant="outline" onClick={() => setPasswordOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button onClick={() => passwordMutation.mutate()} isLoading={passwordMutation.isPending}>{locale === 'ar' ? 'حفظ كلمة المرور' : 'Save password'}</Button></>}>
      <div className="space-y-3"><p className="text-sm text-slate-500">{locale === 'ar' ? 'استخدم كلمة مرور جديدة مكوّنة من 8 أحرف على الأقل.' : 'Use a new password with at least 8 characters.'}</p>{[['current_password', locale === 'ar' ? 'كلمة المرور الحالية' : 'Current password'], ['password', locale === 'ar' ? 'كلمة المرور الجديدة' : 'New password'], ['password_confirmation', locale === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password']].map(([key, label]) => <label key={key}><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type="password" className={inputClass} value={(passwords as any)[key]} onChange={event => setPasswords(current => ({ ...current, [key]: event.target.value }))} autoComplete={key === 'current_password' ? 'current-password' : 'new-password'} /></label>)}{passwordMutation.isError && <p className="text-sm font-semibold text-red-600">{errorMessage(passwordMutation.error)}</p>}</div>
    </Modal>
  </div>;
}
