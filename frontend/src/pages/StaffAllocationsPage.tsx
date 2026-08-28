import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ClipboardCheck, Search, ShieldCheck, UserRound } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';

type DepartmentHead = {
  id: string;
  user_id: number;
  assignment_id: number;
  name: string;
  email: string;
  title: string;
  department_id: number;
  department_name: string;
  contract_type: string;
  phone?: string | null;
  avatar_url?: string | null;
  kpi_score: number | null;
  kpi_rating: string;
  kpi_complete: boolean;
};

export function StaffAllocationsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canViewOfficialEvaluations = can('department_head_evaluations.view');
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');

  const headsQuery = useQuery({
    queryKey: ['db-dept-heads-directory-v1'],
    queryFn: async () => {
      const response = await apiFetch<any>('/dept-heads');
      return (Array.isArray(response) ? response : response?.data ?? []) as DepartmentHead[];
    },
  });
  const heads = headsQuery.data ?? [];
  const departments = useMemo(() => {
    const map = new Map<number, string>();
    heads.forEach((head) => map.set(Number(head.department_id), head.department_name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [heads]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return heads.filter((head) => {
      const matchesSearch = !query || head.name.toLowerCase().includes(query) || head.email.toLowerCase().includes(query) || head.department_name.toLowerCase().includes(query) || head.title.toLowerCase().includes(query);
      return matchesSearch && (departmentId === 'all' || Number(departmentId) === Number(head.department_id));
    });
  }, [departmentId, heads, search]);

  if (headsQuery.isLoading) return <LoadingState />;
  if (headsQuery.isError) return <ErrorState title="تعذر تحميل رؤساء الأقسام" message="لم نتمكن من تحميل التكليفات الحالية. حاول مرة أخرى." onRetry={() => headsQuery.refetch()} />;

  return <div className="space-y-5 pb-20">
    <PageHeader title="دليل رؤساء الأقسام" description="يعرض رؤساء الأقسام المكلفين حاليًا فقط، ويفتح ملفاتهم القيادية والتقييمات الموثقة.">
      <div className="flex flex-wrap gap-2">
        {canViewOfficialEvaluations && <Link to="/department-head-evaluations" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><ClipboardCheck className="h-4 w-4" />التقييمات الرسمية</Link>}
        {(can('departments.manage') || can('users.manage')) && <Link to="/admin/departments" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><Building2 className="h-4 w-4" />إدارة الأقسام والتكليفات</Link>}
      </div>
    </PageHeader>

    <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_16rem_auto]">
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full bg-transparent text-xs font-bold text-slate-800 outline-none" placeholder="البحث بالاسم أو القسم أو البريد..." /></label>
      <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"><option value="all">جميع الأقسام</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <div className="flex items-center justify-center rounded-xl bg-teal-50 px-4 text-xs font-bold text-teal-800">المعروضون: {filtered.length}</div>
    </section>

    {filtered.length === 0 ? <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><UserRound className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 font-black text-slate-700">لا يوجد رؤساء أقسام مطابقون</h2><p className="mt-1 text-xs text-slate-500">إن كانت الأقسام بلا رؤساء، عيّنهم من شاشة إدارة الأقسام والتكليفات.</p></section> : <>
      <section className="grid gap-3 md:hidden">{filtered.map((head) => <article key={head.assignment_id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" onClick={() => navigate(`/dept-heads/${head.id}`)}><div className="flex items-start gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-teal-100 bg-teal-50 text-sm font-black text-teal-700">{head.avatar_url ? <img src={head.avatar_url} alt={head.name} className="h-full w-full object-cover" /> : head.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black text-slate-800">{head.name}</h2><p dir="ltr" className="mt-1 truncate text-left text-[10px] text-slate-500">{head.email}</p><div className="mt-2 flex flex-wrap gap-1.5"><span className="rounded-lg bg-teal-50 px-2 py-1 text-[10px] font-bold text-teal-700">{head.department_name}</span><span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{head.title || 'غير محدد'}</span></div></div></div><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]"><span className="font-bold text-slate-500">مؤشر الأداء</span><span className={`rounded-lg px-2 py-1 font-black ${head.kpi_complete ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{head.kpi_complete && head.kpi_score !== null ? `${head.kpi_score}/100 · ${head.kpi_rating}` : 'غير مكتمل'}</span></div></article>)}</section>

      <section className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm md:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-right text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50 text-slate-500"><th className="px-5 py-4">رئيس القسم</th><th className="px-5 py-4">القسم الحالي</th><th className="px-5 py-4">الدرجة والعقد</th><th className="px-5 py-4 text-center">مؤشر الأداء</th><th className="px-5 py-4 text-center">الإجراء</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((head) => <tr key={head.assignment_id} className="cursor-pointer hover:bg-teal-50/40" onClick={() => navigate(`/dept-heads/${head.id}`)}><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-teal-100 bg-teal-50 font-black text-teal-700">{head.avatar_url ? <img src={head.avatar_url} alt={head.name} className="h-full w-full object-cover" /> : head.name.slice(0, 1)}</div><div><p className="font-black text-slate-800">{head.name}</p><p dir="ltr" className="mt-1 text-left font-mono text-[10px] text-slate-400">{head.email}</p></div></div></td><td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 font-bold text-slate-700"><Building2 className="h-4 w-4 text-teal-600" />{head.department_name}</span></td><td className="px-5 py-4"><p className="font-bold text-slate-700">{head.title || 'غير محدد'}</p><p className="mt-1 text-[10px] text-slate-500">{head.contract_type || 'غير محدد'}</p></td><td className="px-5 py-4 text-center"><span className={`rounded-lg px-2.5 py-1.5 font-black ${head.kpi_complete ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600'}`}>{head.kpi_complete && head.kpi_score !== null ? `${head.kpi_score}/100 · ${head.kpi_rating}` : 'غير مكتمل'}</span></td><td className="px-5 py-4 text-center" onClick={(event) => event.stopPropagation()}><Button size="sm" onClick={() => navigate(`/dept-heads/${head.id}`)}><ShieldCheck className="ml-1 h-4 w-4" />فتح الملف</Button></td></tr>)}</tbody></table></div></section>
    </>}
  </div>;
}
