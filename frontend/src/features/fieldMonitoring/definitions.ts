import type { FieldFormDraft, FieldFormStatus, FieldFormType } from './types';

export const FORM_TITLES: Record<FieldFormType, { ar: string; en: string }> = {
  assistant_follow_up: { ar: 'المتابعة الميدانية للتدريب السريري', en: 'Clinical Training Field Follow-up' },
  department_periodic_report: { ar: 'التقرير الدوري لرئيس القسم السريري', en: 'Clinical Department Head Periodic Report' },
  director_supervisory_visit: { ar: 'الزيارة الإشرافية للتدريب السريري', en: 'Clinical Training Supervisory Visit' },
};

export const STATUS_LABELS: Record<FieldFormStatus, { ar: string; en: string; tone: string }> = {
  draft: { ar: 'مسودة', en: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  submitted: { ar: 'بانتظار المراجعة', en: 'Awaiting review', tone: 'bg-sky-50 text-sky-700' },
  acknowledged: { ar: 'تم الاطلاع', en: 'Acknowledged', tone: 'bg-indigo-50 text-indigo-700' },
  action_required: { ar: 'مطلوب إجراء', en: 'Action required', tone: 'bg-amber-50 text-amber-800' },
  returned_for_revision: { ar: 'معاد للتعديل', en: 'Returned for revision', tone: 'bg-orange-50 text-orange-700' },
  completed: { ar: 'مكتمل', en: 'Completed', tone: 'bg-emerald-50 text-emerald-700' },
};

export const ASSISTANT_ITEMS = [
  ['student_attendance', 'حضور الطلبة والتزامهم بالمواعيد', 'Student attendance and punctuality'],
  ['supervisor_attendance', 'حضور المشرف وكفاية الإشراف', 'Supervisor attendance and adequacy'],
  ['active_participation', 'المشاركة الفاعلة للطلبة', 'Active student participation'],
  ['case_availability', 'توفر الحالات وتنوعها', 'Availability and diversity of cases'],
  ['schedule_adherence', 'الالتزام بالخطة والجدول', 'Adherence to the plan and schedule'],
  ['course_alignment', 'التوافق مع أهداف المساق', 'Alignment with course objectives'],
  ['guidance_feedback', 'التوجيه والتغذية الراجعة', 'Guidance and feedback'],
  ['professional_conduct', 'السلوك المهني وحقوق الطلبة', 'Professional conduct and student rights'],
  ['patient_safety', 'سلامة المرضى والسرية ومكافحة العدوى والموافقة', 'Patient safety, confidentiality, infection control and consent'],
  ['training_environment', 'بيئة التدريب والتجهيزات', 'Training environment and facilities'],
] as const;

export const DEPARTMENT_ITEMS = [
  ['supervisor_adequacy', 'كفاية عدد المشرفين', 'Adequacy of supervisors'],
  ['attendance_coverage', 'الحضور وتغطية جدول الإشراف', 'Attendance and supervision coverage'],
  ['plan_alignment', 'تطبيق خطة المساق وأهدافه في جميع المواقع', 'Course plan and objectives across sites'],
  ['case_adequacy', 'كفاية الحالات وتنوعها لكل طالب', 'Case adequacy and diversity per student'],
  ['assessment_feedback', 'التقييم والتغذية الراجعة في الوقت المناسب', 'Timely assessment and feedback'],
  ['patient_safety', 'سلامة المرضى والسرية ومكافحة العدوى والموافقة', 'Patient safety, confidentiality, infection control and consent'],
  ['respectful_environment', 'بيئة محترمة وحقوق الطلبة والشكاوى', 'Respectful environment, student rights and complaints'],
  ['facilities_resources', 'التجهيزات والموارد', 'Facilities and resources'],
  ['hospital_coordination', 'التنسيق مع المستشفى', 'Hospital coordination'],
] as const;

export const OVERALL_ITEMS = [
  ['clinical_supervision', 'جودة الإشراف السريري', 'Quality of clinical supervision'],
  ['learning_opportunities', 'الفرص السريرية والحالات', 'Learning opportunities and cases'],
  ['hospital_cooperation', 'تعاون المستشفى', 'Hospital cooperation'],
  ['training_environment_safety', 'بيئة التدريب وسلامة المرضى', 'Training environment and patient safety'],
] as const;

export const DEFAULT_SPECIALTIES = [
  ['surgery', 'الجراحة', 'Surgery'], ['internal', 'الباطني', 'Internal Medicine'],
  ['obgyn', 'النسائية والتوليد', 'Obstetrics and Gynecology'], ['pediatrics', 'الأطفال', 'Pediatrics'],
  ['emergency', 'الطوارئ', 'Emergency Medicine'], ['orthopedics', 'جراحة العظام', 'Orthopedics'],
  ['specialized_surgery', 'الجراحات التخصصية', 'Specialized Surgery'],
] as const;

const responseMap = (items: readonly (readonly [string, string, string])[], rating: string) => Object.fromEntries(items.map(([code]) => [code, { rating, comment: '' }]));

export function emptyDraft(type: FieldFormType, locale: 'ar' | 'en', creatorName: string): FieldFormDraft {
  const base = { type, locale, department_id: '' as const, training_site_id: '' as const, course_id: '' as const, activity_date: '', period_from: '', period_to: '' };
  if (type === 'assistant_follow_up') return { ...base, payload: {
    context: { clinical_specialty: '', rotation_name: '', clinical_supervisor: '', student_group: '', students_present: 0, students_absent: 0, assistant_name: creatorName },
    responses: responseMap(ASSISTANT_ITEMS, 'yes'), observations: '', improvements: '', proposed_action: '',
    follow_up: { required: false, date: '' }, urgent: { direct_risk: false, details: '', action_taken: '', notified_at: '' },
  }};
  if (type === 'department_periodic_report') return { ...base, payload: {
    context: { department_head: creatorName, training_sites: '', courses_rotations: '', student_count: 0, supervisor_count: 0 },
    responses: responseMap(DEPARTMENT_ITEMS, 'yes'), previous_period_status: 'none', strengths: '', challenges: '', no_major_improvements: false,
    improvements: [], support_requested: '', urgent: { direct_risk: false, details: '', action_taken: '', notified_at: '' },
  }};
  return { ...base, payload: {
    context: { visit_type: 'routine', representatives: '', director_name: creatorName },
    specialties: DEFAULT_SPECIALTIES.map(([code, ar, en]) => ({ code, name: locale === 'ar' ? ar : en, name_ar: ar, name_en: en, rating: 'not_assessed', basis: '', notes: '' })),
    overall: responseMap(OVERALL_ITEMS, 'good'), no_major_improvements: false, actions: [], summary: '', required_actions: '', dean_intervention: '',
    follow_up: { required: false, date: '' }, urgent: { direct_risk: false, details: '', action_taken: '', notified_at: '' },
  }};
}
