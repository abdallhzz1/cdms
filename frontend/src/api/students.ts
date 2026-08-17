import { apiFetch } from './client';

export interface StudentProfile {
  id: number;
  university_number: string;
  full_name_ar: string;
  full_name_en: string | null;
  national_id: string | null;
  gender: string | null;
  date_of_birth: string | null;
  city: string | null;
  phone: string | null;
  guardian_phone: string | null;
  university_email: string | null;
  academic_level: string;
  registration_status: string;
  gpa: string | null;
  credit_hours_passed: number | null;
  warning_count: number;
  clinical_fees_status: string;
  has_amboss_subscription: boolean;
  notes: string | null;
  academic_year?: { code?: string; name?: string };
  academic_advisor?: { full_name_ar?: string; full_name_en?: string };
}

export function getStudent(studentId: string): Promise<StudentProfile> {
  return apiFetch<StudentProfile>(`/students/${studentId}`);
}
