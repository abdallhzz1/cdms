import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ASSISTANT_ITEMS, DEPARTMENT_ITEMS, OVERALL_ITEMS } from './definitions';
import type { FieldFormDraft, FieldMonitoringOptions } from './types';

interface Props {
  draft: FieldFormDraft;
  options: FieldMonitoringOptions;
  locale: 'ar' | 'en';
  disabled?: boolean;
  onChange: (draft: FieldFormDraft) => void;
}

const inputClass = 'mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500';
const textareaClass = 'mt-2 min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium leading-6 text-slate-800 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50';

export function ClinicalFieldMonitoringForm({ draft, options, locale, disabled = false, onChange }: Props) {
  const ar = locale === 'ar';
  const tr = (a: string, e: string) => ar ? a : e;
  const named = (item: { name_ar?: string; name_en?: string | null; name?: string; code?: string }) => ar ? (item.name_ar || item.name || '') : (item.name_en || item.name_ar || item.name || '');
  const setRoot = (key: keyof FieldFormDraft, value: any) => onChange({ ...draft, [key]: value });
  const setPayload = (path: string, value: any) => {
    const payload = structuredClone(draft.payload);
    const parts = path.split('.');
    let cursor: any = payload;
    parts.slice(0, -1).forEach(part => { if (!cursor[part]) cursor[part] = {}; cursor = cursor[part]; });
    cursor[parts.at(-1)!] = value;
    onChange({ ...draft, payload });
  };
  const urgent = Boolean(draft.payload.urgent?.direct_risk)
    || ['partial', 'no'].includes(draft.payload.responses?.patient_safety?.rating)
    || draft.payload.specialties?.some((item: any) => item.rating === 'unsatisfactory')
    || draft.payload.overall?.training_environment_safety?.rating === 'poor';

  const commonSite = draft.type !== 'department_periodic_report';
  return <div className="overflow-hidden rounded-xl border border-slate-300 bg-white px-4 sm:px-7">
    <Section title={tr('بيانات النموذج', 'Form information')}>
      <div className="grid gap-4 sm:grid-cols-2">
        {commonSite && <SelectField label={tr('المستشفى أو موقع التدريب', 'Hospital or training site')} value={draft.training_site_id} required disabled={disabled} onChange={value => setRoot('training_site_id', Number(value) || '')}>
          <option value="">{tr('اختر الموقع', 'Select site')}</option>{options.training_sites.map(item => <option key={item.id} value={item.id}>{named(item)}</option>)}
        </SelectField>}
        {draft.type === 'assistant_follow_up' && <SelectField label={tr('المساق', 'Course')} value={draft.course_id} disabled={disabled} onChange={value => setRoot('course_id', Number(value) || '')}>
          <option value="">{tr('اختياري', 'Optional')}</option>{options.courses.map(item => <option key={item.id} value={item.id}>{item.code} · {named(item)}</option>)}
        </SelectField>}
        {commonSite && <InputField type="date" label={tr('تاريخ الزيارة', 'Visit date')} value={draft.activity_date} required disabled={disabled} onChange={value => setRoot('activity_date', value)} />}
        {draft.type === 'department_periodic_report' && <><InputField type="date" label={tr('بداية الفترة', 'Period from')} value={draft.period_from} required disabled={disabled} onChange={value => setRoot('period_from', value)} /><InputField type="date" label={tr('نهاية الفترة', 'Period to')} value={draft.period_to} required disabled={disabled} onChange={value => setRoot('period_to', value)} /></>}
        <div className="self-end border-s-2 border-teal-600 px-3 py-1 text-xs"><p className="font-bold text-slate-500">{tr('يرسل إلى', 'Sent to')}</p><p className="mt-1 font-black text-slate-900">{options.recipients[draft.type]?.name || tr('لا يوجد مستلم مفعّل', 'No active recipient')}</p></div>
      </div>
    </Section>

    {draft.type === 'assistant_follow_up' && <AssistantForm draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />}
    {draft.type === 'department_periodic_report' && <DepartmentForm draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />}
    {draft.type === 'director_supervisory_visit' && <DirectorForm draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} locale={locale} />}

    <FollowUp draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />
    <UrgentSection urgent={urgent} draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />
  </div>;
}

