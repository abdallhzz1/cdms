import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, apiFetch } from "@/api/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import hebronLogo from "@/assets/hebron.png";
import { useI18n } from "@/i18n/I18nContext";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LockKeyhole,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

type ScheduleItem = {
  item_type?: "clinical" | "activity";
  activity?: {
    type: "lectures" | "break" | "exam";
    label: string | null;
  } | null;
  course: {
    code: string | null;
    name_ar: string | null;
    name_en: string | null;
  } | null;
  academic_year: string | null;
  clinical_period: {
    id: number;
    code: string;
    name_ar: string;
    name_en: string | null;
    sequence: number;
  } | null;
  block: {
    block_code: string;
    from_week: number;
    to_week: number;
    start_date: string | null;
    end_date: string | null;
  } | null;
  training_site: {
    name: string;
    name_ar: string | null;
    name_en: string | null;
  } | null;
  department: {
    name: string;
    name_ar: string | null;
    name_en: string | null;
  } | null;
  supervisor: {
    name: string;
    full_name_ar: string | null;
    full_name_en: string | null;
    work_schedule?: {
      day: string;
      status: "work" | "leave" | "unavailable";
      note?: string | null;
    }[];
    work_locations?: Array<{
      training_site: {
        id: number;
        name_ar: string;
        name_en?: string | null;
      } | null;
      days: Array<{
        day: string;
        status: "work" | "leave" | "unavailable";
        note?: string | null;
      }>;
    }>;
  } | null;
};
type StudentSchedule = {
  student: {
    name: string;
    name_en: string | null;
    university_number: string;
    academic_level: string;
  };
  group: { name: string } | null;
  subgroup: { name: string } | null;
  members: {
    name: string;
    name_en: string | null;
    is_current_student: boolean;
  }[];
  schedule: ScheduleItem[];
};

