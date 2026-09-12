import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import ExcelJS from "exceljs";
import { ApiError, apiFetch } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/i18n/I18nContext";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  Layers3,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";

type Level = "fourth" | "fifth" | "sixth";
type EventType =
  | "rotation"
  | "exam"
  | "holiday"
  | "break"
  | "registration"
  | "graduation"
  | "other";
type AcademicYear = {
  id: number;
  code: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  status: "planned" | "active" | "closed";
  notes: string | null;
};
type CalendarEvent = {
  id: number;
  academic_year_id: number;
  name: string;
  event_type: EventType;
  start_date: string;
  end_date: string;
  affected_levels: Level[];
  suspends_clinical_training: boolean;
  notes: string | null;
};
type ClinicalPeriod = {
  id: number;
  academic_year_id: number;
  code: string;
  name_ar: string;
  name_en: string | null;
  sequence: number;
  start_date: string;
  end_date: string;
  weeks_count: number;
  status: "planned" | "active" | "closed";
  notes: string | null;
};
type Rotation = {
  id: number;
  code: string;
  name: string;
  academic_level: Level;
  start_date: string | null;
  end_date: string | null;
  duration_weeks: number | null;
  status: string;
  distribution_status: string | null;
  schedule_scope: "period" | "annual";
  clinical_period: ClinicalPeriod | null;
  blocks: Array<{
    id: number;
    block_code: string;
    from_week: number;
    to_week: number;
  }>;
};
type Overview = {
  academic_year: AcademicYear;
  periods: ClinicalPeriod[];
  events: CalendarEvent[];
  rotations: Rotation[];
};
type YearsResponse = AcademicYear[] | { data: AcademicYear[] };
type YearForm = {
  code: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  status: AcademicYear["status"];
  notes: string;
};

