import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Building2, Users, Search, ChevronRight, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export function DistributionPage() {
  const { can } = useAuth();
  const { locale } = useI18n();
  const [search, setSearch] = useState('');

  const { data: sites, isLoading, isError, refetch } = useQuery({
    queryKey: ['training-sites', search],
    queryFn: () => apiFetch<any>(`/training-sites?search=${search}&per_page=50`),
  });

  if (!can('distribution.view')) return <ErrorState title="Access Denied" />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const sitesList = Array.isArray(sites) ? sites : sites?.items || [];

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <PageHeader
        title={locale === 'ar' ? 'توزيع الطلبة على المستشفيات' : 'Clinical Distribution'}
        description={locale === 'ar' ? 'نظرة عامة على جميع مواقع التدريب والطلاب المعينين بها' : 'Overview of all training sites and assigned students'}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder={locale === 'ar' ? 'ابحث عن مستشفى أو موقع تدريب...' : 'Search hospitals & sites...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 text-sm focus:ring-1 focus:ring-indigo-500 bg-white"
        />
      </div>

      {!sitesList.length ? (
        <EmptyState message={locale === 'ar' ? 'لا توجد مواقع تدريب مسجلة' : 'No training sites found'} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sitesList.map((site: any) => (
            <Link
              key={site.id}
              to={`/distribution/${site.id}`}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
            >
              <div className="p-6 flex-1">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 leading-tight truncate">
                      {locale === 'ar' ? site.name_ar : site.name_en || site.name_ar}
                    </h3>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-xs font-semibold">{site.site_code}</span>
                  </div>
                </div>

                {site.department && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{locale === 'ar' ? site.department?.name_ar : site.department?.name_en || site.department?.name_ar}</span>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm text-slate-500">
                    <Users className="w-4 h-4" />
                    <span>{locale === 'ar' ? 'عرض الطلاب المعينين' : 'View assigned students'}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
