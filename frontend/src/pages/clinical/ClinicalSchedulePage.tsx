import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ProfilePhotoLightbox } from "@/components/ui/ProfilePhotoLightbox";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FilterX,
  Info,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ClinicalScheduleItem,
  PaginatedResponse,
} from "@/api/distribution";

type PortalStatus = {
  is_enabled: boolean;
  public_url: string;
  updated_at: string | null;
  updated_by: { name: string } | null;
};
type DashboardOptions = {
  rotations: {
    id: number;
    name: string;
    name_en: string;
    code: string;
    academic_level: string;
    academic_year_id: number;
    academic_year: string;
    clinical_period_id: number | null;
    clinical_period: {
      id: number;
      academic_year_id: number;
      code: string;
      name_ar: string;
      name_en: string | null;
      sequence: number;
    } | null;
  }[];
  periods: {
    id: number;
    academic_year_id: number;
    code: string;
    name_ar: string;
    name_en: string | null;
    sequence: number;
  }[];
  academic_years: { id: number; code: string }[];
  sites: { id: number; name_ar: string; name_en: string | null }[];
};
const levels: Record<string, { ar: string; en: string }> = {
  fourth: { ar: "السنة الرابعة", en: "Fourth year" },
  fifth: { ar: "السنة الخامسة", en: "Fifth year" },
  sixth: { ar: "السنة السادسة", en: "Sixth year" },
};