const levels: Record<Level, { ar: string; en: string }> = {
  fourth: { ar: "السنة الرابعة", en: "Fourth year" },
  fifth: { ar: "السنة الخامسة", en: "Fifth year" },
  sixth: { ar: "السنة السادسة", en: "Sixth year" },
};
const eventTypes: Record<EventType, { label: { ar: string; en: string }; color: string }> = {
  rotation: {
    label: { ar: "فترة سريرية", en: "Clinical period" },
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  exam: {
    label: { ar: "امتحان", en: "Exam" },
    color: "bg-amber-50 text-amber-800 border-amber-200",
  },
  holiday: {
    label: { ar: "عطلة رسمية", en: "Official holiday" },
    color: "bg-rose-50 text-rose-700 border-rose-200",
  },
  break: { label: { ar: "استراحة", en: "Break" }, color: "bg-sky-50 text-sky-700 border-sky-200" },
  registration: {
    label: { ar: "تسجيل", en: "Registration" },
    color: "bg-violet-50 text-violet-700 border-violet-200",
  },
  graduation: {
    label: { ar: "تخرج", en: "Graduation" },
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  other: {
    label: { ar: "حدث عام", en: "General event" },
    color: "bg-slate-50 text-slate-700 border-slate-200",
  },
};
const emptyYear: YearForm = {
  code: "",
  start_date: "",
  end_date: "",
  is_current: false,
  status: "active",
  notes: "",
};
const emptyEvent = {
  name: "",
  event_type: "exam" as EventType,
  start_date: "",
  end_date: "",
  affected_levels: [] as Level[],
  suspends_clinical_training: false,
  notes: "",
};
const emptyPeriod = {
  code: "P1",
  name_ar: "الفترة السريرية الأولى",
  name_en: "Clinical Period 1",
  sequence: 1,
  start_date: "",
  end_date: "",
  weeks_count: 12,
  status: "active" as ClinicalPeriod["status"],
  notes: "",
};
const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10";
const formatDate = (value: string | null, locale: "ar" | "en") =>
  value
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-PS" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : locale === "ar" ? "غير محدد" : "Not specified";
const errorText = (error: unknown, ar: boolean) =>
  error instanceof ApiError
    ? error.message
    : ar ? "تعذر إتمام العملية. حاول مرة أخرى." : "The operation could not be completed. Please try again.";

export function AcademicCalendarPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const levelLabel = (value: Level) => levels[value][locale];
  const eventTypeLabel = (value: EventType) => eventTypes[value]?.label[locale] || value;
  const format = (value: string | null) => formatDate(value, locale);
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can("academic_years.manage");
  const [yearId, setYearId] = useState("");
  const [level, setLevel] = useState<"all" | Level>("all");
  const [view, setView] = useState<"timeline" | "rotations">("timeline");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [yearModal, setYearModal] = useState(false);
  const [eventModal, setEventModal] = useState(false);
  const [periodModal, setPeriodModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<ClinicalPeriod | null>(
    null,
  );
  const [yearForm, setYearForm] = useState({ ...emptyYear });
  const [eventForm, setEventForm] = useState({ ...emptyEvent });
  const [periodForm, setPeriodForm] = useState({ ...emptyPeriod });

  const yearsQuery = useQuery({
    queryKey: ["academic-years", "calendar"],
    queryFn: () => apiFetch<YearsResponse>("/academic-years?per_page=100"),
  });
  const years = useMemo(
    () =>
      Array.isArray(yearsQuery.data)
        ? yearsQuery.data
        : (yearsQuery.data?.data ?? []),
    [yearsQuery.data],
  );
  useEffect(() => {
    if (!yearId && years.length) {
      setYearId(
        String(years.find((item) => item.is_current)?.id ?? years[0].id),
      );
    }
  }, [years, yearId]);
  const overviewQuery = useQuery({
    queryKey: ["academic-calendar-overview", yearId],
    queryFn: () => apiFetch<Overview>(`/academic-calendar-overview/${yearId}`),
    enabled: Boolean(yearId),
  });
  const overview = overviewQuery.data;
  const selectedYear = years.find((item) => String(item.id) === yearId) ?? null;

  const visibleEvents = useMemo(
    () =>
      overview?.events.filter(
        (item) =>
          level === "all" ||
          item.affected_levels.length === 0 ||
          item.affected_levels.includes(level),
      ) ?? [],
    [overview, level],
  );
  const visibleRotations = useMemo(
    () =>
      overview?.rotations.filter(
        (item) => level === "all" || item.academic_level === level,
      ) ?? [],
    [overview, level],
  );
  const timeline = useMemo(
    () =>
      [
        ...visibleEvents.map((item) => ({
          kind: "event" as const,
          date: item.start_date,
          item,
        })),
        ...visibleRotations
          .filter((item) => item.start_date)
          .map((item) => ({
            kind: "rotation" as const,
            date: item.start_date!,
            item,
          })),
      ].sort((a, b) => a.date.localeCompare(b.date)),
    [visibleEvents, visibleRotations],
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["academic-years"] }),
      queryClient.invalidateQueries({
        queryKey: ["academic-calendar-overview"],
      }),
    ]);
  };
  const yearMutation = useMutation({
    mutationFn: () =>
      apiFetch<AcademicYear>(
        editingYear ? `/academic-years/${editingYear.id}` : "/academic-years",
        {
          method: editingYear ? "PUT" : "POST",
          body: {
            ...yearForm,
            semester1_start: null,
            semester1_end: null,
            semester2_start: null,
            semester2_end: null,
            summer_start: null,
            summer_end: null,
            notes: yearForm.notes || null,
          },
        },
      ),
    onSuccess: async (data) => {
      await refresh();
      setYearId(String(data.id));
      setYearModal(false);
      setNotice(
        editingYear ? tr("تم تحديث العام الأكاديمي.", "Academic year updated.") : tr("تم إنشاء العام الأكاديمي.", "Academic year created."),
      );
      setError("");
    },
    onError: (e) => setError(errorText(e, ar)),
  });
  const eventMutation = useMutation({
    mutationFn: () =>
      apiFetch(
        editingEvent
          ? `/academic-calendar-events/${editingEvent.id}`
          : "/academic-calendar-events",
        {
          method: editingEvent ? "PUT" : "POST",
          body: {
            academic_year_id: Number(yearId),
            ...eventForm,
            notes: eventForm.notes || null,
          },
        },
      ),
    onSuccess: async () => {
      await refresh();
      setEventModal(false);
      setNotice(
        editingEvent ? tr("تم تحديث الحدث.", "Event updated.") : tr("تمت إضافة الحدث إلى التقويم.", "Event added to the calendar."),
      );
      setError("");
    },
    onError: (e) => setError(errorText(e, ar)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/academic-calendar-events/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      setNotice(tr("تم حذف الحدث من التقويم.", "Event deleted from the calendar."));
    },
    onError: (e) => setError(errorText(e, ar)),
  });
  const periodMutation = useMutation({
    mutationFn: () =>
      apiFetch(
        editingPeriod
          ? `/clinical-periods/${editingPeriod.id}`
          : "/clinical-periods",
        {
          method: editingPeriod ? "PUT" : "POST",
          body: {
            academic_year_id: Number(yearId),
            ...periodForm,
            notes: periodForm.notes || null,
          },
        },
      ),
    onSuccess: async () => {
      await refresh();
      setPeriodModal(false);
      setNotice(
        editingPeriod
          ? tr("تم تحديث الفترة السريرية.", "Clinical period updated.")
          : tr("تمت إضافة الفترة السريرية.", "Clinical period added."),
      );
      setError("");
    },
      onError: (e) => setError(errorText(e, ar)),
  });
  const deletePeriod = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/clinical-periods/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      setNotice(tr("تم حذف الفترة السريرية.", "Clinical period deleted."));
    },
    onError: (e) => setError(errorText(e, ar)),
  });

  const openNewYear = () => {
    setEditingYear(null);
    setYearForm({ ...emptyYear });
    setError("");
    setYearModal(true);
  };
  const openEditYear = () => {
    if (!selectedYear) return;
    setEditingYear(selectedYear);
    setYearForm({
      code: selectedYear.code,
      start_date: selectedYear.start_date,
      end_date: selectedYear.end_date,
      is_current: selectedYear.is_current,
      status: selectedYear.status,
      notes: selectedYear.notes ?? "",
    });
    setError("");
    setYearModal(true);
  };
  const openNewEvent = () => {
    setEditingEvent(null);
    setEventForm({
      ...emptyEvent,
      start_date: selectedYear?.start_date ?? "",
      end_date: selectedYear?.start_date ?? "",
    });
    setError("");
    setEventModal(true);
  };
  const openNewPeriod = () => {
    const next = (overview?.periods.length ?? 0) + 1;
    const previous = overview?.periods.at(-1);
    const start = previous
      ? new Date(`${previous.end_date}T12:00:00`)
      : new Date(`${selectedYear?.start_date}T12:00:00`);
    if (previous) start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 83);
    setEditingPeriod(null);
    setPeriodForm({
      ...emptyPeriod,
      code: `P${next}`,
      name_ar: `الفترة السريرية ${next}`,
      name_en: `Clinical Period ${next}`,
      sequence: next,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
    });
    setError("");
    setPeriodModal(true);
  };
  const openEditPeriod = (item: ClinicalPeriod) => {
    setEditingPeriod(item);
    setPeriodForm({
      code: item.code,
      name_ar: item.name_ar,
      name_en: item.name_en ?? "",
      sequence: item.sequence,
      start_date: item.start_date,
      end_date: item.end_date,
      weeks_count: item.weeks_count,
      status: item.status,
      notes: item.notes ?? "",
    });
    setError("");
    setPeriodModal(true);
  };
  const openEditEvent = (item: CalendarEvent) => {
    setEditingEvent(item);
    setEventForm({
      name: item.name,
      event_type: item.event_type,
      start_date: item.start_date,
      end_date: item.end_date,
      affected_levels: item.affected_levels,
      suspends_clinical_training: item.suspends_clinical_training,
      notes: item.notes ?? "",
    });
    setError("");
    setEventModal(true);
  };
  const toggleLevel = (item: Level) =>
    setEventForm((current) => ({
      ...current,
      affected_levels: current.affected_levels.includes(item)
        ? current.affected_levels.filter((value) => value !== item)
        : [...current.affected_levels, item],
    }));
  const exportExcel = async () => {
    if (!selectedYear || !overview) return;
    setExporting(true);
    setError("");
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator =
        "Hebron University - Faculty of Medicine - Clinical Department";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet(tr("التقويم السنوي", "Annual Calendar"), {
        views: [{ rightToLeft: ar }],
      });
      sheet.columns = [
        { width: 7 },
        { width: 18 },
        { width: 34 },
        { width: 18 },
        { width: 17 },
        { width: 17 },
        { width: 15 },
        { width: 18 },
        { width: 38 },
      ];
      sheet.mergeCells("A1:I1");
      sheet.getCell("A1").value = tr("جامعة الخليل — كلية الطب والعلوم الصحية", "Hebron University — Faculty of Medicine and Health Sciences");
      sheet.mergeCells("A2:I2");
      sheet.getCell("A2").value =
        tr("الدائرة السريرية — التقويم الأكاديمي والسريري السنوي", "Clinical Department — Annual Academic and Clinical Calendar");
      sheet.mergeCells("A3:I3");
      sheet.getCell("A3").value =
        tr(
          `العام الأكاديمي ${selectedYear.code} | من ${format(selectedYear.start_date)} إلى ${format(selectedYear.end_date)}`,
          `Academic year ${selectedYear.code} | From ${format(selectedYear.start_date)} to ${format(selectedYear.end_date)}`,
        );
      sheet.mergeCells("A4:I4");
      sheet.getCell("A4").value =
        tr(
          `النطاق: ${level === "all" ? "جميع السنوات" : levelLabel(level)} | تاريخ التصدير: ${format(new Date().toISOString().slice(0, 10))}`,
          `Scope: ${level === "all" ? "All years" : levelLabel(level)} | Export date: ${format(new Date().toISOString().slice(0, 10))}`,
        );
      ["A1", "A2", "A3", "A4"].forEach((cell, index) => {
        sheet.getCell(cell).alignment = {
          horizontal: "center",
          vertical: "middle",
        };
        sheet.getCell(cell).font = {
          bold: index < 3,
          size: index === 0 ? 16 : index === 1 ? 13 : 11,
          color: { argb: index < 2 ? "FF0F766E" : "FF334155" },
        };
      });
      sheet.getRow(1).height = 28;
      sheet.getRow(2).height = 24;
      const header = sheet.addRow([
        "#",
        tr("المصدر/النوع", "Source / Type"),
        tr("الحدث أو الدورة", "Event or Rotation"),
        tr("السنة", "Year"),
        tr("تاريخ البداية", "Start date"),
        tr("تاريخ النهاية", "End date"),
        tr("المدة", "Duration"),
        tr("الحالة", "Status"),
        tr("التفاصيل والملاحظات", "Details and notes"),
      ]);
      header.height = 25;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F766E" },
        };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
      const rows = [
        ...visibleEvents.map((item) => ({
          date: item.start_date,
          values: [
            eventTypeLabel(item.event_type),
            item.name,
            item.affected_levels.length
              ? item.affected_levels.map(levelLabel).join(ar ? "، " : ", ")
              : tr("جميع السنوات", "All years"),
            item.start_date,
            item.end_date,
            item.start_date === item.end_date ? tr("يوم واحد", "One day") : tr("فترة", "Period"),
            item.suspends_clinical_training
              ? tr("يوقف التدريب", "Suspends training")
              : tr("لا يوقف التدريب", "Does not suspend training"),
            item.notes ?? "",
          ],
        })),
        ...visibleRotations.map((item) => ({
          date: item.start_date ?? "9999-12-31",
          values: [
            tr("دورة من التوزيع السريري", "Clinical distribution rotation"),
            `${item.name} (${item.code})`,
            levelLabel(item.academic_level),
            item.start_date ?? tr("غير محدد", "Not specified"),
            item.end_date ?? tr("غير محدد", "Not specified"),
            item.duration_weeks ? `${item.duration_weeks} ${tr("أسبوع", "weeks")}` : "—",
            item.distribution_status === "published"
              ? tr("منشور", "Published")
              : item.distribution_status
                ? tr("قيد الإعداد", "In preparation")
                : tr("دون جدول", "No schedule"),
            item.blocks
              .map(
                (block) =>
                  `${block.block_code}: ${tr("أسبوع", "Week")} ${block.from_week}-${block.to_week}`,
              )
              .join(ar ? "، " : ", "),
          ],
        })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      rows.forEach((item, index) => {
        const row = sheet.addRow([index + 1, ...item.values]);
        row.height = 24;
        row.eachCell((cell) => {
          cell.alignment = {
            horizontal: ar ? "right" : "left",
            vertical: "middle",
            wrapText: true,
          };
          cell.border = {
            bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
          };
        });
        if (index % 2 === 1)
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF8FAFC" },
            };
          });
      });
      sheet.autoFilter = { from: "A5", to: `I${Math.max(5, sheet.rowCount)}` };
      sheet.views = [{ rightToLeft: ar, state: "frozen", ySplit: 5 }];
      sheet.pageSetup = {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      };
      sheet.headerFooter.oddFooter =
        tr("الصفحة &P من &N — نظام إدارة الدائرة السريرية", "Page &P of &N — Clinical Department Management System");

      const rotationsSheet = workbook.addWorksheet(tr("تفاصيل الدورات", "Rotation Details"), {
        views: [{ rightToLeft: ar }],
      });
      rotationsSheet.columns = [
        { width: 8 },
        { width: 16 },
        { width: 32 },
        { width: 18 },
        { width: 16 },
        { width: 16 },
        { width: 14 },
        { width: 48 },
      ];
      const rotationsHeader = rotationsSheet.addRow([
        "#",
        tr("رمز الدورة", "Rotation code"),
        tr("اسم الدورة", "Rotation name"),
        tr("السنة", "Year"),
        tr("البداية", "Start"),
        tr("النهاية", "End"),
        tr("المدة", "Duration"),
        tr("الفترات السريرية", "Clinical periods"),
      ]);
      rotationsHeader.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF2563EB" },
        };
        cell.alignment = { horizontal: "center" };
      });
      visibleRotations.forEach((item, index) =>
        rotationsSheet.addRow([
          index + 1,
          item.code,
          item.name,
          levelLabel(item.academic_level),
          item.start_date ?? tr("غير محدد", "Not specified"),
          item.end_date ?? tr("غير محدد", "Not specified"),
          item.duration_weeks ? `${item.duration_weeks} ${tr("أسبوع", "weeks")}` : "—",
          item.blocks
            .map(
              (block) =>
                `${block.block_code} (${tr("أسبوع", "Week")} ${block.from_week}-${block.to_week})`,
            )
            .join(ar ? "، " : ", "),
        ]),
      );
      rotationsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1)
          row.alignment = {
            horizontal: ar ? "right" : "left",
            vertical: "middle",
            wrapText: true,
          };
        row.height = Math.max(row.height ?? 15, 23);
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${tr("التقويم_السنوي", "annual_calendar")}_${selectedYear.code.replace("/", "-")}_${level === "all" ? tr("كل_السنوات", "all_years") : levelLabel(level).replaceAll(" ", "_")}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(tr("تم تصدير التقويم إلى ملف Excel منسق.", "Calendar exported to a formatted Excel file."));
    } catch (exception) {
      setError(errorText(exception, ar));
    } finally {
      setExporting(false);
    }
  };

  if (yearsQuery.isLoading) return <LoadingState />;
  if (yearsQuery.isError)
    return <ErrorState onRetry={() => yearsQuery.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          title={tr("التقويم الأكاديمي والسريري", "Academic and Clinical Calendar")}
          description={tr("مرجع موحّد للأعوام والفصول والدورات السريرية والامتحانات والإجازات.", "A unified reference for academic years, clinical rotations, exams, and holidays.")}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={exportExcel}
            isLoading={exporting}
            disabled={!overview}
          >
            <FileSpreadsheet className="ml-1.5 h-4 w-4" />
            {tr("تصدير Excel", "Export Excel")}
          </Button>
          {canManage && (
            <>
              <Button variant="outline" onClick={openNewYear}>
                <Plus className="ml-1.5 h-4 w-4" />
                {tr("عام جديد", "New year")}
              </Button>
              <Button
                variant="outline"
                onClick={openEditYear}
                disabled={!selectedYear}
              >
                <Settings2 className="ml-1.5 h-4 w-4" />
                {tr("إعدادات العام", "Year settings")}
              </Button>
              <Button
                variant="outline"
                onClick={openNewPeriod}
                disabled={!selectedYear}
              >
                <Layers3 className="ml-1.5 h-4 w-4" />
                {tr("إضافة فترة", "Add period")}
              </Button>
              <Button onClick={openNewEvent} disabled={!selectedYear}>
                <Plus className="ml-1.5 h-4 w-4" />
                {tr("إضافة حدث", "Add event")}
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="h-5 w-5" />
          {notice}
        </div>
      )}
      {error && !yearModal && !eventModal && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      {years.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 font-black">{tr("لا يوجد عام أكاديمي", "No academic year")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {tr("أنشئ العام وحدد بدايته ونهايته قبل إعداد الدورات والجداول.", "Create an academic year and set its dates before configuring rotations and schedules.")}
          </p>
          {canManage && (
            <Button className="mt-4" onClick={openNewYear}>
              {tr("إنشاء أول عام", "Create first year")}
            </Button>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-slate-500">
                  {tr("العام الأكاديمي", "Academic year")}
                </label>
                <select
                  className={`${inputClass} w-48`}
                  value={yearId}
                  onChange={(e) => setYearId(e.target.value)}
                >
                  {years.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code}
                      {item.is_current ? tr(" — الحالي", " — Current") : ""}
                    </option>
                  ))}
                </select>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${selectedYear?.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                >
                  {selectedYear?.status === "active"
                    ? tr("نشط", "Active")
                    : selectedYear?.status === "planned"
                      ? tr("مخطط", "Planned")
                      : tr("مغلق", "Closed")}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "fourth", "fifth", "sixth"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => setLevel(item)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold ${level === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {item === "all" ? tr("كل السنوات", "All years") : levelLabel(item)}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {overviewQuery.isLoading ? (
            <LoadingState />
          ) : overviewQuery.isError ? (
            <ErrorState onRetry={() => overviewQuery.refetch()} />
          ) : (
            overview && (
              <>
                <section className="grid gap-3 lg:grid-cols-3">
                  {overview.periods.map((period) => (
                    <article
                      key={period.id}
                      className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-black text-indigo-700">
                            {period.code} · {period.weeks_count} {tr("أسبوع", "weeks")}
                          </span>
                          <h3 className="mt-2 font-black text-slate-900">{ar ? period.name_ar : (period.name_en || period.name_ar)}</h3>
                          <p className="mt-1 text-xs text-slate-500">
                            {format(period.start_date)} —{" "}
                            {format(period.end_date)}
                          </p>
                        </div>
                        {canManage && (
                          <div className="flex">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditPeriod(period)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => {
                                if (confirm(tr(`حذف ${period.name_ar}؟`, `Delete ${period.name_en || period.name_ar}?`)))
                                  deletePeriod.mutate(period.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </section>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Summary
                    icon={<CalendarDays />}
                    label={tr("مدة العام", "Academic year duration")}
                    value={`${format(selectedYear?.start_date ?? null)} — ${format(selectedYear?.end_date ?? null)}`}
                  />
                  <Summary
                    icon={<Layers3 />}
                    label={tr("الدورات المرتبطة", "Linked rotations")}
                    value={tr(`${visibleRotations.length} دورة`, `${visibleRotations.length} rotations`)}
                  />
                  <Summary
                    icon={<Clock3 />}
                    label={tr("الأحداث المسجلة", "Recorded events")}
                    value={tr(`${visibleEvents.length} حدث`, `${visibleEvents.length} events`)}
                  />
                  <Summary
                    icon={<AlertTriangle />}
                    label={tr("فترات توقف التدريب", "Training suspension periods")}
                    value={tr(`${visibleEvents.filter((item) => item.suspends_clinical_training).length} فترة`, `${visibleEvents.filter((item) => item.suspends_clinical_training).length} periods`)}
                  />
                </div>

                <Card className="overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                      <button
                        className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "timeline" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                        onClick={() => setView("timeline")}
                      >
                        {tr("التسلسل الزمني", "Timeline")}
                      </button>
                      <button
                        className={`rounded-lg px-3 py-2 text-xs font-bold ${view === "rotations" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                        onClick={() => setView("rotations")}
                      >
                        {tr("خطة الدورات", "Rotation plan")}
                      </button>
                    </div>
                    <Link
                      to="/distribution"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {tr("فتح شاشة التوزيع السريري", "Open clinical distribution")}
                    </Link>
                  </div>
                  {view === "timeline" ? (
                    <div className="divide-y divide-slate-100">
                      {timeline.length === 0 ? (
                        <Empty text={tr("لا توجد أحداث أو دورات مؤرخة ضمن التصفية الحالية.", "No dated events or rotations match the current filter.")} />
                      ) : (
                        timeline.map((entry) =>
                          entry.kind === "event" ? (
                            <EventRow
                              key={`e-${entry.item.id}`}
                              item={entry.item}
                              canManage={canManage}
                              onEdit={() => openEditEvent(entry.item)}
                              onDelete={() => {
                                if (confirm(tr(`حذف الحدث «${entry.item.name}»؟`, `Delete event “${entry.item.name}”?`)))
                                  deleteMutation.mutate(entry.item.id);
                              }}
                            />
                          ) : (
                            <RotationRow
                              key={`r-${entry.item.id}`}
                              item={entry.item}
                            />
                          ),
                        )
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {visibleRotations.length === 0 ? (
                        <Empty text={tr("لا توجد دورات سريرية مرتبطة بهذا العام والمستوى.", "No clinical rotations are linked to this year and level.")} />
                      ) : (
                        visibleRotations.map((item) => (
                          <RotationRow key={item.id} item={item} detailed />
                        ))
                      )}
                    </div>
                  )}
                </Card>
              </>
            )
          )}
        </>
      )}

      <Modal
        isOpen={periodModal}
        onClose={() => setPeriodModal(false)}
        title={editingPeriod ? tr("تعديل الفترة السريرية", "Edit clinical period") : tr("إضافة فترة سريرية", "Add clinical period")}
        maxWidth="xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            periodMutation.mutate();
          }}
        >
          <ModalError text={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("رمز الفترة", "Period code")}>
              <input
                required
                className={inputClass}
                value={periodForm.code}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, code: e.target.value })
                }
              />
            </Field>
            <Field label={tr("الترتيب", "Sequence")}>
              <input
                required
                type="number"
                min="1"
                max="10"
                className={inputClass}
                value={periodForm.sequence}
                onChange={(e) =>
                  setPeriodForm({
                    ...periodForm,
                    sequence: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label={tr("اسم الفترة", "Arabic period name")}>
              <input
                required
                className={inputClass}
                value={periodForm.name_ar}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, name_ar: e.target.value })
                }
              />
            </Field>
            <Field label={tr("الاسم بالإنجليزية", "English name")}>
              <input
                className={inputClass}
                value={periodForm.name_en}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, name_en: e.target.value })
                }
              />
            </Field>
            <Field label={tr("تاريخ البداية", "Start date")}>
              <input
                required
                type="date"
                min={selectedYear?.start_date}
                max={selectedYear?.end_date}
                className={inputClass}
                value={periodForm.start_date}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, start_date: e.target.value })
                }
              />
            </Field>
            <Field label={tr("تاريخ النهاية", "End date")}>
              <input
                required
                type="date"
                min={periodForm.start_date}
                max={selectedYear?.end_date}
                className={inputClass}
                value={periodForm.end_date}
                onChange={(e) =>
                  setPeriodForm({ ...periodForm, end_date: e.target.value })
                }
              />
            </Field>
            <Field label={tr("عدد الأسابيع", "Number of weeks")}>
              <input
                required
                type="number"
                min="1"
                max="52"
                className={inputClass}
                value={periodForm.weeks_count}
                onChange={(e) =>
                  setPeriodForm({
                    ...periodForm,
                    weeks_count: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label={tr("الحالة", "Status")}>
              <select
                className={inputClass}
                value={periodForm.status}
                onChange={(e) =>
                  setPeriodForm({
                    ...periodForm,
                    status: e.target.value as ClinicalPeriod["status"],
                  })
                }
              >
                <option value="planned">{tr("مخططة", "Planned")}</option>
                <option value="active">{tr("فعالة", "Active")}</option>
                <option value="closed">{tr("منتهية", "Closed")}</option>
              </select>
            </Field>
          </div>
          <Field label={tr("ملاحظات", "Notes")}>
            <textarea
              className={`${inputClass} h-20 py-2`}
              value={periodForm.notes}
              onChange={(e) =>
                setPeriodForm({ ...periodForm, notes: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPeriodModal(false)}
            >
              {tr("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" isLoading={periodMutation.isPending}>
              {tr("حفظ الفترة", "Save period")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={yearModal}
        onClose={() => setYearModal(false)}
        title={
          editingYear
            ? tr("تعديل العام الأكاديمي السنوي", "Edit annual academic year")
            : tr("إنشاء عام أكاديمي سنوي", "Create annual academic year")
        }
        maxWidth="2xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            yearMutation.mutate();
          }}
        >
          <ModalError text={error} />
          <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-xs font-bold leading-6 text-teal-900">
            {tr("تعتمد كلية الطب نظاماً سنوياً؛ جميع الدورات والامتحانات والأحداث تُرتب بين بداية العام ونهايته دون تقسيم إلى فصول.", "The Faculty of Medicine follows an annual system; rotations, exams, and events are scheduled between the academic year's start and end dates without semesters.")}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={tr("رمز العام", "Year code")}>
              <input
                required
                pattern="[0-9]{4}/[0-9]{4}"
                placeholder="2026/2027"
                className={inputClass}
                value={yearForm.code}
                onChange={(e) =>
                  setYearForm({ ...yearForm, code: e.target.value })
                }
              />
            </Field>
            <Field label={tr("بداية العام", "Year start")}>
              <input
                required
                type="date"
                className={inputClass}
                value={yearForm.start_date}
                onChange={(e) =>
                  setYearForm({ ...yearForm, start_date: e.target.value })
                }
              />
            </Field>
            <Field label={tr("نهاية العام", "Year end")}>
              <input
                required
                type="date"
                className={inputClass}
                value={yearForm.end_date}
                onChange={(e) =>
                  setYearForm({ ...yearForm, end_date: e.target.value })
                }
              />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={tr("حالة العام", "Year status")}>
              <select
                className={inputClass}
                value={yearForm.status}
                onChange={(e) =>
                  setYearForm({
                    ...yearForm,
                    status: e.target.value as AcademicYear["status"],
                  })
                }
              >
                <option value="planned">{tr("مخطط", "Planned")}</option>
                <option value="active">{tr("نشط", "Active")}</option>
                <option value="closed">{tr("مغلق", "Closed")}</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold">
              <input
                type="checkbox"
                checked={yearForm.is_current}
                onChange={(e) =>
                  setYearForm({ ...yearForm, is_current: e.target.checked })
                }
              />
              {tr("اعتماد هذا العام كعام حالي", "Set as current academic year")}
            </label>
          </div>
          <Field label={tr("ملاحظات", "Notes")}>
            <textarea
              className={`${inputClass} h-20 py-2`}
              value={yearForm.notes}
              onChange={(e) =>
                setYearForm({ ...yearForm, notes: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setYearModal(false)}
            >
              {tr("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" isLoading={yearMutation.isPending}>
              {tr("حفظ العام", "Save year")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={eventModal}
        onClose={() => setEventModal(false)}
        title={editingEvent ? tr("تعديل حدث التقويم", "Edit calendar event") : tr("إضافة حدث إلى التقويم", "Add calendar event")}
        maxWidth="xl"
      >
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            eventMutation.mutate();
          }}
        >
          <ModalError text={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("اسم الحدث", "Event name")}>
              <input
                required
                className={inputClass}
                value={eventForm.name}
                onChange={(e) =>
                  setEventForm({ ...eventForm, name: e.target.value })
                }
                placeholder={tr("مثال: امتحان الجراحة النهائي", "Example: Final surgery exam")}
              />
            </Field>
            <Field label={tr("نوع الحدث", "Event type")}>
              <select
                className={inputClass}
                value={eventForm.event_type}
                onChange={(e) =>
                  setEventForm({
                    ...eventForm,
                    event_type: e.target.value as EventType,
                  })
                }
              >
                {Object.entries(eventTypes).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label[locale]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={tr("تاريخ البداية", "Start date")}>
              <input
                required
                type="date"
                min={selectedYear?.start_date}
                max={selectedYear?.end_date}
                className={inputClass}
                value={eventForm.start_date}
                onChange={(e) =>
                  setEventForm({ ...eventForm, start_date: e.target.value })
                }
              />
            </Field>
            <Field label={tr("تاريخ النهاية", "End date")}>
              <input
                required
                type="date"
                min={eventForm.start_date || selectedYear?.start_date}
                max={selectedYear?.end_date}
                className={inputClass}
                value={eventForm.end_date}
                onChange={(e) =>
                  setEventForm({ ...eventForm, end_date: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label={tr("السنوات المتأثرة (اتركها فارغة ليشمل الحدث الجميع)", "Affected years (leave empty to include all years)")}>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(levels) as Level[]).map((item) => (
                <label
                  key={item}
                  className={`rounded-xl border px-3 py-2 text-center text-xs font-bold ${eventForm.affected_levels.includes(item) ? "border-teal-400 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}
                >
                  <input
                    className="sr-only"
                    type="checkbox"
                    checked={eventForm.affected_levels.includes(item)}
                    onChange={() => toggleLevel(item)}
                  />
                  {levelLabel(item)}
                </label>
              ))}
            </div>
          </Field>
          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-900">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={eventForm.suspends_clinical_training}
              onChange={(e) =>
                setEventForm({
                  ...eventForm,
                  suspends_clinical_training: e.target.checked,
                })
              }
            />
            <span>
              {tr("هذا الحدث يوقف التدريب السريري خلال مدته (مثل الإجازة أو فترة الامتحانات).", "This event suspends clinical training for its duration, such as a holiday or examination period.")}
            </span>
          </label>
          <Field label={tr("ملاحظات", "Notes")}>
            <textarea
              className={`${inputClass} h-20 py-2`}
              value={eventForm.notes}
              onChange={(e) =>
                setEventForm({ ...eventForm, notes: e.target.value })
              }
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEventModal(false)}
            >
              {tr("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" isLoading={eventMutation.isPending}>
              {tr("حفظ الحدث", "Save event")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-bold text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
function ModalError({ text }: { text: string }) {
  return text ? (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
      {text}
    </div>
  ) : null;
}
function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-slate-400">{text}</div>;
}
function EventRow({
  item,
  canManage,
  onEdit,
  onDelete,
}: {
  item: CalendarEvent;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const type = eventTypes[item.event_type] ?? eventTypes.other;
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center">
      <div className="text-xs font-bold text-slate-500">
        <p>{formatDate(item.start_date, locale)}</p>
        {item.end_date !== item.start_date && (
          <p className="mt-1">{ar ? "حتى" : "Until"} {formatDate(item.end_date, locale)}</p>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${type.color}`}
          >
            {type.label[locale]}
          </span>
          <h3 className="text-sm font-black text-slate-900">{item.name}</h3>
          {item.suspends_clinical_training && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
              {ar ? "يوقف التدريب" : "Suspends training"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.affected_levels.length
            ? item.affected_levels.map((value) => levels[value][locale]).join(ar ? "، " : ", ")
            : ar ? "جميع السنوات" : "All years"}
          {item.notes ? ` · ${item.notes}` : ""}
        </p>
      </div>
      {canManage && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={ar ? "تعديل" : "Edit"}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={onDelete}
            aria-label={ar ? "حذف" : "Delete"}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
function RotationRow({
  item,
  detailed = false,
}: {
  item: Rotation;
  detailed?: boolean;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-[130px_1fr_auto] sm:items-center">
      <div className="text-xs font-bold text-slate-500">
        {item.start_date ? (
          <>
            <p>{formatDate(item.start_date, locale)}</p>
            <p className="mt-1">{ar ? "حتى" : "Until"} {formatDate(item.end_date, locale)}</p>
          </>
        ) : (
          <span className="text-amber-700">{ar ? "غير مؤرخة" : "Not dated"}</span>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            {(ar ? item.clinical_period?.name_ar : item.clinical_period?.name_en) ?? (ar ? "جدول سنوي" : "Annual schedule")}
          </span>
          <h3 className="text-sm font-black">{item.name}</h3>
          <span className="font-mono text-[10px] text-slate-400">
            {item.code}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {levels[item.academic_level][locale]} · {item.duration_weeks ?? "—"} {ar ? "أسبوع" : "weeks"}
          {detailed && item.blocks.length
            ? ` · ${item.blocks.map((block) => `${block.block_code} (${ar ? "أسبوع" : "Week"} ${block.from_week}-${block.to_week})`).join(ar ? "، " : ", ")}`
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <GraduationCap className="h-4 w-4 text-teal-600" />
        <span className="text-[10px] font-bold text-slate-500">
          {item.distribution_status === "published"
            ? ar ? "منشور" : "Published"
            : item.distribution_status === "approved"
              ? ar ? "معتمد" : "Approved"
              : item.distribution_status
                ? ar ? "قيد الإعداد" : "In preparation"
                : ar ? "دون جدول" : "No schedule"}
        </span>
      </div>
    </div>
  );
}
