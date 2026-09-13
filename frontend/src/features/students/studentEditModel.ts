export type StudentEditForm = {
  university_number: string;
  full_name_ar: string;
  full_name_en: string;
  academic_level: string;
  batch_year: number;
  registration_status: string;
  academic_registration_status: string;
  university_email: string;
  phone: string;
  gpa: string;
  warning_count: number;
  credit_hours_passed: string;
  notes: string;
  group_registration_cycle_id: string;
  main_group_code: string;
};

export const emptyStudentEditForm: StudentEditForm = {
  university_number: '',
  full_name_ar: '',
  full_name_en: '',
  academic_level: 'fourth',
  batch_year: 2022,
  registration_status: 'active',
  academic_registration_status: 'registered',
  university_email: '',
  phone: '',
  gpa: '',
  warning_count: 0,
  credit_hours_passed: '',
  notes: '',
  group_registration_cycle_id: '',
  main_group_code: '',
};

export function studentEditPath(studentId: string | number): string {
  return `/students/${studentId}?edit=1`;
}

export function buildStudentEditForm(student: Record<string, unknown>): StudentEditForm {
  const academicLevel = String(student.academic_level || 'fourth');
  const defaultBatchYear = academicLevel === 'fourth' ? 2022 : academicLevel === 'fifth' ? 2021 : 2020;

  return {
    university_number: String(student.university_number || ''),
    full_name_ar: String(student.full_name_ar || ''),
    full_name_en: String(student.full_name_en || ''),
    academic_level: academicLevel,
    batch_year: Number(student.batch_year || defaultBatchYear),
    registration_status: String(student.registration_status || 'active'),
    academic_registration_status: String(student.academic_registration_status || 'registered'),
    university_email: String(student.university_email || ''),
    phone: String(student.phone || ''),
    gpa: student.gpa !== null && student.gpa !== undefined ? String(student.gpa) : '',
    warning_count: Number(student.warning_count || 0),
    credit_hours_passed: student.credit_hours_passed !== null && student.credit_hours_passed !== undefined
      ? String(student.credit_hours_passed)
      : '',
    notes: String(student.notes || ''),
    group_registration_cycle_id: student.registration_cycle_id ? String(student.registration_cycle_id) : '',
    main_group_code: String(student.registration_main_group || ''),
  };
}

export function buildStudentUpdatePayload(form: StudentEditForm) {
  return {
    university_number: form.university_number.trim(),
    full_name_ar: form.full_name_ar.trim(),
    full_name_en: form.full_name_en.trim(),
    academic_level: form.academic_level,
    batch_year: Number(form.batch_year),
    registration_status: form.registration_status,
    academic_registration_status: form.academic_registration_status,
    university_email: form.university_email.trim() || `${form.university_number.trim()}@students.hebron.edu`,
    phone: form.phone.trim(),
    gpa: form.gpa !== '' ? Number(form.gpa) : null,
    warning_count: Number(form.warning_count || 0),
    credit_hours_passed: form.credit_hours_passed !== '' ? Number(form.credit_hours_passed) : null,
    notes: form.notes.trim(),
    group_registration_cycle_id: form.group_registration_cycle_id ? Number(form.group_registration_cycle_id) : null,
    main_group_code: form.main_group_code || null,
  };
}
