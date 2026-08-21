import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, Star, ExternalLink, Building, ChevronRight, ChevronLeft } from 'lucide-react';

export interface DepartmentHeadSummary {
  id: string;
  user_id: number;
  name: string;
  email: string;
  title: string;
  department_name: string;
  contract_type: string;
  kpi_score: number;
  kpi_rating: string;
  avatar_url?: string;
}

export function StaffAllocationsPage() {
  const navigate = useNavigate();

  // Search & Pagination State matching DirectoryPage.tsx
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 25;

  // Debounce search input by 250ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Query Department Heads directly from Laravel MySQL Database API
  const { data: deptHeadsResponse, isLoading: isHeadsLoading } = useQuery({
    queryKey: ['db-dept-heads-directory-v1'],
    queryFn: async () => {
      const res = await apiFetch<any>('/dept-heads');
      return Array.isArray(res) ? res : res?.data || [];
    }
  });

  const departmentHeadsList: DepartmentHeadSummary[] = useMemo(() => {
    if (!deptHeadsResponse || !Array.isArray(deptHeadsResponse)) return [];
    return deptHeadsResponse.map((item: any) => ({
      id: String(item.id || item.user_id),
      user_id: item.user_id || Number(item.id),
      name: item.name,
      email: item.email,
      title: item.title || 'أستاذ مشارك — استشاري سريري',
      department_name: item.department_name || 'القسم السريري',
      contract_type: item.contract_type || 'عقد دائم — متفرغ',
      kpi_score: item.kpi_score || 0,
      kpi_rating: item.kpi_rating || 'مقبول',
      avatar_url: item.avatar_url
    }));
  }, [deptHeadsResponse]);

  // Filter department heads based on search input
  const filteredHeads = useMemo(() => {
    if (!debouncedSearch.trim()) return departmentHeadsList;
    const q = debouncedSearch.toLowerCase();
    return departmentHeadsList.filter(h => 
      h.name.toLowerCase().includes(q) ||
      h.department_name.toLowerCase().includes(q) ||
      h.title.toLowerCase().includes(q) ||
      h.email.toLowerCase().includes(q)
    );
  }, [departmentHeadsList, debouncedSearch]);

  const paginatedHeads = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredHeads.slice(start, start + perPage);
  }, [filteredHeads, page, perPage]);

  const totalPages = Math.ceil(filteredHeads.length / perPage) || 1;

  return (
    <div className="space-y-6 pb-20">
      
      {/* Page Header */}
      <PageHeader 
        title="دليل ورؤساء الأقسام السريرية بالكلية"
        description="استعراض ورصد جميع مستخدمي النظام المكلفين برئاسة الأقسام السريرية، البروفايل، الأبحاث، والمؤشرات (KPIs) مباشرة من قاعدة البيانات"
      />

      {/* ========================================================================= */}
      {/* DEPARTMENT HEADS DIRECTORY TABLE */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        
        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="بحث في دليل رؤساء الأقسام بالاسم أو القسم..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-bold">
            <span>عدد رؤساء الأقسام بقاعدة البيانات: <strong className="text-teal-800 font-mono text-sm">{filteredHeads.length}</strong></span>
          </div>
        </div>

        {/* Directory Table */}
        {isHeadsLoading ? <LoadingState /> : (
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            {filteredHeads.length === 0 ? (
              <EmptyState message="لا يوجد رؤساء أقسام مسجلين بقاعدة البيانات حالياً" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-12 text-center font-bold">#</TableHead>
                    <TableHead className="font-bold text-slate-900 min-w-[220px]">رئيس القسم</TableHead>
                    <TableHead className="font-bold text-slate-900 min-w-[200px]">القسم السريري</TableHead>
                    <TableHead className="font-bold text-slate-900 min-w-[180px]">الدرجة والعقد</TableHead>
                    <TableHead className="font-bold text-slate-900 text-center w-36">تقييم الأداء (Score)</TableHead>
                    <TableHead className="text-center font-bold w-40">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHeads.map((head, idx) => (
                    <TableRow 
                      key={head.id} 
                      className="hover:bg-teal-50/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/dept-heads/${head.id}`)}
                    >
                      <TableCell className="text-center font-mono font-bold text-slate-400">
                        {(page - 1) * perPage + idx + 1}
                      </TableCell>

                      {/* Head Name & Avatar */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 font-black text-xs border border-teal-100 flex items-center justify-center shrink-0 shadow-2xs overflow-hidden">
                            {head.avatar_url ? (
                              <img src={head.avatar_url} alt={head.name} className="w-full h-full object-cover" />
                            ) : (
                              head.name.split(' ').map(n => n[0]).join('').slice(0, 2) || 'د.'
                            )}
                          </div>

                          <div>
                            <span className="font-black text-xs text-slate-900 block hover:text-teal-700">{head.name}</span>
                            <span className="text-[11px] font-mono text-slate-400 font-medium block">{head.email}</span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Clinical Department */}
                      <TableCell>
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>قسم {head.department_name}</span>
                        </span>
                      </TableCell>

                      {/* Academic Title */}
                      <TableCell>
                        <div>
                          <span className="font-bold text-xs text-slate-800 block">{head.title}</span>
                          <span className="text-[10.5px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100 inline-block mt-0.5">
                            {head.contract_type}
                          </span>
                        </div>
                      </TableCell>

                      {/* KPI Score Badge */}
                      <TableCell className="text-center">
                        <div className="inline-flex items-center gap-1 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                          <span className="font-mono font-black text-xs text-amber-900">{head.kpi_score} / 100</span>
                          <span className="text-[10px] font-bold text-emerald-700 mr-1">({head.kpi_rating})</span>
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => navigate(`/dept-heads/${head.id}`)}
                          className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 mx-auto transition-all shadow-2xs cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>فتح البروفايل الكامل</span>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs text-slate-500 font-medium">
                  عرض الصفحة {page} من أصل {totalPages}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="rounded-xl text-xs flex items-center gap-1"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span>السابق</span>
                  </Button>

                  <Button
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="rounded-xl text-xs flex items-center gap-1"
                  >
                    <span>التالي</span>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
