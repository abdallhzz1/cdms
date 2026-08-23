import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Search,
  Star,
  ExternalLink,
  Building2,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  Mail,
  Phone,
  Users2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClinicalSupervisorSummary {
  id: string;
  user_id: number;
  name: string;
  email: string;
  title: string;
  department_name: string;
  specialty: string;
  contract_type: string;
  phone?: string;
  kpi_score: number;
  kpi_rating: string;
  avatar_url?: string;
}

// ─── KPI Badge helpers ────────────────────────────────────────────────────────

function kpiBadgeColors(rating: string) {
  if (rating === "ممتاز")    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (rating === "جيد جداً") return "bg-teal-50 text-teal-800 border-teal-200";
  if (rating === "جيد")      return "bg-blue-50 text-blue-800 border-blue-200";
  return "bg-amber-50 text-amber-800 border-amber-200";
}

function scoreBarColor(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-teal-500";
  if (score >= 70) return "bg-blue-500";
  return "bg-amber-500";
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function SupervisorAvatar({ name, url }: { name: string; url?: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-100 shadow-sm"
      />
    );
  }

  return (
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0">
      {initials || "م"}
    </div>
  );
}

// ─── Supervisor Card ──────────────────────────────────────────────────────────

function SupervisorCard({
  supervisor,
  index,
  onNavigate,
}: {
  supervisor: ClinicalSupervisorSummary;
  index: number;
  onNavigate: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onNavigate(supervisor.id)}
      className="group bg-white rounded-3xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col"
    >
      {/* Card header stripe */}
      <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500" />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Top row: avatar + name + badge */}
        <div className="flex items-start gap-3.5">
          <SupervisorAvatar name={supervisor.name} url={supervisor.avatar_url} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400 font-mono">
                #{index + 1}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${kpiBadgeColors(supervisor.kpi_rating)}`}
              >
                {supervisor.kpi_rating}
              </span>
            </div>
            <h3 className="font-black text-sm text-slate-900 mt-0.5 leading-snug group-hover:text-indigo-700 transition-colors">
              {supervisor.name}
            </h3>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
              {supervisor.title}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100" />

        {/* Info rows */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11.5px] text-slate-600 font-semibold">
            <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">قسم {supervisor.department_name}</span>
          </div>

          {supervisor.specialty && (
            <div className="flex items-center gap-2 text-[11.5px] text-slate-600 font-semibold">
              <Stethoscope className="w-3.5 h-3.5 text-violet-500 shrink-0" />
              <span className="truncate">{supervisor.specialty}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate font-mono">{supervisor.email}</span>
          </div>

          {supervisor.phone && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="font-mono">{supervisor.phone}</span>
            </div>
          )}
        </div>

        {/* KPI score bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10.5px] font-bold">
            <span className="text-slate-500 flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-300" />
              مؤشر الأداء (KPI)
            </span>
            <span className="font-mono text-slate-800">{supervisor.kpi_score} / 100</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${scoreBarColor(supervisor.kpi_score)}`}
              style={{ width: `${supervisor.kpi_score}%` }}
            />
          </div>
        </div>

        {/* Footer action */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(supervisor.id);
          }}
          className="mt-auto w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-sm"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>فتح البروفايل الكامل</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ClinicalSupervisorsDirectoryPage() {
  const navigate = useNavigate();
  const perPage = 12;

  const [searchInput, setSearchInput]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]                     = useState(1);

  // Debounce 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch from real API
  const { data: apiResponse, isLoading } = useQuery({
    queryKey: ["clinical-supervisors-directory-v1"],
    queryFn: async () => {
      const res = await apiFetch<any>("/clinical-supervisors");
      return Array.isArray(res) ? res : res?.data || [];
    },
  });

  const supervisorsList: ClinicalSupervisorSummary[] = useMemo(() => {
    if (!apiResponse || !Array.isArray(apiResponse)) return [];
    return apiResponse.map((item: any) => ({
      id:              String(item.id || item.user_id),
      user_id:         item.user_id || Number(item.id),
      name:            item.name || item.full_name_ar || "",
      email:           item.email || "",
      title:           item.title || item.academic_title || "مشرف سريري",
      department_name: item.department_name || "القسم السريري",
      specialty:       item.specialty || "",
      contract_type:   item.contract_type || "عقد سريري",
      phone:           item.phone || undefined,
      kpi_score:       Number(item.kpi_score) || 0,
      kpi_rating:      item.kpi_rating || "مقبول",
      avatar_url:      item.avatar_url || undefined,
    }));
  }, [apiResponse]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return supervisorsList;
    const q = debouncedSearch.toLowerCase();
    return supervisorsList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.department_name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.specialty.toLowerCase().includes(q)
    );
  }, [supervisorsList, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <PageHeader
        title="دليل المشرفون السريريون"
        description="جميع المستخدمين المسجلين بدور مشرف سريري في النظام — مباشرة من قاعدة البيانات"
      />

      {/* Search & Stats bar */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search box */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5 rounded-2xl border border-slate-200 w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="بحث بالاسم، القسم، التخصص، أو البريد..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-hidden placeholder:text-slate-400 placeholder:font-normal"
          />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-slate-500 font-semibold">
          <div className="flex items-center gap-1.5">
            <Users2 className="w-4 h-4 text-indigo-500" />
            <span>
              إجمالي المشرفين:{" "}
              <strong className="text-indigo-700 font-mono text-sm">
                {supervisorsList.length}
              </strong>
            </span>
          </div>
          {debouncedSearch && (
            <span className="text-slate-400">
              نتائج البحث:{" "}
              <strong className="text-slate-700">{filtered.length}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10">
          <EmptyState
            message={
              debouncedSearch
                ? "لا توجد نتائج تطابق بحثك"
                : "لا يوجد مشرفون سريريون مسجلون في قاعدة البيانات حالياً"
            }
          />
        </div>
      ) : (
        <>
          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginated.map((supervisor, idx) => (
              <SupervisorCard
                key={supervisor.id}
                supervisor={supervisor}
                index={(page - 1) * perPage + idx}
                onNavigate={(id) => navigate(`/clinical-supervisors/${id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white rounded-3xl border border-slate-200 px-5 py-3.5 flex items-center justify-between shadow-2xs">
              <span className="text-xs text-slate-500 font-medium">
                الصفحة{" "}
                <strong className="text-slate-800">{page}</strong>{" "}
                من أصل{" "}
                <strong className="text-slate-800">{totalPages}</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>السابق</span>
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