const levelNames: Record<string, { ar: string; en: string }> = {
  fourth: { ar: "السنة الرابعة", en: "Fourth year" },
  fifth: { ar: "السنة الخامسة", en: "Fifth year" },
  sixth: { ar: "السنة السادسة", en: "Sixth year" },
};
const formatDate = (value: string | null, locale: "ar" | "en") =>
  value
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T00:00:00`))
    : "—";
const dayName = (day: string, locale: "ar" | "en") =>
  ({
    saturday: { ar: "السبت", en: "Saturday" },
    sunday: { ar: "الأحد", en: "Sunday" },
    monday: { ar: "الاثنين", en: "Monday" },
    tuesday: { ar: "الثلاثاء", en: "Tuesday" },
    wednesday: { ar: "الأربعاء", en: "Wednesday" },
    thursday: { ar: "الخميس", en: "Thursday" },
    friday: { ar: "الجمعة", en: "Friday" },
  } as Record<string, { ar: string; en: string }>)[day]?.[locale] || day;

export function PublicClinicalSchedulePage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [number, setNumber] = useState("");
  const [challenge, setChallenge] = useState("");
  const [otp, setOtp] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [data, setData] = useState<StudentSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [otpSeconds, setOtpSeconds] = useState(0);
  const [periodId, setPeriodId] = useState("");

  const periods = useMemo(
    () =>
      Array.from(
        new Map(
          (data?.schedule ?? [])
            .filter((item) => item.clinical_period)
            .map((item) => [item.clinical_period!.id, item.clinical_period!]),
        ).values(),
      ).sort((a, b) => a.sequence - b.sequence),
    [data],
  );
  const displayedSchedule = useMemo(
    () =>
      periodId
        ? (data?.schedule ?? []).filter(
            (item) => String(item.clinical_period?.id) === periodId,
          )
        : (data?.schedule ?? []),
    [data, periodId],
  );

  useEffect(() => {
    if (!challenge || accessToken || otpSeconds <= 0) return;
    const timer = window.setInterval(
      () => setOtpSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [challenge, accessToken, otpSeconds]);
  useEffect(() => {
    if (
      data &&
      periods.length &&
      !periods.some((period) => String(period.id) === periodId)
    )
      setPeriodId(String(periods[0].id));
  }, [data, periods, periodId]);

  const fail = (exception: unknown) => {
    setMessage("");
    setError(
      exception instanceof ApiError
        ? exception.message
        : tr("تعذر إتمام العملية. يرجى المحاولة لاحقاً.", "The operation could not be completed. Please try again later."),
    );
  };
  const requestOtp = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch<{
        otp_required: boolean;
        challenge_token?: string;
        email_hint?: string;
        expires_in_seconds: number;
        access_token?: string;
      }>("/public/student-schedule/request-otp", {
        method: "POST",
        body: { university_number: number.trim() },
      });
      if (response.otp_required === false && response.access_token) {
        setAccessToken(response.access_token);
        const schedule = await apiFetch<StudentSchedule>(
          "/public/student-schedule",
          { method: "POST", body: { access_token: response.access_token } },
        );
        setData(schedule);
        setMessage(
          tr("وضع الفحص المؤقت فعال: تم تحميل الجدول دون إرسال رمز بريدي.", "Temporary test mode is active: the schedule was loaded without sending an email code."),
        );
        return;
      }
      setChallenge(response.challenge_token ?? "");
      setEmailHint(response.email_hint ?? "");
      setOtp("");
      setOtpSeconds(response.expires_in_seconds);
      setMessage(tr("تم إرسال رمز التحقق إلى بريدك الجامعي.", "A verification code was sent to your university email."));
    } catch (exception) {
      fail(exception);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const verified = await apiFetch<{ access_token: string }>(
        "/public/student-schedule/verify-otp",
        { method: "POST", body: { challenge_token: challenge, otp } },
      );
      setAccessToken(verified.access_token);
      const schedule = await apiFetch<StudentSchedule>(
        "/public/student-schedule",
        { method: "POST", body: { access_token: verified.access_token } },
      );
      setData(schedule);
      setMessage(tr("تم التحقق من هويتك وتحميل جدولك المنشور.", "Your identity was verified and your published schedule was loaded."));
    } catch (exception) {
      fail(exception);
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setNumber("");
    setChallenge("");
    setOtp("");
    setEmailHint("");
    setAccessToken("");
    setData(null);
    setPeriodId("");
    setError("");
    setMessage("");
    setOtpSeconds(0);
  };
  const timer = `${String(Math.floor(otpSeconds / 60)).padStart(2, "0")}:${String(otpSeconds % 60).padStart(2, "0")}`;

  return (
    <main
      className="min-h-screen bg-slate-50 px-3 py-4 text-slate-800 sm:px-6 sm:py-8"
    >
      <div className="mx-auto max-w-4xl space-y-3 sm:space-y-5">
        <header className="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-sm backdrop-blur sm:rounded-[28px] sm:shadow-xl sm:shadow-slate-200/50">
          <div className="h-1 bg-teal-500 sm:h-1.5" />
          <div className="p-4 text-center sm:p-7">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm sm:mb-3 sm:h-16 sm:w-16 sm:rounded-2xl sm:p-2 sm:shadow-md">
              <img
                src={hebronLogo}
                alt={tr("جامعة الخليل", "Hebron University")}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 sm:mb-2 sm:px-3 sm:py-1.5 sm:text-[11px]">
              <ShieldCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {tr("بوابة آمنة عبر البريد الجامعي", "Secure university email portal")}
            </div>
            <h1 className="text-lg font-black sm:text-3xl">
              {tr("جدولي السريري", "My Clinical Schedule")}
            </h1>
            <p className="mx-auto mt-1 max-w-xl text-[11px] leading-5 text-slate-500 sm:mt-2 sm:text-sm sm:leading-6">
              {tr(
                "جدولك الأسبوعي المعتمد ومعلومات مجموعتك السريرية.",
                "Your approved weekly schedule and clinical group details.",
              )}
            </p>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-bold text-teal-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {!challenge && (
          <Card className="rounded-[28px] p-5 sm:p-7">
            <form onSubmit={requestOtp} className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-teal-600" />
                  <label className="text-sm font-black">
                    {tr("أدخل رقمك الجامعي", "Enter your university number")}
                  </label>
                </div>
                <p className="mb-3 text-xs leading-5 text-slate-500">
                  {tr(
                    "لن تظهر أي بيانات قبل التحقق. سنرسل رمزًا من 6 أرقام إلى بريدك الجامعي.",
                    "No data is displayed before verification. We will send a six-digit code to your university email.",
                  )}
                </p>
                <input
                  required
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]+"
                  value={number}
                  onChange={(event) =>
                    setNumber(event.target.value.replace(/\D/g, ""))
                  }
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center font-mono text-xl font-bold tracking-wider outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
                  placeholder={tr("مثال: 22210466", "Example: 22210466")}
                />
              </div>
              <Button
                className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold hover:bg-teal-700"
                isLoading={busy}
              >
                <Mail className="me-2 h-5 w-5" />
                {tr("إرسال رمز التحقق", "Send verification code")}
              </Button>
            </form>
          </Card>
        )}

        {challenge && !accessToken && (
          <Card className="rounded-[28px] p-5 sm:p-7">
            <form onSubmit={verify} className="space-y-4">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                  <Mail className="h-6 w-6" />
                </div>
                <h2 className="font-black">
                  {tr("تحقق من بريدك الجامعي", "Check your university email")}
                </h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {tr("أرسلنا الرمز إلى", "We sent the code to")} <b dir="ltr">{emailHint}</b>
                </p>
              </div>
              <input
                required
                autoFocus
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, ""))
                }
                className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center font-mono text-2xl font-black tracking-[.35em] outline-none focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
                placeholder="000000"
              />
              <div
                className={`flex items-center justify-center gap-1.5 text-xs font-bold ${otpSeconds ? "text-slate-500" : "text-red-600"}`}
              >
                <Clock3 className="h-4 w-4" />
                {otpSeconds
                  ? tr(`صلاحية الرمز: ${timer}`, `Code expires in: ${timer}`)
                  : tr("انتهت صلاحية الرمز", "The verification code has expired")}
              </div>
              <Button
                className="h-13 w-full rounded-2xl bg-teal-600 text-base font-bold"
                isLoading={busy}
                disabled={otp.length !== 6 || otpSeconds === 0}
              >
                <LockKeyhole className="me-2 h-5 w-5" />
                {tr("التحقق وعرض الجدول", "Verify and view schedule")}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl text-xs"
                  onClick={reset}
                >
                  {tr("تغيير الرقم", "Change number")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl text-xs"
                  onClick={() => requestOtp()}
                  disabled={busy || otpSeconds > 0}
                >
                  <RefreshCw className="me-1 h-4 w-4" />
                  {tr("إرسال رمز جديد", "Send a new code")}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {data && (
          <section className="space-y-3 sm:space-y-4">
            <Card className="rounded-2xl border border-slate-200 p-3 sm:rounded-[28px] sm:p-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white sm:h-11 sm:w-11">
                  <GraduationCap className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-black sm:text-base">
                    {ar ? data.student.name : data.student.name_en || data.student.name}
                  </h2>
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-xs">
                    <span className="font-mono">
                      {data.student.university_number}
                    </span>{" "}
                    ·{" "}
                    {levelNames[data.student.academic_level]?.[locale] ||
                      data.student.academic_level}{" "}
                    · {tr("المجموعة", "Group")}{" "}
                    <b className="text-teal-700">
                      {data.group?.name || "—"} / {data.subgroup?.name || "—"}
                    </b>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"
                >
                  {tr("استعلام آخر", "New lookup")}
                </button>
              </div>
            </Card>

            <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4.5 w-4.5 text-teal-700" />
                <h2 className="text-sm font-black sm:text-base">
                  {tr("الجدول الأسبوعي", "Weekly schedule")}
                </h2>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700">
                  {displayedSchedule.length} {tr("أسابيع", "weeks")}
                </span>
              </div>
              {periods.length > 0 && (
                <label className="sm:ms-auto">
                  <span className="sr-only">{tr("اختر الفترة السريرية", "Select clinical period")}</span>
                  <select
                    value={periodId}
                    onChange={(event) => setPeriodId(event.target.value)}
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:border-teal-500 sm:w-56"
                  >
                    {periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.code} — {ar ? period.name_ar : period.name_en || period.name_ar}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {displayedSchedule.length === 0 ? (
              <Card className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
                <h3 className="mt-2 text-sm font-black">
                  {tr("لا يوجد جدول منشور لك في هذه الفترة", "No published schedule is available for this period")}
                </h3>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  {tr(
                    "يرجى المراجعة لاحقاً أو التواصل مع إدارة الدائرة السريرية.",
                    "Please check again later or contact the Clinical Department administration.",
                  )}
                </p>
              </Card>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[690px] table-fixed border-collapse text-start text-[10px] sm:text-xs">
                    <colgroup>
                      <col className="w-[72px]" />
                      <col className="w-[145px]" />
                      <col className="w-[175px]" />
                      <col className="w-[145px]" />
                      <col className="w-[153px]" />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <th className="p-2.5 font-black">{tr("الأسبوع", "Week")}</th>
                        <th className="p-2.5 font-black">{tr("التاريخ", "Date")}</th>
                        <th className="p-2.5 font-black">{tr("المساق / النشاط", "Course / Activity")}</th>
                        <th className="p-2.5 font-black">{tr("المستشفى", "Hospital")}</th>
                        <th className="p-2.5 font-black">{tr("المشرف", "Supervisor")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSchedule.map((item, index) => (
                        <tr
                          key={`${item.block?.block_code}-${index}`}
                          className={`border-b border-slate-100 last:border-0 ${item.item_type === "activity" ? "bg-amber-50/70" : "bg-white"}`}
                        >
                          <td className="p-2.5 align-top">
                            <span
                              className={`inline-flex rounded-md px-2 py-1 font-black ${item.item_type === "activity" ? "bg-amber-100 text-amber-800" : "bg-teal-50 text-teal-800"}`}
                            >
                              {item.block?.from_week || "—"}
                            </span>
                          </td>
                          <td className="p-2.5 align-top leading-5 text-slate-500">
                            <span className="block">
                              {formatDate(item.block?.start_date || null, locale)}
                            </span>
                            <span className="block text-[9px] text-slate-400">
                              {tr("إلى", "to")} {formatDate(item.block?.end_date || null, locale)}
                            </span>
                          </td>
                          <td className="p-2.5 align-top">
                            <span className="block text-[9px] font-bold text-slate-400">
                              {item.course?.code || tr("مساق سريري", "Clinical course")}
                            </span>
                            <span
                              className={`mt-0.5 block font-black ${item.item_type === "activity" ? "text-amber-800" : "text-slate-800"}`}
                            >
                              {item.item_type === "activity"
                                ? item.activity?.label || tr("نشاط أكاديمي", "Academic activity")
                                : (ar ? item.course?.name_ar : item.course?.name_en) ||
                                  item.course?.name_ar ||
                                  tr("الدورة السريرية", "Clinical rotation")}
                            </span>
                          </td>
                          <td className="p-2.5 align-top font-bold text-slate-700">
                            {item.item_type === "activity" ? (
                              <span className="text-amber-700">
                                {tr("لا يوجد دوام سريري", "No clinical duty")}
                              </span>
                            ) : item.supervisor?.work_locations?.length ? (
                              <div className="space-y-1">
                                {item.supervisor.work_locations.map(
                                  (location) => (
                                    <div
                                      key={location.training_site?.id ?? "site"}
                                    >
                                      <span className="block font-black">
                                        {(ar
                                          ? location.training_site?.name_ar
                                          : location.training_site?.name_en || location.training_site?.name_ar) || "—"}
                                      </span>
                                      <span className="block text-[9px] font-normal text-teal-700">
                                        {location.days
                                          .filter(
                                            (day) => day.status === "work",
                                          )
                                          .map((day) => dayName(day.day, locale))
                                          .join(ar ? "، " : ", ") || tr("لا يوجد دوام", "No duty")}
                                      </span>
                                      {location.days
                                        .filter((day) =>
                                          Boolean(day.note?.trim()),
                                        )
                                        .map((day) => (
                                          <span
                                            key={day.day}
                                            className="block text-[9px] font-normal leading-4 text-amber-700"
                                          >
                                            {dayName(day.day, locale)}:{" "}
                                            {day.note?.trim()}
                                          </span>
                                        ))}
                                    </div>
                                  ),
                                )}
                              </div>
                            ) : (
                              (ar ? item.training_site?.name_ar : item.training_site?.name_en) ||
                              item.training_site?.name_ar ||
                              item.training_site?.name ||
                              "—"
                            )}
                          </td>
                          <td className="p-2.5 align-top font-bold text-slate-700">
                            {item.item_type === "activity" ? (
                              <span className="text-amber-700">—</span>
                            ) : (
                              <span className="block">
                                {(ar ? item.supervisor?.full_name_ar : item.supervisor?.full_name_en) ||
                                  item.supervisor?.full_name_ar ||
                                  item.supervisor?.name ||
                                  tr("شاغر", "Vacant")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[9px] text-slate-400 sm:hidden">
                  {tr("مرّر الجدول أفقيًا لرؤية جميع الأعمدة", "Scroll horizontally to view all columns")}
                </p>
              </div>
            )}

            <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs font-black text-slate-700">
                <UsersRound className="h-4 w-4 text-teal-600" />
                {tr("مجموعتي وزملائي", "My group members")}
                <span className="ms-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {data.members.length}
                </span>
              </summary>
              <div className="border-t border-slate-100 p-3">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {data.members.map((member, index) => (
                    <div
                      key={`${member.name}-${index}`}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold ${member.is_current_student ? "bg-teal-50 text-teal-800" : "bg-slate-50 text-slate-600"}`}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[9px]">
                        {index + 1}
                      </span>
                      <span className="truncate">{ar ? member.name : member.name_en || member.name}</span>
                      {member.is_current_student && (
                        <span className="ms-auto text-[9px]">{tr("أنت", "You")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </details>
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[9px] leading-4 text-slate-400 sm:text-[11px]">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />
              <p>
                {tr(
                  "هذه البيانات خاصة بصاحب البريد الجامعي وتنتهي جلسة العرض تلقائياً.",
                  "This information is private to the university email owner, and the viewing session expires automatically.",
                )}
              </p>
            </div>
          </section>
        )}

        <footer className="py-3 text-center text-[11px] text-slate-400">
          {tr(
            "جامعة الخليل — كلية الطب — الدائرة السريرية",
            "Hebron University — Faculty of Medicine — Clinical Department",
          )}
        </footer>
      </div>
    </main>
  );
}
