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

export function ResearchProjectsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('courses.manage');
  
  const [showArchived, setShowArchived] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['research-projects', showArchived],
    queryFn: () => apiFetch<any[]>(`/research-projects?show_archived=${showArchived ? 1 : 0}`)
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/research-projects', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-projects'] });
      setSuccessMsg(t('research.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/research-projects/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-projects'] });
      setSuccessMsg(t('research.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/research-projects/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['research-projects'] });
      setSuccessMsg(t('research.archiveSuccess'));
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: any) => {
    setEditingItem(item);
    setFormData(item);
    setIsModalOpen(true);
  };

  const handleArchive = (id: number) => {
    if (window.confirm(t('research.archiveConfirm'))) {
      archiveMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) updateMutation.mutate({ id: editingItem.id, body: formData });
    else createMutation.mutate(formData);
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <PageHeader 
        title={t('research.title')}
        description={t('research.description')}
      >
        {canManage && <Button onClick={handleOpenAdd}>{t('research.add')}</Button>}
      </PageHeader>
      
      {successMsg && <div className="bg-green-50 text-green-700 p-3 rounded">{successMsg}</div>}

      <div className="flex justify-end mb-4">
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-slate-300" />
          <span>{t('research.showArchived')}</span>
        </label>
      </div>

      {!data?.length ? (
        <EmptyState message={t('research.none')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('research.projectTitle')}</TableHead>
              <TableHead>{t('research.year')}</TableHead>
              <TableHead>{t('research.supervisor')}</TableHead>
              <TableHead>{t('research.stage')}</TableHead>
              <TableHead>{t('research.approval')}</TableHead>
              {canManage && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(item => (
              <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                <TableCell>{item.title || '—'}</TableCell>
                <TableCell>{item.academic_year || '—'}</TableCell>
                <TableCell>{item.supervisor || '—'}</TableCell>
                <TableCell>{item.project_stage || '—'}</TableCell>
                <TableCell>{item.ethical_approval_status || '—'}</TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => handleOpenEdit(item)}>{t('research.edit')}</Button>
                      {!item.archived_at && (
                        <Button variant="outline" onClick={() => handleArchive(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('research.archive')}</Button>
                      )}
                      {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('research.archived')}</span>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? t('research.edit') : t('research.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('research.projectTitle')}</label>
            <input type="text" required className="border p-2 w-full rounded" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
          </div>
          {!editingItem && (
            <>
              <div>
                <label className="block text-sm mb-1">{t('research.year')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.academic_year || ''} onChange={e => setFormData({...formData, academic_year: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('research.supervisor')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.supervisor || ''} onChange={e => setFormData({...formData, supervisor: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('research.course')}</label>
                <input type="number" className="border p-2 w-full rounded" value={formData.course_id || ''} onChange={e => setFormData({...formData, course_id: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('research.department')}</label>
                <input type="number" className="border p-2 w-full rounded" value={formData.department_id || ''} onChange={e => setFormData({...formData, department_id: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('research.students')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.student_identifiers || ''} onChange={e => setFormData({...formData, student_identifiers: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('research.submission')}</label>
                <input type="date" className="border p-2 w-full rounded" value={formData.submission_date || ''} onChange={e => setFormData({...formData, submission_date: e.target.value})} />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm mb-1">{t('research.stage')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.project_stage || ''} onChange={e => setFormData({...formData, project_stage: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('research.approval')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.ethical_approval_status || ''} onChange={e => setFormData({...formData, ethical_approval_status: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('research.score')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.score || ''} onChange={e => setFormData({...formData, score: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('research.publication')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.publication_status || ''} onChange={e => setFormData({...formData, publication_status: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('research.notes')}</label>
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
