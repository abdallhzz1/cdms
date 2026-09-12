import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  History,
  Plus,
  Printer,
  Save,
  Send,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/i18n/I18nContext";

type Domain = {
  code: string;
  name_ar: string;
  name_en: string;
  weight: number;
  score: number;
  weighted_score?: number;
  comment: string;
};
type Evaluation = {
  id: number;
  clinical_supervisor_user_id: number;
  clinical_supervisor_name: string;
  academic_year_id: number;
  academic_year_name?: string | null;
  evaluation_purpose: string;
  status: string;
  overall_score: number;
  overall_rating?: string | null;
  recommendation?: string | null;
  recommendation_notes?: string | null;
  domains: Domain[];
  strengths: string[];
  development_areas: string[];
  evaluator_name?: string | null;
  evaluator_role?: string | null;
  dean_name?: string | null;
  dean_role?: string | null;
  activity_log?: Array<{ action: string; user_name: string; at: string }>;
};
type Options = {
  supervisors: Array<{
    user_id: number;
    name: string;
    department_name?: string | null;
  }>;
  academic_years: Array<{ id: number; code: string; is_current: boolean }>;
};

const domains = [
  {
    code: "clinical_commitment",
    name_ar: "الالتزام بالحضور وتغطية التدريب السريري",
    name_en: "Clinical Attendance and Training Coverage",
    weight: 20,
  },
  {
    code: "student_supervision",
    name_ar: "الإشراف المباشر والتوجيه السريري للطلبة",
    name_en: "Direct Clinical Supervision and Student Guidance",
    weight: 25,
  },
  {
    code: "assessment_feedback",
    name_ar: "جودة التقييم والتغذية الراجعة في الوقت المناسب",
    name_en: "Assessment Quality and Timely Feedback",
    weight: 20,
  },
  {
    code: "professionalism_communication",
    name_ar: "المهنية والتواصل مع الطلبة والفريق العلاجي",
    name_en: "Professionalism and Communication",
    weight: 15,
  },
  {
    code: "patient_safety_student_welfare",
    name_ar: "سلامة المرضى وبيئة تدريب الطلبة",
    name_en: "Patient Safety and Student Learning Environment",
    weight: 10,
  },
  {
    code: "development_contribution",
    name_ar: "التطوير المهني والإسهام في تطوير التدريب",
    name_en: "Professional Development and Training Contribution",
    weight: 10,
  },
] as const;
const scoreOptions = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100";
const statusLabel: Record<string, { ar: string; en: string }> = {
  draft: { ar: "مسودة", en: "Draft" },
  submitted: { ar: "بانتظار الاعتماد", en: "Pending approval" },
  approved: { ar: "معتمد", en: "Approved" },
};
const newForm = (supervisor = "", year = "") => ({
  clinical_supervisor_user_id: supervisor,
  academic_year_id: year,
  evaluation_purpose: "annual_performance",
  domains: Object.fromEntries(
    domains.map((domain) => [domain.code, { score: 0, comment: "" }]),
  ),
  strengths: "",
  development_areas: "",
  recommendation: "continue",
  recommendation_notes: "",
});
const errorText = (error: unknown, ar: boolean) =>
  error instanceof ApiError
    ? error.message
    : ar
      ? "تعذر حفظ التقييم. حاول مرة أخرى."
      : "The evaluation could not be saved. Please try again.";

