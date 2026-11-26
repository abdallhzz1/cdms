import { apiFetch, apiFetchEnvelope, type ApiFetchOptions } from './client';

// Same-origin header also protects these cookies when Sanctum's domain list changes.
export const clinicalPortalFetch = <T,>(path: string, options: ApiFetchOptions = {}) => {
  const headers = new Headers(options.headers); headers.set('X-Requested-With', 'XMLHttpRequest');
  return apiFetch<T>(path, { ...options, headers });
};
export const clinicalFeedbackEnvelope = <T,>(path: string) => apiFetchEnvelope<T>(path);

export type FeedbackRotation = {
  id: number; course_ar: string; course_en: string; year: string; period_ar: string; period_en: string;
  academic_level: string; window_id: number | null; is_enabled: boolean; from_week: number; ends_on: string | null; weeks: number;
};
export type ClinicalStudentSlot = {
  key: string; rotation_id: number; academic_year: string | null; course_id: number; course_ar: string; course_en: string; period_ar: string; period_en: string;
  kind: 'weekly' | 'period'; from_week: number; to_week: number; starts_on: string; ends_on: string;
  supervisor_ar: string | null; supervisor_en: string | null; feedback_done: boolean; can_participate: boolean; mark_ready: boolean;
  mark?: { score: number; max_score: number; revision: number };
};
