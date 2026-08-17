import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Button } from '@/components/ui/Button';

interface Group { id: number; name: string; academic_level: string; academic_year?: { name?: string; code?: string }; subgroups?: Array<{ id: number; name: string; min_size: number | null; max_size: number | null; is_active: boolean }> }

export function StudentGroupsPage() {
  const { can } = useAuth(); const { t } = useI18n();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false); const [saving, setSaving] = useState(false); const [saveError, setSaveError] = useState<string | null>(null);
  const [yearId, setYearId] = useState(''); const [level, setLevel] = useState('fourth'); const [name, setName] = useState(''); const [subgroups, setSubgroups] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['student-groups'], queryFn: () => apiFetch<Group[]>('/student-groups?per_page=50') });
  const { data: years = [] } = useQuery({ queryKey: ['academic-years'], queryFn: () => apiFetch<Array<{ id: number; code: string; name: string }>>('/academic-years') });
  const createGroup = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setSaveError(null); try { await apiFetch('/student-groups', { method: 'POST', body: { academic_year_id: Number(yearId), academic_level: level, name, subgroups: subgroups.split(',').map((value) => value.trim()).filter(Boolean).map((value) => ({ name: value })) } }); await queryClient.invalidateQueries({ queryKey: ['student-groups'] }); setCreating(false); setName(''); setSubgroups(''); } catch { setSaveError(t('state.error.message')); } finally { setSaving(false); } };
  if (!can('groups.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />; if (isError) return <ErrorState onRetry={() => refetch()} />;
  return <div className="space-y-6"><div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4"><div><h1 className="text-2xl font-bold text-slate-900">{t('groups.title')}</h1><p className="mt-1 text-sm text-slate-500">{t('groups.description')}</p></div>{can('groups.manage') && <Button onClick={() => setCreating((value) => !value)}>{creating ? t('common.cancel') : t('groups.create')}</Button>}</div>{creating && <form onSubmit={createGroup} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 sm:grid-cols-2"><select required value={yearId} onChange={(event) => setYearId(event.target.value)} className="rounded border p-2"><option value="">{t('groups.academicYear')}</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name || year.code}</option>)}</select><select value={level} onChange={(event) => setLevel(event.target.value)} className="rounded border p-2"><option value="fourth">Fourth / الرابعة</option><option value="fifth">Fifth / الخامسة</option><option value="sixth">Sixth / السادسة</option></select><input required value={name} onChange={(event) => setName(event.target.value)} placeholder={t('groups.name')} className="rounded border p-2"/><input value={subgroups} onChange={(event) => setSubgroups(event.target.value)} placeholder={t('groups.subgroupsHint')} className="rounded border p-2"/><div className="sm:col-span-2">{saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}<Button type="submit" isLoading={saving}>{t('groups.save')}</Button></div></form>}{!data?.length ? <EmptyState message={t('groups.noGroups')} /> : <div className="grid gap-4 md:grid-cols-2">{data.map((group) => <section key={group.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">{group.name}</h2><p className="mt-1 text-sm text-slate-500">{t('groups.level')}: {group.academic_level} · {group.academic_year?.name || group.academic_year?.code || '—'}</p><div className="mt-4 divide-y border-t">{group.subgroups?.map((subgroup) => <div key={subgroup.id} className="flex justify-between py-3 text-sm"><span className="font-medium">{subgroup.name}</span><span>{t('groups.capacity')}: {subgroup.min_size ?? '—'}–{subgroup.max_size ?? '—'} · {subgroup.is_active ? t('groups.active') : t('groups.inactive')}</span></div>)}</div></section>)}</div>}</div>;
}
