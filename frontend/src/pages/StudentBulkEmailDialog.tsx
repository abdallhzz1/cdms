import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Mail, Search, UsersRound, X } from 'lucide-react';
import { apiFetch, apiFetchEnvelope } from '@/api/client';
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
type StudentChoice = {
  id: number;
  university_number: string;
  full_name_ar: string;
  full_name_en?: string | null;
  academic_level: string;
  resolved_university_email?: string | null;
  university_email?: string | null;
};

const selectClass = 'h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50';

function validEmail(student: StudentChoice): string | null {
  const address = (student.resolved_university_email || student.university_email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}

export function StudentBulkEmailDialog({ cohorts, initialLevel, onClose }: { cohorts: Cohort[]; initialLevel: string; onClose: () => void }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [mode, setMode] = useState<'cohort' | 'students'>('cohort');
  const [level, setLevel] = useState(cohorts.some(cohort => cohort.value === initialLevel) ? initialLevel : '');
  const [group, setGroup] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [searchLevel, setSearchLevel] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [selected, setSelected] = useState<StudentChoice[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setSearchPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const groupsQuery = useQuery({
    queryKey: ['student-main-groups', level],
    queryFn: () => apiFetch<string[]>('/students/main-groups?academic_level=' + encodeURIComponent(level)),
    enabled: mode === 'cohort' && Boolean(level) && level !== 'all',
  });
  const recipientsQuery = useQuery({
    queryKey: ['student-email-recipients', level, group],
    queryFn: () => {
      const params = new URLSearchParams({ academic_level: level });
      if (group && level !== 'all') params.set('main_group_code', group);
      return apiFetch<Recipients>('/students/email-recipients?' + params);
    },
    enabled: mode === 'cohort' && Boolean(level),
  });
  const studentParams = new URLSearchParams({ per_page: '20', page: String(searchPage) });
  if (search) studentParams.set('search', search);
  if (searchLevel) studentParams.set('academic_level', searchLevel);
  const studentsQuery = useQuery({
    queryKey: ['student-email-picker', search, searchLevel, searchPage],
    queryFn: () => apiFetchEnvelope<StudentChoice[]>('/students?' + studentParams),
    enabled: mode === 'students',
  });

  const uniqueSelectedEmails = [...new Set(selected.map(validEmail).filter((email): email is string => Boolean(email)))];
  const emails = mode === 'cohort' ? recipientsQuery.data?.emails || [] : uniqueSelectedEmails;
  const gmailUrl = gmailComposeUrl({ bcc: emails });
  const needsCopy = gmailUrl.length > GMAIL_COMPOSE_URL_LIMIT;
  const lastPage = Number(studentsQuery.data?.meta.last_page || 1);
  const studentName = (student: StudentChoice) => (ar ? student.full_name_ar : student.full_name_en || student.full_name_ar);
  const cohortLabel = (value: string) => {
    const cohort = cohorts.find(item => item.value === value);
    return cohort ? (ar ? cohort.label_ar : cohort.label_en) : value;
  };
  const toggleStudent = (student: StudentChoice) => {
    if (!validEmail(student)) return;
    setSelected(current => current.some(item => item.id === student.id)
      ? current.filter(item => item.id !== student.id)
      : [...current, student]);
    setCopied(false);
  };
  const copyRecipients = async () => {
    if (!emails.length) return;
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={tr('مراسلة الطلبة', 'Email students')} className="flex max-h-[94dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
      <header className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Mail className="h-5 w-5 shrink-0 text-teal-700" />{tr('مراسلة الطلبة', 'Email students')}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{tr('اختر الدفعات أو طلابًا محددين، ثم افتح مسودة واحدة في Gmail.', 'Choose cohorts or specific students, then open one Gmail draft.')}</p></div>
          <button type="button" onClick={onClose} aria-label={tr('إغلاق', 'Close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div role="tablist" aria-label={tr('طريقة اختيار المستلمين', 'Recipient selection method')} className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button type="button" role="tab" aria-selected={mode === 'cohort'} onClick={() => { setMode('cohort'); setCopied(false); }} className={'min-h-10 rounded-lg px-2 text-xs font-black transition ' + (mode === 'cohort' ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-500')}>{tr('دفعة أو كل الدفعات', 'Cohorts')}</button>
          <button type="button" role="tab" aria-selected={mode === 'students'} onClick={() => { setMode('students'); setCopied(false); }} className={'min-h-10 rounded-lg px-2 text-xs font-black transition ' + (mode === 'students' ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-500')}>{tr('طلاب محددون', 'Specific students')}</button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
        {mode === 'cohort' ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">{tr('المستلمون', 'Recipients')}
              <select value={level} onChange={event => { setLevel(event.target.value); setGroup(''); setCopied(false); }} aria-label={tr('دفعة المستلمين', 'Recipient cohort')} className={'mt-1.5 ' + selectClass}>
                <option value="">{tr('اختر الدفعة', 'Choose cohort')}</option>
                {cohorts.length > 1 && <option value="all">{tr('جميع الدفعات المتاحة', 'All available cohorts')}</option>}
                {cohorts.map(cohort => <option key={cohort.value} value={cohort.value}>{ar ? cohort.label_ar : cohort.label_en}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">{tr('المجموعة الرئيسية (اختياري)', 'Main group (optional)')}
              <select value={group} disabled={!level || level === 'all' || groupsQuery.isLoading} onChange={event => { setGroup(event.target.value); setCopied(false); }} aria-label={tr('مجموعة المستلمين', 'Recipient group')} className={'mt-1.5 ' + selectClass}>
                <option value="">{level === 'all' ? tr('كل المجموعات في كل الدفعات', 'All groups in all cohorts') : tr('كل طلاب الدفعة', 'Entire cohort')}</option>
                {groupsQuery.data?.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </div>
          {groupsQuery.isError && <p role="alert" className="text-xs text-rose-700">{tr('تعذر تحميل المجموعات.', 'Unable to load groups.')} <button type="button" className="underline" onClick={() => groupsQuery.refetch()}>{tr('إعادة المحاولة', 'Retry')}</button></p>}
          {!level && <p className="rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">{tr('اختر دفعة واحدة أو جميع الدفعات المتاحة لحسابك. لن تُفتح رسالة حتى تُراجع عدد المستلمين.', 'Choose one cohort or all cohorts available to your account. Review the recipient count before opening Gmail.')}</p>}
          {level && <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">{recipientsQuery.isLoading ? tr('جارٍ حساب المستلمين...', 'Counting recipients...') : recipientsQuery.isError ? <span role="alert">{tr('تعذر تحميل المستلمين.', 'Unable to load recipients.')} <button type="button" className="underline" onClick={() => recipientsQuery.refetch()}>{tr('إعادة المحاولة', 'Retry')}</button></span> : <><strong>{recipientsQuery.data?.recipient_count ?? 0} {tr('عنوانًا جاهزًا للمراسلة', 'email recipients')}</strong><p className="mt-1 text-xs leading-5 text-teal-800">{tr('من أصل ', 'From ')}{recipientsQuery.data?.total_students ?? 0} {tr('طالب', 'students')}{Boolean(recipientsQuery.data?.missing_email_count) && ' · ' + recipientsQuery.data?.missing_email_count + ' ' + tr('بدون بريد صالح', 'without valid email')}{Boolean(recipientsQuery.data?.duplicate_email_count) && ' · ' + recipientsQuery.data?.duplicate_email_count + ' ' + tr('عنوان مكرر', 'duplicate addresses')}</p></>}</div>}
        </> : <>
          <div className="space-y-2"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-slate-900">{tr('ابحث وحدد الطلاب', 'Find and select students')}</h3><span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-800">{selected.length} {tr('محدد', 'selected')}</span></div><p className="text-xs leading-5 text-slate-500">{tr('يبقى اختيارك محفوظًا عند تغيير الدفعة أو البحث أو الصفحة.', 'Your selection stays while changing cohorts, search terms or pages.')}</p></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} aria-label={tr('البحث عن طالب', 'Search students')} placeholder={tr('الاسم أو الرقم الجامعي', 'Name or university number')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
            <select value={searchLevel} onChange={event => { setSearchLevel(event.target.value); setSearchPage(1); }} aria-label={tr('تصفية دفعة الطلاب', 'Filter student cohort')} className={selectClass}><option value="">{tr('كل الدفعات المتاحة', 'All available cohorts')}</option>{cohorts.map(cohort => <option key={cohort.value} value={cohort.value}>{ar ? cohort.label_ar : cohort.label_en}</option>)}</select>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {studentsQuery.isLoading && <p className="p-5 text-center text-xs text-slate-500">{tr('جارٍ تحميل الطلاب...', 'Loading students...')}</p>}
            {studentsQuery.isError && <p role="alert" className="p-5 text-center text-xs text-rose-700">{tr('تعذر تحميل الطلاب.', 'Unable to load students.')} <button type="button" onClick={() => studentsQuery.refetch()} className="underline">{tr('إعادة المحاولة', 'Retry')}</button></p>}
            {studentsQuery.isSuccess && !studentsQuery.data.data.length && <p className="p-5 text-center text-xs text-slate-500">{tr('لا يوجد طلاب مطابقون.', 'No matching students.')}</p>}
            {studentsQuery.data?.data.map(student => {
              const email = validEmail(student);
              const checked = selected.some(item => item.id === student.id);
              return <label key={student.id} className={'flex min-w-0 items-start gap-3 border-b border-slate-100 px-3 py-3 last:border-0 ' + (email ? 'cursor-pointer hover:bg-slate-50' : 'bg-slate-50/70 opacity-65')}>
                <input type="checkbox" checked={checked} disabled={!email} onChange={() => toggleStudent(student)} aria-label={tr('تحديد الطالب ', 'Select student ') + studentName(student)} className="mt-1 h-4 w-4 shrink-0 accent-teal-700" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-5 text-slate-900">{studentName(student)}</span><span className="mt-0.5 block break-all text-[11px] text-slate-500">{student.university_number} · {cohortLabel(student.academic_level)}</span></span>
                <span className={'shrink-0 text-[10px] font-bold ' + (email ? 'text-teal-700' : 'text-rose-600')}>{email ? (checked ? tr('محدد', 'Selected') : tr('اختر', 'Select')) : tr('لا يوجد بريد', 'No email')}</span>
              </label>;
            })}
          </div>
          {studentsQuery.isSuccess && lastPage > 1 && <div className="flex items-center justify-center gap-3"><button type="button" disabled={searchPage <= 1} onClick={() => setSearchPage(page => page - 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" />{tr('السابق', 'Previous')}</button><span className="text-xs text-slate-500">{searchPage} / {lastPage}</span><button type="button" disabled={searchPage >= lastPage} onClick={() => setSearchPage(page => page + 1)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:opacity-40">{tr('التالي', 'Next')}<ChevronLeft className="h-3.5 w-3.5" /></button></div>}
          {selected.length > 0 && <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-3"><div className="flex items-center justify-between gap-2"><h4 className="flex items-center gap-1.5 text-xs font-black text-teal-950"><UsersRound className="h-4 w-4" />{tr('الطلاب المحددون', 'Selected students')} · {selected.length}</h4><button type="button" onClick={() => { setSelected([]); setCopied(false); }} className="text-[11px] font-bold text-teal-800 underline">{tr('مسح الاختيار', 'Clear selection')}</button></div><div className="mt-2 max-h-28 space-y-1 overflow-y-auto">{selected.map(student => <div key={student.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs"><span className="min-w-0 truncate font-semibold">{studentName(student)} · {cohortLabel(student.academic_level)}</span><button type="button" onClick={() => toggleStudent(student)} aria-label={tr('إزالة الطالب ', 'Remove student ') + studentName(student)} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-700"><X className="h-3.5 w-3.5" /></button></div>)}</div><p className="mt-2 text-[11px] text-teal-800">{emails.length} {tr('عنوانًا فريدًا في الرسالة', 'unique addresses in the draft')}</p></div>}
        </>}

        {emails.length > 0 && <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-600"><Check className="me-1 inline h-3.5 w-3.5 text-teal-700" />{tr('ستُفتح مسودة Gmail واحدة، وتُوضع العناوين في BCC لحفظ خصوصية الطلاب. راجع المستلمين قبل الإرسال؛ النظام لا يرسل تلقائيًا.', 'One Gmail draft opens with recipients in Bcc for privacy. Review them before sending; this system does not send automatically.')}</div>}
        {needsCopy && emails.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold leading-5 text-amber-900">{tr('عدد العناوين أكبر من سعة الرابط. انسخها وألصقها في خانة BCC داخل مسودة Gmail الواحدة.', 'The addresses exceed the link size. Copy them into Bcc in the single Gmail draft.')}</p><textarea readOnly aria-label={tr('عناوين الطلاب للنسخ', 'Student addresses to copy')} value={emails.join(', ')} className="mt-2 h-20 w-full resize-none rounded-lg border border-amber-200 bg-white p-2 text-xs" dir="ltr" /><button type="button" onClick={copyRecipients} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-900"><Copy className="h-4 w-4" />{copied ? tr('تم النسخ', 'Copied') : tr('نسخ العناوين', 'Copy addresses')}</button>{copyFailed && <p role="alert" className="mt-2 text-xs text-rose-700">{tr('تعذر النسخ التلقائي. حدد العناوين من المربع وانسخها يدويًا.', 'Clipboard access failed. Select and copy the addresses manually.')}</p>}</div>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3 sm:px-6"><span className="text-[11px] font-bold text-slate-500">{emails.length} {tr('مستلم', 'recipients')}</span><div className="flex items-center gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700">{tr('إلغاء', 'Cancel')}</button>{emails.length > 0 && <a href={needsCopy ? gmailComposeUrl() : gmailUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800"><ExternalLink className="h-4 w-4" />{tr('فتح Gmail', 'Open Gmail')}</a>}</div></footer>
    </section>
  </div>;
}
