import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { apiFetch } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { PageHeader } from '@/components/ui/PageHeader';

export function SkillLogbookPage() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('assessment.create');
  
  const [showArchived, setShowArchived] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['skill-logbook-requirements', showArchived],
    queryFn: () => apiFetch<any[]>(`/skill-logbook-requirements?show_archived=${showArchived ? 1 : 0}`)
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/skill-logbook-requirements', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill-logbook-requirements'] });
      setSuccessMsg(t('logbook.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/skill-logbook-requirements/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill-logbook-requirements'] });
      setSuccessMsg(t('logbook.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/skill-logbook-requirements/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skill-logbook-requirements'] });
      setSuccessMsg(t('logbook.archiveSuccess'));
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({ requires_supervisor_signature: false });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleArchive = (id: number) => {
    if (window.confirm(t('logbook.archiveConfirm'))) {
      archiveMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, body: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader 
        title={t('logbook.title')}
        description={t('logbook.description')}
      >
        {canManage && <Button onClick={handleOpenAdd}>{t('logbook.add')}</Button>}
      </PageHeader>
      
      {successMsg && <div className="bg-green-50 text-green-700 p-3 rounded">{successMsg}</div>}

      <div className="flex justify-end mb-4">
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-slate-300" />
          <span>{t('logbook.showArchived')}</span>
        </label>
      </div>

      {!data?.length ? (
        <EmptyState message={t('logbook.none')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('logbook.skill')}</TableHead>
              <TableHead>{t('logbook.course')}</TableHead>
              <TableHead>{t('logbook.department')}</TableHead>
              <TableHead>{t('logbook.proficiency')}</TableHead>
              <TableHead>{t('logbook.minCount')}</TableHead>
              {canManage && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(item => (
              <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                <TableCell>
                  {locale === 'ar' ? item.name_ar || '—' : item.name_en || item.name_ar || '—'}
                  <span className="block text-xs text-slate-500">{item.skill_code || ''}</span>
                </TableCell>
                <TableCell>{item.course?.code || '—'}</TableCell>
                <TableCell>{locale === 'ar' ? item.department?.name_ar || '—' : item.department?.name_en || item.department?.name_ar || '—'}</TableCell>
                <TableCell>{item.required_proficiency || '—'}</TableCell>
                <TableCell>{item.minimum_count ?? '—'}</TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => handleOpenEdit(item)}>{t('logbook.edit')}</Button>
                      {!item.archived_at && (
                        <Button variant="outline" onClick={() => handleArchive(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('logbook.archive')}</Button>
                      )}
                      {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('logbook.archived')}</span>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? t('logbook.edit') : t('logbook.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('logbook.code')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.skill_code || ''} onChange={e => setFormData({...formData, skill_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.nameAr')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.name_ar || ''} onChange={e => setFormData({...formData, name_ar: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.nameEn')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.name_en || ''} onChange={e => setFormData({...formData, name_en: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.course')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.course_id || ''} onChange={e => setFormData({...formData, course_id: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.department')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.department_id || ''} onChange={e => setFormData({...formData, department_id: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.proficiency')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.required_proficiency || ''} onChange={e => setFormData({...formData, required_proficiency: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.minCount')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.minimum_count || ''} onChange={e => setFormData({...formData, minimum_count: Number(e.target.value)})} />
          </div>
          <div>
            <label className="flex items-center space-x-2">
              <input type="checkbox" checked={!!formData.requires_supervisor_signature} onChange={e => setFormData({...formData, requires_supervisor_signature: e.target.checked})} />
              <span>{t('logbook.signature')}</span>
            </label>
          </div>
          <div>
            <label className="block text-sm mb-1">{t('logbook.notes')}</label>
            <textarea className="border p-2 w-full rounded" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
