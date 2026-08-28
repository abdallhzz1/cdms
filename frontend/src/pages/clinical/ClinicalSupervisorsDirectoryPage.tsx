import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Pencil, Plus, Search, ShieldCheck, Stethoscope, UserRound, Users } from 'lucide-react';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';

type Doctor = { id: number | null; user_id: number; full_name_ar: string; full_name_en?: string | null; email: string; specialty?: string | null; primary_site_id?: number | null; training_site_ids?: number[] };
type Hospital = { id: number; site_code: string; name_ar: string; name_en?: string | null; site_type: string; city?: string | null; supervisors: Doctor[] };
type Workforce = { hospitals: Hospital[]; unassigned_doctors: Doctor[] };
type Profile = { id: string; user_id: number; name: string; email: string };

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const validation = Object.values(error.errors).flat().find((value) => typeof value === 'string');
  return typeof validation === 'string' ? validation : error.message || fallback;
}

export function ClinicalSupervisorsDirectoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<'doctors' | 'hospitals'>('doctors');
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [doctorModal, setDoctorModal] = useState(false);
  const [hospitalModal, setHospitalModal] = useState(false);
  const [editingHospitalId, setEditingHospitalId] = useState<number | null>(null);
  const [assigning, setAssigning] = useState<{ doctor: Doctor; siteId: string } | null>(null);
  const [doctorForm, setDoctorForm] = useState({ full_name_ar: '', full_name_en: '', email: '', password: '', primary_site_id: '', specialty: '' });
  const [hospitalForm, setHospitalForm] = useState({ site_code: '', name_ar: '', name_en: '', site_type: 'hospital_public', city: '' });

  const workforceQuery = useQuery({ queryKey: ['clinical-workforce'], queryFn: () => apiFetch<Workforce>('/clinical-workforce') });
  const profilesQuery = useQuery({
    queryKey: ['clinical-supervisors-directory-v1'],
    queryFn: async () => { const response = await apiFetch<any>('/clinical-supervisors'); return (Array.isArray(response) ? response : response?.data ?? []) as Profile[]; },
    enabled: can('people.view'),
  });
  const workforce = workforceQuery.data;
  const hospitals = workforce?.hospitals ?? [];
  const doctors = useMemo(() => {
    const map = new Map<number, Doctor>();
    hospitals.forEach((hospital) => hospital.supervisors.forEach((doctor) => map.set(doctor.user_id, doctor)));
    (workforce?.unassigned_doctors ?? []).forEach((doctor) => map.set(doctor.user_id, doctor));
    return [...map.values()].sort((a, b) => a.full_name_ar.localeCompare(b.full_name_ar, 'ar'));
  }, [hospitals, workforce?.unassigned_doctors]);
  const profiles = useMemo(() => new Map((profilesQuery.data ?? []).map((profile) => [Number(profile.user_id || profile.id), profile])), [profilesQuery.data]);
  const filteredDoctors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return doctors.filter((doctor) => {
      const matchesSearch = !query || doctor.full_name_ar.toLowerCase().includes(query) || doctor.email.toLowerCase().includes(query) || doctor.specialty?.toLowerCase().includes(query);
      const siteIds = doctor.training_site_ids ?? (doctor.primary_site_id ? [doctor.primary_site_id] : []);
      const matchesHospital = hospitalFilter === 'all' || (hospitalFilter === 'unassigned' ? siteIds.length === 0 : siteIds.includes(Number(hospitalFilter)));
      return matchesSearch && matchesHospital;
    });
  }, [doctors, hospitalFilter, search]);

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['clinical-workforce'] }),
    queryClient.invalidateQueries({ queryKey: ['clinical-supervisors-directory-v1'] }),
    queryClient.invalidateQueries({ queryKey: ['course-distribution-options'] }),
    queryClient.invalidateQueries({ queryKey: ['course-distribution-schedule'] }),
  ]);
  const addDoctor = useMutation({
    mutationFn: () => apiFetch('/clinical-workforce/doctors', { method: 'POST', body: { ...doctorForm, primary_site_id: Number(doctorForm.primary_site_id) } }),
    onSuccess: async () => { setDoctorModal(false); setDoctorForm({ full_name_ar: '', full_name_en: '', email: '', password: '', primary_site_id: '', specialty: '' }); await refresh(); setNotice({ type: 'success', text: 'تم إنشاء الطبيب وحساب المشرف وربطه بالمستشفى.' }); },
    onError: (error) => setNotice({ type: 'error', text: errorMessage(error, 'تعذر إضافة الطبيب.') }),
  });
  const assignHospital = useMutation({
    mutationFn: () => apiFetch(`/clinical-workforce/doctors/${assigning!.doctor.user_id}/hospital`, { method: 'PUT', body: { primary_site_id: assigning!.siteId ? Number(assigning!.siteId) : null } }),
    onSuccess: async () => { setAssigning(null); await refresh(); setNotice({ type: 'success', text: 'تم تحديث مستشفى الطبيب وسيظهر التغيير في التوزيع مباشرة.' }); },
    onError: (error) => setNotice({ type: 'error', text: errorMessage(error, 'تعذر تحديث مستشفى الطبيب.') }),
  });
  const saveHospital = useMutation({
    mutationFn: () => apiFetch(editingHospitalId ? `/training-sites/${editingHospitalId}` : '/training-sites', { method: editingHospitalId ? 'PUT' : 'POST', body: hospitalForm }),
    onSuccess: async () => { setHospitalModal(false); setEditingHospitalId(null); setHospitalForm({ site_code: '', name_ar: '', name_en: '', site_type: 'hospital_public', city: '' }); await refresh(); setNotice({ type: 'success', text: 'تم حفظ المستشفى.' }); },
    onError: (error) => setNotice({ type: 'error', text: errorMessage(error, 'تعذر حفظ المستشفى.') }),
  });
  const openHospital = (hospital?: Hospital) => {
    setEditingHospitalId(hospital?.id ?? null);
    setHospitalForm(hospital ? { site_code: hospital.site_code, name_ar: hospital.name_ar, name_en: hospital.name_en ?? '', site_type: hospital.site_type, city: hospital.city ?? '' } : { site_code: '', name_ar: '', name_en: '', site_type: 'hospital_public', city: '' });
    setHospitalModal(true);
  };

  if (workforceQuery.isLoading) return <LoadingState />;
  if (workforceQuery.isError) return <ErrorState message="تعذر تحميل المستشفيات والمشرفين السريريين." onRetry={() => workforceQuery.refetch()} />;

  return <div className="space-y-5 pb-20">
  <PageHeader title="دليل المشرفين والمواقع التدريبية" description="دليل تشغيلي موحّد لملفات المشرفين، تخصصاتهم، وربطهم بالمستشفيات التي تستخدمها شاشة التوزيع السريري.">
    {can('clinical_supervisor_evaluations.view') && <Link to="/clinical-supervisor-evaluations"><Button variant="outline"><ShieldCheck className="ml-1 h-4 w-4" />تقييمات المشرفين</Button></Link>}
  </PageHeader>
    {notice && <div className={`flex items-start justify-between rounded-2xl border p-4 text-xs font-bold ${notice.type === 'success' ? 'border-teal-200 bg-teal-50 text-teal-800' : 'border-red-200 bg-red-50 text-red-800'}`}><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)}>×</button></div>}
    <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-50 p-1"><button type="button" onClick={() => setTab('doctors')} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'doctors' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500'}`}><Users className="ml-1 inline h-4 w-4" />المشرفون</button><button type="button" onClick={() => setTab('hospitals')} className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === 'hospitals' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500'}`}><Building2 className="ml-1 inline h-4 w-4" />المستشفيات</button></div><div className="flex flex-wrap gap-2">{can('training_sites.manage') && <Button variant="outline" onClick={() => openHospital()}><Plus className="ml-1 h-4 w-4" />إضافة مستشفى</Button>}{can('people.manage') && <Button onClick={() => setDoctorModal(true)}><Plus className="ml-1 h-4 w-4" />إضافة طبيب وحساب</Button>}</div></div></section>

    {tab === 'doctors' ? <><section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_15rem]"><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full bg-transparent text-xs font-bold outline-none" placeholder="بحث بالاسم أو البريد أو التخصص..." /></label><select value={hospitalFilter} onChange={(event) => setHospitalFilter(event.target.value)} className={inputClass}><option value="all">جميع المستشفيات</option><option value="unassigned">بدون مستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></section>
      <section className="grid gap-3 lg:grid-cols-2">{filteredDoctors.map((doctor) => { const profile = profiles.get(doctor.user_id); const doctorHospitals = hospitals.filter((hospital) => (doctor.training_site_ids ?? []).includes(hospital.id) || doctor.primary_site_id === hospital.id); return <article key={doctor.user_id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Stethoscope className="h-6 w-6" /></div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black text-slate-800">{doctor.full_name_ar}</h2><p dir="ltr" className="mt-1 truncate text-left text-[11px] text-slate-500">{doctor.email}</p><div className="mt-2 flex flex-wrap gap-1.5">{doctorHospitals.length ? doctorHospitals.map((hospital) => <span key={hospital.id} className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">{hospital.name_ar}</span>) : <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">بدون مستشفى</span>}{doctor.specialty && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{doctor.specialty}</span>}</div></div></div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{profile && <Button size="sm" variant="outline" onClick={() => navigate(`/clinical-supervisors/${doctor.user_id}`)}><ShieldCheck className="ml-1 h-4 w-4" />فتح الملف السريري</Button>}{can('clinical_supervisor_evaluations.create') && <Link to={`/clinical-supervisor-evaluations?supervisor=${doctor.user_id}`}><Button size="sm" variant="outline"><ShieldCheck className="ml-1 h-4 w-4" />تقييم رسمي</Button></Link>}{can('people.manage') && <Button size="sm" variant="outline" onClick={() => setAssigning({ doctor, siteId: doctor.primary_site_id ? String(doctor.primary_site_id) : '' })}><Building2 className="ml-1 h-4 w-4" />تعيين أو نقل</Button>}</div></article>; })}</section>
      {filteredDoctors.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-500">لا يوجد مشرفون مطابقون للبحث.</div>}</> :
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{hospitals.map((hospital) => <article key={hospital.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><header className="flex items-start justify-between gap-2"><div><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-600" /><h2 className="font-black text-slate-800">{hospital.name_ar}</h2></div><p className="mt-1 text-[10px] text-slate-500">{hospital.site_code}{hospital.city ? ` · ${hospital.city}` : ''}</p></div>{can('training_sites.manage') && <button type="button" onClick={() => openHospital(hospital)} className="rounded-xl bg-slate-50 p-2 text-slate-500"><Pencil className="h-4 w-4" /></button>}</header><div className="mt-4 space-y-2">{hospital.supervisors.length ? hospital.supervisors.map((doctor) => <div key={doctor.user_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><div className="flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-teal-600" /><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{doctor.full_name_ar}</p><p className="truncate text-[10px] text-slate-500">{doctor.email}</p></div></div>{can('people.manage') && <button type="button" onClick={() => setAssigning({ doctor, siteId: String(hospital.id) })} className="text-[10px] font-black text-teal-700">نقل</button>}</div>) : <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">لا يوجد أطباء</p>}</div></article>)}</section>}

    <Modal isOpen={doctorModal} onClose={() => setDoctorModal(false)} title="إضافة طبيب وإنشاء حساب مشرف سريري" maxWidth="lg"><form onSubmit={(event: FormEvent) => { event.preventDefault(); addDoctor.mutate(); }} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold">الاسم بالعربية</span><input required className={inputClass} value={doctorForm.full_name_ar} onChange={(e) => setDoctorForm({ ...doctorForm, full_name_ar: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">الاسم بالإنجليزية</span><input className={inputClass} value={doctorForm.full_name_en} onChange={(e) => setDoctorForm({ ...doctorForm, full_name_en: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">المستشفى</span><select required className={inputClass} value={doctorForm.primary_site_id} onChange={(e) => setDoctorForm({ ...doctorForm, primary_site_id: e.target.value })}><option value="">اختر المستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></label><label><span className="mb-1 block text-xs font-bold">التخصص</span><input className={inputClass} value={doctorForm.specialty} onChange={(e) => setDoctorForm({ ...doctorForm, specialty: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">البريد الإلكتروني</span><input required type="email" dir="ltr" className={inputClass} value={doctorForm.email} onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">كلمة المرور المؤقتة</span><input required type="password" minLength={12} dir="ltr" className={inputClass} value={doctorForm.password} onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })} /></label></div><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setDoctorModal(false)}>إلغاء</Button><Button type="submit" isLoading={addDoctor.isPending}>إضافة الطبيب</Button></div></form></Modal>
    <Modal isOpen={hospitalModal} onClose={() => setHospitalModal(false)} title={editingHospitalId ? 'تعديل المستشفى' : 'إضافة مستشفى'}><form onSubmit={(event: FormEvent) => { event.preventDefault(); saveHospital.mutate(); }} className="space-y-3"><label><span className="mb-1 block text-xs font-bold">رمز المستشفى</span><input required className={inputClass} value={hospitalForm.site_code} onChange={(e) => setHospitalForm({ ...hospitalForm, site_code: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">الاسم بالعربية</span><input required className={inputClass} value={hospitalForm.name_ar} onChange={(e) => setHospitalForm({ ...hospitalForm, name_ar: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">الاسم بالإنجليزية</span><input className={inputClass} value={hospitalForm.name_en} onChange={(e) => setHospitalForm({ ...hospitalForm, name_en: e.target.value })} /></label><label><span className="mb-1 block text-xs font-bold">المدينة</span><input className={inputClass} value={hospitalForm.city} onChange={(e) => setHospitalForm({ ...hospitalForm, city: e.target.value })} /></label><div className="flex justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" onClick={() => setHospitalModal(false)}>إلغاء</Button><Button type="submit" isLoading={saveHospital.isPending}>حفظ</Button></div></form></Modal>
    <Modal isOpen={Boolean(assigning)} onClose={() => setAssigning(null)} title={assigning ? `تعيين مستشفى — ${assigning.doctor.full_name_ar}` : ''} footer={<><Button variant="outline" onClick={() => setAssigning(null)}>إلغاء</Button><Button onClick={() => assignHospital.mutate()} isLoading={assignHospital.isPending}>حفظ</Button></>}><label><span className="mb-2 block text-xs font-black text-slate-600">المستشفى</span><select className={inputClass} value={assigning?.siteId ?? ''} onChange={(event) => setAssigning((current) => current ? { ...current, siteId: event.target.value } : null)}><option value="">بدون مستشفى</option>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name_ar}</option>)}</select></label></Modal>
  </div>;
}
