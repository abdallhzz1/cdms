import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalSchedulePage } from './ClinicalSchedulePage';
import { PublicClinicalSchedulePage } from '@/pages/public/PublicClinicalSchedulePage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const item = {
  assignment_id: 7, distribution_version_id: 2,
  student: { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', full_name: 'Clinical Student', registration_status: 'active', photo_url: '/storage/students/4.jpg' },
  group: { id: 1, name: 'L' }, subgroup: { id: 2, name: 'L1', group: { id: 1, name: 'L' } },
  rotation: { id: 3, code: 'MED401', name: 'Surgery', academic_year_id: 1, academic_level: 'fourth', start_date: '2026-09-01', end_date: '2026-11-01' },
  clinical_period: { id: 5, code: 'P1', name_ar: 'الفترة الأولى', name_en: 'Period 1', sequence: 1 },
  course: { id: 6, code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' },
  block: { id: 8, block_code: 'W1', from_week: 1, to_week: 1, start_date: '2026-09-01', end_date: '2026-09-07' },
  training_site: { id: 9, name: 'Ahli', name_ar: 'الأهلي', name_en: 'Ahli' }, department: null,
  supervisor: { id: 10, full_name_ar: 'د. مشرف', full_name_en: 'Dr Supervisor', name: 'Dr Supervisor', avatar_url: '/storage/avatars/10.jpg', work_schedule: [], work_locations: [] },
};

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('clinical schedule profile photos', () => {
  it('shows enlargeable student and supervisor photos in the administrative table', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], assigned_levels: ['fourth'], permissions: [{ code: 'clinical_schedule.view', scope: 'global' }] });
      if (url.includes('/operational/clinical-schedule-options')) return envelope({ rotations: [], periods: [], academic_years: [], sites: [] });
      if (url.includes('/operational/clinical-schedule?')) return envelope({ current_page: 1, data: [item], from: 1, last_page: 1, next_page_url: null, per_page: 50, prev_page_url: null, to: 1, total: 1 });
      if (url.includes('/student-schedule-portal')) return envelope({ is_enabled: true, public_url: '/portal/student-lookup', updated_at: null, updated_by: null });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<ClinicalSchedulePage />, { route: '/clinical/schedule' });
    expect(await screen.findByRole('button', { name: 'Enlarge student photo' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge supervisor photo' }));
    expect(screen.getByRole('dialog', { name: 'Dr Supervisor' })).toBeVisible();
  });

  it('shows enlargeable photos for the student, supervisor, and all group members in the public lookup', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(null);
      if (url.includes('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
      if (url.includes('/public/student-schedule/request-otp')) return envelope({ otp_required: false, access_token: 'x'.repeat(80), expires_in_seconds: 1200 });
      if (url.endsWith('/public/student-schedule') && init?.method === 'POST') return envelope({ student: { name: 'طالب سريري', name_en: 'Clinical Student', university_number: '22310001', academic_level: 'fourth', photo_url: '/storage/students/4.jpg' }, group: { name: 'L' }, subgroup: { name: 'L1' }, members: [{ name: 'طالب سريري', name_en: 'Clinical Student', photo_url: '/storage/students/4.jpg', is_current_student: true }, { name: 'زميل', name_en: 'Teammate', photo_url: '/storage/students/5.jpg', is_current_student: false }], schedule: [item] });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<PublicClinicalSchedulePage />, { route: '/portal/student-lookup' });
    await userEvent.type(screen.getByPlaceholderText('Example: 22210466'), '22310001');
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
    expect((await screen.findAllByRole('button', { name: 'Enlarge student photo' })).length).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge supervisor photo' }));
    const dialog = screen.getByRole('dialog', { name: 'Dr Supervisor' });
    expect(within(dialog).getByRole('img', { name: 'Dr Supervisor' })).toBeVisible();
  });
});
