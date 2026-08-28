import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, GraduationCap, KeyRound, Mail, MapPin, Pencil, Save, ShieldCheck, UserRound } from 'lucide-react';
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
};

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
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<MyProfile>>({});
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [notice, setNotice] = useState('');

  const profileQuery = useQuery({ queryKey: ['my-profile'], queryFn: () => apiFetch<MyProfile>('/profile/me') });
  const profile = profileQuery.data;

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: () => apiFetch<MyProfile>('/profile/me', {
      method: 'PUT', body: {
        name: form.name || '', full_name_en: form.full_name_en || null, phone: form.phone || null,
        specialty: form.specialty || null, academic_degree: form.academic_degree || null, bio: form.bio || null,
      },
    }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['my-profile'], data);
      await refreshUser();
      setEditing(false);
      setNotice(locale === 'ar' ? 'تم حفظ معلوماتك وتحديثها في النظام.' : 'Your profile has been updated across the system.');
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
          {[['name', locale === 'ar' ? 'الاسم بالعربية' : 'Arabic name'], ['full_name_en', locale === 'ar' ? 'الاسم بالإنجليزية' : 'English name'], ['phone', locale === 'ar' ? 'رقم الهاتف' : 'Phone number'], ['specialty', locale === 'ar' ? 'التخصص' : 'Specialty'], ['academic_degree', locale === 'ar' ? 'الدرجة أو المسمى الأكاديمي' : 'Academic degree / title']].map(([key, label]) => <label key={key} className={key === 'academic_degree' ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{editing ? <input className={inputClass} value={String((form as any)[key] || '')} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /> : <p className="min-h-11 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700">{String((profile as any)[key] || '—')}</p>}</label>)}
          <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold text-slate-600">{locale === 'ar' ? 'نبذة مهنية مختصرة' : 'Professional summary'}</span>{editing ? <textarea rows={4} className={inputClass} value={form.bio || ''} onChange={event => setForm(current => ({ ...current, bio: event.target.value }))} placeholder={locale === 'ar' ? 'عرّف بنفسك ومجال عملك باختصار...' : 'A short professional introduction...'} /> : <p className="min-h-24 whitespace-pre-line rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-700">{profile.bio || (locale === 'ar' ? 'لم تُضف نبذة مهنية بعد.' : 'No professional summary added yet.')}</p>}</label>
        </div>
        {editing && <div className="mt-5 flex justify-end"><Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}><Save className="ml-2 h-4 w-4" />{locale === 'ar' ? 'حفظ التحديثات' : 'Save changes'}</Button></div>}
        {saveMutation.isError && <p className="mt-3 text-sm font-semibold text-red-600">{errorMessage(saveMutation.error)}</p>}
      </Card>

      <div className="space-y-5">
        <Card className="rounded-3xl border-slate-200 p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-teal-600" /><h3 className="font-black text-slate-800">{locale === 'ar' ? 'معلومات النظام' : 'System information'}</h3></div><dl className="mt-4 space-y-3 text-sm"><div className="flex items-start justify-between gap-4"><dt className="text-slate-500">{locale === 'ar' ? 'البريد المؤسسي' : 'Institutional email'}</dt><dd dir="ltr" className="text-left font-semibold text-slate-700">{profile.email}</dd></div><p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">{locale === 'ar' ? 'يُعدّل البريد المؤسسي من إدارة النظام لأنه يستخدم في الدخول والإشعارات.' : 'Institutional email is managed by system administration because it is used for access and notifications.'}</p>{profile.staff_code && <div className="flex justify-between gap-4"><dt className="text-slate-500">{locale === 'ar' ? 'الرقم الوظيفي' : 'Staff code'}</dt><dd className="font-semibold text-slate-700">{profile.staff_code}</dd></div>}</dl></Card>
        <Card className="rounded-3xl border-slate-200 p-5"><div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-teal-600" /><h3 className="font-black text-slate-800">{locale === 'ar' ? 'الارتباطات الأكاديمية' : 'Academic assignments'}</h3></div><div className="mt-4 space-y-3 text-sm">{displayDepartment && <div className="flex items-center gap-2 text-slate-700"><GraduationCap className="h-4 w-4 text-teal-600" />{displayDepartment}</div>}{displaySite && <div className="flex items-center gap-2 text-slate-700"><MapPin className="h-4 w-4 text-teal-600" />{displaySite}</div>}{profile.assigned_levels.length > 0 && <div className="flex flex-wrap gap-1.5">{profile.assigned_levels.map(level => <span key={level} className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700">{locale === 'ar' ? `دفعة ${level === 'fourth' ? 'رابعة' : level === 'fifth' ? 'خامسة' : 'سادسة'}` : `${level} cohort`}</span>)}</div>}{!displayDepartment && !displaySite && !profile.assigned_levels.length && <p className="text-sm text-slate-500">{locale === 'ar' ? 'لا توجد ارتباطات أكاديمية مسندة لهذا الحساب.' : 'No academic assignments are linked to this account.'}</p>}</div></Card>
        <Card className="rounded-3xl border-teal-100 bg-teal-50/50 p-5"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" /><p className="text-xs leading-6 text-teal-800">{locale === 'ar' ? 'يمكنك تحديث صورتك وبياناتك المهنية بنفسك. أما الصلاحيات والأدوار والقسم والبريد المؤسسي فتُدار من إدارة النظام لضمان صحة الصلاحيات.' : 'You can keep your photo and professional information current. Roles, permissions, department, and institutional email are managed by system administration.'}</p></div></Card>
      </div>
    </div>

    <Modal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} title={locale === 'ar' ? 'تغيير كلمة المرور' : 'Change password'} footer={<><Button variant="outline" onClick={() => setPasswordOpen(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</Button><Button onClick={() => passwordMutation.mutate()} isLoading={passwordMutation.isPending}>{locale === 'ar' ? 'حفظ كلمة المرور' : 'Save password'}</Button></>}>
      <div className="space-y-3"><p className="text-sm text-slate-500">{locale === 'ar' ? 'استخدم كلمة مرور جديدة مكوّنة من 8 أحرف على الأقل.' : 'Use a new password with at least 8 characters.'}</p>{[['current_password', locale === 'ar' ? 'كلمة المرور الحالية' : 'Current password'], ['password', locale === 'ar' ? 'كلمة المرور الجديدة' : 'New password'], ['password_confirmation', locale === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm new password']].map(([key, label]) => <label key={key}><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type="password" className={inputClass} value={(passwords as any)[key]} onChange={event => setPasswords(current => ({ ...current, [key]: event.target.value }))} autoComplete={key === 'current_password' ? 'current-password' : 'new-password'} /></label>)}{passwordMutation.isError && <p className="text-sm font-semibold text-red-600">{errorMessage(passwordMutation.error)}</p>}</div>
    </Modal>
  </div>;
}
