import type { PaginatedResponse } from '@/api/distribution';
import type { DistributionVersionDetail } from '@/api/distribution';

import { useState, useEffect } from 'react';
import {
  getAssignments,
  deleteAssignment
} from '@/api/distribution';
import type {
  StudentClinicalAssignmentItem
} from '@/api/distribution';

import { AssignmentModal } from './AssignmentModal';
import { useI18n } from '@/i18n/I18nContext';

interface AssignmentsTabProps {
  version: DistributionVersionDetail;
  onRefresh: () => void;
}

export function AssignmentsTab({ version, onRefresh }: AssignmentsTabProps) {
  const { t } = useI18n();
  const [data, setData] = useState<PaginatedResponse<StudentClinicalAssignmentItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<StudentClinicalAssignmentItem | null>(null);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAssignments(version.id, {
        page,
        search: search || undefined,
        block_id: blockFilter ? Number(blockFilter) : undefined,
      });
      setData(res);
    } catch (err: any) {
      setError(t('state.error.message'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [version.id, page, search, blockFilter]);

  const handleDelete = async (assignment: StudentClinicalAssignmentItem) => {
    const studentName = assignment.student?.full_name ?? (`${assignment.student?.first_name ?? ''} ${assignment.student?.last_name ?? ''}`.trim() || t('workflow.assignments.student'));
    if (!confirm(t('workflow.assignments.deleteConfirmation').replace('{student}', studentName))) {
      return;
    }
    try {
      await deleteAssignment(version.id, assignment.id);
      fetchAssignments();
      onRefresh();
    } catch (err: any) {
      alert(t('state.error.message'));
    }
  };

  const isEditable = version.status !== 'published';

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder={t('workflow.assignments.search')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
          />

          <select
            value={blockFilter}
            onChange={(e) => {
              setBlockFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-xs focus:border-indigo-500 focus:outline-hidden"
          >
            <option value="">{t('workflow.assignments.allBlocks')}</option>
            {version.rotation?.blocks?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {isEditable && (
          <button
            onClick={() => {
              setSelectedAssignment(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
          >
            + {t('workflow.assignment.add')}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-xs font-medium text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{t('workflow.assignments.loading')}</div>
      ) : !data || data.data.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          {t('workflow.assignments.empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-start text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.assignments.student')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.assignments.subgroup')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.assignments.block')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.assignments.site')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.assignments.supervisor')}</th>
                  {isEditable && (
                    <th scope="col" className="px-4 py-3 text-end font-semibold">{t('common.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {data.data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {item.student?.full_name ?? (`${item.student?.first_name ?? ''} ${item.student?.last_name ?? ''}`.trim() || '—')}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.student?.student_number || '—'}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {item.student_subgroup?.name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {item.rotation_block?.name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {item.training_site?.name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {item.supervisor
                        ? `${item.supervisor.first_name} ${item.supervisor.last_name}`
                        : <span className="text-slate-400 italic">{t('workflow.assignments.noSupervisor')}</span>}
                    </td>
                    {isEditable && (
                      <td className="whitespace-nowrap px-4 py-3 text-end">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedAssignment(item);
                              setModalOpen(true);
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-900"
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="text-xs font-semibold text-red-600 hover:text-red-900"
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <div className="text-xs text-slate-500">
                {t('workflow.assignments.pageSummary').replace('{current}', String(data.current_page)).replace('{last}', String(data.last_page)).replace('{total}', String(data.total))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
                >
                  {t('common.previous')}
                </button>
                <button
                  disabled={page >= data.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <AssignmentModal
          version={version}
          assignment={selectedAssignment}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            fetchAssignments();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

