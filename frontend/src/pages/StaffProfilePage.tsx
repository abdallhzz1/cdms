import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { 
  Mail, Phone, MapPin, Building, Briefcase, Activity, 
  UserCircle, ChevronRight, Hash, Clock, Stethoscope, CreditCard, Calendar
} from 'lucide-react';

const DetailItem = ({ icon: Icon, label, value }: { icon: any, label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-4 py-3">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 text-emerald-600">
      <Icon className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 truncate">{value ?? '—'}</dd>
    </div>
  </div>
);

export function StaffProfilePage() {
  const { can } = useAuth();
  const { personId } = useParams<{ personId: string }>();
  const { locale, t } = useI18n();

  const { data: person, isLoading, isError, refetch } = useQuery({
    queryKey: ['person', personId],
    queryFn: () => apiFetch<any>(`/people/${personId}`),
    enabled: Boolean(personId)
  });
  
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (!person) return <EmptyState title={t('state.not_found.title')} message={t('state.not_found.message')} />;
  
  const name = locale === 'ar' ? person.full_name_ar : person.full_name_en || person.full_name_ar;
  const relationName = (value: { name_ar?: string; name_en?: string } | undefined) =>
    locale === 'ar' ? value?.name_ar : value?.name_en || value?.name_ar;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <Link to="/supervisors" className="flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-emerald-600 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm">
            <ChevronRight className="w-4 h-4" />
            {t('nav.supervisor', 'المشرفين')}
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-sm font-semibold text-slate-700">{person.national_id}</span>
        </div>
        
        <div className="flex items-center gap-2">
           {can('correspondence.create') && (
             <Link to={person.user_id ? `/outbox?to=${person.user_id}` : '/outbox'} className="text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl shadow-sm transition-all">
               {locale === 'ar' ? 'مراسلة المشرف' : 'Message Supervisor'}
             </Link>
           )}
           {(can('performance.view') || can('quality.manage')) && (
             <Link to={`/evaluation-forms?target=${personId}`} className="text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-xl shadow-sm transition-all">
               {locale === 'ar' ? 'إضافة تقييم مشرف' : 'Evaluate Supervisor'}
             </Link>
           )}
        </div>
      </div>

      {/* Profile Header */}
      <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden shadow-sm relative">
        <div className="h-32 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 w-full opacity-90" />
        <div className="px-6 sm:px-8 pb-8 relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-6 -mt-14 mb-4">
            <div className="h-28 w-28 rounded-full border-4 border-white bg-white shadow-md flex items-center justify-center shrink-0 overflow-hidden">
              <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=e0f2fe&color=0284c7&size=150`} alt={name} className="h-full w-full object-cover" />
            </div>
            <div className="pb-2">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{name}</h1>
              <p className="text-sm font-medium text-slate-500 flex items-center gap-2 mt-1">
                <Stethoscope className="w-4 h-4" /> {person.specialty || t('staffProfile.title', 'مشرف سريري')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-4">
            {person.academic_degree && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
                <Briefcase className="w-3.5 h-3.5" />
                {person.academic_degree}
              </span>
            )}
            {person.staff_code && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                <Hash className="w-3.5 h-3.5" />
                Code: {person.staff_code}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><UserCircle className="w-5 h-5 text-emerald-500"/> {t('staffProfile.contact', 'معلومات الاتصال')}</CardTitle></CardHeader>
            <CardContent className="px-6 py-2">
              <dl className="divide-y divide-slate-100">
                <DetailItem icon={Mail} label={t('staffProfile.email', 'البريد الإلكتروني')} value={person.email} />
                <DetailItem icon={Phone} label={t('staffProfile.phone', 'رقم الهاتف')} value={person.phone} />
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="w-5 h-5 text-emerald-500"/> {t('staffProfile.professional', 'المعلومات المهنية')}</CardTitle></CardHeader>
            <CardContent className="px-6 py-2">
              <dl className="divide-y divide-slate-100">
                <DetailItem icon={Hash} label={t('staffProfile.staffCode', 'الرمز الوظيفي')} value={person.staff_code} />
                <DetailItem icon={Stethoscope} label={t('staffProfile.specialty', 'التخصص')} value={person.specialty} />
                <DetailItem icon={Briefcase} label={t('staffProfile.degree', 'الدرجة الأكاديمية')} value={person.academic_degree} />
                <DetailItem icon={CreditCard} label={t('staffProfile.license', 'رقم المزاولة')} value={person.license_number} />
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Building className="w-5 h-5 text-emerald-500"/> {t('staffProfile.department', 'القسم وموقع التدريب')}</CardTitle></CardHeader>
            <CardContent className="px-6 py-2">
              <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <DetailItem icon={Building} label={t('staffProfile.department', 'القسم')} value={relationName(person.department)} />
                <DetailItem icon={MapPin} label={t('staffProfile.site', 'موقع التدريب الأساسي')} value={relationName(person.primary_site)} />
                <DetailItem icon={UserCircle} label={t('staffProfile.capacity', 'القدرة الاستيعابية')} value={person.max_students} />
                <DetailItem icon={Calendar} label={t('staffProfile.availability', 'أيام التواجد')} value={person.available_days} />
              </dl>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-500"/> {t('staffProfile.activities', 'الأنشطة السريرية')}</CardTitle></CardHeader>
            <div className="px-6 pb-6 pt-2">
              {!person.activity_records?.length ? (
                <EmptyState message={t('staffProfile.noActivities', 'لا توجد أنشطة مسجلة')} />
              ) : (
                <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">Title</th>
                        <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                        <th className="px-5 py-4 text-end text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {person.activity_records.map((activity: any) => (
                        <tr key={activity.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4 text-sm font-bold text-slate-900">{activity.title}</td>
                          <td className="px-5 py-4 text-sm font-medium text-slate-600">{activity.activity_type}</td>
                          <td className="px-5 py-4 text-sm font-medium text-end text-slate-500">{activity.activity_date || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-500"/> {t('staffProfile.availabilityRecords', 'جداول التواجد')}</CardTitle></CardHeader>
            <div className="px-6 pb-6 pt-2">
              {!person.availabilities?.length ? (
                <EmptyState message={t('staffProfile.noAvailabilityRecords', 'لا توجد جداول تواجد')} />
              ) : (
                <div className="rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">Day</th>
                        <th className="px-5 py-4 text-start text-xs font-bold text-slate-500 uppercase tracking-wider">Time</th>
                        <th className="px-5 py-4 text-end text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {person.availabilities.map((record: any) => (
                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-4 text-sm font-bold text-slate-900">{record.day || '—'}</td>
                          <td className="px-5 py-4 text-sm font-medium text-slate-600">{record.from_time || '—'} — {record.until_time || '—'}</td>
                          <td className="px-5 py-4 text-sm font-medium text-end text-slate-500">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                              {record.status || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
