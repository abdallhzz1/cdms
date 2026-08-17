import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

type Scope = 'local' | 'international';
type Partnership = { id: number; institution_name: string; purpose?: string | null; scope: Scope; start_date?: string | null; end_date?: string | null };
type Form = { institution_name: string; purpose: string; scope: Scope; start_date: string; end_date: string; notes: string };
const emptyForm: Form = { institution_name: '', purpose: '', scope: 'local', start_date: '', end_date: '', notes: '' };

export function PartnershipsPage() {
  const { t } = useI18n(); const { can } = useAuth(); const client = useQueryClient();
  const [creating, setCreating] = useState(false); const [form, setForm] = useState<Form>(emptyForm);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['partnerships'], queryFn: () => apiFetch<Partnership[]>('/partnerships?per_page=100'), enabled: can('partnerships.view') });
  const create = useMutation({ mutationFn: () => apiFetch('/partnerships', { method: 'POST', body: { ...form, start_date: form.start_date || null, end_date: form.end_date || null, is_active: true } }), onSuccess: () => { client.invalidateQueries({ queryKey: ['partnerships'] }); setCreating(false); setForm(emptyForm); } });
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const partnerships = data ?? [];
  return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4"><div><h1 className="text-2xl font-bold">{t('partnerships.title')}</h1><p className="mt-1 text-sm text-slate-500">{t('partnerships.description')}</p></div>{can('partnerships.manage') && <Button onClick={() => setCreating(value => !value)}>{t('partnerships.create')}</Button>}</div>
    {creating && <form onSubmit={event => { event.preventDefault(); create.mutate(); }} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2"><input required value={form.institution_name} onChange={event => setForm({ ...form, institution_name: event.target.value })} placeholder={t('partnerships.institution')} className="rounded border p-2"/><input value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} placeholder={t('partnerships.purpose')} className="rounded border p-2"/><select value={form.scope} onChange={event => setForm({ ...form, scope: event.target.value as Scope })} className="rounded border p-2"><option value="local">{t('partnerships.local')}</option><option value="international">{t('partnerships.international')}</option></select><input type="date" value={form.start_date} onChange={event => setForm({ ...form, start_date: event.target.value })} className="rounded border p-2"/><input type="date" value={form.end_date} onChange={event => setForm({ ...form, end_date: event.target.value })} className="rounded border p-2"/><input value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder={t('partnerships.notes')} className="rounded border p-2"/><div className="sm:col-span-2"><Button type="submit" isLoading={create.isPending}>{t('partnerships.save')}</Button></div></form>}
    {partnerships.length === 0 ? <EmptyState message={t('partnerships.none')} /> : <Table><TableHeader><TableRow><TableHead>{t('partnerships.institution')}</TableHead><TableHead>{t('partnerships.purpose')}</TableHead><TableHead>{t('partnerships.scope')}</TableHead><TableHead>{t('partnerships.dates')}</TableHead></TableRow></TableHeader><TableBody>{partnerships.map(item => <TableRow key={item.id}><TableCell className="font-medium">{item.institution_name}</TableCell><TableCell>{item.purpose || '—'}</TableCell><TableCell>{item.scope === 'international' ? t('partnerships.international') : t('partnerships.local')}</TableCell><TableCell>{item.start_date || '—'} {item.end_date ? `– ${item.end_date}` : ''}</TableCell></TableRow>)}</TableBody></Table>}
  </div>;
}
