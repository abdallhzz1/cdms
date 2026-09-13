import { describe, expect, it } from 'vitest';
import { buildStudentEditForm, buildStudentUpdatePayload, studentEditPath } from './studentEditModel';

describe('student edit model', () => {
  it('opens list edits through the profile editor entry point', () => {
    expect(studentEditPath(42)).toBe('/students/42?edit=1');
  });

  it('keeps only fields used by the student workflow when opening the editor', () => {
    const form = buildStudentEditForm({
      university_number: '22011001',
      full_name_ar: 'أحمد علي',
      full_name_en: 'Ahmad Ali',
      academic_level: 'fifth',
      batch_year: 2021,
      registration_status: 'active',
      academic_registration_status: 'registered',
      university_email: 'student@students.hebron.edu',
      phone: '0599000000',
      gpa: 83.5,
      warning_count: 1,
      credit_hours_passed: 142,
      notes: 'متابعة',
      registration_cycle_id: 9,
      registration_main_group: 'M',
      national_id: '999999999',
      city: 'الخليل',
      gender: 'male',
      guardian_phone: '0566000000',
      clinical_fees_status: 'paid',
      has_amboss_subscription: true,
    });

    expect(form).toEqual({
      university_number: '22011001',
      full_name_ar: 'أحمد علي',
      full_name_en: 'Ahmad Ali',
      academic_level: 'fifth',
      batch_year: 2021,
      registration_status: 'active',
      academic_registration_status: 'registered',
      university_email: 'student@students.hebron.edu',
      phone: '0599000000',
      gpa: '83.5',
      warning_count: 1,
      credit_hours_passed: '142',
      notes: 'متابعة',
      group_registration_cycle_id: '9',
      main_group_code: 'M',
    });
  });

  it('builds a normalized update without overwriting removed profile fields', () => {
    const payload = buildStudentUpdatePayload({
      university_number: '22011001',
      full_name_ar: 'أحمد علي',
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
    });

    expect(payload).toEqual({
      university_number: '22011001',
      full_name_ar: 'أحمد علي',
      full_name_en: '',
      academic_level: 'fourth',
      batch_year: 2022,
      registration_status: 'active',
      academic_registration_status: 'registered',
      university_email: '22011001@students.hebron.edu',
      phone: '',
      gpa: null,
      warning_count: 0,
      credit_hours_passed: null,
      notes: '',
      group_registration_cycle_id: null,
      main_group_code: null,
    });
  });
});