export function ClinicalSchedulePage() {
  const { can, user } = useAuth();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [rotationFilter, setRotationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const hasAccess = can("clinical_schedule.view");
  const canManagePortal = can("distribution.student_portal.manage");

  const params = new URLSearchParams({ page: String(page), per_page: "50" });
  if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
  if (yearFilter) params.set("academic_year_id", yearFilter);
  if (periodFilter) params.set("clinical_period_id", periodFilter);
  if (siteFilter) params.set("training_site_id", siteFilter);
  if (levelFilter) params.set("academic_level", levelFilter);
  if (rotationFilter) params.set("rotation_id", rotationFilter);

  const scheduleQuery = useQuery({
    queryKey: [
      "clinical-schedule",
      page,
      debouncedSearch,
      yearFilter,
      periodFilter,
      siteFilter,
      levelFilter,
      rotationFilter,
    ],
    queryFn: () =>
      apiFetch<PaginatedResponse<ClinicalScheduleItem>>(
        `/operational/clinical-schedule?${params}`,
      ),
    enabled: hasAccess,
    placeholderData: (previous) => previous,
  });
  const optionsQuery = useQuery({
    queryKey: ["clinical-schedule-options"],
    queryFn: () =>
      apiFetch<DashboardOptions>("/operational/clinical-schedule-options"),
    enabled: hasAccess,
  });
  const portalQuery = useQuery({
    queryKey: ["student-schedule-portal"],
    queryFn: () => apiFetch<PortalStatus>("/student-schedule-portal"),
    enabled: hasAccess,
  });
  const togglePortal = useMutation({
    mutationFn: (is_enabled: boolean) =>
      apiFetch<PortalStatus>("/student-schedule-portal", {
        method: "PUT",
        body: { is_enabled },
      }),
    onSuccess: async (data) => {
      setActionError("");
      setNotice(
        data.is_enabled
          ? locale === "ar"
            ? "تم تفعيل رابط الطالب بنجاح."
            : "Student portal enabled successfully."
          : locale === "ar"
            ? "تم تعطيل رابط الطالب ومنع الاستعلام فوراً."
            : "Student portal disabled and lookup access ended immediately.",
      );
      await qc.invalidateQueries({ queryKey: ["student-schedule-portal"] });
    },
    onError: (error) => {
      setNotice("");
      setActionError(
        error instanceof ApiError
          ? error.message
          : locale === "ar"
            ? "تعذر تحديث حالة الرابط."
            : "Unable to update portal status.",
      );
    },
  });

  const copyLink = async () => {
    const url = `${location.origin}${portalQuery.data?.public_url || "/portal/student-lookup"}`;
    await navigator.clipboard.writeText(url);
    setNotice(
      locale === "ar" ? "تم نسخ رابط الطالب." : "Student portal link copied.",
    );
    setActionError("");
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setYearFilter("");
    setPeriodFilter("");
    setSiteFilter("");
    setLevelFilter("");
    setRotationFilter("");
    setPage(1);
  };
  const options = optionsQuery.data;
  const schedule = scheduleQuery.data;
  const items = schedule?.data ?? [];
  const portal = portalQuery.data;
  const filteredPeriods = useMemo(
    () =>
      options?.periods.filter(
        (period) =>
          !yearFilter || String(period.academic_year_id) === yearFilter,
      ) ?? [],
    [options, yearFilter],
  );
  const filteredRotations = useMemo(
    () =>
      options?.rotations.filter(
        (rotation) =>
          (!yearFilter || String(rotation.academic_year_id) === yearFilter) &&
          (!periodFilter ||
            String(rotation.clinical_period_id) === periodFilter) &&
          (!levelFilter || rotation.academic_level === levelFilter),
      ) ?? [],
    [options, yearFilter, periodFilter, levelFilter],
  );
  const visibleLevels = Object.entries(levels).filter(
    ([value]) =>
      !user?.roles.includes("RTA") ||
      (user.assigned_levels ?? []).includes(value),
  );
  const formatDate = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
          day: "numeric",
          month: "short",
        }).format(new Date(`${value}T00:00:00`))
      : "—";
  const dayNames: Record<string, { ar: string; en: string }> = {
    saturday: { ar: "السبت", en: "Saturday" },
    sunday: { ar: "الأحد", en: "Sunday" },
    monday: { ar: "الاثنين", en: "Monday" },
    tuesday: { ar: "الثلاثاء", en: "Tuesday" },
    wednesday: { ar: "الأربعاء", en: "Wednesday" },
    thursday: { ar: "الخميس", en: "Thursday" },
    friday: { ar: "الجمعة", en: "Friday" },
  };
  const workDays = (item: ClinicalScheduleItem) =>
    item.supervisor?.work_schedule
      ?.filter((day) => day.status === "work")
      .map((day) => dayNames[day.day]?.[locale] || day.day)
      .join(locale === "ar" ? "، " : ", ") || "";
  const locationDays = (
    days: NonNullable<
      NonNullable<ClinicalScheduleItem["supervisor"]>["work_locations"]
    >[number]["days"],
  ) =>
    days
      .filter((day) => day.status === "work")
      .map((day) => dayNames[day.day]?.[locale] || day.day)
      .join(locale === "ar" ? "، " : ", ");

  if (!hasAccess)
    return (
      <ErrorState
        title={locale === "ar" ? "غير مصرح" : "Access denied"}
        message={
          locale === "ar"
            ? "تحتاج صلاحية عرض الجدول السريري."
            : "You need clinical schedule view permission."
        }
      />
    );
  if (
    scheduleQuery.isLoading ||
    optionsQuery.isLoading ||
    portalQuery.isLoading
  )
    return <LoadingState />;
  if (scheduleQuery.isError || optionsQuery.isError || portalQuery.isError)
    return (
      <ErrorState
        onRetry={() => {
          scheduleQuery.refetch();
          optionsQuery.refetch();
          portalQuery.refetch();
        }}
      />
    );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 pb-12">
      <PageHeader
        title={
          locale === "ar"
            ? "الجدول السريري الإداري"
            : "Administrative Clinical Schedule"
        }
        description={
          locale === "ar"
            ? "مركز متابعة التعيينات المنشورة وإدارة بوابة استعلام الطلبة."
            : "Monitor published assignments and manage the student lookup portal."
        }
      />

      {notice && (
        <div className="flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 p-3 text-xs font-bold text-teal-800">
          <Check className="h-4 w-4" />
          {notice}
        </div>
      )}
      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">
          {actionError}
        </div>
      )}

      <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span
            className={`grid h-9 w-9 place-items-center rounded-xl ${portal?.is_enabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-500"}`}
          >
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <b className="text-xs text-slate-900">
              {locale === "ar"
                ? "بوابة استعلام الطلبة"
                : "Student lookup portal"}
            </b>
            <span
              className={`ms-2 rounded-full px-2 py-0.5 text-[9px] font-black ${portal?.is_enabled ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600"}`}
            >
              {portal?.is_enabled
                ? locale === "ar"
                  ? "مفعّلة"
                  : "Enabled"
                : locale === "ar"
                  ? "متوقفة"
                  : "Disabled"}
            </span>
            <p className="mt-0.5 truncate text-[10px] text-slate-400" dir="ltr">
              {location.origin}
              {portal?.public_url}
            </p>
          </div>
          <span className="text-[10px] font-bold text-teal-700">
            {locale === "ar" ? "إدارة الرابط" : "Manage portal"}
          </span>
        </summary>
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          <p className="mb-3 text-[10px] leading-5 text-slate-500">
            {locale === "ar"
              ? "الدخول محمي برمز تحقق على البريد الجامعي. تعطيل الرابط ينهي جلسات الاستعلام فورًا."
              : "Access is protected by university-email OTP. Disabling the portal ends lookup sessions immediately."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyLink}>
              <Copy className="me-1 h-4 w-4" />
              {locale === "ar" ? "نسخ الرابط" : "Copy link"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  portal?.public_url || "/portal/student-lookup",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              <ExternalLink className="me-1 h-4 w-4" />
              {locale === "ar" ? "فتح الرابط" : "Open link"}
            </Button>
            {canManagePortal && (
              <Button
                variant={portal?.is_enabled ? "danger" : "primary"}
                isLoading={togglePortal.isPending}
                onClick={() => togglePortal.mutate(!portal?.is_enabled)}
              >
                {portal?.is_enabled
                  ? locale === "ar"
                    ? "تعطيل الرابط"
                    : "Disable portal"
                  : locale === "ar"
                    ? "تفعيل الرابط"
                    : "Enable portal"}
              </Button>
            )}
          </div>
        </div>
      </details>

      <Card className="rounded-2xl border border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
          <div className="relative">
            <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={
                locale === "ar"
                  ? "بحث باسم الطالب أو رقمه..."
                  : "Search by student name or number..."
              }
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pe-10 ps-3 text-xs outline-none focus:border-teal-500 focus:bg-white"
            />
          </div>
          <select
            value={yearFilter}
            onChange={(event) => {
              setYearFilter(event.target.value);
              setPeriodFilter("");
              setRotationFilter("");
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"
          >
            <option value="">
              {locale === "ar" ? "كل الأعوام الأكاديمية" : "All academic years"}
            </option>
            {options?.academic_years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.code}
              </option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(event) => {
              setPeriodFilter(event.target.value);
              setRotationFilter("");
              setPage(1);
            }}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"
          >
            <option value="">
              {locale === "ar" ? "كل الفترات السريرية" : "All clinical periods"}
            </option>
            {filteredPeriods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.code} —{" "}
                {locale === "ar"
                  ? period.name_ar
                  : period.name_en || period.name_ar}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={resetFilters}>
            <FilterX className="me-1 h-4 w-4" />
            {locale === "ar" ? "مسح جميع التصنيفات" : "Clear all filters"}
          </Button>
        </div>
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-black text-slate-600">
            <SlidersHorizontal className="h-4 w-4 text-teal-700" />
            {locale === "ar"
              ? "فلاتر إضافية: المستوى، المساق، المستشفى"
              : "More filters: level, course, hospital"}
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <select
              value={levelFilter}
              onChange={(event) => {
                setLevelFilter(event.target.value);
                setRotationFilter("");
                setPage(1);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"
            >
              <option value="">
                {locale === "ar"
                  ? "كل المستويات المعيّنة"
                  : "All assigned levels"}
              </option>
              {visibleLevels.map(([value, label]) => (
                <option key={value} value={value}>
                  {locale === "ar" ? label.ar : label.en}
                </option>
              ))}
            </select>
            <select
              value={rotationFilter}
              onChange={(event) => {
                setRotationFilter(event.target.value);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"
            >
              <option value="">
                {locale === "ar"
                  ? "كل المساقات المنشورة"
                  : "All published courses"}
              </option>
              {filteredRotations.map((rotation) => (
                <option key={rotation.id} value={rotation.id}>
                  {rotation.code} — {rotation.name} ({rotation.academic_year})
                </option>
              ))}
            </select>
            <select
              value={siteFilter}
              onChange={(event) => {
                setSiteFilter(event.target.value);
                setPage(1);
              }}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs"
            >
              <option value="">
                {locale === "ar" ? "كل المستشفيات" : "All hospitals"}
              </option>
              {options?.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {locale === "ar"
                    ? site.name_ar
                    : site.name_en || site.name_ar}
                </option>
              ))}
            </select>
          </div>
        </details>
      </Card>

      {!items.length ? (
        <EmptyState
          title={locale === "ar" ? "لا توجد نتائج" : "No results"}
          message={
            locale === "ar"
              ? "لا توجد تعيينات منشورة تطابق الفلاتر. تأكد من توزيع مجموعة طلاب داخل خلية أسبوعية ثم نشر النسخة."
              : "No published assignments match the filters. Assign a student group to a weekly cell, then publish the version."
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-start">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black text-slate-500">
                    {[
                      locale === "ar" ? "الطالب" : "Student",
                      locale === "ar" ? "التدريب" : "Training",
                      locale === "ar" ? "المجموعة والأسبوع" : "Group & week",
                      locale === "ar" ? "الموقع والمشرف" : "Site & supervisor",
                    ].map((label) => (
                      <th key={label} className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const studentName =
                      (locale === "ar"
                        ? item.student?.full_name_ar
                        : item.student?.full_name_en ||
                          item.student?.full_name_ar) || "—";
                    const supervisorName =
                      (locale === "ar"
                        ? item.supervisor?.full_name_ar
                        : item.supervisor?.full_name_en ||
                          item.supervisor?.full_name_ar) ||
                      (locale === "ar" ? "شاغر" : "Vacant");
                    return (
                      <tr
                        key={item.assignment_id}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <ProfilePhotoLightbox
                              photoUrl={item.student?.photo_url}
                              name={studentName}
                              subtitle={item.student?.university_number}
                              enlargeLabel={
                                locale === "ar"
                                  ? "تكبير صورة الطالب"
                                  : "Enlarge student photo"
                              }
                              size="sm"
                            />
                            <div>
                              <p className="max-w-[190px] truncate text-xs font-black">
                                {studentName}
                              </p>
                              <p
                                dir="ltr"
                                className="mt-0.5 text-start font-mono text-[9px] text-slate-400"
                              >
                                {item.student?.university_number}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-bold">
                            {locale === "ar"
                              ? item.course?.name_ar
                              : item.course?.name_en ||
                                item.course?.name_ar ||
                                item.rotation?.name}
                          </p>
                          <p className="mt-1 text-[9px] text-slate-500">
                            {item.course?.code || item.rotation?.code} ·{" "}
                            {item.clinical_period
                              ? locale === "ar"
                                ? item.clinical_period.name_ar
                                : item.clinical_period.name_en ||
                                  item.clinical_period.name_ar
                              : locale === "ar"
                                ? "سنوي"
                                : "Annual"}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <b className="text-xs">
                            {item.group?.name || "—"} /{" "}
                            {item.subgroup?.name || "—"}
                          </b>
                          <p className="mt-1 text-[9px] text-slate-500">
                            {item.block?.block_code || "—"} ·{" "}
                            {formatDate(item.block?.start_date)} —{" "}
                            {formatDate(item.block?.end_date)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <ProfilePhotoLightbox
                              photoUrl={item.supervisor?.avatar_url}
                              name={supervisorName}
                              enlargeLabel={
                                locale === "ar"
                                  ? "تكبير صورة المشرف"
                                  : "Enlarge supervisor photo"
                              }
                              size="sm"
                            />
                            <div>
                              <b className="block text-xs">{supervisorName}</b>
                              <p className="mt-0.5 text-[9px] font-bold text-slate-500">
                                {locale === "ar"
                                  ? item.training_site?.name_ar
                                  : item.training_site?.name_en ||
                                    item.training_site?.name_ar ||
                                    "—"}
                              </p>
                              {item.supervisor && (
                                <details className="relative mt-1">
                                  <summary className="flex cursor-pointer list-none items-center gap-1 text-[9px] font-bold text-teal-700">
                                    <Info className="h-3 w-3" />
                                    {locale === "ar"
                                      ? "أيام الدوام"
                                      : "Work days"}
                                  </summary>
                                  <div className="mt-1 rounded-lg bg-teal-50 p-2 text-[9px] text-teal-900">
                                    {item.supervisor.work_locations?.map(
                                      (location) => (
                                        <p key={location.training_site?.id}>
                                          {locale === "ar"
                                            ? location.training_site?.name_ar
                                            : location.training_site?.name_en ||
                                              location.training_site?.name_ar}
                                          : {locationDays(location.days)}
                                        </p>
                                      ),
                                    )}
                                    {!item.supervisor.work_locations?.length &&
                                      workDays(item)}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[9px] text-slate-400 md:hidden">
              {locale === "ar"
                ? "مرّر الجدول أفقيًا لرؤية جميع الأعمدة"
                : "Scroll horizontally to view all columns"}
            </p>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 rounded-2xl bg-white p-3 sm:flex-row">
            <p className="text-[11px] text-slate-500">
              {locale === "ar"
                ? `عرض ${schedule?.from ?? 0}–${schedule?.to ?? 0} من ${schedule?.total ?? 0} تعيين`
                : `Showing ${schedule?.from ?? 0}–${schedule?.to ?? 0} of ${schedule?.total ?? 0} assignments`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!schedule?.prev_page_url}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronRight className="h-4 w-4" />
                {locale === "ar" ? "السابق" : "Previous"}
              </Button>
              <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black">
                {schedule?.current_page} / {schedule?.last_page}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!schedule?.next_page_url}
                onClick={() => setPage((value) => value + 1)}
              >
                {locale === "ar" ? "التالي" : "Next"}
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
