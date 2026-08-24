import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeftRight, BookOpenCheck, CalendarDays, CheckCircle2,
  ChevronDown, ChevronUp, ClipboardCheck, History, LayoutGrid, Plus,
  RefreshCw, Search, Send, Sparkles, Trash2, Users,
} from 'lucide-react';
import { ApiError } from '@/api/client';
import {
  approveVersion, createDistributionVersion, deleteSubgroupAssignment,
  generateDistribution, getDistributionOptions, getDistributionSubgroups,
  getDistributionVersion, getDistributionVersions, getRotations, publishVersion,
  type DistributionSubgroupItem,
} from '@/api/distribution';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConflictsTab } from '@/components/distribution/ConflictsTab';
import { AuditHistoryTab } from '@/components/distribution/AuditHistoryTab';
import { ComparisonTab } from '@/components/distribution/ComparisonTab';
import { SubgroupAssignmentModal } from '@/components/distribution/SubgroupAssignmentModal';

type WorkbenchTab = 'board' | 'conflicts' | 'history' | 'comparison';
type GroupFilter = 'all' | 'unassigned' | 'attention';

const levelOrder = { fourth: 4, fifth: 5, sixth: 6 } as const;

function apiMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const validation = Object.values(error.errors).flatMap((value) => Array.isArray(value) ? value : [value]);
  const first = validation.find((value) => typeof value === 'string');
  return typeof first === 'string' ? first : error.message || fallback;
}

