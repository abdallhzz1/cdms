import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  Mail,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { apiFetch, ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/i18n/I18nContext";

type WorkDay = {
  day: string;
  status: "work" | "leave" | "unavailable";
  note: string;
};
type WorkSchedule = {
  training_site_id: string;
  period_id: string;
  is_primary: boolean;
  valid_from: string;
  valid_until: string;
  days: WorkDay[];
};
type Doctor = {
  id: number | null;
  user_id: number;
  full_name_ar: string;
  full_name_en?: string | null;
  email: string;
  specialty?: string | null;
  primary_site_id?: number | null;
  training_site_ids?: number[];
  work_schedules?: WorkSchedule[];
};
type Hospital = {
  id: number;
  site_code: string;
  name_ar: string;
  name_en?: string | null;
  site_type: string;
  city?: string | null;
  supervisors: Doctor[];
};
type ClinicalPeriod = { id:number;academic_year_id:number;code:string;name_ar:string;name_en?:string|null;start_date:string;end_date:string;academic_year?:{id:number;code:string} };
type Workforce = { hospitals: Hospital[]; unassigned_doctors: Doctor[]; clinical_periods:ClinicalPeriod[] };
type Profile = {
  id: string;
  user_id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
  title?: string | null;
  specialty?: string | null;
  department_name?: string | null;
  contract_type?: string | null;
};

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
const weekDays = [
  "saturday",
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];
const emptySchedule = (): WorkSchedule => ({
  training_site_id: "",
  period_id: "",
  is_primary: false,
  valid_from: "",
  valid_until: "",
  days: weekDays.map((day) => ({ day, status: "unavailable", note: "" })),
});
function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;
  const validation = Object.values(error.errors)
    .flat()
    .find((value) => typeof value === "string");
  return typeof validation === "string"
    ? validation
    : error.message || fallback;
}

export function ClinicalSupervisorsDirectoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { locale } = useI18n();
  const ar = locale === "ar";
  const tr = (arabic: string, english: string) => (ar ? arabic : english);
  const dayLabel = (day: string) =>
    ({
      saturday: tr("السبت", "Saturday"), sunday: tr("الأحد", "Sunday"), monday: tr("الاثنين", "Monday"),
      tuesday: tr("الثلاثاء", "Tuesday"), wednesday: tr("الأربعاء", "Wednesday"), thursday: tr("الخميس", "Thursday"), friday: tr("الجمعة", "Friday"),
    })[day] ?? day;
  const canManageSites = can("training_sites.manage") || can("people.manage");
  const doctorName = (doctor: Doctor) =>
    ar ? doctor.full_name_ar : doctor.full_name_en || doctor.full_name_ar;
  const hospitalName = (hospital: Hospital) =>
    ar ? hospital.name_ar : hospital.name_en || hospital.name_ar;
  const siteTypeLabel = (type: string) =>
    ({
      hospital_public: tr("مستشفى حكومي", "Public hospital"),
      hospital_private: tr("مستشفى خاص", "Private hospital"),
      medical_center: tr("مركز طبي", "Medical center"),
      clinic: tr("عيادة", "Clinic"),
      lab: tr("مختبر", "Laboratory"),
      online: tr("أونلاين", "Online"),
      other: tr("أخرى", "Other"),
    })[type] ?? type;
  const [tab, setTab] = useState<"doctors" | "hospitals">("doctors");
  const [search, setSearch] = useState("");
  const [hospitalFilter, setHospitalFilter] = useState("all");
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [doctorModal, setDoctorModal] = useState(false);
  const [hospitalModal, setHospitalModal] = useState(false);
  const [editingHospitalId, setEditingHospitalId] = useState<number | null>(
    null,
  );
  const [scheduling, setScheduling] = useState<Doctor | null>(null);
  const [scheduleForm, setScheduleForm] = useState<WorkSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [doctorForm, setDoctorForm] = useState({
    full_name_ar: "",
    full_name_en: "",
    email: "",
    password: "",
    primary_site_id: "",
    specialty: "",
  });
  const [hospitalForm, setHospitalForm] = useState({
    name_ar: "",
    name_en: "",
    site_type: "hospital_public",
    city: "",
  });

  const workforceQuery = useQuery({
    queryKey: ["clinical-workforce"],
    queryFn: () => apiFetch<Workforce>("/clinical-workforce"),
  });
  const profilesQuery = useQuery({
    queryKey: ["clinical-supervisors-directory-v1"],
    queryFn: async () => {
      const response = await apiFetch<any>("/clinical-supervisors");
      return (
        Array.isArray(response) ? response : (response?.data ?? [])
      ) as Profile[];
    },
    enabled: can("people.view"),
  });
  const workforce = workforceQuery.data;
  const hospitals = workforce?.hospitals ?? [];
  const clinicalPeriods = workforce?.clinical_periods ?? [];
  const doctors = useMemo(() => {
    const map = new Map<number, Doctor>();
    hospitals.forEach((hospital) =>
      hospital.supervisors.forEach((doctor) => map.set(doctor.user_id, doctor)),
    );
    (workforce?.unassigned_doctors ?? []).forEach((doctor) =>
      map.set(doctor.user_id, doctor),
    );
    return [...map.values()].sort((a, b) =>
      a.full_name_ar.localeCompare(b.full_name_ar, "ar"),
    );
  }, [hospitals, workforce?.unassigned_doctors]);
  const profiles = useMemo(
    () =>
      new Map(
        (profilesQuery.data ?? []).map((profile) => [
          Number(profile.user_id || profile.id),
          profile,
        ]),
      ),
    [profilesQuery.data],
  );
  const filteredDoctors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return doctors.filter((doctor) => {
      const matchesSearch =
        !query ||
        doctorName(doctor).toLowerCase().includes(query) ||
        doctor.email.toLowerCase().includes(query) ||
        doctor.specialty?.toLowerCase().includes(query);
      const siteIds =
        doctor.training_site_ids ??
        (doctor.primary_site_id ? [doctor.primary_site_id] : []);
      const matchesHospital =
        hospitalFilter === "all" ||
        (hospitalFilter === "unassigned"
          ? siteIds.length === 0
          : siteIds.includes(Number(hospitalFilter)));
      return matchesSearch && matchesHospital;
    });
  }, [doctors, hospitalFilter, search]);

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["clinical-workforce"] }),
      queryClient.invalidateQueries({
        queryKey: ["clinical-supervisors-directory-v1"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["course-distribution-options"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["course-distribution-schedule"],
      }),
    ]);
  const addDoctor = useMutation({
    mutationFn: () =>
      apiFetch("/clinical-workforce/doctors", {
        method: "POST",
        body: {
          ...doctorForm,
          primary_site_id: Number(doctorForm.primary_site_id),
        },
      }),
    onSuccess: async () => {
      setDoctorModal(false);
      setDoctorForm({
        full_name_ar: "",
        full_name_en: "",
        email: "",
        password: "",
        primary_site_id: "",
        specialty: "",
      });
      await refresh();
      setNotice({
        type: "success",
        text: tr(
          "تم إنشاء الطبيب وحساب المشرف وربطه بالمستشفى.",
          "The physician account was created and linked to the hospital.",
        ),
      });
    },
    onError: (error) =>
      setNotice({
        type: "error",
        text: errorMessage(
          error,
          tr("تعذر إضافة الطبيب.", "Could not add the physician."),
        ),
      }),
  });
  const openWorkSchedules = async (doctor: Doctor) => {
    setScheduling(doctor);
    setScheduleLoading(true);
    try {
      const data = await apiFetch<{ schedules: any[] }>(
        `/clinical-workforce/doctors/${doctor.user_id}/work-schedules`,
      );
      setScheduleForm(
        (data.schedules ?? []).map((item) => ({
          training_site_id: String(item.training_site_id),
          period_id: String(clinicalPeriods.find((period)=>period.start_date===item.valid_from&&period.end_date===item.valid_until)?.id??"custom"),
          is_primary: Boolean(item.is_primary),
          valid_from: item.valid_from ?? "",
          valid_until: item.valid_until ?? "",
          days: weekDays.map((day) => {
            const saved = item.days?.find((entry: any) => entry.day === day);
            return {
              day,
              status: saved?.status ?? "unavailable",
              note: saved?.note ?? "",
            };
          }),
        })),
      );
    } catch (error) {
      setNotice({
        type: "error",
        text: errorMessage(
          error,
          tr(
            "تعذر تحميل جدول دوام المشرف.",
            "Could not load the supervisor work schedule.",
          ),
        ),
      });
      setScheduling(null);
    } finally {
      setScheduleLoading(false);
    }
  };
  const saveWorkSchedules = useMutation({
    mutationFn: () =>
      apiFetch(
        `/clinical-workforce/doctors/${scheduling!.user_id}/work-schedules`,
        {
          method: "PUT",
          body: {
            schedules: scheduleForm.map((item) => ({
              ...item,
              training_site_id: Number(item.training_site_id),
            })),
          },
        },
      ),
    onSuccess: async () => {
      setScheduling(null);
      setScheduleForm([]);
      await refresh();
      setNotice({
        type: "success",
        text: tr(
          "تم حفظ المستشفيات وأيام العمل وسيطبق التغيير في التوزيع مباشرة.",
          "Hospitals and work days were saved and will apply to distribution immediately.",
        ),
      });
    },
    onError: (error) =>
      setNotice({
        type: "error",
        text: errorMessage(
          error,
          tr("تعذر حفظ جدول الدوام.", "Could not save the work schedule."),
        ),
      }),
  });
  const saveHospital = useMutation({
    mutationFn: () =>
      apiFetch<Hospital>(
        editingHospitalId
          ? `/training-sites/${editingHospitalId}`
          : "/training-sites",
        { method: editingHospitalId ? "PUT" : "POST", body: hospitalForm },
      ),
    onSuccess: async (site: Hospital) => {
      setHospitalModal(false);
      setEditingHospitalId(null);
      setHospitalForm({
        name_ar: "",
        name_en: "",
        site_type: "hospital_public",
        city: "",
      });
      await refresh();
      setNotice({
        type: "success",
        text: tr(
          `تم حفظ الموقع بالرمز ${site.site_code}.`,
          `Site saved with code ${site.site_code}.`,
        ),
      });
    },
    onError: (error) =>
      setNotice({
        type: "error",
        text: errorMessage(
          error,
          tr("تعذر حفظ المستشفى.", "Could not save the hospital."),
        ),
      }),
  });
  const openHospital = (hospital?: Hospital) => {
    setEditingHospitalId(hospital?.id ?? null);
    setHospitalForm(
      hospital
        ? {
            name_ar: hospital.name_ar,
            name_en: hospital.name_en ?? "",
            site_type: hospital.site_type,
            city: hospital.city ?? "",
          }
        : { name_ar: "", name_en: "", site_type: "hospital_public", city: "" },
    );
    setHospitalModal(true);
  };

  if (workforceQuery.isLoading) return <LoadingState />;
  if (workforceQuery.isError)
    return (
      <ErrorState
        message={tr(
          "تعذر تحميل المستشفيات والمشرفين السريريين.",
          "Clinical supervisors and hospitals could not be loaded.",
        )}
        onRetry={() => workforceQuery.refetch()}
      />
    );

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title={tr(
          "دليل المشرفين والمواقع التدريبية",
          "Supervisors and training sites directory",
        )}
        description={tr(
          "دليل تشغيلي موحّد لملفات المشرفين وتخصصاتهم وربطهم بالمستشفيات أو المواقع الأونلاين المستخدمة في التوزيع السريري.",
          "An operational directory of supervisors, specialties, and hospital or online training-site links used by clinical distribution.",
        )}
      >
        {can("clinical_supervisor_evaluations.view") && (
          <Link to="/clinical-supervisor-evaluations">
            <Button variant="outline">
              <ShieldCheck className="me-1 h-4 w-4" />
              {tr("تقييمات المشرفين", "Supervisor evaluations")}
            </Button>
          </Link>
        )}
      </PageHeader>
      {notice && (
        <div
          className={`flex items-start justify-between rounded-2xl border p-4 text-xs font-bold ${notice.type === "success" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-red-200 bg-red-50 text-red-800"}`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setTab("doctors")}
              className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === "doctors" ? "bg-teal-600 text-white shadow-sm" : "text-slate-500"}`}
            >
              <Users className="me-1 inline h-4 w-4" />
              {tr("المشرفون", "Supervisors")}
            </button>
            <button
              type="button"
              onClick={() => setTab("hospitals")}
              className={`rounded-xl px-4 py-2.5 text-xs font-black ${tab === "hospitals" ? "bg-teal-600 text-white shadow-sm" : "text-slate-500"}`}
            >
              <Building2 className="me-1 inline h-4 w-4" />
              {tr("المواقع التدريبية", "Training sites")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManageSites && (
              <Button variant="outline" onClick={() => openHospital()}>
                <Plus className="me-1 h-4 w-4" />
                {tr("إضافة موقع تدريبي", "Add training site")}
              </Button>
            )}
            {can("people.manage") && (
              <Button onClick={() => setDoctorModal(true)}>
                <Plus className="me-1 h-4 w-4" />
                {tr("إضافة طبيب وحساب", "Add physician and account")}
              </Button>
            )}
          </div>
        </div>
      </section>

      {tab === "doctors" ? (
        <>
          <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_15rem_auto]">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full bg-transparent text-xs font-bold outline-none"
                placeholder={tr(
                  "بحث بالاسم أو البريد أو التخصص...",
                  "Search by name, email, or specialty...",
                )}
              />
            </label>
            <select
              value={hospitalFilter}
              onChange={(event) => setHospitalFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">
                {tr("جميع المستشفيات", "All hospitals")}
              </option>
              <option value="unassigned">
                {tr("بدون مستشفى", "No hospital")}
              </option>
              {hospitals.map((hospital) => (
                <option key={hospital.id} value={hospital.id}>
                  {hospitalName(hospital)}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-center rounded-xl bg-teal-50 px-4 text-xs font-bold text-teal-800">
              {tr(
                `المعروضون: ${filteredDoctors.length}`,
                `Shown: ${filteredDoctors.length}`,
              )}
            </div>
          </section>
          <section className="grid gap-3 md:hidden">
            {filteredDoctors.map((doctor) => {
              const profile = profiles.get(doctor.user_id);
              const doctorHospitals = hospitals.filter(
                (hospital) =>
                  (doctor.training_site_ids ?? []).includes(hospital.id) ||
                  doctor.primary_site_id === hospital.id,
              );
              return (
                <article
                  key={doctor.user_id}
                  className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/clinical-supervisors/${doctor.user_id}`)
                    }
                    className="flex w-full items-start gap-3 text-right"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-teal-100 bg-teal-50 text-sm font-black text-teal-700">
                      {profile?.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt={doctorName(doctor)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        doctorName(doctor).slice(0, 1)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-black text-slate-800">
                        {doctorName(doctor)}
                      </h2>
                      <p
                        dir="ltr"
                        className="mt-1 truncate text-left text-[10px] text-slate-500"
                      >
                        {doctor.email}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {doctorHospitals.length ? (
                          doctorHospitals.map((hospital) => (
                            <span
                              key={hospital.id}
                              className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700"
                            >
                              {hospitalName(hospital)}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                            بدون مستشفى
                          </span>
                        )}
                        <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                          {doctor.specialty ||
                            profile?.specialty ||
                            "التخصص غير محدد"}
                        </span>
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(`/clinical-supervisors/${doctor.user_id}`)
                      }
                    >
                      <ShieldCheck className="ml-1 h-4 w-4" />
                      فتح الملف
                    </Button>
                    {can("clinical_supervisor_evaluations.create") && (
                      <Link
                        to={`/clinical-supervisor-evaluations?supervisor=${doctor.user_id}`}
                      >
                        <Button size="sm" variant="outline">
                          تقييم رسمي
                        </Button>
                      </Link>
                    )}
                    {can("people.manage") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openWorkSchedules(doctor)}
                      >
                        <CalendarDays className="ml-1 h-4 w-4" />
                        أماكن وأيام العمل
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="px-5 py-4">المشرف السريري</th>
                    <th className="px-5 py-4">المستشفى أو الموقع</th>
                    <th className="px-5 py-4">التخصص والدرجة</th>
                    <th className="px-5 py-4">بيانات التواصل</th>
                    <th className="px-5 py-4 text-center">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDoctors.map((doctor) => {
                    const profile = profiles.get(doctor.user_id);
                    const doctorHospitals = hospitals.filter(
                      (hospital) =>
                        (doctor.training_site_ids ?? []).includes(
                          hospital.id,
                        ) || doctor.primary_site_id === hospital.id,
                    );
                    return (
                      <tr key={doctor.user_id} className="hover:bg-teal-50/40">
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/clinical-supervisors/${doctor.user_id}`,
                              )
                            }
                            className="group flex items-center gap-3 text-right"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-teal-100 bg-teal-50 font-black text-teal-700">
                              {profile?.avatar_url ? (
                                <img
                                  src={profile.avatar_url}
                                  alt={doctorName(doctor)}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                doctorName(doctor).slice(0, 1)
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-black text-slate-800 transition group-hover:text-teal-700">
                                {doctorName(doctor)}
                              </span>
                              {doctor.full_name_en && (
                                <span
                                  dir="ltr"
                                  className="mt-1 block text-left text-[10px] text-slate-400"
                                >
                                  {doctor.full_name_en}
                                </span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          {doctorHospitals.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {doctorHospitals.map((hospital) => (
                                <span
                                  key={hospital.id}
                                  className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 font-bold text-teal-700"
                                >
                                  <Building2 className="h-3.5 w-3.5" />
                                  {hospitalName(hospital)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-600">
                              بدون مستشفى
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-bold text-slate-700">
                            {doctor.specialty ||
                              profile?.specialty ||
                              "غير محدد"}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {profile?.title ||
                              profile?.contract_type ||
                              "الدرجة غير محددة"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <a
                            href={`mailto:${doctor.email}`}
                            dir="ltr"
                            className="inline-flex items-center gap-1.5 text-left font-mono text-[10px] text-slate-500 hover:text-teal-700"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {doctor.email}
                          </a>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap justify-center gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                navigate(
                                  `/clinical-supervisors/${doctor.user_id}`,
                                )
                              }
                            >
                              <ShieldCheck className="ml-1 h-4 w-4" />
                              فتح الملف
                            </Button>
                            {can("clinical_supervisor_evaluations.create") && (
                              <Link
                                to={`/clinical-supervisor-evaluations?supervisor=${doctor.user_id}`}
                              >
                                <Button size="sm" variant="outline">
                                  تقييم رسمي
                                </Button>
                              </Link>
                            )}
                            {can("people.manage") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWorkSchedules(doctor)}
                              >
                                <CalendarDays className="ml-1 h-4 w-4" />
                                أماكن وأيام العمل
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          {filteredDoctors.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-500">
              لا يوجد مشرفون مطابقون للبحث.
            </div>
          )}
        </>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hospitals.map((hospital) => (
            <article
              key={hospital.id}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <header className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-teal-600" />
                    <h2 className="font-black text-slate-800">
                      {hospitalName(hospital)}
                    </h2>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">
                      {hospital.site_code}
                      {hospital.city ? ` · ${hospital.city}` : ""}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${hospital.site_type === "online" ? "bg-violet-50 text-violet-700" : "bg-teal-50 text-teal-700"}`}
                    >
                      {siteTypeLabel(hospital.site_type)}
                    </span>
                  </div>
                </div>
                {canManageSites && (
                  <button
                    type="button"
                    onClick={() => openHospital(hospital)}
                    className="rounded-xl bg-slate-50 p-2 text-slate-500"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </header>
              <div className="mt-4 space-y-2">
                {hospital.supervisors.length ? (
                  hospital.supervisors.map((doctor) => (
                    <div
                      key={doctor.user_id}
                      className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <UserRound className="h-4 w-4 shrink-0 text-teal-600" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-800">
                            {doctorName(doctor)}
                          </p>
                          <p className="truncate text-[10px] text-slate-500">
                            {doctor.email}
                          </p>
                        </div>
                      </div>
                      {can("people.manage") && (
                        <button
                          type="button"
                          onClick={() => openWorkSchedules(doctor)}
                          className="text-[10px] font-black text-teal-700"
                        >
                          إدارة الدوام
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                    لا يوجد أطباء
                  </p>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <Modal
        isOpen={doctorModal}
        onClose={() => setDoctorModal(false)}
        title={tr(
          "إضافة طبيب وإنشاء حساب مشرف سريري",
          "Add physician and clinical supervisor account",
        )}
        maxWidth="lg"
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            addDoctor.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("الاسم بالعربية", "Arabic name")}
              </span>
              <input
                required
                className={inputClass}
                value={doctorForm.full_name_ar}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, full_name_ar: e.target.value })
                }
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("الاسم بالإنجليزية", "English name")}
              </span>
              <input
                className={inputClass}
                value={doctorForm.full_name_en}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, full_name_en: e.target.value })
                }
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("المستشفى", "Hospital")}
              </span>
              <select
                required
                className={inputClass}
                value={doctorForm.primary_site_id}
                onChange={(e) =>
                  setDoctorForm({
                    ...doctorForm,
                    primary_site_id: e.target.value,
                  })
                }
              >
                <option value="">
                  {tr("اختر المستشفى", "Select hospital")}
                </option>
                {hospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospitalName(hospital)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("التخصص", "Specialty")}
              </span>
              <input
                className={inputClass}
                value={doctorForm.specialty}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, specialty: e.target.value })
                }
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("البريد الإلكتروني", "Email")}
              </span>
              <input
                required
                type="email"
                dir="ltr"
                className={inputClass}
                value={doctorForm.email}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, email: e.target.value })
                }
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("كلمة المرور المؤقتة", "Temporary password")}
              </span>
              <input
                required
                type="password"
                minLength={12}
                dir="ltr"
                className={inputClass}
                value={doctorForm.password}
                onChange={(e) =>
                  setDoctorForm({ ...doctorForm, password: e.target.value })
                }
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDoctorModal(false)}
            >
              {tr("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" isLoading={addDoctor.isPending}>
              {tr("إضافة الطبيب", "Add physician")}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        isOpen={hospitalModal}
        onClose={() => setHospitalModal(false)}
        title={
          editingHospitalId
            ? tr("تعديل الموقع التدريبي", "Edit training site")
            : tr("إضافة موقع تدريبي", "Add training site")
        }
      >
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            saveHospital.mutate();
          }}
          className="space-y-3"
        >
          <label>
            <span className="mb-1 block text-xs font-bold">
              {tr("نوع الموقع", "Site type")}
            </span>
            <select
              className={inputClass}
              value={hospitalForm.site_type}
              onChange={(e) =>
                setHospitalForm({ ...hospitalForm, site_type: e.target.value })
              }
            >
              <option value="hospital_public">
                {tr("مستشفى حكومي", "Public hospital")}
              </option>
              <option value="hospital_private">
                {tr("مستشفى خاص", "Private hospital")}
              </option>
              <option value="medical_center">
                {tr("مركز طبي", "Medical center")}
              </option>
              <option value="clinic">{tr("عيادة", "Clinic")}</option>
              <option value="lab">{tr("مختبر", "Laboratory")}</option>
              <option value="online">{tr("أونلاين", "Online")}</option>
              <option value="other">{tr("أخرى", "Other")}</option>
            </select>
          </label>
          {!editingHospitalId && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              {tr(
                "سيُنشأ رمز الموقع تلقائيًا عند الحفظ.",
                "The site code will be created automatically when saved.",
              )}
            </p>
          )}
          <label>
            <span className="mb-1 block text-xs font-bold">
              {tr("الاسم بالعربية", "Arabic name")}
            </span>
            <input
              required
              className={inputClass}
              value={hospitalForm.name_ar}
              onChange={(e) =>
                setHospitalForm({ ...hospitalForm, name_ar: e.target.value })
              }
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold">
              {tr("الاسم بالإنجليزية", "English name")}
            </span>
            <input
              className={inputClass}
              value={hospitalForm.name_en}
              onChange={(e) =>
                setHospitalForm({ ...hospitalForm, name_en: e.target.value })
              }
            />
          </label>
          {hospitalForm.site_type !== "online" && (
            <label>
              <span className="mb-1 block text-xs font-bold">
                {tr("المدينة", "City")}
              </span>
              <input
                className={inputClass}
                value={hospitalForm.city}
                onChange={(e) =>
                  setHospitalForm({ ...hospitalForm, city: e.target.value })
                }
              />
            </label>
          )}
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setHospitalModal(false)}
            >
              {tr("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" isLoading={saveHospital.isPending}>
              {tr("حفظ", "Save")}
            </Button>
          </div>
        </form>
      </Modal>
      <WorkScheduleModal doctor={scheduling} schedules={scheduleForm} hospitals={hospitals} clinicalPeriods={clinicalPeriods} loading={scheduleLoading} saving={saveWorkSchedules.isPending} tr={tr} dayLabel={dayLabel} hospitalName={hospitalName} onChange={setScheduleForm} onClose={()=>{setScheduling(null);setScheduleForm([])}} onSave={()=>saveWorkSchedules.mutate()}/>
    </div>
  );
}