export function ClinicalSupervisorEvaluationsPage() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const tr = (arabic: string, english: string) => (ar ? arabic : english);
  const status = (value: string) => statusLabel[value]?.[locale] || value;
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(
    Number(params.get("evaluation")) || null,
  );
  const [form, setForm] = useState(newForm(params.get("supervisor") || ""));
  const [notice, setNotice] = useState("");
  const canCreate = can("clinical_supervisor_evaluations.create");
  const canApprove =
    can("clinical_supervisor_evaluations.approve") || can("approvals.decide");
  const optionsQuery = useQuery({
    queryKey: ["clinical-supervisor-evaluation-options"],
    queryFn: () =>
      apiFetch<Options>("/clinical-supervisor-evaluations/options"),
  });
  const listQuery = useQuery({
    queryKey: ["clinical-supervisor-evaluations"],
    queryFn: () => apiFetch<Evaluation[]>("/clinical-supervisor-evaluations"),
  });
  const selectedQuery = useQuery({
    queryKey: ["clinical-supervisor-evaluation", selectedId],
    queryFn: () =>
      apiFetch<Evaluation>(`/clinical-supervisor-evaluations/${selectedId}`),
    enabled: Boolean(selectedId),
  });
  const options = optionsQuery.data;
  const selected = selectedQuery.data;

  useEffect(() => {
    if (!options) return;
    const currentYear =
      options.academic_years.find((year) => year.is_current)?.id ||
      options.academic_years[0]?.id ||
      "";
    setForm((current) => ({
      ...current,
      clinical_supervisor_user_id:
        current.clinical_supervisor_user_id ||
        params.get("supervisor") ||
        String(options.supervisors[0]?.user_id || ""),
      academic_year_id: current.academic_year_id || String(currentYear),
    }));
  }, [options, params]);
  useEffect(() => {
    if (!selected) return;
    setForm({
      clinical_supervisor_user_id: String(selected.clinical_supervisor_user_id),
      academic_year_id: String(selected.academic_year_id),
      evaluation_purpose: selected.evaluation_purpose,
      domains: Object.fromEntries(
        selected.domains.map((domain) => [
          domain.code,
          { score: domain.score, comment: domain.comment || "" },
        ]),
      ),
      strengths: selected.strengths.join("\n"),
      development_areas: selected.development_areas.join("\n"),
      recommendation: selected.recommendation || "continue",
      recommendation_notes: selected.recommendation_notes || "",
    });
  }, [selected]);

  const payload = () => ({
    ...form,
    clinical_supervisor_user_id: Number(form.clinical_supervisor_user_id),
    academic_year_id: Number(form.academic_year_id),
    strengths: form.strengths
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    development_areas: form.development_areas
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
  });
  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["clinical-supervisor-evaluations"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["clinical-supervisor-evaluation"],
      }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      selectedId
        ? apiFetch<Evaluation>(
            `/clinical-supervisor-evaluations/${selectedId}`,
            { method: "PUT", body: payload() },
          )
        : apiFetch<Evaluation>("/clinical-supervisor-evaluations", {
            method: "POST",
            body: payload(),
          }),
    onSuccess: async (evaluation) => {
      setSelectedId(evaluation.id);
      setParams({ evaluation: String(evaluation.id) });
      await refresh();
      setNotice(tr("تم حفظ مسودة التقييم.", "Evaluation draft saved."));
    },
  });
  const action = useMutation({
    mutationFn: ({ type }: { type: "submit" | "approve" | "reopen" }) =>
      apiFetch<Evaluation>(
        `/clinical-supervisor-evaluations/${selectedId}/${type}`,
        { method: "POST" },
      ),
    onSuccess: async (_, variables) => {
      await refresh();
      setNotice(
        variables.type === "approve"
          ? tr("تم اعتماد التقييم رسميًا.", "Evaluation approved officially.")
          : variables.type === "submit"
            ? tr(
                "تم توقيع التقييم وإرساله للاعتماد.",
                "Evaluation signed and submitted for approval.",
              )
            : tr("أعيد التقييم إلى مسودة.", "Evaluation returned to draft."),
      );
    },
  });
  const score = useMemo(
    () =>
      domains.reduce(
        (total, domain) =>
          total +
          (Number(form.domains[domain.code]?.score || 0) / 5) * domain.weight,
        0,
      ),
    [form.domains],
  );
  const complete = domains.every(
    (domain) => Number(form.domains[domain.code]?.score || 0) >= 1,
  );
  const canEdit = canCreate && (!selected || selected.status === "draft");
  const startNew = () => {
    setSelectedId(null);
    setParams({});
    setForm(
      newForm(
        String(options?.supervisors[0]?.user_id || ""),
        String(
          options?.academic_years.find((year) => year.is_current)?.id ||
            options?.academic_years[0]?.id ||
            "",
        ),
      ),
    );
  };
  if (optionsQuery.isLoading || listQuery.isLoading) return <LoadingState />;
  if (optionsQuery.isError || listQuery.isError)
    return (
      <ErrorState
        title={tr("تعذر تحميل تقييمات المشرفين", "Unable to load supervisor evaluations")}
        message={tr("تحقق من الصلاحيات ثم أعد المحاولة.", "Check your permissions and try again.")}
        onRetry={() => {
          optionsQuery.refetch();
          listQuery.refetch();
        }}
      />
    );

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <PageHeader
        title={tr("تقييم المشرفين السريريين", "Clinical Supervisor Evaluations")}
        description={tr("نموذج رسمي يركز على جودة الإشراف السريري، التقييم، المهنية، وسلامة بيئة تدريب الطلبة.", "An official evaluation of clinical supervision, assessment quality, professionalism, and the student learning environment.")}
      >
        {canCreate && (
          <Button onClick={startNew}>
            <Plus className="me-2 h-4 w-4" />
            {tr("تقييم جديد", "New evaluation")}
          </Button>
        )}
        {selected && (
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="me-2 h-4 w-4" />
            {tr("طباعة", "Print")}
          </Button>
        )}
      </PageHeader>
      {notice && (
        <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800">
          {notice}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <Card className="h-fit rounded-3xl border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-black">{tr("سجل التقييمات", "Evaluation history")}</h2>
          </div>
          <div className="space-y-2">
            {(listQuery.data || []).length ? (
              (listQuery.data || []).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setParams({ evaluation: String(item.id) });
                  }}
                  className={`w-full rounded-2xl border p-3 text-start ${selectedId === item.id ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-200"}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-black">
                      {item.clinical_supervisor_name}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold">
                      {status(item.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {item.academic_year_name}
                  </p>
                  <p className="mt-2 text-xs font-bold text-teal-700">
                    {item.overall_score} / 100 ·{" "}
                    {item.overall_rating || tr("غير مكتمل", "Incomplete")}
                  </p>
                </button>
              ))
            ) : (
              <p className="rounded-2xl border border-dashed p-5 text-center text-xs text-slate-500">
                {tr("لا توجد تقييمات بعد.", "No evaluations yet.")}
              </p>
            )}
          </div>
        </Card>
        <Card className="rounded-3xl border-slate-200 p-4 sm:p-6">
          {!canCreate && !selected ? (
            <div className="py-16 text-center">
              <ShieldCheck className="mx-auto h-10 w-10 text-teal-600" />
              <h2 className="mt-3 font-black">{tr("اختر تقييمًا من السجل", "Select an evaluation from the history")}</h2>
            </div>
          ) : (
            <>
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row">
                <div>
                  <h2 className="font-black text-slate-800">
                    {selected ? tr("نموذج تقييم المشرف", "Supervisor evaluation form") : tr("مسودة تقييم جديدة", "New evaluation draft")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {tr("النتيجة من 100 تُحتسب تلقائيًا من المحاور الستة.", "The score out of 100 is calculated automatically from the six domains.")}
                  </p>
                </div>
                {selected && (
                  <span className="h-fit rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800">
                    {status(selected.status)}
                  </span>
                )}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <label>
                  <span className="mb-1 block text-xs font-bold">
                    {tr("المشرف السريري", "Clinical supervisor")}
                  </span>
                  <select
                    disabled={!canEdit}
                    value={form.clinical_supervisor_user_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        clinical_supervisor_user_id: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">{tr("اختر المشرف", "Select supervisor")}</option>
                    {options?.supervisors.map((supervisor) => (
                      <option
                        key={supervisor.user_id}
                        value={supervisor.user_id}
                      >
                        {supervisor.name}
                        {supervisor.department_name
                          ? ` - ${supervisor.department_name}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-bold">
                    {tr("العام الأكاديمي", "Academic year")}
                  </span>
                  <select
                    disabled={!canEdit}
                    value={form.academic_year_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        academic_year_id: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    {options?.academic_years.map((year) => (
                      <option key={year.id} value={year.id}>
                        {year.code}
                        {year.is_current ? tr(" - الحالي", " - Current") : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-xs font-bold">{tr("الغرض", "Purpose")}</span>
                  <select
                    disabled={!canEdit}
                    value={form.evaluation_purpose}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        evaluation_purpose: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="annual_performance">{tr("تقييم أداء سنوي", "Annual performance evaluation")}</option>
                    <option value="renewal">{tr("تجديد الإشراف", "Supervision renewal")}</option>
                  </select>
                </label>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-2xl border border-teal-100 bg-teal-50 p-4">
                <p className="text-xs font-bold text-teal-800">
                  {tr("سلم التقدير: 5 ممتاز · 4 جيد جدًا · 3 جيد · 2 مقبول · 1 غير مرضٍ", "Rating scale: 5 Excellent · 4 Very good · 3 Good · 2 Acceptable · 1 Unsatisfactory")}
                </p>
                <p className="text-xl font-black text-teal-800">
                  {score.toFixed(1)} / 100
                </p>
              </div>
              <div className="mt-5 space-y-3">
                {domains.map((domain, index) => {
                  const value = form.domains[domain.code] || {
                    score: 0,
                    comment: "",
                  };
                  return (
                    <section
                      key={domain.code}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-col justify-between gap-2 sm:flex-row">
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            {index + 1}. {ar ? domain.name_ar : domain.name_en}{" "}
                            <span className="text-xs text-teal-700">
                              ({domain.weight}%)
                            </span>
                          </p>
                          {ar && <p className="mt-1 text-[11px] text-slate-500">{domain.name_en}</p>}
                        </div>
                        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-black">
                          {(
                            (Number(value.score || 0) / 5) *
                            domain.weight
                          ).toFixed(1)}{" "}
                          / {domain.weight}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {scoreOptions.map((valueOption) => (
                          <button
                            key={valueOption}
                            disabled={!canEdit}
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                domains: {
                                  ...current.domains,
                                  [domain.code]: {
                                    ...current.domains[domain.code],
                                    score: valueOption,
                                  },
                                },
                              }))
                            }
                            className={`h-8 min-w-10 rounded-lg border px-2 text-xs font-bold ${Number(value.score) === valueOption ? "border-teal-500 bg-teal-500 text-white" : "border-slate-200 bg-white text-slate-600"} disabled:opacity-70`}
                          >
                            {valueOption}
                          </button>
                        ))}
                      </div>
                      <textarea
                        disabled={!canEdit}
                        rows={2}
                        value={value.comment}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            domains: {
                              ...current.domains,
                              [domain.code]: {
                                ...current.domains[domain.code],
                                comment: event.target.value,
                              },
                            },
                          }))
                        }
                        className={`${inputClass} mt-3 resize-y`}
                        placeholder={tr("ملاحظات ومبررات مهنية لهذا المحور...", "Professional comments and rationale for this domain...")}
                      />
                    </section>
                  );
                })}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-black">
                    {tr("نقاط القوة والإنجازات", "Strengths and achievements")}
                  </span>
                  <textarea
                    disabled={!canEdit}
                    rows={5}
                    value={form.strengths}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        strengths: event.target.value,
                      }))
                    }
                    className={`${inputClass} resize-y`}
                    placeholder={tr("كل بند في سطر مستقل", "Enter each item on a separate line")}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-black">
                    {tr("مجالات التطوير", "Development areas")}
                  </span>
                  <textarea
                    disabled={!canEdit}
                    rows={5}
                    value={form.development_areas}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        development_areas: event.target.value,
                      }))
                    }
                    className={`${inputClass} resize-y`}
                    placeholder={tr("كل بند في سطر مستقل", "Enter each item on a separate line")}
                  />
                </label>
              </div>
              <section className="mt-5 rounded-2xl border border-slate-200 p-4">
                <h3 className="text-sm font-black">{tr("التوصية النهائية", "Final recommendation")}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-[16rem_1fr]">
                  <select
                    disabled={!canEdit}
                    value={form.recommendation}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recommendation: event.target.value,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="continue">{tr("يوصى بالاستمرار في الإشراف", "Recommend continuing supervision")}</option>
                    <option value="continue_with_development_plan">
                      {tr("الاستمرار مع خطة تطوير", "Continue with a development plan")}
                    </option>
                    <option value="not_recommend">{tr("لا يوصى بالاستمرار", "Do not recommend continuing")}</option>
                  </select>
                  <textarea
                    disabled={!canEdit}
                    rows={3}
                    value={form.recommendation_notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recommendation_notes: event.target.value,
                      }))
                    }
                    className={`${inputClass} resize-y`}
                    placeholder={tr("الخلاصة المهنية والتوصية...", "Professional summary and recommendation...")}
                  />
                </div>
              </section>
              {canEdit && (
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => save.mutate()}
                    isLoading={save.isPending}
                  >
                    <Save className="me-2 h-4 w-4" />
                    {tr("حفظ مسودة", "Save draft")}
                  </Button>
                  {selected && (
                    <Button
                      onClick={() => action.mutate({ type: "submit" })}
                      disabled={!complete || action.isPending}
                    >
                      <Send className="me-2 h-4 w-4" />
                      {tr("توقيع وإرسال", "Sign and submit")}
                    </Button>
                  )}
                </div>
              )}
              {selected?.status === "submitted" && canApprove && (
                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => action.mutate({ type: "reopen" })}
                  >
                    <Undo2 className="me-2 h-4 w-4" />
                    {tr("إعادة فتح", "Reopen")}
                  </Button>
                  <Button onClick={() => action.mutate({ type: "approve" })}>
                    <CheckCircle2 className="me-2 h-4 w-4" />
                    {tr("اعتماد المرحلة الحالية", "Approve current stage")}
                  </Button>
                </div>
              )}
              {selected?.status === "approved" && canApprove && (
                <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => action.mutate({ type: "reopen" })}
                  >
                    <Undo2 className="me-2 h-4 w-4" />
                    {tr("إعادة إلى مسودة", "Return to draft")}
                  </Button>
                </div>
              )}
              {(save.isError || action.isError) && (
                <p className="mt-3 text-sm font-bold text-red-600">
                  {errorText(save.error || action.error, ar)}
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
