import { formatClinicalFeedback } from '@/i18n/clinicalFeedbackMessages';
import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, LockKeyhole, LogOut, Check, ArrowLeft, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { clinicalPortalFetch, clinicalPeriodKey, type ClinicalStudentSlot } from '@/api/clinicalFeedback';
import { ApiError } from '@/api/client';
import './clinicalStudentPortal.css';

const base = '/public/clinical-student';
const normalizeDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) - (c >= '۰' ? 1776 : 1632)));
const field = 'min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';
const primary = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-bold text-white disabled:opacity-50';
type Student = { full_name_ar: string; full_name_en: string | null; university_number: string };
const assessmentWeekKey = (slot: ClinicalStudentSlot) => [slot.kind, slot.from_week, slot.to_week, slot.starts_on, slot.ends_on].join('|');

export function ClinicalStudentAssessmentsPage({ testRun }: { testRun?: { id: string; canDelete: boolean; onClose: () => void } } = {}) {
  const { locale, setLocale, t } = useI18n();
  const ar = locale === 'ar';
  const client = useQueryClient();
  const apiBase = testRun ? `/clinical-student-feedback/test-runs/${testRun.id}` : base;
  const identityKey = testRun ? ['clinical-student-test-identity', testRun.id] : ['clinical-student-identity'];
  const marksKey = testRun ? ['clinical-student-test-marks', testRun.id] : ['clinical-student-marks'];
  const [number, setNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [period, setPeriod] = useState('');
  const [chosen, setChosen] = useState('');
  const identity = useQuery({ queryKey: identityKey, queryFn: () => clinicalPortalFetch<{ student: Student | null }>(`${apiBase}/identity`), retry: false, staleTime: 0 });
  const student = identity.data?.student;
  const marks = useQuery({ queryKey: [...marksKey, student?.university_number], queryFn: () => clinicalPortalFetch<{ slots: ClinicalStudentSlot[] }>(`${apiBase}/marks`, { method: 'POST' }), enabled: Boolean(student), retry: false, staleTime: 0, refetchInterval: 30_000 });
  const deleteTestAnswer = useMutation({ mutationFn: (id: string) => clinicalPortalFetch(`${apiBase}/answers/${id}`, { method: 'DELETE' }), onSuccess: async () => { await client.invalidateQueries({ queryKey: marksKey }); await client.invalidateQueries({ queryKey: ['clinical-feedback-test-runs'] }); } });
  const requestCode = useMutation({ mutationFn: () => clinicalPortalFetch<{ challenge: string }>(`${base}/request-otp`, { method: 'POST', body: { university_number: normalizeDigits(number) } }), onSuccess: data => { setChallenge(data.challenge); setOtp(''); } });
  const verify = useMutation({ mutationFn: () => clinicalPortalFetch(`${base}/verify-otp`, { method: 'POST', body: { challenge, otp, remember } }), onSuccess: async () => {
    client.removeQueries({ queryKey: ['clinical-student-marks'] });
    setChosen(''); setPeriod(''); setChallenge(null); setOtp(''); setNumber('');
    await client.invalidateQueries({ queryKey: ['clinical-student-identity'] });
  } });
  const forget = useMutation({ mutationFn: () => clinicalPortalFetch(`${base}/forget`, { method: 'POST' }), onSuccess: () => {
    client.removeQueries({ queryKey: ['clinical-student-marks'] });
    client.setQueryData(['clinical-student-identity'], { student: null });
    setChosen(''); setPeriod(''); setChallenge(null); setOtp(''); setNumber('');
  } });
  const slots = [...(marks.data?.slots ?? [])].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const today = new Date().toLocaleDateString('en-CA');
  const preferred = slots.find(s => s.can_participate && s.mark_ready) ?? slots.find(s => s.starts_on <= today) ?? slots[0];
  const periods = [...new Map(slots.map(s => [clinicalPeriodKey(s), s])).entries()];
  const activePeriod = periods.some(([key]) => key === period) ? period : preferred ? clinicalPeriodKey(preferred) : '';
  const inPeriod = slots.filter(s => clinicalPeriodKey(s) === activePeriod);
  const weeks = [...new Map(inPeriod.map(s => [assessmentWeekKey(s), s])).entries()];
  const preferredWeek = inPeriod.find(s => s.can_participate && s.mark_ready) ?? inPeriod.find(s => s.starts_on <= today) ?? inPeriod[0];
  const activeWeek = weeks.some(([key]) => key === chosen) ? chosen : preferredWeek ? assessmentWeekKey(preferredWeek) : '';
  const visible = inPeriod.filter(s => assessmentWeekKey(s) === activeWeek);
  useEffect(() => {
    if (!activeWeek) return;
    setPeriod(activePeriod); setChosen(activeWeek);
  }, [activePeriod, activeWeek]);
  const slotLabel = (s: ClinicalStudentSlot) => s.kind === 'period' ? formatClinicalFeedback(t, 'period_assessment_weeks', { from: s.from_week, to: s.to_week }) : formatClinicalFeedback(t, 'week_number', { number: s.from_week });
  const errorText = (error: unknown) => error instanceof ApiError ? error.message : t('clinicalFeedback.could_not_complete_the_request_please_retry');

  return <div dir={ar ? 'rtl' : 'ltr'} className="clinical-student-portal min-h-dvh bg-slate-50 px-4 pb-10 text-slate-900">
    <div className="mx-auto w-full max-w-xl">
      <header className="flex items-center justify-between gap-3 py-5 sm:py-7">
        <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-800 text-white"><GraduationCap className="h-5 w-5" /></span><div><p className="text-xs font-bold text-slate-500">{t('clinicalFeedback.hebron_university_clinical_department')}</p><h1 className="mt-0.5 text-lg font-black">{t('clinicalFeedback.my_clinical_assessments')}</h1></div></div>
        <button type="button" className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold" onClick={() => setLocale(ar ? 'en' : 'ar')} aria-label={t('clinicalFeedback.switch_to_arabic')}>{ar ? 'EN' : 'عربي'}</button>
      </header>
      {testRun && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950">{t('clinicalFeedback.test_notice')}</p>}
      {deleteTestAnswer.isError && <p role="alert" className="mb-4 text-sm text-red-700">{errorText(deleteTestAnswer.error)}</p>}

      {identity.isPending ? <p role="status" className="py-10 text-center text-sm text-slate-500">{t('clinicalFeedback.checking_your_session')}</p> : identity.isError ? <div className="rounded-2xl border border-slate-200 bg-white p-5"><p role="alert" className="text-sm">{t('clinicalFeedback.could_not_connect_please_retry')}</p><button className={`${primary} mt-4`} onClick={() => identity.refetch()}>{t('clinicalFeedback.retry')}</button></div> : !student ?
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label={t('clinicalFeedback.secure_access')}>
          <LockKeyhole className="mb-4 h-6 w-6 text-teal-800" /><h2 className="text-base font-black">{challenge ? t('clinicalFeedback.enter_your_verification_code') : t('clinicalFeedback.your_marks_are_private')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{challenge ? t('clinicalFeedback.if_your_number_is_eligible_a_code_was_sent_to_your_university_email_') : t('clinicalFeedback.enter_your_university_number_to_receive_an_access_code_at_your_unive')}</p>
          <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); if (challenge) verify.mutate(); else requestCode.mutate(); }}>
            {!challenge ? <label className="block text-sm font-bold">{t('clinicalFeedback.university_number')}<input required inputMode="numeric" autoComplete="username" value={number} maxLength={20} onChange={e => setNumber(e.target.value.replace(/[^0-9٠-٩۰-۹]/g, ''))} className={`${field} mt-2`} dir="ltr" /></label> : <>
              <label className="block text-sm font-bold">{t('clinicalFeedback.verification_code')}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={e => setOtp(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))} className={`${field} mt-2 text-center tracking-[0.3em]`} dir="ltr" /></label>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-teal-800" />{t('clinicalFeedback.remember_me_for_30_days_on_my_personal_device')}</label>
            </>}
            {(requestCode.isError || verify.isError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700">{errorText(challenge ? verify.error : requestCode.error)}</p>}
            <button type="submit" className={primary} disabled={requestCode.isPending || verify.isPending || (challenge ? otp.length !== 6 : number.length < 4)}>{requestCode.isPending || verify.isPending ? t('clinicalFeedback.please_wait') : challenge ? t('clinicalFeedback.continue') : t('clinicalFeedback.send_access_code')}</button>
            {challenge && <button type="button" className="min-h-11 w-full text-sm font-bold text-slate-600" onClick={() => { setChallenge(null); verify.reset(); requestCode.reset(); }}>{t('clinicalFeedback.change_number_or_request_a_new_code')}</button>}
          </form>
          <p className="mt-5 text-xs leading-6 text-slate-500">{t('clinicalFeedback.if_no_code_arrives_check_spam_or_contact_the_department_to_verify_yo')}</p>
        </section> : <>
          <div className="mb-4 flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{ar ? student.full_name_ar : student.full_name_en || student.full_name_ar}</p><p className="mt-1 text-xs text-slate-500" dir="ltr">{student.university_number}</p></div>{!testRun && <button type="button" disabled={forget.isPending} onClick={() => forget.mutate()} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"><LogOut className="h-4 w-4" />{t('clinicalFeedback.sign_out')}</button>}</div>
          {forget.isError && <p role="alert" className="mb-3 text-sm text-red-700">{errorText(forget.error)}</p>}
          {marks.isPending ? <p role="status" className="py-10 text-center text-sm">{t('clinicalFeedback.loading_your_assessments')}</p> : marks.isError ? <div className="rounded-2xl border border-slate-200 bg-white p-5"><p role="alert" className="text-sm leading-6">{errorText(marks.error)}</p><button type="button" className={`${primary} mt-4`} onClick={() => !testRun && marks.error instanceof ApiError && marks.error.status === 401 ? forget.mutate() : marks.refetch()}>{t('clinicalFeedback.retry_sign_in')}</button></div> : !visible.length ? <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm leading-7 text-slate-500">{t('clinicalFeedback.no_assessments_are_available_yet_they_will_appear_when_your_course_i')}</p> : <>
            <div className="mb-4 space-y-3 px-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block min-w-0 text-xs font-bold text-slate-500">{t('clinicalFeedback.clinical_period')}<select className={`${field} mt-1.5`} value={activePeriod} onChange={e => { setPeriod(e.target.value); setChosen(''); }}>{periods.map(([key, s]) => <option key={key} value={key}>{ar ? s.period_ar : s.period_en} · {s.academic_year}</option>)}</select></label>
                <label className="block min-w-0 text-xs font-bold text-slate-500">{t('clinicalFeedback.week_period')}<select className={`${field} mt-1.5`} value={activeWeek} onChange={e => setChosen(e.target.value)}>{weeks.map(([key, s]) => {
                  const group = inPeriod.filter(item => assessmentWeekKey(item) === key);
                  return <option key={key} value={key}>{slotLabel(s)}{weeks.some(([otherKey, other]) => otherKey !== key && slotLabel(other) === slotLabel(s)) ? ` · ${s.starts_on}` : ''}{group.every(item => item.status === 'not_evaluated') ? ` · ${t('clinicalFeedback.not_evaluated_short')}` : group.every(item => item.feedback_done) ? ' ✓' : ''}</option>;
                })}</select></label>
              </div>
            </div>
            <div className="space-y-4">{visible.map(selected => <section key={selected.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6" aria-label={visible.length > 1 ? `${slotLabel(selected)} · ${ar ? selected.course_ar : selected.course_en}` : slotLabel(selected)}>
              <div className="mb-4 border-b border-slate-100 pb-3">{visible.length > 1 && <h2 className="mb-2 text-sm font-bold">{ar ? selected.course_ar : selected.course_en}</h2>}<p className="mt-1 text-xs text-slate-500"><bdi dir="ltr">{selected.starts_on} — {selected.ends_on}</bdi></p><p className="mt-2 text-sm font-medium text-slate-600">{ar ? selected.supervisor_ar : selected.supervisor_en || selected.supervisor_ar}</p></div>
              {selected.mark ? <div className="rounded-2xl bg-teal-50 px-4 py-8 text-center"><Check className="mx-auto mb-2 h-6 w-6 text-teal-800" /><p className="text-sm font-bold text-teal-900">{t('clinicalFeedback.your_clinical_assessment_mark')}</p><p className="mt-3 text-4xl font-black text-teal-900" dir="ltr">{selected.mark.score} <span className="text-xl font-medium text-teal-700">/ {selected.mark.max_score}</span></p>{selected.mark.revision > 1 && <p className="mt-3 text-xs text-teal-800">{t('clinicalFeedback.updated_after_review')}</p>}</div> : selected.can_participate ? <SlotFeedback key={selected.key} slot={selected} apiBase={apiBase} isTest={Boolean(testRun)} onSuccess={() => { setChosen(assessmentWeekKey(selected)); return client.invalidateQueries({ queryKey: marksKey }); }} /> : <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                <p className="font-bold">{t(selected.status === 'not_evaluated' ? 'clinicalFeedback.not_evaluated_by_supervisor' : selected.status === 'awaiting_week_end' ? 'clinicalFeedback.waiting_for_week_end' : 'clinicalFeedback.waiting_for_mark_release')}</p>
                {selected.status === 'not_evaluated' && <p className="mt-2 text-xs leading-6">{t('clinicalFeedback.feedback_after_assessment')}</p>}
                {selected.feedback_done && <p className="mt-2 text-xs text-teal-800">{t('clinicalFeedback.thank_you_your_participation_is_complete')}</p>}
                <button type="button" onClick={() => marks.refetch()} className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-teal-800"><RefreshCw className="h-4 w-4" />{t('clinicalFeedback.refresh')}</button>
              </div>}

              {testRun && selected.test_response && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7"><p className="font-bold">{t('clinicalFeedback.test_response')}</p><p className="flex flex-wrap gap-x-3"><span>{t('clinicalFeedback.training_value')}: <bdi dir="ltr">{selected.test_response.experience ?? '—'} / 5</bdi></span><span>{t('clinicalFeedback.supervision')}: <bdi dir="ltr">{selected.test_response.supervision ?? '—'} / 5</bdi></span></p>{selected.test_response.comment && <p dir="auto" className="whitespace-pre-wrap break-words">{selected.test_response.comment}</p>}{testRun.canDelete && <button type="button" className="mt-2 min-h-11 rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 disabled:opacity-50" disabled={deleteTestAnswer.isPending} onClick={() => deleteTestAnswer.mutate(selected.test_response!.id)}>{t('clinicalFeedback.delete_test_response')}</button>}</div>}
            </section>)}</div>
          </>}
        </>}
    </div>
  </div>;
}

function SlotFeedback({ slot, onSuccess, apiBase, isTest }: { slot: ClinicalStudentSlot; onSuccess: () => Promise<unknown>; apiBase: string; isTest: boolean }) {
  const { locale, t } = useI18n(); const ar = locale === 'ar';
  const commentId = useId();
  const [experience, setExperience] = useState<number | null>(null);
  const [supervision, setSupervision] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const submit = useMutation({ mutationFn: () => clinicalPortalFetch(`${apiBase}/participate`, { method: 'POST', body: { key: slot.key, experience, supervision, comment: comment.trim() || null } }), onSuccess });
  const rating = (title: string, value: number | null, change: (n: number) => void) => <fieldset><legend className="mb-3 text-sm font-bold leading-6">{title}</legend><div className="grid grid-cols-5 gap-2">{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" aria-label={`${title}: ${n}`} aria-pressed={value === n} onClick={() => change(n)} className={`min-h-11 rounded-xl border text-base font-bold ${value === n ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>{n}</button>)}</div><div className="mt-1.5 flex justify-between text-[11px] text-slate-500"><span>{t('clinicalFeedback.poor')}</span><span>{t('clinicalFeedback.excellent')}</span></div><button type="button" aria-pressed={value === 0} className={`mt-2 min-h-11 rounded-lg px-2 text-xs font-bold ${value === 0 ? 'bg-teal-50 text-teal-900 ring-1 ring-teal-300' : 'text-slate-500'}`} onClick={() => change(0)}>{t('clinicalFeedback.unable_to_assess')}</button></fieldset>;
  return <form className="space-y-5" onSubmit={e => { e.preventDefault(); if (experience !== null && supervision !== null) submit.mutate(); }}>
    <p className="flex items-start gap-2 rounded-xl bg-teal-50 p-3 text-xs leading-6 text-teal-900"><LockKeyhole className="mt-1 h-4 w-4 shrink-0" />{t('clinicalFeedback.your_name_and_number_are_not_shown_with_your_answers_your_supervisor')}</p>
    {rating(t('clinicalFeedback.how_useful_was_your_training'), experience, setExperience)}
    {rating(t('clinicalFeedback.how_was_the_supervision_and_guidance'), supervision, setSupervision)}
    <div><label htmlFor={commentId} className="block text-sm font-bold">{t('clinicalFeedback.anything_you_would_like_to_share_optional')}</label><textarea id={commentId} aria-describedby={`${commentId}-help`} rows={2} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} className={`${field} mt-2 resize-y py-3`} /><span id={`${commentId}-help`} className="mt-1.5 block text-xs font-normal leading-6 text-slate-500">{t('clinicalFeedback.avoid_your_name_patient_names_or_identifying_details_contact_the_dep')}</span></div>
    {submit.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700">{submit.error instanceof ApiError ? submit.error.message : t('clinicalFeedback.could_not_send_your_answers_are_still_here_please_retry')}</p>}
    <button type="submit" disabled={submit.isPending || experience === null || supervision === null} className={primary}>{submit.isPending ? t('clinicalFeedback.sending') : isTest ? t('clinicalFeedback.send_test_response') : slot.mark_ready ? t('clinicalFeedback.send_and_view_my_mark') : t('clinicalFeedback.send_feedback')}<ArrowLeft className={`h-4 w-4 ${ar ? '' : 'rotate-180'}`} /></button>
  </form>;
}
