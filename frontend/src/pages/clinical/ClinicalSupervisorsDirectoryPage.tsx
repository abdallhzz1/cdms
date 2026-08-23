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
  Building2,
  ChevronRight,
  ChevronLeft,
  Mail,
  Phone,
  Users2,
} from "lucide-react";

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

function SupervisorListItem({
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
      className="group bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col sm:flex-row items-center gap-4 p-4"
    >
      {/* Avatar & Rank */}
      <div className="flex items-center gap-4 shrink-0 w-full sm:w-auto">
         <div className="flex flex-col items-center justify-center w-8">
           <span className="text-xs font-bold text-slate-400 font-mono">#{index + 1}</span>
         </div>
         <SupervisorAvatar name={supervisor.name} url={supervisor.avatar_url} />
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1 w-full sm:w-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-black text-sm text-slate-900 leading-snug group-hover:text-indigo-700 transition-colors">
            {supervisor.name}
          </h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${kpiBadgeColors(supervisor.kpi_rating)}`}>
            {supervisor.kpi_rating}
          </span>
        </div>
        <p className="text-[11.5px] font-semibold text-slate-500 truncate">
          {supervisor.title} • قسم {supervisor.department_name}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium mt-1">
          <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {supervisor.email}</span>
          {supervisor.phone && <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {supervisor.phone}</span>}
        </div>
      </div>

      {/* KPI Score */}
      <div className="w-full sm:w-48 shrink-0 space-y-1.5 hidden sm:block">
        <div className="flex items-center justify-between text-[10.5px] font-bold">
          <span className="text-slate-500 flex items-center gap-1">
            <Star className="w-3 h-3 text-amber-400 fill-amber-300" />
            مؤشر الأداء
          </span>
          <span className="font-mono text-slate-800">{supervisor.kpi_score} / 100</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${scoreBarColor(supervisor.kpi_score)}`} style={{ width: `${supervisor.kpi_score}%` }} />
        </div>
      </div>

      {/* Action Button */}
      <div className="shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNavigate(supervisor.id); }}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
        >
          <span>فتح البروفايل</span>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ClinicalSupervisorsDirectoryPage() {
  const navigate = useNavigate();
  const perPage = 12;

  const [searchInput, setSearchInput]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]                     = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
      <PageHeader
        title="دليل المشرفين السريريين"
        description="جميع المستخدمين المسجلين بدور مشرف سريري في النظام"
      />

      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          <div className="flex flex-col gap-3">
            {paginated.map((supervisor, idx) => (
              <SupervisorListItem
                key={supervisor.id}
                supervisor={supervisor}
                index={(page - 1) * perPage + idx}
                onNavigate={(id) => navigate(`/clinical-supervisors/${id}`)}
              />
            ))}
          </div>

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
