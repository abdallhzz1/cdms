import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Mail, X } from 'lucide-react';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { GMAIL_COMPOSE_URL_LIMIT, gmailComposeUrl } from './studentEmail';

type Cohort = { value: string; label_ar: string; label_en: string };
type Recipients = {
  total_students: number;
  recipient_count: number;
  missing_email_count: number;
  duplicate_email_count: number;
  emails: string[];
};

export function StudentBulkEmailDialog({ cohorts, initialLevel, onClose }: { cohorts: Cohort[]; initialLevel: string; onClose: () => void }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [level, setLevel] = useState(cohorts.some(cohort => cohort.value === initialLevel) ? initialLevel : '');
  const [group, setGroup] = useState('');
  const [copied, setCopied] = useState(false);
  const groupsQuery = useQuery({
    queryKey: ['student-main-groups', level],
    queryFn: () => apiFetch<string[]>(`/students/main-groups?academic_level=${encodeURIComponent(level)}`),
    enabled: Boolean(level),
  });
  const recipientsQuery = useQuery({
    queryKey: ['student-email-recipients', level, group],
    queryFn: () => {
      const params = new URLSearchParams({ academic_level: level });
      if (group) params.set('main_group_code', group);
      return apiFetch<Recipients>(`/students/email-recipients?${params}`);
    },
    enabled: Boolean(level),
  });
  const recipients = recipientsQuery.data;
  const gmailUrl = gmailComposeUrl({ bcc: recipients?.emails || [] });
  const needsCopy = gmailUrl.length > GMAIL_COMPOSE_URL_LIMIT;

  const copyRecipients = async () => {
    if (!recipients?.emails.length) return;
    try {
      await navigator.clipboard.writeText(recipients.emails.join(', '));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={tr('مراسلة طلاب دفعة أو مجموعة', 'Email a cohort or group')} className="flex max-h-[92dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-black text-slate-900"><Mail className="h-5 w-5 text-teal-700" />{tr('مراسلة جماعية', 'Group email')}</h2><p className="mt-1 text-xs text-slate-500">{tr('اختر الدفعة، ثم مجموعة رئيسية إذا أردت مراسلة جزء منها.', 'Choose a cohort, then optionally a main group.')}</p></div>
        <button type="button" onClick={onClose} aria-label={tr('إغلاق', 'Close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-4 overflow-y-auto p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">{tr('الدفعة', 'Cohort')}<select value={level} onChange={event => { setLevel(event.target.value); setGroup(''); setCopied(false); }} aria-label={tr('دفعة المستلمين', 'Recipient cohort')} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">{tr('اختر الدفعة', 'Choose cohort')}</option>{cohorts.map(cohort => <option key={cohort.value} value={cohort.value}>{ar ? cohort.label_ar : cohort.label_en}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-700">{tr('المجموعة الرئيسية (اختياري)', 'Main group (optional)')}<select value={group} disabled={!level || groupsQuery.isLoading} onChange={event => { setGroup(event.target.value); setCopied(false); }} aria-label={tr('مجموعة المستلمين', 'Recipient group')} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50"><option value="">{tr('كل طلاب الدفعة', 'Entire cohort')}</option>{groupsQuery.data?.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
        </div>
        {groupsQuery.isError && <p role="alert" className="text-xs text-rose-700">{tr('تعذر تحميل المجموعات.', 'Unable to load groups.')} <button type="button" className="underline" onClick={() => groupsQuery.refetch()}>{tr('إعادة المحاولة', 'Retry')}</button></p>}
        {level && <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">{recipientsQuery.isLoading ? tr('جارٍ حساب المستلمين...', 'Counting recipients...') : recipientsQuery.isError ? <span role="alert">{tr('تعذر تحميل المستلمين.', 'Unable to load recipients.')} <button type="button" className="underline" onClick={() => recipientsQuery.refetch()}>{tr('إعادة المحاولة', 'Retry')}</button></span> : <><strong>{recipients?.recipient_count ?? 0} {tr('عنوانًا جاهزًا للمراسلة', 'email recipients')}</strong><p className="mt-1 text-xs text-teal-800">{tr(`من أصل ${recipients?.total_students ?? 0} طالب`, `From ${recipients?.total_students ?? 0} students`)}{Boolean(recipients?.missing_email_count) && ` · ${recipients?.missing_email_count} ${tr('بدون بريد صالح', 'without valid email')}`}{Boolean(recipients?.duplicate_email_count) && ` · ${recipients?.duplicate_email_count} ${tr('عنوان مكرر', 'duplicate addresses')}`}</p></>}</div>}
        {recipients && recipients.recipient_count > 0 && <>
          <p className="text-xs leading-6 text-slate-600">{tr('ستفتح رسالة جديدة في Gmail. عند مراسلة أكثر من طالب توضع العناوين في BCC حتى لا تظهر لبقية الطلبة. راجع العدد والعناوين قبل الإرسال؛ النظام لن يرسل تلقائيًا.', 'A new Gmail draft will open. Multiple addresses go in Bcc for privacy. Review the recipients before sending; this system does not send automatically.')}</p>
          {needsCopy && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">{tr('الدفعة كبيرة على رابط واحد: انسخ العناوين وألصقها في خانة BCC داخل Gmail.', 'The cohort is too large for one link: copy the addresses and paste them into Gmail Bcc.')}</p><textarea readOnly aria-label={tr('عناوين الطلاب للنسخ', 'Student addresses to copy')} value={recipients.emails.join(', ')} className="mt-2 h-20 w-full resize-none rounded-lg border border-amber-200 bg-white p-2 text-xs" dir="ltr" /><button type="button" onClick={copyRecipients} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900"><Copy className="h-4 w-4" />{copied ? tr('تم النسخ', 'Copied') : tr('نسخ العناوين', 'Copy addresses')}</button></div>}
        </>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700">{tr('إلغاء', 'Cancel')}</button>{recipients && recipients.recipient_count > 0 && <a href={needsCopy ? gmailComposeUrl() : gmailUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-bold text-white"><ExternalLink className="h-4 w-4" />{tr('فتح Gmail', 'Open Gmail')}</a>}</footer>
    </section>
  </div>;
}
