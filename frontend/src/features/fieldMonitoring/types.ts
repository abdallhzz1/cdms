export type FieldFormType = 'assistant_follow_up' | 'department_periodic_report' | 'director_supervisory_visit';
export type FieldFormStatus = 'draft' | 'submitted' | 'acknowledged' | 'action_required' | 'returned_for_revision' | 'completed';

export interface NamedOption { id: number; name_ar?: string; name_en?: string | null; name?: string; code?: string; }
export interface FieldMonitoringOptions {
  allowed_types: FieldFormType[];
  recipients: Partial<Record<FieldFormType, { id: number; name: string } | null>>;
  departments: NamedOption[];
  training_sites: NamedOption[];
  courses: NamedOption[];
  creator: { id: number; name: string };
}

export interface FieldFormRecord {
  id: number;
  public_id: string;
  reference_number: string;
  type: FieldFormType;
  status: FieldFormStatus;
  revision: number;
  locale: 'ar' | 'en';
  creator: { id: number; name: string };
  recipient: { id: number; name: string };
  department?: NamedOption | null;
  training_site?: NamedOption | null;
  course?: NamedOption | null;
  activity_date?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  is_urgent: boolean;
  latest_review_note?: string | null;
  submitted_at?: string | null;
  acknowledged_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  payload?: Record<string, any>;
  events?: Array<{ id: number; action: string; from_status?: string | null; to_status?: string | null; note?: string | null; user?: { id: number; name: string } | null; created_at: string }>;
}

export interface FieldFormDraft {
  type: FieldFormType;
  locale: 'ar' | 'en';
  department_id: number | '';
  training_site_id: number | '';
  course_id: number | '';
  activity_date: string;
  period_from: string;
  period_to: string;
  payload: Record<string, any>;
}

export interface FieldMonitoringScheduleGroup {
  key: string;
  rotation_id: number;
  course: NamedOption | null;
  department: NamedOption | null;
  group: { id: number; name: string };
  subgroup: { id: number; name: string };
  supervisors: Array<{ id: number; name_ar?: string | null; name_en?: string | null }>;
  student_count: number;
}

export interface FieldMonitoringContext {
  groups?: FieldMonitoringScheduleGroup[];
  specialties?: Array<{ code: string; name_ar: string; name_en: string }>;
  totals?: { groups: number; students: number; supervisors: number };
  department_id?: number;
  summary?: {
    training_sites: NamedOption[];
    courses: NamedOption[];
    student_count: number;
    supervisor_count: number;
  };
}