export function DistributionPage() {
  const { versionId: routeVersionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const { locale, t } = useI18n();

  const [rotationId, setRotationId] = useState<number | null>(null);
  const [versionId, setVersionId] = useState<number | null>(routeVersionId ? Number(routeVersionId) : null);
  const [tab, setTab] = useState<WorkbenchTab>('board');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [selectedSubgroup, setSelectedSubgroup] = useState<DistributionSubgroupItem | null>(null);
  const [expandedSubgroupId, setExpandedSubgroupId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const rotationsQuery = useQuery({
    queryKey: ['distribution-rotations'],
    queryFn: () => getRotations(),
    enabled: can('distribution.view'),
  });

  const rotations = useMemo(() => [...(rotationsQuery.data ?? [])].sort((a, b) => {
    const yearCompare = (b.academic_year?.name ?? '').localeCompare(a.academic_year?.name ?? '');
    return yearCompare || levelOrder[a.academic_level] - levelOrder[b.academic_level] || a.name.localeCompare(b.name);
  }), [rotationsQuery.data]);

  useEffect(() => {
    if (!rotationId && rotations.length > 0) setRotationId(rotations[0].id);
  }, [rotationId, rotations]);

  const versionsQuery = useQuery({
    queryKey: ['distribution-versions', rotationId],
    queryFn: () => getDistributionVersions({ rotation_id: rotationId!, per_page: 100 }),
    enabled: Boolean(rotationId),
  });

  const versions = versionsQuery.data?.data ?? [];

  useEffect(() => {
    if (routeVersionId && Number(routeVersionId) !== versionId) setVersionId(Number(routeVersionId));
  }, [routeVersionId, versionId]);

  useEffect(() => {
    if (!routeVersionId && versions.length > 0 && !versions.some((version) => version.id === versionId)) {
      const preferred = versions.find((version) => version.is_current_published) ?? versions[0];
      setVersionId(preferred.id);
    }
    if (versions.length === 0 && versionsQuery.isSuccess) setVersionId(null);
  }, [routeVersionId, versionId, versions, versionsQuery.isSuccess]);

  const versionQuery = useQuery({
    queryKey: ['distribution-version', versionId],
    queryFn: () => getDistributionVersion(versionId!),
    enabled: Boolean(versionId),
  });

  useEffect(() => {
    if (routeVersionId && versionQuery.data && rotationId !== versionQuery.data.rotation_id) {
      setRotationId(versionQuery.data.rotation_id);
    }
  }, [routeVersionId, rotationId, versionQuery.data]);

  const subgroupsQuery = useQuery({
    queryKey: ['distribution-subgroups', versionId],
    queryFn: () => getDistributionSubgroups(versionId!),
    enabled: Boolean(versionId),
  });

  const optionsQuery = useQuery({
    queryKey: ['distribution-options', versionId],
    queryFn: () => getDistributionOptions(versionId!),
    enabled: Boolean(versionId),
  });

  const refreshWorkbench = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['distribution-version', versionId] }),
      queryClient.invalidateQueries({ queryKey: ['distribution-subgroups', versionId] }),
      queryClient.invalidateQueries({ queryKey: ['distribution-versions', rotationId] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: () => createDistributionVersion({ rotation_id: rotationId! }),
    onSuccess: async (version) => {
      await queryClient.invalidateQueries({ queryKey: ['distribution-versions', rotationId] });
      setVersionId(version.id);
      navigate(`/distribution/workbench/${version.id}`, { replace: true });
      setNotice({ type: 'success', text: t('distribution.workspace.versionCreated') });
    },
    onError: (error) => setNotice({ type: 'error', text: apiMessage(error, t('state.error.message')) }),
  });

  const generateMutation = useMutation({
    mutationFn: () => generateDistribution(rotationId!),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['distribution-versions', rotationId] });
      setVersionId(result.distribution_version_id);
      navigate(`/distribution/workbench/${result.distribution_version_id}`, { replace: true });
      setNotice({ type: 'success', text: t('distribution.workspace.suggestionCreated') });
    },
    onError: (error) => setNotice({ type: 'error', text: apiMessage(error, t('distribution.workspace.generationFailed')) }),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveVersion(versionId!),
    onSuccess: async () => { await refreshWorkbench(); setNotice({ type: 'success', text: t('distribution.workspace.approved') }); },
    onError: (error) => setNotice({ type: 'error', text: apiMessage(error, t('distribution.workspace.approvalFailed')) }),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishVersion(versionId!, { last_updated_at: versionQuery.data!.updated_at }),
    onSuccess: async () => { await refreshWorkbench(); setNotice({ type: 'success', text: t('distribution.workspace.published') }); },
    onError: (error) => setNotice({ type: 'error', text: apiMessage(error, t('distribution.workspace.publishFailed')) }),
  });

  const deleteMutation = useMutation({
    mutationFn: (subgroupId: number) => deleteSubgroupAssignment(versionId!, subgroupId),
    onSuccess: async () => { await refreshWorkbench(); setNotice({ type: 'success', text: t('distribution.workspace.assignmentRemoved') }); },
    onError: (error) => setNotice({ type: 'error', text: apiMessage(error, t('state.error.message')) }),
  });

  const selectedRotation = rotations.find((rotation) => rotation.id === rotationId);
  const version = versionQuery.data;
  const subgroups = subgroupsQuery.data ?? [];
  const assignedCount = subgroups.filter((subgroup) => subgroup.status === 'assigned').length;
  const unassignedCount = subgroups.filter((subgroup) => subgroup.status === 'unassigned').length;
  const attentionCount = subgroups.filter((subgroup) => subgroup.status === 'attention').length;
  const filteredSubgroups = subgroups.filter((subgroup) => {
    const matchesFilter = filter === 'all' || subgroup.status === filter;
    const term = search.trim().toLocaleLowerCase();
    if (!term) return matchesFilter;
    const matchesSearch = subgroup.name.toLocaleLowerCase().includes(term)
      || subgroup.main_group.name.toLocaleLowerCase().includes(term)
      || subgroup.students.some((student) => student.university_number?.includes(term)
        || student.full_name_ar?.toLocaleLowerCase().includes(term)
        || student.full_name_en?.toLocaleLowerCase().includes(term));
    return matchesFilter && matchesSearch;
  });
  const isPublished = version?.status === 'published';
  const isApproved = Boolean(version?.summary.approval_state);

  if (!can('distribution.view')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (rotationsQuery.isLoading) return <LoadingState />;
  if (rotationsQuery.isError) return <ErrorState onRetry={() => rotationsQuery.refetch()} />;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-12">
      <PageHeader title={t('distribution.workspace.title')} description={t('distribution.workspace.description')}>
        <Link to="/distribution/groups" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"><Users className="h-4 w-4" />{t('distribution.workspace.manageGroups')}</Link>
        <Link to="/clinical/schedule" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><CalendarDays className="h-4 w-4" />{t('distribution.workspace.publishedSchedule')}</Link>
      </PageHeader>

      {notice && <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-semibold ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} className="font-black">×</button></div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1.2fr)_minmax(220px,1fr)_auto] md:items-end">
          <label><span className="mb-1.5 block text-[11px] font-bold text-slate-500">{t('distribution.workspace.rotation')}</span><select value={rotationId ?? ''} onChange={(event) => { const next = Number(event.target.value); setRotationId(next); setVersionId(null); navigate('/distribution', { replace: true }); }} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100">{rotations.map((rotation) => <option key={rotation.id} value={rotation.id}>{rotation.academic_year?.name} — {t(`distribution.levels.${rotation.academic_level}`)} — {rotation.name}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[11px] font-bold text-slate-500">{t('distribution.workspace.version')}</span><select value={versionId ?? ''} onChange={(event) => { const next = Number(event.target.value); setVersionId(next); navigate(`/distribution/workbench/${next}`, { replace: true }); }} disabled={versions.length === 0} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none disabled:bg-slate-100 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"><option value="">{versions.length === 0 ? t('distribution.workspace.noVersions') : t('distribution.workspace.selectVersion')}</option>{versions.map((item) => <option key={item.id} value={item.id}>#{item.id} — {item.name || t('distribution.workspace.unnamedVersion')} — {t(`distribution.status.${item.status}`)}</option>)}</select></label>
          <div className="flex flex-wrap gap-2">{can('distribution.create') && <button type="button" disabled={!rotationId || createMutation.isPending} onClick={() => createMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />{t('distribution.workspace.newManualVersion')}</button>}{can('distribution.generate') && <button type="button" disabled={!rotationId || generateMutation.isPending} onClick={() => generateMutation.mutate()} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"><Sparkles className="h-4 w-4" />{t('distribution.workspace.autoSuggestion')}</button>}</div>
        </div>
      </section>

      {rotations.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center"><BookOpenCheck className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-3 text-sm font-bold text-slate-800">{t('distribution.workspace.noRotations')}</h2><p className="mt-1 text-xs text-slate-500">{t('distribution.workspace.noRotationsHint')}</p></div>
      ) : versionsQuery.isLoading || (versionId && versionQuery.isLoading) ? <LoadingState />
      : versionsQuery.isError || versionQuery.isError ? <ErrorState onRetry={() => { versionsQuery.refetch(); versionQuery.refetch(); }} />
      : !version ? (
        <div className="rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/40 p-10 text-center"><LayoutGrid className="mx-auto h-10 w-10 text-teal-400" /><h2 className="mt-3 text-sm font-bold text-slate-800">{t('distribution.workspace.startTitle')}</h2><p className="mx-auto mt-1 max-w-xl text-xs leading-6 text-slate-600">{t('distribution.workspace.startDescription')}</p></div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${isPublished ? 'bg-indigo-100 text-indigo-800' : isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isPublished ? <Send className="h-3.5 w-3.5" /> : isApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}{isPublished ? t('distribution.status.published') : isApproved ? t('distribution.status.approved') : t(`distribution.status.${version.status}`)}</span><span className="text-xs font-bold text-slate-800">#{version.id} — {version.name}</span><span className="text-[11px] text-slate-500">{selectedRotation?.academic_year?.name} • {selectedRotation ? t(`distribution.levels.${selectedRotation.academic_level}`) : ''}</span></div>
              <div className="flex flex-wrap gap-2">{can('distribution.approve') && !isPublished && !isApproved && <button type="button" disabled={approveMutation.isPending || subgroupsQuery.isLoading || subgroups.length === 0 || unassignedCount > 0 || attentionCount > 0} onClick={() => approveMutation.mutate()} title={(subgroups.length === 0 || unassignedCount || attentionCount) ? t('distribution.workspace.fixBeforeApproval') : undefined} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"><ClipboardCheck className="h-4 w-4" />{t('distribution.workspace.approve')}</button>}{can('distribution.publish') && !isPublished && isApproved && <button type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50"><Send className="h-4 w-4" />{t('distribution.workspace.publish')}</button>}</div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">{[
              [t('distribution.workspace.totalSubgroups'), subgroups.length, 'text-slate-900'], [t('distribution.workspace.assignedSubgroups'), assignedCount, 'text-emerald-700'],
              [t('distribution.workspace.unassignedSubgroups'), unassignedCount, 'text-amber-700'], [t('distribution.workspace.needsAttention'), attentionCount, 'text-red-700'],
              [t('distribution.workspace.students'), version.summary.total_students, 'text-slate-900'], [t('distribution.workspace.conflicts'), version.summary.conflicts, version.summary.conflicts ? 'text-red-700' : 'text-emerald-700'],
            ].map(([label, value, color]) => <div key={String(label)} className="bg-white px-4 py-3"><div className="text-[10px] font-semibold text-slate-500">{label}</div><div className={`mt-1 text-xl font-black ${color}`}>{value}</div></div>)}</div>
          </section>

          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-900"><div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /><div><strong>{t('distribution.workspace.groupsSourceTitle')}</strong><p className="mt-1 leading-5 text-teal-800">{t('distribution.workspace.groupsSourceDescription')}</p></div></div></div>

          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" aria-label={t('distribution.workspace.tabs')}>{([
            ['board', LayoutGrid, t('distribution.workspace.board')], ['conflicts', AlertCircle, `${t('distribution.workspace.conflicts')} (${version.summary.conflicts})`],
            ['history', History, t('distribution.workspace.history')], ['comparison', ArrowLeftRight, t('distribution.workspace.comparison')],
          ] as const).map(([key, Icon, label]) => <button key={key} type="button" onClick={() => setTab(key)} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold ${tab === key ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

          {tab === 'board' && <section className="space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative min-w-0 flex-1 sm:max-w-md"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('distribution.workspace.searchSubgroups')} className="w-full rounded-xl border border-slate-300 py-2.5 pe-3 ps-10 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" /></div><div className="flex gap-1 rounded-xl bg-slate-100 p-1">{(['all', 'unassigned', 'attention'] as GroupFilter[]).map((key) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${filter === key ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>{t(`distribution.filters.${key}`)}</button>)}</div></div>
            {subgroupsQuery.isLoading ? <LoadingState /> : subgroupsQuery.isError ? <ErrorState onRetry={() => subgroupsQuery.refetch()} /> : subgroups.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 p-8 text-center"><AlertCircle className="mx-auto h-9 w-9 text-amber-500" /><h3 className="mt-2 text-sm font-bold text-amber-900">{t('distribution.workspace.noSubgroups')}</h3><p className="mt-1 text-xs text-amber-800">{t('distribution.workspace.noSubgroupsHint')}</p><Link to="/distribution/groups" className="mt-4 inline-flex rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white">{t('distribution.workspace.manageGroups')}</Link></div>
            ) : filteredSubgroups.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500">{t('distribution.workspace.noMatchingSubgroups')}</div> : (
              <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{filteredSubgroups.map((subgroup) => {
                const allocation = subgroup.allocations[0];
                const siteName = allocation?.training_site?.name_ar || allocation?.training_site?.name || allocation?.training_site?.name_en || '—';
                const supervisorName = allocation?.supervisor?.full_name_ar || allocation?.supervisor?.full_name_en || [allocation?.supervisor?.first_name, allocation?.supervisor?.last_name].filter(Boolean).join(' ') || t('distribution.workspace.withoutSupervisor');
                const blockName = allocation?.rotation_block?.name || allocation?.rotation_block?.block_code || (allocation ? `#${allocation.rotation_block_id}` : '—');
                const statusClasses = subgroup.status === 'assigned' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : subgroup.status === 'attention' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800';
                return <article key={subgroup.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3 p-4"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-100 text-sm font-black text-teal-800">{subgroup.name}</div><div><h3 className="text-sm font-bold text-slate-900">{t('distribution.workspace.subgroup')} {subgroup.name}</h3><p className="mt-1 text-[11px] text-slate-500">{t('distribution.workspace.mainGroup')}: {subgroup.main_group.name} • {t('distribution.workspace.studentsCount').replace('{count}', String(subgroup.student_count))}</p></div></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusClasses}`}>{t(`distribution.subgroupStatus.${subgroup.status}`)}</span></div>
                  {allocation ? <div className="grid grid-cols-2 gap-px border-y border-slate-200 bg-slate-200 text-xs"><div className="bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">{t('distribution.workspace.rotationBlock')}</span><strong className="mt-1 block text-slate-800">{blockName}</strong></div><div className="bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">{t('distribution.workspace.trainingSite')}</span><strong className="mt-1 block text-slate-800">{siteName}</strong></div><div className="col-span-2 bg-slate-50 p-3"><span className="block text-[10px] text-slate-500">{t('distribution.workspace.supervisor')}</span><strong className="mt-1 block text-slate-800">{supervisorName}</strong></div></div> : <div className="border-y border-dashed border-amber-200 bg-amber-50/50 p-4 text-center text-xs font-semibold text-amber-800">{t('distribution.workspace.readyForAssignment')}</div>}
                  {subgroup.roster_changed && <div className="mx-4 mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800"><AlertCircle className="h-4 w-4 shrink-0" />{t('distribution.workspace.rosterChanged')}</div>}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3"><button type="button" onClick={() => setExpandedSubgroupId(expandedSubgroupId === subgroup.id ? null : subgroup.id)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"><Users className="h-3.5 w-3.5" />{t('distribution.workspace.showStudents')}{expandedSubgroupId === subgroup.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>{!isPublished && <div className="flex gap-2">{allocation && (can('distribution.delete') || can('distribution.update')) && <button type="button" disabled={deleteMutation.isPending} onClick={() => { if (window.confirm(t('distribution.workspace.removeConfirmation').replace('{subgroup}', subgroup.name))) deleteMutation.mutate(subgroup.id); }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-700 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />{t('common.delete')}</button>}{((allocation && can('distribution.update')) || (!allocation && can('distribution.create'))) && <button type="button" onClick={() => setSelectedSubgroup(subgroup)} className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800">{allocation ? t('common.edit') : t('distribution.workspace.assign')}</button>}</div>}</div>
                  {expandedSubgroupId === subgroup.id && <div className="max-h-48 overflow-y-auto border-t border-slate-200 bg-slate-50 px-4 py-2">{subgroup.students.map((student) => <div key={student.id} className="flex items-center justify-between gap-3 border-b border-slate-200 py-2 last:border-0"><span className="truncate text-xs font-semibold text-slate-800">{locale === 'ar' ? student.full_name_ar : student.full_name_en || student.full_name_ar}</span><span className="shrink-0 font-mono text-[10px] text-slate-500">{student.university_number}</span></div>)}</div>}
                </article>;
              })}</div>
            )}
          </section>}
          {tab === 'conflicts' && <ConflictsTab version={version} />}
          {tab === 'history' && <AuditHistoryTab version={version} />}
          {tab === 'comparison' && <ComparisonTab version={version} />}
        </>
      )}

      {selectedSubgroup && version && <SubgroupAssignmentModal version={version} subgroup={selectedSubgroup} supervisors={optionsQuery.data?.supervisors ?? []} onClose={() => setSelectedSubgroup(null)} onSuccess={async () => { setSelectedSubgroup(null); await refreshWorkbench(); setNotice({ type: 'success', text: t('distribution.workspace.assignmentSaved') }); }} />}
    </div>
  );
}
