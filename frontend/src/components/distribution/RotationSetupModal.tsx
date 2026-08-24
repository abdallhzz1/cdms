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
  fourth: 'السنة الرابعة',
  fifth: 'السنة الخامسة',
  sixth: 'السنة السادسة',
} as const;

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100';

export function RotationSetupModal({ isOpen, onClose, onCreated }: RotationSetupModalProps) {
  const { locale } = useI18n();
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
    if (!yearId || !name.trim() || !code.trim()) return setError('أكمل العام والمستوى واسم ورمز الدورة.');
    if (cleanBlocks.length === 0 || cleanBlocks.some((block) => !block.block_code || block.from_week < 1 || block.to_week < block.from_week)) {
      return setError('راجع الفترات السريرية: يجب أن يكون لكل فترة رمز ونطاق أسابيع صحيح.');
    }
    if (new Set(cleanBlocks.map((block) => block.block_code.toUpperCase())).size !== cleanBlocks.length) {
      return setError('رموز الفترات السريرية يجب ألا تتكرر.');
    }
    const orderedBlocks = [...cleanBlocks].sort((a, b) => a.from_week - b.from_week);
    if (orderedBlocks.some((block, index) => index > 0 && block.from_week <= orderedBlocks[index - 1].to_week)) {
      return setError('الفترات السريرية لا يجوز أن تتداخل في الأسابيع.');
    }
    const selectedSites = Object.entries(siteCapacities).map(([siteId, capacity]) => ({
      site_id: Number(siteId),
      max_students: Number(capacity),
    }));
    if (selectedSites.length === 0) return setError('اختر موقع تدريب واحدًا على الأقل وحدد سعته.');
    if (selectedSites.some((site) => site.max_students < 1)) return setError('سعة موقع التدريب يجب أن تكون طالبًا واحدًا على الأقل.');
    if (startDate && endDate && endDate < startDate) return setError('تاريخ نهاية الدورة يجب ألا يسبق تاريخ بدايتها.');

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
        setError('تعذر حفظ الدورة السريرية. حاول مرة أخرى.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="إعداد دورة سريرية جديدة" maxWidth="2xl">
      <form onSubmit={submit} className="space-y-5" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-xs leading-6 text-teal-900">
          عرّف الدورة مرة واحدة، ثم ستظهر مجموعات الطلبة المطابقة للعام والمستوى في مساحة التوزيع.
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}
        {optionsQuery.isError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">تعذر تحميل الأعوام الأكاديمية ومواقع التدريب.</div>}

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">العام الأكاديمي</span><select className={inputClass} value={yearId} onChange={(event) => setYearId(event.target.value)} disabled={optionsQuery.isLoading}><option value="">اختر العام</option>{years.map((year) => <option key={year.id} value={year.id}>{year.code}{year.is_current ? ' — الحالي' : ''}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">المستوى</span><select className={inputClass} value={level} onChange={(event) => setLevel(event.target.value as CreateRotationPayload['academic_level'])}>{Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">اسم الدورة</span><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: دورة الباطني الأولى" maxLength={255} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">رمز الدورة</span><input className={inputClass} dir="ltr" value={code} onChange={(event) => setCode(event.target.value)} placeholder="مثال: IM-01" maxLength={50} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">تاريخ البداية (اختياري)</span><input type="date" className={inputClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
          <label className="space-y-1.5"><span className="text-xs font-bold text-slate-600">تاريخ النهاية (اختياري)</span><input type="date" className={inputClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        </div>

        <section className="rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><CalendarRange className="h-4 w-4 text-teal-700" />الفترات السريرية</h3><p className="mt-1 text-[11px] text-slate-500">مدة الدورة المحسوبة: {durationWeeks} أسبوع</p></div>
            <Button type="button" variant="outline" size="sm" onClick={addBlock}><Plus className="ms-1 h-4 w-4" />إضافة فترة</Button>
          </div>
          <div className="space-y-2 p-4">{blocks.map((block, index) => <div key={block.key} className="grid items-end gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">رمز الفترة</span><input className={inputClass} dir="ltr" value={block.block_code} onChange={(event) => updateBlock(block.key, 'block_code', event.target.value)} /></label><label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">من أسبوع</span><input type="number" min={1} className={inputClass} value={block.from_week} onChange={(event) => updateBlock(block.key, 'from_week', event.target.value)} /></label><label className="space-y-1"><span className="text-[11px] font-bold text-slate-500">إلى أسبوع</span><input type="number" min={1} className={inputClass} value={block.to_week} onChange={(event) => updateBlock(block.key, 'to_week', event.target.value)} /></label><button type="button" disabled={blocks.length === 1} onClick={() => setBlocks((current) => current.filter((item) => item.key !== block.key))} className="mb-0.5 rounded-xl p-2.5 text-red-600 hover:bg-red-50 disabled:opacity-30" aria-label={`حذف الفترة ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>
        </section>

        <section className="rounded-2xl border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><MapPin className="h-4 w-4 text-teal-700" />مواقع التدريب والسعة لكل فترة</h3><p className="mt-1 text-[11px] text-slate-500">السعة تُطبق على الموقع في كل فترة سريرية بشكل مستقل.</p></div>
          <div className="grid max-h-64 gap-2 overflow-y-auto p-4 md:grid-cols-2">{sites.map((site) => { const selected = siteCapacities[site.id] !== undefined; return <div key={site.id} className={`rounded-xl border p-3 ${selected ? 'border-teal-300 bg-teal-50/60' : 'border-slate-200'}`}><div className="flex items-center gap-3"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={selected} onChange={(event) => toggleSite(site.id, event.target.checked, site.max_students_per_period)} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-800">{locale === 'ar' ? site.name_ar : site.name_en || site.name_ar}</p><p className="font-mono text-[10px] text-slate-500">{site.site_code}</p></div>{selected && <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">السعة<input type="number" min={1} max={500} value={siteCapacities[site.id]} onChange={(event) => setSiteCapacities((current) => ({ ...current, [site.id]: Number(event.target.value) }))} className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center" /></label>}</div></div>; })}</div>
          {!optionsQuery.isLoading && sites.length === 0 && <p className="p-5 text-center text-xs font-bold text-amber-700">لا توجد مواقع تدريب فعّالة. أضف مواقع التدريب من الدليل أولًا.</p>}
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button><Button type="submit" isLoading={saving} disabled={optionsQuery.isLoading || years.length === 0 || sites.length === 0}>حفظ الدورة وفتحها للتوزيع</Button></div>
      </form>
    </Modal>
  );
}
