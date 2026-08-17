import type { DistributionVersionDetail } from '@/api/distribution';
import { useState, useEffect } from 'react';
import { getUnassignedStudents,  } from '@/api/distribution';
import { AssignmentModal } from './AssignmentModal';
import { useI18n } from '@/i18n/I18nContext';

interface UnassignedTabProps {
  version: DistributionVersionDetail;
  onRefresh: () => void;
}

export function UnassignedTab({ version, onRefresh }: UnassignedTabProps) {
  const { t } = useI18n();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStudent, setSelectedStudent] = useState<{ id: number; name: string } | null>(null);

  const fetchUnassigned = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getUnassignedStudents(version.id);
      setStudents(res);
    } catch (err: any) {
      setError(t('state.error.message'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnassigned();
  }, [version.id]);

  const isEditable = version.status !== 'published';

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-xs font-medium text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">{t('workflow.unassigned.loading')}</div>
      ) : students.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <div className="text-emerald-700 font-semibold text-sm">{t('workflow.unassigned.completeTitle')}</div>
          <p className="text-xs text-emerald-600 mt-1">
            {t('workflow.unassigned.completeDescription')}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <div className="text-xs font-semibold text-amber-800">
              {t('workflow.unassigned.requiresPlacement').replace('{count}', String(students.length))}
            </div>
            <div className="text-xs text-amber-700">
              {t('workflow.unassigned.approvalWarning')}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-start text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.unassigned.name')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.unassigned.number')}</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{t('workflow.unassigned.subgroup')}</th>
                  {isEditable && (
                    <th scope="col" className="px-4 py-3 text-end font-semibold">{t('common.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {students.map((student) => {
                  const subgroup = student.group_assignments?.[0]?.subgroup?.name || t('workflow.unassigned.unavailable');
                  const name = student.full_name ?? (`${student.first_name || ''} ${student.last_name || ''}`.trim() || t('workflow.unassigned.unavailable'));

                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 text-xs">
                        {student.student_number || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 text-xs">
                        {subgroup}
                      </td>
                      {isEditable && (
                        <td className="whitespace-nowrap px-4 py-3 text-end">
                          <button
                            onClick={() => setSelectedStudent({ id: student.id, name })}
                            className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100"
                          >
                            {t('workflow.unassigned.assign')}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedStudent && (
        <AssignmentModal
          version={version}
          presetStudentId={selectedStudent.id}
          presetStudentName={selectedStudent.name}
          onClose={() => setSelectedStudent(null)}
          onSuccess={() => {
            setSelectedStudent(null);
            fetchUnassigned();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

