import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useI18n } from '@/i18n/I18nContext';
import {
  getMySupervisorAssignments
} from '../api/distribution';
import type {
  SupervisorAssignment,
  MySupervisorAssignmentsResponse
} from '../api/distribution';


// ============================================================================
// SupervisorPortal — Phase 5C
// Authenticated user's supervisor portal view.
// Shows all students assigned to the current user in the current published
// clinical distribution.
// ============================================================================

export function SupervisorPortal() {
  const { t } = useI18n();
  const [response, setResponse] = useState<MySupervisorAssignmentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMySupervisorAssignments()
      .then((data) => setResponse(data))
      .catch(() => setError(t('supervisorPortal.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('supervisorPortal.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('supervisorPortal.description')}
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300"
          aria-label={t('supervisorPortal.current')}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {t('supervisorPortal.current')}
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      {loading && (
        <div
          className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <svg className="h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm font-medium">{t('supervisorPortal.loading')}</span>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && response && !response.meta?.is_supervisor && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
          <svg className="mx-auto mb-3 h-10 w-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm font-semibold text-amber-800">{t('supervisorPortal.noProfile')}</p>
          <p className="mt-1 text-sm text-amber-700">
            {t('supervisorPortal.noProfileHint')}
          </p>
        </div>
      )}

      {!loading && !error && response && response.meta?.is_supervisor && (
        <>
          {/* ── Supervisor Info Card ── */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {response.meta?.full_name_en || response.meta?.full_name_ar || 'Supervisor'}
              </p>
              {response.meta?.full_name_ar && (
                <p className="text-xs text-slate-500 mt-0.5" dir="rtl">{response.meta?.full_name_ar}</p>
              )}
            </div>
            <div className="ms-auto">
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                {t('supervisorPortal.assignedCount').replace('{count}', String(response.meta?.total ?? 0))}
              </span>
            </div>
          </div>

          {/* ── Empty State ── */}
          {response.data.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-sm font-semibold text-slate-600">{t('supervisorPortal.none')}</p>
              <p className="mt-1 text-xs text-slate-400">
                {t('supervisorPortal.noneHint')}
              </p>
            </div>
          )}

          {/* ── Assignments Table ── */}
          {response.data.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 border-b border-slate-200">
                      <TableHead>{t('workflow.assignments.student')}</TableHead>
                      <TableHead>{t('directory.universityNumber')}</TableHead>
                      <TableHead>{t('workflow.assignments.block')}</TableHead>
                      <TableHead>{t('workflow.assignments.block')}</TableHead>
                      <TableHead>{t('workflow.assignments.site')}</TableHead>
                      <TableHead>{t('directory.department')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {response.data.map((assignment) => (
                      <SupervisorAssignmentRow key={assignment.id} assignment={assignment} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Row Component ────────────────────────────────────────────────────────────

function SupervisorAssignmentRow({ assignment }: { assignment: SupervisorAssignment }) {
  const studentName = assignment.student?.full_name_en || assignment.student?.full_name_ar || '—';
  const univNo = assignment.student?.university_number ?? '—';
  const rotationName = assignment.rotation_block?.rotation?.name ?? '—';
  const blockCode = assignment.rotation_block?.block_code ?? '—';
  const siteName = assignment.training_site
    ? (assignment.training_site.name_en || assignment.training_site.name_ar)
    : '—';
  const deptName = assignment.department
    ? (assignment.department.name_en || assignment.department.name_ar)
    : '—';

  return (
    <TableRow className="hover:bg-slate-50 transition-colors">
      <TableCell>
        {studentName}
        {assignment.student?.full_name_ar && (
          <div className="text-xs text-slate-400 mt-0.5" dir="rtl">
            {assignment.student.full_name_ar}
          </div>
        )}
      </TableCell>
      <TableCell>{univNo}</TableCell>
      <TableCell>{rotationName}</TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
          {blockCode}
        </span>
      </TableCell>
      <TableCell>{siteName}</TableCell>
      <TableCell>{deptName}</TableCell>
    </TableRow>
  );
}
