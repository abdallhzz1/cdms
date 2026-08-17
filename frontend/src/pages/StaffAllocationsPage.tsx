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

export function StaffAllocationsPage() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canManage = can('people.manage');
  
  const [academicYear, setAcademicYear] = useState('');
  const [weekNumber, setWeekNumber] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  const [successMsg, setSuccessMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const queryParams = new URLSearchParams();
  if (academicYear) queryParams.set('academic_year', academicYear);
  if (weekNumber) queryParams.set('week_number', weekNumber);
  if (departmentId) queryParams.set('department_id', departmentId);
  if (showArchived) queryParams.set('show_archived', '1');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['staff-allocations', academicYear, weekNumber, departmentId, showArchived],
    queryFn: () => apiFetch<any>(`/staff-allocations?${queryParams.toString()}`)
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/weekly-supervisor-allocations', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-allocations'] });
      setSuccessMsg(t('staffAllocations.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number, body: any }) => apiFetch(`/weekly-supervisor-allocations/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-allocations'] });
      setSuccessMsg(t('staffAllocations.success'));
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 3000);
    }
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/weekly-supervisor-allocations/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-allocations'] });
      setSuccessMsg(t('staffAllocations.archiveSuccess'));
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
    if (window.confirm(t('staffAllocations.archiveConfirm'))) {
      archiveMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) updateMutation.mutate({ id: editingItem.id, body: formData });
    else createMutation.mutate(formData);
  };

  return (
    <div className="space-y-5">
      <PageHeader 
        title={t('staffAllocations.title')}
        description={t('staffAllocations.description')}
      >
        {canManage && <Button onClick={handleOpenAdd}>{t('staffAllocations.add')}</Button>}
      </PageHeader>
      
      {successMsg && <div className="bg-green-50 text-green-700 p-3 rounded">{successMsg}</div>}

      <div className="flex flex-wrap gap-4 items-center mb-4">
        <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">{t('staffAllocations.filterYear')}</label>
            <input type="text" className="border p-2 rounded w-32" value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">{t('staffAllocations.filterWeek')}</label>
            <input type="number" className="border p-2 rounded w-20" value={weekNumber} onChange={e => setWeekNumber(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">{t('staffAllocations.filterDepartment')}</label>
            <input type="number" className="border p-2 rounded w-24" value={departmentId} onChange={e => setDepartmentId(e.target.value)} />
        </div>
        <label className="flex items-center space-x-2 text-sm cursor-pointer ml-auto">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded border-slate-300" />
          <span>{t('staffAllocations.showArchived')}</span>
        </label>
      </div>

      {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => refetch()} /> : (
        <>
            <h2 className="text-xl font-bold border-b pb-2">{t('staffAllocations.weeklyTitle')}</h2>
            {!data?.weekly?.length ? (
                <EmptyState message={t('staffAllocations.none')} />
            ) : (
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>{t('staffAllocations.year')} / {t('staffAllocations.filterWeek')}</TableHead>
                    <TableHead>{t('staffAllocations.supervisor')}</TableHead>
                    <TableHead>{t('staffAllocations.department')}</TableHead>
                    <TableHead>{t('staffAllocations.subgroup')}</TableHead>
                    <TableHead>{t('staffAllocations.students')}</TableHead>
                    {canManage && <TableHead></TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.weekly.map((item: any) => (
                    <TableRow key={item.id} className={item.archived_at ? 'opacity-50' : ''}>
                        <TableCell>{item.academic_year || '—'} - W{item.week_number || ''}</TableCell>
                        <TableCell>{item.supervisor_name || '—'}</TableCell>
                        <TableCell>{locale === 'ar' ? item.department?.name_ar || '—' : item.department?.name_en || item.department?.name_ar || '—'}</TableCell>
                        <TableCell>{item.subgroup || '—'}</TableCell>
                        <TableCell>{item.student_count ?? '—'}</TableCell>
                        {canManage && (
                        <TableCell>
                            <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => handleOpenEdit(item)}>{t('staffAllocations.edit')}</Button>
                            {!item.archived_at && (
                                <Button variant="outline" onClick={() => handleArchive(item.id)} className="text-red-600 border-red-200 hover:bg-red-50">{t('staffAllocations.archive')}</Button>
                            )}
                            {item.archived_at && <span className="text-xs text-slate-400 self-center">{t('staffAllocations.archived')}</span>}
                            </div>
                        </TableCell>
                        )}
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            )}

            {data?.history?.length > 0 && (
                <div className="mt-8 space-y-4">
                    <h2 className="text-xl font-bold border-b pb-2">{t('staffAllocations.historyTitle')}</h2>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('staffAllocations.supervisor')}</TableHead>
                                <TableHead>{t('staffAllocations.details')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.history.map((h: any, idx: number) => (
                                <TableRow key={idx}>
                                    <TableCell>{h.supervisor_name}</TableCell>
                                    <TableCell>{h.details}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? t('staffAllocations.edit') : t('staffAllocations.add')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.year')}</label>
            <input type="text" required className="border p-2 w-full rounded" value={formData.academic_year || ''} onChange={e => setFormData({...formData, academic_year: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.filterWeek')}</label>
            <input type="number" required className="border p-2 w-full rounded" value={formData.week_number || ''} onChange={e => setFormData({...formData, week_number: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.supervisor')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.supervisor_name || ''} onChange={e => setFormData({...formData, supervisor_name: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.department')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.department_id || ''} onChange={e => setFormData({...formData, department_id: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.subgroup')}</label>
            <input type="text" className="border p-2 w-full rounded" value={formData.subgroup || ''} onChange={e => setFormData({...formData, subgroup: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.students')}</label>
            <input type="number" className="border p-2 w-full rounded" value={formData.student_count || ''} onChange={e => setFormData({...formData, student_count: Number(e.target.value)})} />
          </div>
          <div>
            <label className="block text-sm mb-1">{t('staffAllocations.notes')}</label>
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
