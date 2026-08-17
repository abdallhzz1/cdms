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

export function ExternalElectivesPage() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('courses.manage');
  
  const [showArchived, setShowArchived] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['external-electives', showArchived],
    queryFn: () => apiFetch<any[]>(`/external-electives?show_archived=${showArchived ? 1 : 0}`)
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/external-electives', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-electives'] });
      setSuccessMsg(t('electives.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/external-electives/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-electives'] });
      setSuccessMsg(t('electives.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/external-electives/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-electives'] });
      setSuccessMsg(t('electives.archiveSuccess'));
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
    if (window.confirm(t('electives.archiveConfirm'))) {
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
        title={t('electives.title')}
        description={t('electives.description')}
      >
        {canManage && <Button onClick={handleOpenAdd}>{t('electives.add')}</Button>}
      </PageHeader>
      
      {successMsg && <div className="bg-green-50 text-green-700 p-3 rounded">{successMsg}</div>}

      <div className="flex justify-end mb-4">
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-slate-300" />
          <span>{t('electives.showArchived')}</span>
        </label>
      </div>

      {!data?.length ? (
        <EmptyState message={t('electives.none')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('electives.student')}</TableHead>
              <TableHead>{t('electives.course')}</TableHead>
              <TableHead>{t('electives.organization')}</TableHead>
              <TableHead>{t('electives.period')}</TableHead>
              <TableHead>{t('electives.approval')}</TableHead>
              <TableHead>{t('electives.score')}</TableHead>
              {canManage && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(item => (
              <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                <TableCell>{locale === 'ar' ? item.student?.full_name_ar || '—' : item.student?.full_name_en || item.student?.full_name_ar || '—'}</TableCell>
                <TableCell>{item.course?.code || '—'}</TableCell>
                <TableCell>
                  {item.organization || '—'}
                  <span className="block text-xs text-slate-500">{item.country || ''}</span>
                </TableCell>
                <TableCell>{item.start_date || '—'} — {item.end_date || '—'}</TableCell>
                <TableCell>{item.approval_status || '—'}</TableCell>
                <TableCell>
                  {item.score ?? '—'}
                  <span className="block text-xs text-slate-500">{item.external_evaluation || ''}</span>
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => handleOpenEdit(item)}>{t('electives.edit')}</Button>
                      {!item.archived_at && (
                        <Button variant="outline" onClick={() => handleArchive(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('electives.archive')}</Button>
                      )}
                      {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('electives.archived')}</span>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? t('electives.edit') : t('electives.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingItem && (
            <>
              <div>
                <label className="block text-sm mb-1">{t('electives.student')}</label>
                <input type="number" required className="border p-2 w-full rounded" value={formData.student_id || ''} onChange={e => setFormData({...formData, student_id: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.course')}</label>
                <input type="number" className="border p-2 w-full rounded" value={formData.course_id || ''} onChange={e => setFormData({...formData, course_id: Number(e.target.value)})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.year')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.academic_year || ''} onChange={e => setFormData({...formData, academic_year: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.organization')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.organization || ''} onChange={e => setFormData({...formData, organization: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.country')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.country || ''} onChange={e => setFormData({...formData, country: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.specialty')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.specialty || ''} onChange={e => setFormData({...formData, specialty: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.startDate')}</label>
                <input type="date" className="border p-2 w-full rounded" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.endDate')}</label>
                <input type="date" className="border p-2 w-full rounded" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.supervisor')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.external_supervisor || ''} onChange={e => setFormData({...formData, external_supervisor: e.target.value})} />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm mb-1">{t('electives.approval')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.approval_status || ''} onChange={e => setFormData({...formData, approval_status: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('electives.externalEvaluation')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.external_evaluation || ''} onChange={e => setFormData({...formData, external_evaluation: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('electives.score')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.score || ''} onChange={e => setFormData({...formData, score: Number(e.target.value)})} />
          </div>
          {editingItem && (
            <>
              <div>
                <label className="block text-sm mb-1">{t('electives.recognition')}</label>
                <input type="text" className="border p-2 w-full rounded" value={formData.recognition_status || ''} onChange={e => setFormData({...formData, recognition_status: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('electives.notes')}</label>
                <textarea className="border p-2 w-full rounded" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