function AssistantForm({ draft, disabled, tr, setPayload }: SharedProps) {
  return <>
    <Section title={tr('معلومات المجموعة والزيارة', 'Group and visit details')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField label={tr('التخصص السريري', 'Clinical specialty')} value={draft.payload.context?.clinical_specialty || ''} required disabled={disabled} onChange={v => setPayload('context.clinical_specialty', v)} />
        <InputField label={tr('المساق أو الدورة السريرية', 'Course or rotation')} value={draft.payload.context?.rotation_name || ''} required disabled={disabled} onChange={v => setPayload('context.rotation_name', v)} />
        <InputField label={tr('المشرف السريري', 'Clinical supervisor')} value={draft.payload.context?.clinical_supervisor || ''} required disabled={disabled} onChange={v => setPayload('context.clinical_supervisor', v)} />
        <InputField label={tr('مجموعة الطلبة', 'Student group')} value={draft.payload.context?.student_group || ''} required disabled={disabled} onChange={v => setPayload('context.student_group', v)} />
        <InputField type="number" min="0" label={tr('عدد الحاضرين', 'Students present')} value={draft.payload.context?.students_present ?? 0} required disabled={disabled} onChange={v => setPayload('context.students_present', Number(v))} />
        <InputField type="number" min="0" label={tr('عدد الغائبين', 'Students absent')} value={draft.payload.context?.students_absent ?? 0} required disabled={disabled} onChange={v => setPayload('context.students_absent', Number(v))} />
      </div>
    </Section>
    <Section title={tr('قائمة المتابعة', 'Field monitoring checklist')} description={tr('تظهر الملاحظة وتصبح مطلوبة عند اختيار جزئيًا أو لا.', 'A comment is required when Partly or No is selected.')}>
      <ResponseList items={ASSISTANT_ITEMS} root="responses" ratings={[['yes','نعم','Yes'],['partial','جزئيًا','Partly'],['no','لا','No']]} draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />
    </Section>
    <Section title={tr('الملاحظات والتحسين', 'Observations and improvement')}>
      <div className="grid gap-4"><TextArea label={tr('ملاحظات الزيارة', 'Visit observations')} value={draft.payload.observations || ''} disabled={disabled} onChange={v => setPayload('observations', v)} /><TextArea label={tr('مجالات التحسين', 'Improvement areas')} value={draft.payload.improvements || ''} disabled={disabled} onChange={v => setPayload('improvements', v)} /><TextArea label={tr('الإجراء المقترح', 'Proposed action')} value={draft.payload.proposed_action || ''} disabled={disabled} onChange={v => setPayload('proposed_action', v)} /></div>
    </Section>
  </>;
}

function DepartmentForm({ draft, disabled, tr, setPayload }: SharedProps) {
  return <>
    <Section title={tr('بيانات التقرير', 'Report information')}>
      <div className="grid gap-4 sm:grid-cols-2"><InputField label={tr('رئيس القسم', 'Department head')} value={draft.payload.context?.department_head || ''} required disabled={disabled} onChange={v => setPayload('context.department_head', v)} /><InputField label={tr('مواقع التدريب المشمولة', 'Training sites covered')} value={draft.payload.context?.training_sites || ''} disabled={disabled} onChange={v => setPayload('context.training_sites', v)} /><InputField label={tr('المساقات أو الدورات', 'Courses or rotations')} value={draft.payload.context?.courses_rotations || ''} disabled={disabled} onChange={v => setPayload('context.courses_rotations', v)} /><InputField type="number" min="0" label={tr('عدد الطلبة', 'Students')} value={draft.payload.context?.student_count ?? 0} required disabled={disabled} onChange={v => setPayload('context.student_count', Number(v))} /><InputField type="number" min="0" label={tr('عدد المشرفين', 'Supervisors')} value={draft.payload.context?.supervisor_count ?? 0} required disabled={disabled} onChange={v => setPayload('context.supervisor_count', Number(v))} /><SelectField label={tr('حالة إجراءات الفترة السابقة', 'Previous-period actions')} value={draft.payload.previous_period_status || 'none'} disabled={disabled} onChange={v => setPayload('previous_period_status', v)}><option value="none">{tr('لا يوجد', 'None')}</option><option value="completed">{tr('مكتمل', 'Completed')}</option><option value="in_progress">{tr('قيد التنفيذ', 'In progress')}</option><option value="not_implemented">{tr('لم ينفذ', 'Not implemented')}</option></SelectField></div>
    </Section>
    <Section title={tr('تقييم الفترة', 'Period assessment')} description={tr('خيارات لم يتم التحقق ولا ينطبق متاحة في اللغتين.', 'Not verified and Not applicable are available in both languages.')}>
      <ResponseList items={DEPARTMENT_ITEMS} root="responses" ratings={[['yes','نعم','Yes'],['partial','جزئيًا','Partly'],['no','لا','No'],['not_verified','لم يتم التحقق','Not verified'],['not_applicable','لا ينطبق','Not applicable']]} draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />
    </Section>
    <Section title={tr('الخلاصة والتحسينات', 'Summary and improvements')}>
      <div className="grid gap-4"><TextArea label={tr('نقاط القوة', 'Strengths')} value={draft.payload.strengths || ''} disabled={disabled} onChange={v => setPayload('strengths', v)} /><TextArea label={tr('التحديات', 'Challenges')} value={draft.payload.challenges || ''} disabled={disabled} onChange={v => setPayload('challenges', v)} /><TextArea label={tr('الدعم أو القرار المطلوب من الدائرة', 'Support or decision requested')} value={draft.payload.support_requested || ''} disabled={disabled} onChange={v => setPayload('support_requested', v)} /></div>
      <ActionsEditor root="improvements" draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} />
    </Section>
  </>;
}

