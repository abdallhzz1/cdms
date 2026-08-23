import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2, Calendar, Stethoscope, Users } from 'lucide-react';
import hebronLogo from '@/assets/hebron.png';

interface SiteData {
  id: number;
  name_ar: string;
  name_en: string;
  supervisors: SupervisorData[];
}

interface SupervisorData {
  id: number;
  name_ar: string;
  department_ar: string;
  weeksArray: { week: number | string; students: string[] }[];
}

export function PublicClinicalSchedulePage() {
  const { locale } = useI18n();

  const { data: scheduleData, isLoading, isError, refetch } = useQuery({
    queryKey: ['public-clinical-schedule'],
    queryFn: () => apiFetch<any>('/public/clinical-schedule?per_page=1000'),
    refetchInterval: 5 * 60 * 1000,
  });

  const assignments = useMemo((): any[] => {
    const raw = Array.isArray(scheduleData) ? scheduleData : scheduleData?.data || scheduleData?.items || [];
    return raw as any[];
  }, [scheduleData]);

  const groupedData = useMemo((): SiteData[] => {
    const sites = new Map<number, {
      id: number; name_ar: string; name_en: string;
      supervisors: Map<number, { id: number; name_ar: string; department_ar: string; weeks: Map<string | number, Set<string>>; }>;
    }>();

    for (const item of assignments) {
      if (!item.trainingSite || !item.supervisor) continue;
      const siteId = item.trainingSite.id as number;
      if (!sites.has(siteId)) {
        sites.set(siteId, { id: siteId, name_ar: item.trainingSite.name_ar || '', name_en: item.trainingSite.name_en || '', supervisors: new Map() });
      }
      const site = sites.get(siteId)!;
      const supId = item.supervisor.id as number;
      if (!site.supervisors.has(supId)) {
        site.supervisors.set(supId, { id: supId, name_ar: item.supervisor.name || item.supervisor.full_name_ar || '', department_ar: item.department?.name_ar || '', weeks: new Map() });
      }
      const sup = site.supervisors.get(supId)!;
      const weekKey: string | number = item.rotationBlock?.id ?? 'block';
      if (!sup.weeks.has(weekKey)) sup.weeks.set(weekKey, new Set());
      if (item.student) {
        const studentName: string = item.student.full_name_ar || item.student.name || String(item.student.id);
        sup.weeks.get(weekKey)!.add(studentName);
      }
    }

    return Array.from(sites.values()).map((site) => ({
      ...site,
      supervisors: Array.from(site.supervisors.values()).map((sup) => ({
        ...sup,
        weeksArray: Array.from(sup.weeks.entries()).map(([w, students]) => ({ week: w, students: Array.from(students) })),
      })),
    }));
  }, [assignments]);

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12" dir="rtl">
      <div className="max-w-[1400px] mx-auto space-y-8">

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <img src={hebronLogo} alt="Hebron University" className="h-20 w-auto object-contain" />
            <div>
              <h1 className="text-3xl font-black text-slate-900">الجداول السريرية للطلبة</h1>
              <p className="text-slate-500 mt-2 text-lg font-medium">اللوحة الحية لتوزيع الطلبة والمشرفين على مواقع التدريب</p>
            </div>
          </div>
          <div className="bg-teal-50 border border-teal-200 text-teal-800 px-6 py-3 rounded-2xl flex items-center gap-3">
            <Calendar className="w-6 h-6 text-teal-600" />
            <div>
              <span className="block text-xs font-bold text-teal-600/80">العام الأكاديمي الحالي</span>
              <span className="block text-xl font-black">2026 / 2027</span>
            </div>
          </div>
        </div>

        {groupedData.length === 0 ? (
          <EmptyState title="لا يوجد توزيع سريري معتمد حالياً" message="جاري تجهيز الجداول من قبل الدائرة السريرية، يرجى المراجعة لاحقاً." />
        ) : (
          <div className="space-y-8">
            {groupedData.map((site) => (
              <div key={site.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 p-6 flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white">{locale === 'ar' ? site.name_ar : site.name_en}</h2>
                    <span className="text-slate-400 text-sm font-medium">موقع تدريب معتمد</span>
                  </div>
                </div>
                <div className="p-6 overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="border-b-2 border-slate-100">
                        <th className="py-4 text-slate-400 font-bold text-sm w-1/4">
                          <div className="flex items-center gap-2 justify-end"><Stethoscope className="w-4 h-4" />المشرف السريري / القسم</div>
                        </th>
                        <th className="py-4 text-slate-400 font-bold text-sm">
                          <div className="flex items-center gap-2 justify-end"><Users className="w-4 h-4" />الطلاب المتدربون</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {site.supervisors.map((sup) => (
                        <tr key={sup.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-5 pl-4 align-top">
                            <h3 className="font-bold text-slate-900 text-lg">{sup.name_ar}</h3>
                            {sup.department_ar && (
                              <span className="text-sm font-medium text-teal-600 bg-teal-50 px-2 py-1 rounded-md border border-teal-100 mt-2 inline-block">{sup.department_ar}</span>
                            )}
                          </td>
                          <td className="py-5 pr-4">
                            {sup.weeksArray.length === 0 ? (
                              <span className="text-sm text-slate-400">لا يوجد طلاب مخصصون</span>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                {sup.weeksArray.map((w) => (
                                  <div key={String(w.week)} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm min-w-[180px]">
                                    <div className="text-xs font-bold text-slate-400 mb-2 border-b border-slate-100 pb-2">روتيشن #{String(w.week)}</div>
                                    <ul className="space-y-1.5">
                                      {w.students.map((stu: string, i: number) => (
                                        <li key={i} className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full flex-shrink-0" />
                                          {stu}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="text-center text-slate-400 text-xs py-4">
          جامعة الخليل — كلية الطب &nbsp;•&nbsp; يتم تحديث هذه الصفحة تلقائياً كل 5 دقائق
        </div>

      </div>
    </div>
  );
}
