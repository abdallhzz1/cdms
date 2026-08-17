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

export function SupervisorWorkloadsPage() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('people.manage');
  
  const [showArchived, setShowArchived] = useState(false);
  const [academicYear, setAcademicYear] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['supervisor-annual-workloads', showArchived, academicYear],
    queryFn: () => apiFetch<any[]>(`/supervisor-annual-workloads?show_archived=${showArchived ? 1 : 0}&academic_year=${academicYear}`)
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/supervisor-annual-workloads', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-annual-workloads'] });
      setSuccessMsg(t('workloads.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/supervisor-annual-workloads/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-annual-workloads'] });
      setSuccessMsg(t('workloads.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/supervisor-annual-workloads/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-annual-workloads'] });
      setSuccessMsg(t('workloads.archiveSuccess'));
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
    if (window.confirm(t('workloads.archiveConfirm'))) {
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

  return (
    <div className="space-y-5">
      <PageHeader 
        title={t('workloads.title')}
        description={t('workloads.description')}
      >
        {canManage && <Button onClick={handleOpenAdd}>{t('workloads.add')}</Button>}
      </PageHeader>
      
      {successMsg && <div className="bg-green-50 text-green-700 p-3 rounded">{successMsg}</div>}

      <div className="flex justify-between items-center mb-4 gap-4">
        <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">{t('workloads.filterYear')}</label>
            <input type="text" className="border p-2 rounded" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="e.g. 2023/2024" />
        </div>
        <label className="flex items-center space-x-2 text-sm cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-slate-300" />
          <span>{t('workloads.showArchived')}</span>
        </label>
      </div>

      {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : !data?.length ? (
        <EmptyState message={t('workloads.none')} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('workloads.supervisor')}</TableHead>
              <TableHead>{t('workloads.department')}</TableHead>
              <TableHead>{t('workloads.year')}</TableHead>
              <TableHead>{t('workloads.level')}</TableHead>
              <TableHead>{t('workloads.weeks')}</TableHead>
              {canManage && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(item => (
              <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                <TableCell>
                  {item.supervisor_name || '—'}
                  <span className="block text-xs text-slate-500">{item.supervisor_code || ''}</span>
                </TableCell>
                <TableCell>{locale === 'ar' ? item.department?.name_ar || '—' : item.department?.name_en || item.department?.name_ar || '—'}</TableCell>
                <TableCell>{item.academic_year || '—'}</TableCell>
                <TableCell>{t(`workloads.level_${item.academic_level}`) || item.academic_level}</TableCell>
                <TableCell>{item.supervision_weeks ?? '—'}</TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => handleOpenEdit(item)}>{t('workloads.edit')}</Button>
                      {!item.archived_at && (
                        <Button variant="outline" onClick={() => handleArchive(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('workloads.archive')}</Button>
                      )}
                      {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('workloads.archived')}</span>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? t('workloads.edit') : t('workloads.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('workloads.supervisor')}</label>
            <input type="text" required className="border p-2 w-full rounded" value={formData.supervisor_name || ''} onChange={e => setFormData({...formData, supervisor_name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('workloads.code')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.supervisor_code || ''} onChange={e => setFormData({...formData, supervisor_code: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('workloads.year')}</label>
            <input type="text" required className="border p-2 w-full rounded" value={formData.academic_year || ''} onChange={e => setFormData({...formData, academic_year: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('workloads.level')}</label>
            <select className="border p-2 w-full rounded" value={formData.academic_level || ''} onChange={e => setFormData({...formData, academic_level: e.target.value})}>
                <option value="">--</option>
                <option value="fourth">{t('workloads.level_fourth')}</option>
                <option value="fifth">{t('workloads.level_fifth')}</option>
                <option value="sixth">{t('workloads.level_sixth')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">{t('workloads.department')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.department_id || ''} onChange={e => setFormData({...formData, department_id: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('workloads.weeks')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.supervision_weeks || ''} onChange={e => setFormData({...formData, supervision_weeks: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('workloads.notes')}</label>
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