function DirectorForm({ draft, disabled, tr, setPayload, locale }: SharedProps & { locale: 'ar' | 'en' }) {
  const specialties: any[] = draft.payload.specialties || [];
  const changeSpecialty = (index: number, key: string, value: string) => { const items = structuredClone(specialties); items[index][key] = value; if (key === 'name_ar' || key === 'name_en') items[index].name = value; setPayload('specialties', items); };
  return <>
    <Section title={tr('معلومات الزيارة الإشرافية', 'Supervisory visit information')}>
      <div className="grid gap-3 sm:grid-cols-2"><SelectField label={tr('نوع الزيارة', 'Visit type')} value={draft.payload.context?.visit_type || 'routine'} disabled={disabled} onChange={v => setPayload('context.visit_type', v)}><option value="routine">{tr('دورية', 'Routine')}</option><option value="follow_up">{tr('متابعة', 'Follow-up')}</option><option value="emergency">{tr('طارئة', 'Emergency')}</option></SelectField><InputField label={tr('ممثلو المستشفى', 'Hospital representatives')} value={draft.payload.context?.representatives || ''} disabled={disabled} onChange={v => setPayload('context.representatives', v)} /></div>
    </Section>
    <Section title={tr('تقييم التخصصات السريرية', 'Clinical specialties assessment')} description={tr('استخدم لم يُقيّم عند عدم توفر أدلة كافية.', 'Use Not assessed when evidence is insufficient.')}>
      <div className="space-y-3">{specialties.map((item, index) => <div key={`${item.code}-${index}`} className="rounded-2xl border border-slate-200 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><InputField label={tr('التخصص', 'Specialty')} value={locale === 'ar' ? (item.name_ar || item.name) : (item.name_en || item.name)} disabled={disabled} onChange={v => changeSpecialty(index, locale === 'ar' ? 'name_ar' : 'name_en', v)} /><SelectField label={tr('التقييم', 'Assessment')} value={item.rating} disabled={disabled} onChange={v => changeSpecialty(index, 'rating', v)}><option value="satisfactory">{tr('مُرضٍ', 'Satisfactory')}</option><option value="needs_improvement">{tr('بحاجة لتحسين', 'Needs improvement')}</option><option value="unsatisfactory">{tr('غير مُرضٍ', 'Unsatisfactory')}</option><option value="not_assessed">{tr('لم يُقيّم', 'Not assessed')}</option></SelectField><SelectField label={tr('أساس التقييم', 'Assessment basis')} value={item.basis || ''} disabled={disabled || item.rating === 'not_assessed'} onChange={v => changeSpecialty(index, 'basis', v)}><option value="">—</option><option value="direct">{tr('زيارة مباشرة', 'Direct observation')}</option><option value="reports">{tr('تقارير', 'Reports')}</option></SelectField><div className="flex items-end gap-2"><InputField label={tr('ملاحظات', 'Notes')} value={item.notes || ''} disabled={disabled} onChange={v => changeSpecialty(index, 'notes', v)} />{!disabled && specialties.length > 1 && <button type="button" onClick={() => setPayload('specialties', specialties.filter((_, i) => i !== index))} className="mb-0.5 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div></div></div>)}</div>
      {!disabled && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setPayload('specialties', [...specialties, { code: `custom_${Date.now()}`, name: '', name_ar: '', name_en: '', rating: 'not_assessed', basis: '', notes: '' }])}><Plus className="me-1 h-4 w-4" />{tr('إضافة تخصص', 'Add specialty')}</Button>}
    </Section>
    <Section title={tr('التقييم العام للمستشفى', 'Overall hospital assessment')}><ResponseList items={OVERALL_ITEMS} root="overall" ratings={[['good','جيد','Good'],['acceptable','مقبول','Acceptable'],['poor','ضعيف','Poor']]} draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} /></Section>
    <Section title={tr('النتائج والإجراءات', 'Findings and actions')}><div className="grid gap-4"><TextArea label={tr('الخلاصة', 'Summary')} value={draft.payload.summary || ''} disabled={disabled} onChange={v => setPayload('summary', v)} /><TextArea label={tr('الإجراءات المطلوبة', 'Required actions')} value={draft.payload.required_actions || ''} disabled={disabled} onChange={v => setPayload('required_actions', v)} /><TextArea label={tr('تدخل العميد المطلوب', 'Dean intervention required')} value={draft.payload.dean_intervention || ''} disabled={disabled} onChange={v => setPayload('dean_intervention', v)} /></div><ActionsEditor root="actions" draft={draft} disabled={disabled} tr={tr} setPayload={setPayload} /></Section>
  </>;
}

