import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarDays, CheckCheck, ListTodo, Mail, SlidersHorizontal } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useI18n } from '@/i18n/I18nContext';
import { notificationText, relativeNotificationTime, type LocalNotification } from '@/features/notifications/types';

const categoryIcon = (category: string) => category === 'tasks' ? ListTodo : category === 'correspondence' ? Mail : category === 'distribution' ? CalendarDays : Bell;

export function NotificationsPage() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => apiFetch<LocalNotification[]>('/notifications?per_page=50'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
    ]);
  };
  const readOne = useMutation({ mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }), onSuccess: refresh });
  const visible = useMemo(() => filter === 'unread' ? data.filter(item => !item.read_at) : data, [data, filter]);
  const open = async (item: LocalNotification) => {
    if (!item.read_at) await readOne.mutateAsync(item.id);
    if (item.action_url) navigate(item.action_url);
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return <div className="mx-auto max-w-5xl space-y-5 pb-14">
    <PageHeader title={ar ? 'الإشعارات' : 'Notifications'} description={ar ? 'كل ما يحتاج متابعتك من مكان واحد.' : 'Everything requiring your attention in one place.'}>
      {data.some(item => !item.read_at) && <button onClick={() => readAll.mutate()} disabled={readAll.isPending} className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-60"><CheckCheck className="h-4 w-4" />{ar ? 'تعيين الكل كمقروء' : 'Mark all read'}</button>}
    </PageHeader>
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      <SlidersHorizontal className="mx-2 h-4 w-4 text-slate-400" />
      {(['all', 'unread'] as const).map(value => <button key={value} onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 text-xs font-bold ${filter === value ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{value === 'all' ? (ar ? 'الكل' : 'All') : (ar ? 'غير المقروءة' : 'Unread')}</button>)}
    </div>
    {!visible.length ? <EmptyState message={ar ? 'لا توجد إشعارات ضمن هذا التصنيف.' : 'No notifications in this view.'} /> : <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {visible.map(item => { const Icon = item.severity === 'urgent' ? AlertTriangle : categoryIcon(item.category); const text = notificationText(item, locale); return <button key={item.id} onClick={() => open(item)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-start last:border-0 hover:bg-slate-50 sm:p-5 ${!item.read_at ? 'bg-teal-50/40' : ''}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.severity === 'urgent' ? 'bg-red-50 text-red-600' : item.severity === 'action' ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700'}`}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-800">{text.title}</strong>{!item.read_at && <span className="h-2 w-2 rounded-full bg-teal-500" aria-label={ar ? 'غير مقروء' : 'Unread'} />}</span><span className="mt-1 block text-xs leading-6 text-slate-500">{text.message}</span><span className="mt-2 block text-[11px] font-medium text-slate-400">{relativeNotificationTime(item.created_at, locale)}{item.actor_name ? ` · ${item.actor_name}` : ''}</span></span>
      </button>; })}
    </section>}
  </div>;
}
