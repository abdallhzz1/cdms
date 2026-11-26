import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { clinicalPortalFetch } from '@/api/clinicalFeedback';
import { ApiError } from '@/api/client';
import { ClinicalStudentAssessmentsPage } from '@/pages/public/ClinicalStudentAssessmentsPage';
import { formatClinicalFeedback } from '@/i18n/clinicalFeedbackMessages';

const base = '/clinical-student-feedback';
type TestStudent = { id: number; university_number: string; full_name_ar: string; full_name_en: string | null };
type TestRun = Omit<TestStudent, 'id'> & { id: string; answers_count: number; is_active: boolean };
const button = 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-teal-900 disabled:opacity-40';

export function ClinicalFeedbackTesting() {
  const { can } = useAuth(); const { locale, t } = useI18n(); const client = useQueryClient();
  const [search, setSearch] = useState(''); const [debounced, setDebounced] = useState(''); const [page, setPage] = useState(1); const [open, setOpen] = useState<string | null>(null);
  const canTest = can('clinical_feedback.test'); const canDelete = can('clinical_feedback.delete_test');
  useEffect(() => { const timer = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const students = useQuery({ queryKey: ['clinical-feedback-test-students', debounced], queryFn: () => clinicalPortalFetch<TestStudent[]>(`${base}/test-students?search=${encodeURIComponent(debounced)}`), enabled: canTest && debounced.length >= 2, retry: false });
  const runs = useQuery({ queryKey: ['clinical-feedback-test-runs', page], queryFn: () => clinicalPortalFetch<{ runs: TestRun[]; current_page: number; last_page: number }>(`${base}/test-runs?page=${page}`) });
  const create = useMutation({ mutationFn: (id: number) => clinicalPortalFetch<{ id: string }>(`${base}/test-runs`, { method: 'POST', body: { student_id: id } }), onSuccess: result => { setOpen(result.id); setSearch(''); setPage(1); void client.invalidateQueries({ queryKey: ['clinical-feedback-test-runs'] }); } });
  const remove = useMutation({ mutationFn: (id: string) => clinicalPortalFetch(`${base}/test-runs/${id}`, { method: 'DELETE' }), onSuccess: async (_, id) => { setPage(1); client.removeQueries({ queryKey: ['clinical-student-test-marks', id] }); client.removeQueries({ queryKey: ['clinical-student-test-identity', id] }); await client.invalidateQueries({ queryKey: ['clinical-feedback-test-runs'] }); } });
  const close = () => { if (open) { client.removeQueries({ queryKey: ['clinical-student-test-marks', open] }); client.removeQueries({ queryKey: ['clinical-student-test-identity', open] }); } setOpen(null); void client.invalidateQueries({ queryKey: ['clinical-feedback-test-runs'] }); };
  const name = (s: Omit<TestStudent, 'id'>) => locale === 'ar' ? s.full_name_ar : s.full_name_en || s.full_name_ar;
  const error = (e: unknown) => e instanceof ApiError ? e.message : t('clinicalFeedback.could_not_complete');
  return <div className="space-y-4">
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950">{t('clinicalFeedback.test_notice')}</p>
    {canTest && <section className="rounded-2xl border border-slate-200 bg-white p-4"><label className="block text-sm font-bold">{t('clinicalFeedback.find_test_student')}<input className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-3 text-base" value={search} onChange={e => setSearch(e.target.value)} maxLength={100} autoComplete="off" /></label>
      {students.isFetching && <p role="status" className="mt-3 text-sm">{t('clinicalFeedback.loading')}</p>}
      {students.isError && <p role="alert" className="mt-3 text-sm text-red-700">{error(students.error)}</p>}
      {debounced.length >= 2 && students.data && <div className="mt-3 space-y-2">{!students.data.length && <p className="text-sm text-slate-500">{t('clinicalFeedback.no_test_students')}</p>}{students.data.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0 text-sm"><p className="font-bold">{name(s)}</p><p className="text-xs text-slate-500" dir="ltr">{s.university_number}</p></div><button type="button" className={button} disabled={create.isPending} onClick={() => create.mutate(s.id)}>{t('clinicalFeedback.start_test')}</button></div>)}</div>}
    </section>}
    {(create.isError || remove.isError) && <p role="alert" className="text-sm text-red-700">{error(create.error ?? remove.error)}</p>}
    <section aria-label={t('clinicalFeedback.my_tests')} className="space-y-3"><h2 className="text-sm font-black">{t('clinicalFeedback.my_tests')}</h2>{runs.isLoading ? <p role="status">{t('clinicalFeedback.loading')}</p> : runs.isError ? <p role="alert" className="text-sm text-red-700">{error(runs.error)}</p> : !runs.data?.runs.length ? <p className="text-sm text-slate-500">{t('clinicalFeedback.no_tests')}</p> : runs.data.runs.map(r => <article key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="min-w-0"><h3 className="text-sm font-bold">{name(r)}</h3><p className="mt-1 text-xs text-slate-500"><bdi dir="ltr">{r.university_number}</bdi> · {formatClinicalFeedback(t, 'test_answer_count', { count: r.answers_count })}{!r.is_active && ` · ${t('clinicalFeedback.test_expired')}`}</p></div><div className="flex gap-2">{canTest && <button type="button" className={button} disabled={!r.is_active} onClick={() => setOpen(r.id)}>{t('clinicalFeedback.open_test')}</button>}{canDelete && <button type="button" className={`${button} text-red-700`} disabled={remove.isPending} onClick={() => remove.mutate(r.id)}>{t('clinicalFeedback.delete_test')}</button>}</div></article>)}
      {runs.data && runs.data.last_page > 1 && <div className="flex items-center justify-between gap-3"><button type="button" className={button} disabled={page <= 1 || runs.isFetching} onClick={() => setPage(p => p - 1)}>{t('clinicalFeedback.previous')}</button><span>{page}</span><button type="button" className={button} disabled={page >= runs.data.last_page || runs.isFetching} onClick={() => setPage(p => p + 1)}>{t('clinicalFeedback.next')}</button></div>}
    </section>
    {open && canTest && <TestDialog id={open} canDelete={canDelete} onClose={close} />}
  </div>;
}

function TestDialog({ id, canDelete, onClose }: { id: string; canDelete: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const { t } = useI18n();
  useEffect(() => { const dialog = ref.current!; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.showModal(); return () => { dialog.close(); document.body.style.overflow = overflow; }; }, []);
  return <dialog ref={ref} aria-label={t('clinicalFeedback.test_portal')} onCancel={e => { e.preventDefault(); onClose(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-slate-50 p-0 backdrop:bg-slate-900/40"><button type="button" onClick={onClose} className="mx-4 mt-3 min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold">{t('clinicalFeedback.close_test')}</button><ClinicalStudentAssessmentsPage testRun={{ id, canDelete, onClose }} /></dialog>;
}