function ResponseList({ items, root, ratings, draft, disabled, tr, setPayload }: SharedProps & { items: readonly (readonly [string,string,string])[]; root: string; ratings: readonly (readonly [string,string,string])[] }) {
  return <div className="overflow-hidden rounded-lg border border-slate-300">{items.map(([code, ar, en], index) => { const response = draft.payload[root]?.[code] || {}; const needsComment = ['partial','no','acceptable','poor','needs_improvement','unsatisfactory'].includes(response.rating); return <div key={code} className="grid gap-3 border-b border-slate-200 p-3 last:border-b-0 sm:p-4 lg:grid-cols-[2rem_minmax(14rem,1.2fr)_minmax(10rem,.7fr)_minmax(14rem,1fr)] lg:items-center"><span className="text-xs font-black text-teal-700">{index + 1}.</span><p className="text-sm font-bold leading-6 text-slate-800">{tr(ar,en)}</p><select className={inputClass} value={response.rating || ratings[0][0]} disabled={disabled} onChange={event => setPayload(`${root}.${code}.rating`, event.target.value)}>{ratings.map(([value,a,e]) => <option key={value} value={value}>{tr(a,e)}</option>)}</select><input className={inputClass} value={response.comment || ''} disabled={disabled} required={needsComment} onChange={event => setPayload(`${root}.${code}.comment`, event.target.value)} placeholder={needsComment ? tr('الملاحظة مطلوبة', 'Comment required') : tr('ملاحظة اختيارية', 'Optional comment')} /></div>; })}</div>;
}

