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

export function EvaluationFormsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('assessment.create');
  
  const [successMsg, setSuccessMsg] = useState('');
  
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<any>(null);
  const [versionFormData, setVersionFormData] = useState<any>({});

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemFormData, setItemFormData] = useState<any>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['evaluation-form-reference'],
    queryFn: () => apiFetch<any>('/evaluation-form-reference')
  });

  const createVersionMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/evaluation-form-versions', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-form-reference'] });
      setSuccessMsg(t('evaluationForms.success'));
      setIsVersionModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateVersionMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/evaluation-form-versions/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-form-reference'] });
      setSuccessMsg(t('evaluationForms.success'));
      setIsVersionModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveVersionMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/evaluation-form-versions/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-form-reference'] });
      setSuccessMsg(t('evaluationForms.archiveSuccess'));
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const createItemMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/evaluation-form-items', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-form-reference'] });
      setSuccessMsg(t('evaluationForms.success'));
      setIsItemModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/evaluation-form-items/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-form-reference'] });
      setSuccessMsg(t('evaluationForms.success'));
      setIsItemModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveItemMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/evaluation-form-items/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluation-form-reference'] });
      setSuccessMsg(t('evaluationForms.archiveSuccess'));
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const handleOpenAddVersion = () => {
    setEditingVersion(null);
    setVersionFormData({});
    setIsVersionModalOpen(true);
  };

  const handleOpenEditVersion = (item: any) => {
    setEditingVersion(item);
    setVersionFormData(item);
    setIsVersionModalOpen(true);
  };

  const handleArchiveVersion = (id: number) => {
    if (window.confirm(t('evaluationForms.archiveConfirm'))) {
      archiveVersionMutation.mutate(id);
    }
  };

  const handleVersionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVersion) updateVersionMutation.mutate({ id: editingVersion.id, body: versionFormData });
    else createVersionMutation.mutate(versionFormData);
  };

  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemFormData({});
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (item: any) => {
    setEditingItem(item);
    setItemFormData(item);
    setIsItemModalOpen(true);
  };

  const handleArchiveItem = (id: number) => {
    if (window.confirm(t('evaluationForms.archiveConfirm'))) {
      archiveItemMutation.mutate(id);
    }
  };

  const handleItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) updateItemMutation.mutate({ id: editingItem.id, body: itemFormData });
    else createItemMutation.mutate(itemFormData);
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const forms = data?.forms || [];
  const items = data?.items || [];

  return (
    <div className="space-y-8">
      <PageHeader 
        title={t('evaluationForms.title')}
        description={t('evaluationForms.description')}
      />
      
      {successMsg && <div className="bg-green-50 text-green-700 p-3 rounded">{successMsg}</div>}

      <div className="space-y-4">
        <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-xl font-bold">{t('evaluationForms.versionsTitle')}</h2>
            {canManage && <Button onClick={handleOpenAddVersion}>{t('evaluationForms.addVersion')}</Button>}
        </div>
        
        {!forms.length ? (
          <EmptyState message={t('evaluationForms.none')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('evaluationForms.code')}</TableHead>
                <TableHead>{t('evaluationForms.name')}</TableHead>
                <TableHead>{t('evaluationForms.evaluatorType')} &rarr; {t('evaluationForms.evaluatee')}</TableHead>
                <TableHead>{t('evaluationForms.effectiveFrom')}</TableHead>
                <TableHead>{t('evaluationForms.totalScore')}</TableHead>
                {canManage && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((item: any) => (
                <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                  <TableCell>{item.form_code || '—'} v{item.version || ''}</TableCell>
                  <TableCell>{item.name || '—'}</TableCell>
                  <TableCell>{item.evaluator_type || '—'} &rarr; {item.evaluatee_type || '—'}</TableCell>
                  <TableCell>{item.effective_from || '—'}</TableCell>
                  <TableCell>{item.total_score ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => handleOpenEditVersion(item)}>{t('evaluationForms.edit')}</Button>
                        {!item.archived_at && (
                          <Button variant="outline" onClick={() => handleArchiveVersion(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('evaluationForms.archive')}</Button>
                        )}
                        {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('evaluationForms.archived')}</span>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="space-y-4 pt-8">
        <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-xl font-bold">{t('evaluationForms.itemsTitle')}</h2>
            {canManage && <Button onClick={handleOpenAddItem}>{t('evaluationForms.addItem')}</Button>}
        </div>

        {!items.length ? (
          <EmptyState message={t('evaluationForms.none')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('evaluationForms.code')}</TableHead>
                <TableHead>{t('evaluationForms.text')}</TableHead>
                <TableHead>{t('evaluationForms.domain')}</TableHead>
                <TableHead>{t('evaluationForms.weight')}</TableHead>
                {canManage && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: any) => (
                <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                  <TableCell>{item.item_code || '—'}</TableCell>
                  <TableCell>{item.item_text || '—'}</TableCell>
                  <TableCell>{item.domain || '—'}</TableCell>
                  <TableCell>{item.weight ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => handleOpenEditItem(item)}>{t('evaluationForms.edit')}</Button>
                        {!item.archived_at && (
                          <Button variant="outline" onClick={() => handleArchiveItem(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('evaluationForms.archive')}</Button>
                        )}
                        {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('evaluationForms.archived')}</span>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Modal isOpen={isVersionModalOpen} onClose={() => setIsVersionModalOpen(false)} title={editingVersion ? t('evaluationForms.edit') : t('evaluationForms.addVersion')}>
        <form onSubmit={handleVersionSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.code')}</label>
            <input type="text" className="border p-2 w-full rounded" value={versionFormData.form_code || ''} onChange={e => setVersionFormData({...versionFormData, form_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.name')}</label>
            <input type="text" className="border p-2 w-full rounded" value={versionFormData.name || ''} onChange={e => setVersionFormData({...versionFormData, name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.version')}</label>
            <input type="number" className="border p-2 w-full rounded" value={versionFormData.version || ''} onChange={e => setVersionFormData({...versionFormData, version: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.evaluatorType')}</label>
            <input type="text" className="border p-2 w-full rounded" value={versionFormData.evaluator_type || ''} onChange={e => setVersionFormData({...versionFormData, evaluator_type: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.evaluatee')}</label>
            <input type="text" className="border p-2 w-full rounded" value={versionFormData.evaluatee_type || ''} onChange={e => setVersionFormData({...versionFormData, evaluatee_type: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.effectiveFrom')}</label>
            <input type="date" className="border p-2 w-full rounded" value={versionFormData.effective_from || ''} onChange={e => setVersionFormData({...versionFormData, effective_from: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.totalScore')}</label>
            <input type="number" className="border p-2 w-full rounded" value={versionFormData.total_score || ''} onChange={e => setVersionFormData({...versionFormData, total_score: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.status')}</label>
            <input type="text" className="border p-2 w-full rounded" value={versionFormData.status || ''} onChange={e => setVersionFormData({...versionFormData, status: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.notes')}</label>
            <textarea className="border p-2 w-full rounded" value={versionFormData.notes || ''} onChange={e => setVersionFormData({...versionFormData, notes: e.target.value})} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setIsVersionModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createVersionMutation.isPending || updateVersionMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} title={editingItem ? t('evaluationForms.edit') : t('evaluationForms.addItem')}>
        <form onSubmit={handleItemSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.code')}</label>
            <input type="text" className="border p-2 w-full rounded" value={itemFormData.item_code || ''} onChange={e => setItemFormData({...itemFormData, item_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.text')}</label>
            <input type="text" className="border p-2 w-full rounded" value={itemFormData.item_text || ''} onChange={e => setItemFormData({...itemFormData, item_text: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.domain')}</label>
            <input type="text" className="border p-2 w-full rounded" value={itemFormData.domain || ''} onChange={e => setItemFormData({...itemFormData, domain: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.ratingScale')}</label>
            <input type="text" className="border p-2 w-full rounded" value={itemFormData.rating_scale || ''} onChange={e => setItemFormData({...itemFormData, rating_scale: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.weight')}</label>
            <input type="number" className="border p-2 w-full rounded" value={itemFormData.weight || ''} onChange={e => setItemFormData({...itemFormData, weight: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.plo')}</label>
            <input type="text" className="border p-2 w-full rounded" value={itemFormData.program_outcome_code || ''} onChange={e => setItemFormData({...itemFormData, program_outcome_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('evaluationForms.notes')}</label>
            <textarea className="border p-2 w-full rounded" value={itemFormData.notes || ''} onChange={e => setItemFormData({...itemFormData, notes: e.target.value})} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setIsItemModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createItemMutation.isPending || updateItemMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
