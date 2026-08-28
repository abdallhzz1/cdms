import { useState, useEffect, useMemo, type ChangeEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { Modal } from "@/components/ui/Modal";
import {
  ChevronRight, User, FileText, BookOpen, Award, BarChart3,
  Pencil, Plus, Trash2, Save, Star, ShieldCheck, CheckCircle2,
  Phone, Mail, Info, Upload, FolderOpen, Download, Eye, Stethoscope, Building2,
} from "lucide-react";

interface PublicationItem  { title: string; journal: string; year: string; doi?: string }
interface ConferenceItem   { name: string; location: string; date: string; role: string }
interface DocumentItem     { id?: string; name: string; category: string; file_url: string; file_type: string; file_size?: string; created_at: string }
interface OfficialEvaluation { evaluator_name: string; evaluator_role: string; leadership_score: number; clinical_score: number; comments: string; evaluation_date: string }
interface KpiWeights       { sessionAttendanceWeight: number; researchWeight: number; confWeight: number; evaluationWeight: number; studentFeedbackWeight: number }
interface KpiOverrides     { sessionAttendanceScore?: number; researchScore?: number; confScore?: number; studentFeedbackScore?: number }
interface SupervisorProfileData {
  id: string; user_id: number | string;
  name: string; name_en?: string; title: string;
  department_name: string; specialty: string;
  avatar_url?: string; email: string; phone?: string;
  contract_type: string; appointment_date: string; cv_summary: string;
  publications: PublicationItem[]; conferences: ConferenceItem[];
  documents?: DocumentItem[]; evaluation?: OfficialEvaluation;
  kpi_weights?: KpiWeights; kpi_overrides?: KpiOverrides;
  kpi_score?: number | null; kpi_rating?: string; kpi_complete?: boolean; kpi_breakdown?: any;
}

const getCategoryLabel = (cat: string) => {
  const m: Record<string, string> = {
    academic_degree: "شهادة أكاديمية", administrative_decision: "قرار إداري",
    identification_license: "أوراق ثبوتية", contract_agreement: "عقود واتفاقيات",
  };
  return m[cat] || "وثيقة أخرى";
};
const ratingColors: Record<string, string> = {
  "ممتاز": "text-emerald-700 bg-emerald-50 border-emerald-200",
  "جيد جداً": "text-teal-700 bg-teal-50 border-teal-200",
  "جيد": "text-blue-700 bg-blue-50 border-blue-200",
  "مقبول": "text-amber-700 bg-amber-50 border-amber-200",
};
const barFill = (s: number, max: number) => max > 0 ? Math.min(100, (s / max) * 100) : 0;

export function ClinicalSupervisorProfilePage() {
  const { id: paramId } = useParams<{ id: string }>();
  const { user, refreshUser } = useAuth();
  const queryClient     = useQueryClient();

  const [activeTab, setActiveTab] = useState<"cv"|"research"|"conferences"|"documents"|"kpi">("cv");
  const [isEditMode, setIsEditMode]           = useState(false);
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [isDocModalOpen, setIsDocModalOpen]   = useState(false);
  const [previewDoc, setPreviewDoc]           = useState<DocumentItem | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingDoc, setIsUploadingDoc]       = useState(false);
  const [newDocTitle, setNewDocTitle]     = useState("");
  const [newDocCategory, setNewDocCategory] = useState("academic_degree");
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [newPubTitle, setNewPubTitle]     = useState("");
  const [newPubJournal, setNewPubJournal] = useState("");
  const [newPubYear, setNewPubYear]       = useState("2024");
  const [newPubDoi, setNewPubDoi]         = useState("");
  const [newConfName, setNewConfName]     = useState("");
  const [newConfLocation, setNewConfLocation] = useState("");
  const [newConfDate, setNewConfDate]     = useState("");
  const [newConfRole, setNewConfRole]     = useState("متحدث ورئيس جلسة");
  const [evalLeadership, setEvalLeadership] = useState<number>(7.5);
  const [evalClinical, setEvalClinical]     = useState<number>(7.5);
  const [evalComments, setEvalComments]     = useState("");

  const targetId = !paramId || paramId === "me" ? "me" : paramId;
  const userRoles = (user?.roles || []).map((r: any) =>
    typeof r === "string" ? r.toUpperCase() : String(r.code || r.name || "").toUpperCase()
  );
  const canEvaluate = userRoles.some((r) =>
    ["CLINICAL_DIRECTOR","DEAN","VICE_DEAN","SYS_ADMIN","SYSTEM_ADMIN"].includes(r)
  );

  const { data: rawProfile, isLoading } = useQuery({
    queryKey: ["clinical-supervisor-profile-v1", targetId, user?.id],
    queryFn: async () => {
      const res = await apiFetch<any>(`/clinical-supervisors/${targetId}`);
      return res?.data || res;
    },
  });

  const [profileData, setProfileData] = useState<SupervisorProfileData | null>(null);

  const isOwnProfile = paramId === "me" ||
    String(targetId) === String(user?.id) ||
    (user?.email && rawProfile?.email && user.email.toLowerCase() === rawProfile.email.toLowerCase());
  const canEdit = isOwnProfile || canEvaluate;

  useEffect(() => {
    if (!rawProfile) return;
    const localKey = `clinical_sup_docs_${String(rawProfile.user_id || rawProfile.id || targetId)}`;
    const apiDocs: DocumentItem[] = Array.isArray(rawProfile.documents) ? rawProfile.documents : [];
    let localDocs: DocumentItem[] = [];
    try { localDocs = JSON.parse(localStorage.getItem(localKey) || "[]"); } catch { localDocs = []; }
    const docMap = new Map<string, DocumentItem>();
    for (const d of apiDocs) if (d?.name) docMap.set(d.id || d.name, d);
    for (const d of localDocs) if (d?.name && !docMap.has(d.id || d.name)) docMap.set(d.id || d.name, d);
    setProfileData({
      id: String(rawProfile.id || rawProfile.user_id),
      user_id: rawProfile.user_id || rawProfile.id,
      name: rawProfile.name || "",
      name_en: rawProfile.name_en,
      title: rawProfile.title || "غير محدد",
      department_name: rawProfile.department_name || "القسم السريري",
      specialty: rawProfile.specialty || "",
      avatar_url: rawProfile.avatar_url,
      email: rawProfile.email || "",
      phone: rawProfile.phone,
      contract_type: rawProfile.contract_type || "",
      appointment_date: rawProfile.appointment_date || "",
      cv_summary: rawProfile.cv_summary || "",
      publications: rawProfile.publications || [],
      conferences: rawProfile.conferences || [],
      documents: Array.from(docMap.values()),
      evaluation: rawProfile.evaluation,
      kpi_weights: rawProfile.kpi_weights,
      kpi_overrides: rawProfile.kpi_overrides,
      kpi_score: rawProfile.kpi_score,
      kpi_rating: rawProfile.kpi_rating,
      kpi_complete: Boolean(rawProfile.kpi_complete),
      kpi_breakdown: rawProfile.kpi_breakdown,
    });
    if (rawProfile.evaluation) {
      setEvalLeadership(rawProfile.evaluation.leadership_score || 7.5);
      setEvalClinical(rawProfile.evaluation.clinical_score || 7.5);
      setEvalComments(rawProfile.evaluation.comments || "");
    }
  }, [rawProfile, targetId]);

  useEffect(() => {
    if (profileData?.documents?.length) {
      const key = `clinical_sup_docs_${String(profileData.user_id || profileData.id)}`;
      localStorage.setItem(key, JSON.stringify(profileData.documents));
    }
  }, [profileData?.documents]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["clinical-supervisor-profile-v1"] });
    queryClient.invalidateQueries({ queryKey: ["clinical-supervisors-directory-v1"] });
  };

  const kpiBreakdown = useMemo(() => {
    if (profileData?.kpi_breakdown) return profileData.kpi_breakdown;
    const w = profileData?.kpi_weights || { sessionAttendanceWeight:30, researchWeight:20, confWeight:15, evaluationWeight:20, studentFeedbackWeight:15 };
    const ov = profileData?.kpi_overrides || {};
    const ev = profileData?.evaluation;
    const sessionScore = ov.sessionAttendanceScore !== undefined ? ov.sessionAttendanceScore : 0;
    const pubCount = profileData?.publications?.length || 0;
    const resScore = ov.researchScore !== undefined ? ov.researchScore : Math.min(w.researchWeight||20, pubCount * 5);
    const confCount = profileData?.conferences?.length || 0;
    const confScore = ov.confScore !== undefined ? ov.confScore : Math.min(w.confWeight||15, confCount * 5);
    const rawEval = ev ? ((ev.leadership_score||0) + (ev.clinical_score||0)) : 0;
    const evalScore = ev ? Math.round((rawEval/15) * (w.evaluationWeight||20) * 10)/10 : 0;
    const feedbackScore = ov.studentFeedbackScore !== undefined ? ov.studentFeedbackScore : 0;
    const total = Math.min(100, Math.round((sessionScore+resScore+confScore+evalScore+feedbackScore)*10)/10);
    const isComplete = ov.sessionAttendanceScore !== undefined && ov.studentFeedbackScore !== undefined && Boolean(ev);
    let rating="غير مكتمل"; if (isComplete) { rating="مقبول"; if(total>=90) rating="ممتاز"; else if(total>=80) rating="جيد جداً"; else if(total>=70) rating="جيد"; }
    return { sessionAttendanceScore:sessionScore, researchScore:resScore, confScore, directorEvalScore:evalScore, studentFeedbackScore:feedbackScore, totalScore:isComplete ? total : null, rating, isComplete, weights:w };
  }, [profileData]);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) { alert("يرجى اختيار صورة صالحة"); return; }
    setIsUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      if (profileData) setProfileData({ ...profileData, avatar_url: b64 });
      try {
        await apiFetch(`/clinical-supervisors/${targetId}/avatar`, { method:"POST", body:{ avatar_base64: b64 } });
        refreshAll(); await refreshUser(); alert("تم رفع الصورة بنجاح ✓");
      } catch { } finally { setIsUploadingAvatar(false); }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!profileData) return;
    try {
      await apiFetch(`/clinical-supervisors/${targetId}`, { method:"PUT", body: profileData });
      refreshAll(); setIsEditMode(false); alert("تم حفظ التعديلات بنجاح ✓");
    } catch { setIsEditMode(false); alert("حدث خطأ أثناء الحفظ"); }
  };

  const handleSaveEval = async () => {
    if (!profileData) return;
    const ev = { evaluator_name: user?.name || "المدير السريري", evaluator_role: "مدير الدائرة السريرية", leadership_score: Number(evalLeadership), clinical_score: Number(evalClinical), comments: evalComments.trim() || "تم التقييم والاعتماد الرسمي.", evaluation_date: new Date().toLocaleDateString("ar-EG") };
    try {
      await apiFetch(`/clinical-supervisors/${targetId}/evaluation`, { method:"POST", body: ev });
      refreshAll(); setIsEvalModalOpen(false); alert("تم حفظ التقييم بنجاح ✓");
    } catch { alert("حدث خطأ أثناء حفظ التقييم"); }
  };

  const handleAddPub = async () => {
    if (!newPubTitle.trim() || !profileData) return;
    const updated = { ...profileData, publications: [...profileData.publications, { title:newPubTitle.trim(), journal:newPubJournal.trim()||"مجلة علمية محكمة", year:newPubYear, doi:newPubDoi.trim()||undefined }] };
    await apiFetch(`/clinical-supervisors/${targetId}`, { method:"PUT", body: updated });
    refreshAll(); setNewPubTitle(""); setNewPubJournal(""); setNewPubDoi("");
  };
  const handleDeletePub = async (idx: number) => {
    if (!profileData) return;
    const updated = { ...profileData, publications: profileData.publications.filter((_,i)=>i!==idx) };
    await apiFetch(`/clinical-supervisors/${targetId}`, { method:"PUT", body: updated });
    refreshAll();
  };
  const handleAddConf = async () => {
    if (!newConfName.trim() || !profileData) return;
    const updated = { ...profileData, conferences: [...profileData.conferences, { name:newConfName.trim(), location:newConfLocation.trim()||"جامعة الخليل", date:newConfDate||"2024", role:newConfRole }] };
    await apiFetch(`/clinical-supervisors/${targetId}`, { method:"PUT", body: updated });
    refreshAll(); setNewConfName(""); setNewConfLocation(""); setNewConfDate("");
  };
  const handleDeleteConf = async (idx: number) => {
    if (!profileData) return;
    const updated = { ...profileData, conferences: profileData.conferences.filter((_,i)=>i!==idx) };
    await apiFetch(`/clinical-supervisors/${targetId}`, { method:"PUT", body: updated });
    refreshAll();
  };
  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !profileData) return;
    setIsUploadingDoc(true);
    try {
      let res: any;
      if (selectedDocFile) {
        const fd = new FormData();
        fd.append("file", selectedDocFile); fd.append("name", newDocTitle.trim()); fd.append("category", newDocCategory);
        res = await apiFetch<any>(`/clinical-supervisors/${targetId}/documents`, { method:"POST", body: fd });
      } else {
        res = await apiFetch<any>(`/clinical-supervisors/${targetId}/documents`, { method:"POST", body:{ name:newDocTitle.trim(), category:newDocCategory, file_base64:"", file_type:"pdf", file_size:"0 MB" } });
      }
      const docs = res?.documents || [...(profileData.documents||[]), res?.data];
      const key = `clinical_sup_docs_${String(profileData.user_id||profileData.id)}`;
      localStorage.setItem(key, JSON.stringify(docs));
      setProfileData({ ...profileData, documents: docs });
      setIsDocModalOpen(false); setNewDocTitle(""); setSelectedDocFile(null);
    } catch { alert("حدث خطأ أثناء رفع الوثيقة"); }
    finally { setIsUploadingDoc(false); refreshAll(); }
  };
  const handleDeleteDoc = async (docId: string, idx: number) => {
    if (!profileData || !window.confirm("هل أنت متأكد من حذف هذا المستند؟")) return;
    const updated = (profileData.documents||[]).filter((d,i)=> d.id ? d.id!==docId : i!==idx);
    const key = `clinical_sup_docs_${String(profileData.user_id||profileData.id)}`;
    localStorage.setItem(key, JSON.stringify(updated));
    setProfileData({ ...profileData, documents: updated });
    try { await apiFetch(`/clinical-supervisors/${targetId}/documents/${docId||idx}`, { method:"DELETE" }); } catch {}
    finally { refreshAll(); }
  };

  if (isLoading || !profileData) return <LoadingState />;

  const deptLabel = profileData.department_name.startsWith("قسم") ? profileData.department_name : `قسم ${profileData.department_name}`;

  const TABS = [
    { id:"cv",          label:"السيرة الذاتية",  icon:User },
    { id:"research",    label:"الأبحاث",          icon:BookOpen },
    { id:"conferences", label:"المؤتمرات",        icon:Award },
    { id:"documents",   label:"الوثائق",          icon:FolderOpen },
    { id:"kpi",         label:"مؤشرات الأداء",   icon:BarChart3 },
  ] as const;

  return (
    <div className="space-y-5 pb-20 max-w-6xl mx-auto">

      <div className="flex items-center gap-2">
        <Link to="/clinical-supervisors" className="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-2xs text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-all">
          <ChevronRight className="w-5 h-5" />
        </Link>
        <span className="text-xs text-slate-400 font-medium">
          دليل المشرفين السريريين <span className="mx-1.5">/</span>
          <span className="text-slate-700 font-bold">{profileData.name}</span>
        </span>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-2 bg-teal-600" />
        <div className="p-6 flex flex-col sm:flex-row gap-6">
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-3xl bg-teal-50 border-2 border-teal-200 overflow-hidden shadow-sm flex items-center justify-center">
              {profileData.avatar_url
                ? <img src={profileData.avatar_url} alt={profileData.name} className="w-full h-full object-cover" />
                : <span className="text-2xl font-black text-teal-600">{profileData.name.split(" ").map(n=>n[0]).join("").slice(0,2)||"م"}</span>
              }
            </div>
            {canEdit && (
              <label htmlFor="avatar-upload" className="absolute -bottom-1.5 -left-1.5 w-7 h-7 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center cursor-pointer shadow-sm transition-colors" title="تغيير الصورة">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={isUploadingAvatar} />
              </label>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-[11px] font-bold text-teal-700">
                  <ShieldCheck className="w-3.5 h-3.5" /> مشرف سريري
                </span>
                {profileData.kpi_complete && profileData.kpi_rating && (
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${ratingColors[profileData.kpi_rating]||ratingColors["مقبول"]}`}>
                    <Star className="w-3 h-3 inline mr-0.5 fill-current" />
                    {profileData.kpi_rating} — {kpiBreakdown.totalScore} / 100
                  </span>
                )}
              </div>
              <h1 className="text-xl font-black text-slate-900">{profileData.name}</h1>
              {profileData.name_en && <p className="text-sm font-medium text-slate-400 font-mono">{profileData.name_en}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
              <div className="flex items-center gap-2 text-slate-600 font-semibold"><Stethoscope className="w-3.5 h-3.5 text-emerald-500 shrink-0" /><span>{profileData.title}</span></div>
              <div className="flex items-center gap-2 text-slate-600 font-semibold"><Building2 className="w-3.5 h-3.5 text-teal-500 shrink-0" /><span>{deptLabel}</span></div>
              <div className="flex items-center gap-2 text-slate-500 font-medium"><Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="font-mono">{profileData.email}</span></div>
              {profileData.phone && <div className="flex items-center gap-2 text-slate-500 font-medium"><Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span className="font-mono">{profileData.phone}</span></div>}
              {profileData.specialty && <div className="flex items-center gap-2 text-slate-600 font-semibold col-span-2"><Info className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span>{profileData.specialty}</span></div>}
            </div>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {canEdit && (
                <button type="button" onClick={() => isEditMode ? handleSaveProfile() : setIsEditMode(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-colors">
                  {isEditMode ? <><Save className="w-3.5 h-3.5" /><span>حفظ التعديلات</span></> : <><Pencil className="w-3.5 h-3.5" /><span>تعديل البروفايل</span></>}
                </button>
              )}
              {canEvaluate && (
                <button type="button" onClick={() => setIsEvalModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-colors">
                  <CheckCircle2 className="w-3.5 h-3.5" /><span>إضافة تقييم رسمي</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="flex items-center gap-0.5 p-2 border-b border-slate-100 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${activeTab===id ? "bg-teal-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "cv" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2"><User className="w-4 h-4 text-teal-500" />نبذة تعريفية</h3>
                {isEditMode
                  ? <textarea value={profileData.cv_summary} onChange={e=>setProfileData({...profileData,cv_summary:e.target.value})} rows={6} className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" placeholder="اكتب نبذة تعريفية عن المشرف السريري..." />
                  : <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-4 min-h-[80px]">{profileData.cv_summary || <span className="text-slate-400 italic">لم تُضف نبذة تعريفية بعد.</span>}</p>
                }
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([["اللقب الأكاديمي","title"],["التخصص","specialty"],["نوع العقد","contract_type"],["تاريخ التكليف","appointment_date"],["رقم الهاتف","phone"]] as [string,keyof SupervisorProfileData][]).map(([label,key])=>(
                  <div key={key} className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>
                    {isEditMode
                      ? <input type="text" value={(profileData as any)[key]||""} onChange={e=>setProfileData({...profileData,[key]:e.target.value})} className="w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-300" />
                      : <p className="text-sm font-semibold text-slate-800 bg-slate-50 rounded-xl px-3 py-2">{(profileData as any)[key]||<span className="text-slate-400">—</span>}</p>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "research" && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><BookOpen className="w-4 h-4 text-teal-500" />الأبحاث العلمية المنشورة ({profileData.publications.length})</h3>
              {canEdit && (
                <div className="bg-teal-50 rounded-2xl border border-teal-100 p-4 space-y-3">
                  <p className="text-xs font-bold text-teal-700">إضافة بحث جديد</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([["عنوان البحث *",newPubTitle,setNewPubTitle],["المجلة العلمية",newPubJournal,setNewPubJournal],["سنة النشر",newPubYear,setNewPubYear],["رابط DOI",newPubDoi,setNewPubDoi]] as [string,string,any][]).map(([ph,val,fn],i)=>(
                      <input key={i} type="text" placeholder={ph} value={val} onChange={e=>fn(e.target.value)} className="text-xs font-medium bg-white border border-teal-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 w-full" />
                    ))}
                  </div>
                  <button type="button" onClick={handleAddPub} disabled={!newPubTitle.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-bold transition-colors">
                    <Plus className="w-3.5 h-3.5" /> إضافة البحث
                  </button>
                </div>
              )}
              {profileData.publications.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">لم تُضف أبحاث بعد.</p> : (
                <div className="space-y-3">
                  {profileData.publications.map((pub,idx)=>(
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start justify-between gap-3 hover:border-teal-200 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 mb-1">{pub.title}</p>
                        <p className="text-xs text-slate-500 font-medium">{pub.journal} · {pub.year}</p>
                        {pub.doi && <a href={pub.doi.startsWith("http")?pub.doi:`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-teal-600 font-mono hover:underline">{pub.doi}</a>}
                      </div>
                      {canEdit && <button type="button" onClick={()=>handleDeletePub(idx)} className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "conferences" && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><Award className="w-4 h-4 text-emerald-500" />المؤتمرات والفعاليات ({profileData.conferences.length})</h3>
              {canEdit && (
                <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 space-y-3">
                  <p className="text-xs font-bold text-emerald-700">إضافة مؤتمر / فعالية</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {([["اسم المؤتمر *",newConfName,setNewConfName],["المكان",newConfLocation,setNewConfLocation],["السنة",newConfDate,setNewConfDate],["الدور",newConfRole,setNewConfRole]] as [string,string,any][]).map(([ph,val,fn],i)=>(
                      <input key={i} type="text" placeholder={ph} value={val} onChange={e=>fn(e.target.value)} className="text-xs font-medium bg-white border border-emerald-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300 w-full" />
                    ))}
                  </div>
                  <button type="button" onClick={handleAddConf} disabled={!newConfName.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-colors">
                    <Plus className="w-3.5 h-3.5" /> إضافة المؤتمر
                  </button>
                </div>
              )}
              {profileData.conferences.length === 0 ? <p className="text-sm text-slate-400 text-center py-8">لم تُضف مؤتمرات بعد.</p> : (
                <div className="space-y-3">
                  {profileData.conferences.map((conf,idx)=>(
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start justify-between gap-3 hover:border-emerald-200 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 mb-1">{conf.name}</p>
                        <p className="text-xs text-slate-500 font-medium">{conf.location} · {conf.date}</p>
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-0.5 inline-block mt-1">{conf.role}</span>
                      </div>
                      {canEdit && <button type="button" onClick={()=>handleDeleteConf(idx)} className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors shrink-0"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "documents" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><FolderOpen className="w-4 h-4 text-amber-500" />الوثائق الرسمية ({(profileData.documents||[]).length})</h3>
                {canEdit && <button type="button" onClick={()=>setIsDocModalOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-colors"><Upload className="w-3.5 h-3.5" /> رفع وثيقة</button>}
              </div>
              {(profileData.documents||[]).length === 0 ? <p className="text-sm text-slate-400 text-center py-8">لم تُرفع وثائق بعد.</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(profileData.documents||[]).map((doc,idx)=>(
                    <div key={doc.id||idx} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-start gap-3 hover:border-amber-200 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-amber-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{doc.name}</p>
                        <p className="text-[10.5px] text-slate-400 font-medium mt-0.5">{getCategoryLabel(doc.category)}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{doc.file_size} · {doc.created_at}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc.file_url && <button type="button" onClick={()=>setPreviewDoc(doc)} className="w-7 h-7 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-teal-50 flex items-center justify-center transition-colors"><Eye className="w-3.5 h-3.5" /></button>}
                        {canEdit && <button type="button" onClick={()=>handleDeleteDoc(doc.id||"",idx)} className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "kpi" && (
            <div className="space-y-5">
              <div className="bg-teal-50 rounded-2xl border border-teal-100 p-6 flex flex-col sm:flex-row items-center gap-5">
                <div className="text-center">
                  <div className="text-4xl font-black text-teal-700 font-mono">{kpiBreakdown.isComplete ? kpiBreakdown.totalScore : '—'}</div>
                  <div className="text-xs text-teal-500 font-bold mt-0.5">{kpiBreakdown.isComplete ? 'من أصل 100' : 'بانتظار استكمال بيانات التقييم'}</div>
                </div>
                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-800">مجموع نقاط الأداء</span>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${ratingColors[kpiBreakdown.rating]||ratingColors["مقبول"]}`}>{kpiBreakdown.rating}</span>
                  </div>
                  <div className="h-3 bg-white rounded-full overflow-hidden border border-teal-100">
                    <div className="h-full bg-teal-500 rounded-full transition-all" style={{width:`${kpiBreakdown.totalScore ?? 0}%`}} />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  {label:"حضور الجلسات السريرية", score:kpiBreakdown.sessionAttendanceScore, max:(kpiBreakdown.weights?.sessionAttendanceWeight||30), color:"bg-teal-500", icon:"📋"},
                  {label:"الأبحاث والنشر العلمي",  score:kpiBreakdown.researchScore,          max:(kpiBreakdown.weights?.researchWeight||20),          color:"bg-blue-500",   icon:"📚"},
                  {label:"المؤتمرات والفعاليات",   score:kpiBreakdown.confScore,              max:(kpiBreakdown.weights?.confWeight||15),               color:"bg-emerald-500", icon:"🎤"},
                  {label:"تقييم الإدارة السريرية", score:kpiBreakdown.directorEvalScore,      max:(kpiBreakdown.weights?.evaluationWeight||20),         color:"bg-emerald-500",icon:"✅"},
                  {label:"تقييم الطلاب للمشرف",   score:kpiBreakdown.studentFeedbackScore,   max:(kpiBreakdown.weights?.studentFeedbackWeight||15),    color:"bg-amber-500",  icon:"⭐"},
                ].map(({label,score,max,color,icon})=>(
                  <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-2">{icon} {label} <span className="text-[10px] text-slate-400">(الوزن: {max} نقطة)</span></span>
                      <span className="text-xs font-mono font-black text-slate-800">{score} / {max}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{width:`${barFill(score,max)}%`}} />
                    </div>
                  </div>
                ))}
              </div>
              {profileData.evaluation && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-black text-emerald-800 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />التقييم الرسمي من الإدارة</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><span className="text-slate-500">المقيّم:</span><span className="font-bold text-slate-800 mr-1">{profileData.evaluation.evaluator_name}</span></div>
                    <div><span className="text-slate-500">الصفة:</span><span className="font-bold text-slate-800 mr-1">{profileData.evaluation.evaluator_role}</span></div>
                    <div><span className="text-slate-500">القيادة:</span><span className="font-bold text-slate-800 mr-1">{profileData.evaluation.leadership_score} / 7.5</span></div>
                    <div><span className="text-slate-500">السريري:</span><span className="font-bold text-slate-800 mr-1">{profileData.evaluation.clinical_score} / 7.5</span></div>
                  </div>
                  {profileData.evaluation.comments && <p className="text-xs text-slate-600 bg-white rounded-xl p-2.5 border border-emerald-100 leading-relaxed">{profileData.evaluation.comments}</p>}
                  <p className="text-[10.5px] text-slate-400 font-mono">{profileData.evaluation.evaluation_date}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isEvalModalOpen} onClose={()=>setIsEvalModalOpen(false)} title="تقييم رسمي للمشرف السريري" maxWidth="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[{label:"درجة القيادة (0 – 7.5)",val:evalLeadership,fn:setEvalLeadership},{label:"الكفاءة السريرية (0 – 7.5)",val:evalClinical,fn:setEvalClinical}].map(({label,val,fn})=>(
              <div key={label} className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">{label}</label>
                <input type="number" min={0} max={7.5} step={0.5} value={val} onChange={e=>fn(Math.min(7.5,Math.max(0,Number(e.target.value))))} className="w-full text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-300" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">ملاحظات التقييم</label>
            <textarea rows={4} value={evalComments} onChange={e=>setEvalComments(e.target.value)} className="w-full text-sm bg-slate-50 border border-slate-200 rounded-2xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300" placeholder="أدخل ملاحظاتك وتقييمك الرسمي للمشرف السريري..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleSaveEval} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"><Save className="w-4 h-4" /> حفظ التقييم</button>
            <button type="button" onClick={()=>setIsEvalModalOpen(false)} className="px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors">إلغاء</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDocModalOpen} onClose={()=>setIsDocModalOpen(false)} title="رفع وثيقة رسمية" maxWidth="md">
        <form onSubmit={handleDocUpload} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">عنوان الوثيقة *</label>
            <input type="text" value={newDocTitle} onChange={e=>setNewDocTitle(e.target.value)} required className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="مثال: شهادة البورد في الجراحة" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">تصنيف الوثيقة</label>
            <select value={newDocCategory} onChange={e=>setNewDocCategory(e.target.value)} className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-300">
              {["academic_degree","administrative_decision","identification_license","contract_agreement"].map(c=><option key={c} value={c}>{getCategoryLabel(c)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">ملف الوثيقة</label>
            <label className="flex flex-col items-center gap-2 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 cursor-pointer hover:border-amber-400 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-500 font-medium">{selectedDocFile ? selectedDocFile.name : "اضغط لاختيار ملف"}</span>
              <input type="file" accept=".pdf,image/*" className="hidden" onChange={e=>setSelectedDocFile(e.target.files?.[0]||null)} />
            </label>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={!newDocTitle.trim()||isUploadingDoc} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold text-sm transition-colors"><Upload className="w-4 h-4" />{isUploadingDoc?"جارٍ الرفع...":"رفع الوثيقة"}</button>
            <button type="button" onClick={()=>setIsDocModalOpen(false)} className="px-5 py-2.5 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors">إلغاء</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!previewDoc} onClose={()=>setPreviewDoc(null)} title={previewDoc?.name||"معاينة الوثيقة"} maxWidth="lg">
        {previewDoc && (
          <div className="space-y-3">
            {previewDoc.file_url.startsWith("data:image") || /\.(jpg|jpeg|png|webp)$/i.test(previewDoc.file_url)
              ? <img src={previewDoc.file_url} alt={previewDoc.name} className="w-full rounded-2xl max-h-[60vh] object-contain bg-slate-50" />
              : previewDoc.file_url.startsWith("data:application/pdf") || /\.pdf$/i.test(previewDoc.file_url)
                ? <iframe src={previewDoc.file_url} className="w-full h-[60vh] rounded-2xl border border-slate-200" title={previewDoc.name} />
                : <p className="text-sm text-slate-500 text-center py-10">لا يمكن معاينة هذا النوع هنا.</p>
            }
            {previewDoc.file_url && !previewDoc.file_url.startsWith("data:") && (
              <a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-colors">
                <Download className="w-4 h-4" /> فتح / تنزيل الوثيقة
              </a>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