function ActionsEditor({ root, draft, disabled, tr, setPayload }: SharedProps & { root: 'actions' | 'improvements' }) {
  const actions: any[] = draft.payload[root] || [];
  const set = (index: number, key: string, value: string) => { const copy = structuredClone(actions); copy[index][key] = value; setPayload(root, copy); };
  return <div className="mt-4"><div className="space-y-3">{actions.map((item, index) => <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><InputField label={tr('المجال أو الموقع', 'Area or site')} value={item.area} disabled={disabled} required onChange={v => set(index,'area',v)} /><InputField label={tr('التحسين المطلوب', 'Improvement required')} value={item.improvement} disabled={disabled} required onChange={v => set(index,'improvement',v)} /><InputField label={tr('الإجراء', 'Action')} value={item.action} disabled={disabled} required onChange={v => set(index,'action',v)} /><InputField label={tr('المسؤول', 'Responsible')} value={item.responsible} disabled={disabled} required onChange={v => set(index,'responsible',v)} /><InputField type="date" label={tr('الموعد النهائي', 'Deadline')} value={item.deadline} disabled={disabled} required onChange={v => set(index,'deadline',v)} /><div className="flex items-end gap-2"><SelectField label={tr('الأولوية', 'Priority')} value={item.priority} disabled={disabled} onChange={v => set(index,'priority',v)}><option value="urgent">{tr('عاجل', 'Urgent')}</option><option value="important">{tr('مهم', 'Important')}</option><option value="routine">{tr('اعتيادي', 'Routine')}</option></SelectField>{!disabled && <button type="button" onClick={() => setPayload(root, actions.filter((_, i) => i !== index))} className="mb-0.5 rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>}</div></div></div>)}</div>{!disabled && <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setPayload(root, [...actions, { area:'', improvement:'', action:'', responsible:'', deadline:'', priority:'routine' }])}><Plus className="me-1 h-4 w-4" />{tr('إضافة إجراء تحسين', 'Add improvement action')}</Button>}</div>;
}

function FollowUp({ draft, disabled, tr, setPayload }: SharedProps) {
  return <Section title={tr('المتابعة اللاحقة', 'Follow-up')}><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={Boolean(draft.payload.follow_up?.required)} disabled={disabled} onChange={event => setPayload('follow_up.required', event.target.checked)} className="h-4 w-4 accent-teal-600" />{tr('تحتاج متابعة لاحقة', 'Follow-up is required')}</label>{draft.payload.follow_up?.required && <div className="w-full sm:max-w-xs"><InputField type="date" label={tr('تاريخ المتابعة', 'Follow-up date')} value={draft.payload.follow_up?.date || ''} required disabled={disabled} onChange={v => setPayload('follow_up.date', v)} /></div>}</div></Section>;
}

function UrgentSection({ urgent, draft, disabled, tr, setPayload }: SharedProps & { urgent: boolean }) {
  return <Section title={tr('السلامة والحالات العاجلة', 'Safety and urgent matters')}>
    <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold leading-5 text-rose-800"><input type="checkbox" checked={Boolean(draft.payload.urgent?.direct_risk)} disabled={disabled} onChange={event => setPayload('urgent.direct_risk', event.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" /><span>{tr('يوجد خطر مباشر أو أمر عاجل يستلزم إشعار الجهة المستلمة فورًا.', 'A direct risk or urgent matter requires immediate notification of the recipient.')}</span></label>
    {urgent && <div className="mt-3 rounded-2xl border border-rose-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-xs font-black text-rose-700"><AlertTriangle className="h-4 w-4" />{tr('توثيق الحالة العاجلة إلزامي', 'Urgent-case documentation is required')}</div><div className="grid gap-3 lg:grid-cols-3"><TextArea label={tr('تفاصيل الحالة', 'Case details')} value={draft.payload.urgent?.details || ''} required disabled={disabled} onChange={v => setPayload('urgent.details', v)} /><TextArea label={tr('الإجراء الفوري المتخذ', 'Immediate action taken')} value={draft.payload.urgent?.action_taken || ''} required disabled={disabled} onChange={v => setPayload('urgent.action_taken', v)} /><InputField type="datetime-local" label={tr('تاريخ ووقت التبليغ', 'Notification date and time')} value={draft.payload.urgent?.notified_at || ''} required disabled={disabled} onChange={v => setPayload('urgent.notified_at', v)} /></div></div>}
  </Section>;
}

interface SharedProps { draft: FieldFormDraft; disabled: boolean; tr: (a:string,e:string)=>string; setPayload: (path:string,value:any)=>void; }
function Section({ title, description, children }: { title:string; description?:string; children:ReactNode }) { return <section className="border-b border-slate-200 py-6 last:border-b-0 sm:py-7"><div className="mb-5"><h3 className="text-base font-black text-slate-900">{title}</h3>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>{children}</section>; }
function InputField({ label, value, onChange, disabled, required, type='text', min }: { label:string; value:any; onChange:(v:string)=>void; disabled?:boolean; required?:boolean; type?:string; min?:string }) { return <label className="block w-full text-xs font-bold text-slate-700">{label}{required && <span className="ms-1 text-rose-500">*</span>}<input className={inputClass} type={type} min={min} value={value ?? ''} disabled={disabled} required={required} onChange={event=>onChange(event.target.value)} /></label>; }
function SelectField({ label, value, onChange, disabled, required, children }: { label:string; value:any; onChange:(v:string)=>void; disabled?:boolean; required?:boolean; children:ReactNode }) { return <label className="block w-full text-xs font-bold text-slate-700">{label}{required && <span className="ms-1 text-rose-500">*</span>}<select className={inputClass} value={value ?? ''} disabled={disabled} required={required} onChange={event=>onChange(event.target.value)}>{children}</select></label>; }
function TextArea({ label, value, onChange, disabled, required }: { label:string; value:string; onChange:(v:string)=>void; disabled?:boolean; required?:boolean }) { return <label className="block text-xs font-bold text-slate-700">{label}{required && <span className="ms-1 text-rose-500">*</span>}<textarea className={textareaClass} value={value} disabled={disabled} required={required} onChange={event=>onChange(event.target.value)} /></label>; }
