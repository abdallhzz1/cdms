import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, MapPin, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/api/client';
import {
  createRotation,
  getRotationSetupOptions,
  type CreateRotationPayload,
  type RotationListItem,
} from '@/api/distribution';
import { useI18n } from '@/i18n/I18nContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface BlockDraft {
  key: number;
  block_code: string;
  from_week: number;
  to_week: number;
}

interface RotationSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (rotation: RotationListItem) => Promise<void> | void;
}

const levelLabels = {
  fourth: { ar: 'السنة الرابعة', en: 'Fourth year' },
  fifth: { ar: 'السنة الخامسة', en: 'Fifth year' },
  sixth: { ar: 'السنة السادسة', en: 'Sixth year' },
} as const;

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function RotationSetupModal({ isOpen, onClose, onCreated }: RotationSetupModalProps) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const tr = (arabic: string, english: string) => ar ? arabic : english;
  const [yearId, setYearId] = useState('');
  const [level, setLevel] = useState<CreateRotationPayload['academic_level']>('fourth');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [blocks, setBlocks] = useState<BlockDraft[]>([{ key: 1, block_code: 'B1', from_week: 1, to_week: 4 }]);
  const [siteCapacities, setSiteCapacities] = useState<Record<number, number>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ['rotation-setup-options'],
    queryFn: getRotationSetupOptions,
    enabled: isOpen,
  });

  const years = optionsQuery.data?.academic_years ?? [];
  const sites = optionsQuery.data?.training_sites ?? [];
  const durationWeeks = useMemo(() => Math.max(...blocks.map((block) => Number(block.to_week) || 0), 1), [blocks]);

  useEffect(() => {
    if (isOpen && !yearId && years.length > 0) {
      setYearId(String(years.find((year) => year.is_current)?.id ?? years[0].id));
    }
  }, [isOpen, yearId, years]);

  const addBlock = () => {
    const lastWeek = Math.max(...blocks.map((block) => Number(block.to_week) || 0), 0);
    const nextNumber = blocks.length + 1;
    setBlocks((current) => [...current, {
      key: Date.now(),
      block_code: `B${nextNumber}`,
      from_week: lastWeek + 1,
      to_week: lastWeek + 4,
    }]);
  };

  const updateBlock = (key: number, field: keyof Omit<BlockDraft, 'key'>, value: string) => {
    setBlocks((current) => current.map((block) => block.key === key
      ? { ...block, [field]: field === 'block_code' ? value : Number(value) }
      : block));
  };

  const toggleSite = (siteId: number, checked: boolean, suggestedCapacity?: number | null) => {
    setSiteCapacities((current) => {
      const next = { ...current };
      if (checked) next[siteId] = suggestedCapacity && suggestedCapacity > 0 ? suggestedCapacity : 6;
      else delete next[siteId];
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const cleanBlocks = blocks.map((block) => ({
      block_code: block.block_code.trim(),
      from_week: Number(block.from_week),
      to_week: Number(block.to_week),
    }));
    if (!yearId || !name.trim() || !code.trim()) return setError(tr('أكمل العام والمستوى واسم ورمز الدورة.', 'Complete the academic year, level, rotation name, and code.'));
    if (cleanBlocks.length === 0 || cleanBlocks.some((block) => !block.block_code || block.from_week < 1 || block.to_week < block.from_week)) {
      return setError(tr('راجع الفترات السريرية: يجب أن يكون لكل فترة رمز ونطاق أسابيع صحيح.', 'Review the clinical blocks: each block needs a code and a valid week range.'));
    }
    if (new Set(cleanBlocks.map((block) => block.block_code.toUpperCase())).size !== cleanBlocks.length) {
      return setError(tr('رموز الفترات السريرية يجب ألا تتكرر.', 'Clinical block codes must be unique.'));
    }
    const orderedBlocks = [...cleanBlocks].sort((a, b) => a.from_week - b.from_week);
    if (orderedBlocks.some((block, index) => index > 0 && block.from_week <= orderedBlocks[index - 1].to_week)) {
      return setError(tr('الفترات السريرية لا يجوز أن تتداخل في الأسابيع.', 'Clinical blocks cannot overlap in weeks.'));
    }
    const selectedSites = Object.entries(siteCapacities).map(([siteId, capacity]) => ({
      site_id: Number(siteId),
      max_students: Number(capacity),
    }));
    if (selectedSites.length === 0) return setError(tr('اختر موقع تدريب واحدًا على الأقل وحدد سعته.', 'Select at least one training site and set its capacity.'));
    if (selectedSites.some((site) => site.max_students < 1)) return setError(tr('سعة موقع التدريب يجب أن تكون طالبًا واحدًا على الأقل.', 'Training site capacity must be at least one student.'));
    if (startDate && endDate && endDate < startDate) return setError(tr('تاريخ نهاية الدورة يجب ألا يسبق تاريخ بدايتها.', 'The rotation end date cannot be before its start date.'));

    setSaving(true);
    try {
      const rotation = await createRotation({
        academic_year_id: Number(yearId),
        code: code.trim().toUpperCase(),
        name: name.trim(),
        academic_level: level,
        duration_weeks: durationWeeks,
        start_date: startDate || null,
        end_date: endDate || null,
        status: 'active',
        blocks: cleanBlocks,
        site_capacity_rules: selectedSites,
      });
      await onCreated(rotation);
      onClose();
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        const firstValidationError = Object.values(requestError.errors).flat().find((message) => typeof message === 'string');
        setError(typeof firstValidationError === 'string' ? firstValidationError : requestError.message);
      } else {
        setError(tr('تعذر حفظ الدورة السريرية. حاول مرة أخرى.', 'The clinical rotation could not be saved. Please try again.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tr('إعداد دورة سريرية جديدة', 'Set up a new clinical rotation')} maxWidth="2xl">
      <form onSubmit={submit} className="space-y-5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-xs leading-6 text-teal-900">
          {tr('عرّف الدورة مرة واحدة، ثم ستظهر مجموعات الطلبة المطابقة للعام والمستوى في مساحة التوزيع.', 'Define the rotation once, then matching student groups for its academic year and level will appear in the distribution workspace.')}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}
        {optionsQuery.isError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{tr('تعذر تحميل الأعوام الأكاديمية ومواقع التدريب.', 'Academic years and training sites could not be loaded.')}</div>}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{tr('العام الأكاديمي', 'Academic year')}</span><select className={inputClass} value={yearId} onChange={(event) => setYearId(event.target.value)} disabled={optionsQuery.isLoading}><option value="">{tr('اختر العام', 'Select year')}</option>{years.map((year) => <option key={year.id} value={year.id}>{year.code}{year.is_current ? tr(' — الحالي', ' — Current') : ''}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{tr('المستوى', 'Level')}</span><select className={inputClass} value={level} onChange={(event) => setLevel(event.target.value as CreateRotationPayload['academic_level'])}>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label[locale]}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{tr('اسم الدورة', 'Rotation name')}</span><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder={tr('مثال: دورة الباطني الأولى', 'e.g. First internal medicine rotation')} maxLength={255} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{tr('رمز الدورة', 'Rotation code')}</span><input className={inputClass} dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. IM-01" maxLength={50} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{tr('تاريخ البداية (اختياري)', 'Start date (optional)')}</span><input type="date" className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">{tr('تاريخ النهاية (اختياري)', 'End date (optional)')}</span><input type="date" className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div>

        <section className="rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><CalendarRange className="h-4 w-4 text-teal-700" />{tr('الفترات السريرية', 'Clinical blocks')}</h3><p className="mt-1 text-[11px] text-slate-500">{tr('مدة الدورة المحسوبة:', 'Calculated rotation duration:')} {durationWeeks} {tr('أسبوع', 'weeks')}</p></div>
            <Button type="button" variant="outline" size="sm" onClick={addBlock}><Plus className="ms-1 h-4 w-4" />{tr('إضافة فترة', 'Add block')}</Button>
          </div>
          <div className="space-y-2 p-4">{blocks.map((block, index) => <div key={block.key} className="grid items-end gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">{tr('رمز الفترة', 'Block code')}</span><input className={inputClass} dir="ltr" value={block.block_code} onChange={(event) => updateBlock(block.key, 'block_code', event.target.value)} /></label><label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">{tr('من أسبوع', 'From week')}</span><input type="number" min={1} className={inputClass} value={block.from_week} onChange={(event) => updateBlock(block.key, 'from_week', event.target.value)} /></label><label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">{tr('إلى أسبوع', 'To week')}</span><input type="number" min={1} className={inputClass} value={block.to_week} onChange={(event) => updateBlock(block.key, 'to_week', event.target.value)} /></label><button type="button" disabled={blocks.length === 1} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))} className="mb-0.5 rounded-xl p-2.5 text-red-600 hover:bg-red-50 disabled:opacity-30" aria-label={`${tr('حذف الفترة', 'Delete block')} ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>
        </section>

        <section className="rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><MapPin className="h-4 w-4 text-teal-700" />{tr('مواقع التدريب والسعة لكل فترة', 'Training sites and capacity per block')}</h3><p className="mt-1 text-[11px] text-slate-500">{tr('السعة تُطبق على الموقع في كل فترة سريرية بشكل مستقل.', 'Capacity is applied independently for each training site in every clinical block.')}</p></div>
          <div className="grid max-h-64 gap-2 overflow-y-auto p-4 md:grid-cols-2">{sites.map((site) => { const selected = siteCapacities[site.id] !== undefined; return <div key={site.id} className={`rounded-xl border p-3 ${selected ? 'border-teal-300 bg-teal-50/60' : 'border-slate-200'}`}><div className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={selected} onChange={(event) => toggleSite(site.id, event.target.checked, site.max_students_per_period)} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-800">{ar ? site.name_ar : site.name_en || site.name_ar}</p><p className="font-mono text-[10px] text-slate-500">{site.site_code}</p></div>{selected && <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">{tr('السعة', 'Capacity')}<input type="number" min={1} max={500} value={siteCapacities[site.id]} onChange={(event) => setSiteCapacities((current) => ({ ...current, [site.id]: Number(event.target.value) }))} className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center" /></label>}</div></div>; })}</div>
          {!optionsQuery.isLoading && sites.length === 0 && <p className="p-5 text-center text-xs font-bold text-amber-700">{tr('لا توجد مواقع تدريب فعّالة. أضف مواقع التدريب من الدليل أولًا.', 'There are no active training sites. Add training sites from the directory first.')}</p>}
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>{tr('إلغاء', 'Cancel')}</Button><Button type="submit" isLoading={saving} disabled={optionsQuery.isLoading || years.length === 0 || sites.length === 0}>{tr('حفظ الدورة وفتحها للتوزيع', 'Save rotation and open it for distribution')}</Button></div>
      </form>
    </Modal>
  );
}