function WorkScheduleModal({doctor,schedules,hospitals,clinicalPeriods,loading,saving,tr,dayLabel,hospitalName,onChange,onClose,onSave}:{doctor:Doctor|null;schedules:WorkSchedule[];hospitals:Hospital[];clinicalPeriods:ClinicalPeriod[];loading:boolean;saving:boolean;tr:(a:string,e:string)=>string;dayLabel:(day:string)=>string;hospitalName:(site:Hospital)=>string;onChange:(value:WorkSchedule[])=>void;onClose:()=>void;onSave:()=>void}) {
  const update=(index:number,patch:Partial<WorkSchedule>)=>onChange(schedules.map((item,i)=>i===index?{...item,...patch}:item));
  const updateDay=(index:number,dayIndex:number,patch:Partial<WorkDay>)=>update(index,{days:schedules[index].days.map((item,i)=>i===dayIndex?{...item,...patch}:item)});
  const schedulesWithoutWork = schedules.filter((schedule) => !schedule.days.some((day) => day.status === 'work'));
  return <Modal isOpen={Boolean(doctor)} onClose={onClose} title={doctor?`${tr('أماكن وأيام عمل المشرف','Supervisor workplaces and working days')} — ${doctor.full_name_ar}`:''} maxWidth="2xl">
    {loading?<LoadingState/>:<div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs font-bold leading-6 text-teal-900">{tr('اختر الفترة السريرية وسيملأ النظام تاريخها تلقائيًا. استخدم فترة مخصصة فقط عند وجود دوام استثنائي.','Select a clinical period and its dates will be filled automatically. Use a custom range only for exceptional schedules.')}</p><Button type="button" variant="outline" onClick={()=>onChange([...schedules,emptySchedule()])}><Plus className="me-1 h-4 w-4"/>{tr('إضافة ارتباط','Add workplace')}</Button></div>
      {!schedules.length&&<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs font-bold text-slate-500">{tr('لا توجد أماكن عمل محددة.','No workplaces configured.')}</div>}
      {schedules.map((schedule,index)=><section key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><label><span className="mb-1 block text-[11px] font-black text-slate-600">{tr('المستشفى','Hospital')}</span><select className={inputClass} value={schedule.training_site_id} onChange={event=>update(index,{training_site_id:event.target.value})}><option value="">{tr('اختر المستشفى','Select hospital')}</option>{hospitals.map(site=><option key={site.id} value={site.id}>{hospitalName(site)}</option>)}</select></label><label><span className="mb-1 block text-[11px] font-black text-slate-600">{tr('الفترة السريرية','Clinical period')}</span><select className={inputClass} value={schedule.period_id} onChange={event=>{const value=event.target.value;const period=clinicalPeriods.find(item=>String(item.id)===value);update(index,{period_id:value,valid_from:period?.start_date??'',valid_until:period?.end_date??''})}}><option value="">{tr('اختر الفترة','Select period')}</option>{clinicalPeriods.map(period=><option key={period.id} value={period.id}>{period.academic_year?.code?`${period.academic_year.code} — `:''}{tr(period.name_ar,period.name_en||period.name_ar)}</option>)}<option value="custom">{tr('فترة مخصصة (استثنائية)','Custom range (exception)')}</option></select></label><div className="flex items-end gap-2"><label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[11px] font-bold"><input type="radio" name="primary-work-site" checked={schedule.is_primary} onChange={()=>onChange(schedules.map((item,i)=>({...item,is_primary:i===index})))}/>{tr('رئيسي','Primary')}</label><button type="button" onClick={()=>onChange(schedules.filter((_,i)=>i!==index))} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-100 text-red-500"><Trash2 className="h-4 w-4"/></button></div></div>{schedule.period_id&&schedule.period_id!=='custom'&&<p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">{tr('صلاحية الدوام:','Schedule validity:')} {schedule.valid_from} — {schedule.valid_until}</p>}{schedule.period_id==='custom'&&<div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-[11px] font-black text-slate-600">{tr('من تاريخ','Valid from')}</span><input type="date" className={inputClass} value={schedule.valid_from} onChange={event=>update(index,{valid_from:event.target.value})}/></label><label><span className="mb-1 block text-[11px] font-black text-slate-600">{tr('إلى تاريخ','Valid until')}</span><input type="date" className={inputClass} value={schedule.valid_until} onChange={event=>update(index,{valid_until:event.target.value})}/></label></div>}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{schedule.days.map((entry,dayIndex)=><div key={entry.day} className={`rounded-xl border p-3 ${entry.status==='work'?'border-teal-200 bg-teal-50':entry.status==='leave'?'border-amber-200 bg-amber-50':'border-slate-200 bg-slate-50'}`}><p className="mb-2 text-xs font-black">{dayLabel(entry.day)}</p><select className={inputClass} value={entry.status} onChange={event=>updateDay(index,dayIndex,{status:event.target.value as WorkDay['status']})}><option value="work">{tr('دوام','Working')}</option><option value="leave">{tr('إجازة','Leave')}</option><option value="unavailable">{tr('غير متاح','Unavailable')}</option></select><input className={`${inputClass} mt-2`} value={entry.note} onChange={event=>updateDay(index,dayIndex,{note:event.target.value})} placeholder={tr('مثال: مؤتمر، OFF','Example: conference, OFF')}/></div>)}</div>
      </section>)}
      {schedulesWithoutWork.length>0&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-6 text-amber-800">{tr('كل ارتباط يحتاج يومًا واحدًا على الأقل بحالة «دوام». الارتباط الذي تكون جميع أيامه إجازة أو غير متاح لن يجعل المشرف متاحًا في شاشة التوزيع.','Every workplace needs at least one day marked Working. A workplace whose days are all Leave or Unavailable will not make the supervisor selectable in distribution.')}</p>}
      <div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" onClick={onClose}>{tr('إلغاء','Cancel')}</Button><Button onClick={onSave} isLoading={saving} disabled={schedules.some(item=>!item.training_site_id||!item.period_id||!item.valid_from||!item.valid_until)||schedulesWithoutWork.length>0}>{tr('حفظ جدول الدوام','Save work schedule')}</Button></div>
    </div>}
  </Modal>;
}
