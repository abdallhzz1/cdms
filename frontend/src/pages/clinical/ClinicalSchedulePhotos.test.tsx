import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
const dailyGroup = {
  site: { id: 9, name_ar: 'الأهلي', name_en: 'Ahli' }, rotation_id: 3,
  course: { id: 6, code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' }, academic_year: { id: 1, code: '2026-2027' },
  group: { id: 1, name: 'L' }, subgroup: { id: 2, name: 'L1' },
  supervisors: [{ id: 10, full_name_ar: 'د. مشرف', full_name_en: 'Dr Supervisor', photo_url: '/storage/avatars/10.jpg' }],
  students: [{ id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', photo_url: '/storage/students/4.jpg', supervisor_ids: [10] }],
};
const weekCounts = (url: string) => {
  const start = new Date(`${new URL(url, 'http://localhost').searchParams.get('week_start')}T12:00:00`);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    return { date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`, group_count: offset === 0 ? 1 : 0 };
  });
};

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('clinical schedule profile photos', () => {
  it('shows enlargeable student and supervisor photos in the administrative table', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], assigned_levels: ['fourth'], permissions: [{ code: 'clinical_schedule.view', scope: 'global' }] });
      if (url.includes('/operational/clinical-schedule-options')) return envelope({ sites: [dailyGroup.site] });
      if (url.includes('/operational/clinical-schedule/weekly-counts?')) return envelope(weekCounts(url));
      if (url.includes('/operational/clinical-schedule/daily-groups?')) return envelope([dailyGroup]);
      if (url.includes('/student-schedule-portal')) return envelope({ is_enabled: true, public_url: '/portal/student-lookup', updated_at: null, updated_by: null });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<ClinicalSchedulePage />, { route: '/clinical/schedule' });
    expect(await screen.findByRole('button', { name: 'Enlarge student photo' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge supervisor photo' }));
    expect(screen.getByRole('dialog', { name: 'Dr Supervisor' })).toBeVisible();
  });

  it('keeps all four filters visible and shows students only after choosing a site', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const otherGroup = { ...dailyGroup, rotation_id: 4, course: { id: 7, code: 'MED402', name_ar: 'الأعصاب', name_en: 'Neurology' }, group: { id: 3, name: 'M' }, subgroup: { id: 4, name: 'M1' }, students: [{ id: 5, university_number: '22310002', full_name_ar: 'طالب آخر', full_name_en: 'Other Student', photo_url: null, supervisor_ids: [10] }] };
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [{ code: 'clinical_schedule.view', scope: 'global' }] });
      if (url.includes('/operational/clinical-schedule-options')) return envelope({ sites: [dailyGroup.site, { id: 10, name_ar: 'المركز الثاني', name_en: 'Second site' }] });
      if (url.includes('/operational/clinical-schedule/weekly-counts?')) return envelope(weekCounts(url));
      if (url.includes('/operational/clinical-schedule/daily-groups?')) return envelope(url.includes('training_site_id=9') ? [dailyGroup, otherGroup] : []);
      if (url.includes('/student-schedule-portal')) return envelope({ is_enabled: true, public_url: '/portal/student-lookup' });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<ClinicalSchedulePage />, { route: '/clinical/schedule' });
    expect(await screen.findByText('Choose a hospital or training site')).toBeVisible();
    expect(screen.queryByText('Clinical Student')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Course')).toBeVisible();
    expect(screen.getByLabelText('Main group')).toBeVisible();
    expect(screen.getByLabelText('Subgroup')).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Hospital or training site'), '9');
    expect(await screen.findByText('Clinical Student')).toBeVisible();
    expect(screen.getByText('Other Student')).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: /Group L.*L1/ })).toBeVisible();
    await userEvent.selectOptions(screen.getByLabelText('Course'), '3');
    expect(screen.queryByText('Other Student')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Main group'), '1');
    await userEvent.selectOptions(screen.getByLabelText('Subgroup'), '2');
    expect(screen.getByText('Clinical Student')).toBeVisible();
  });

  it('shows seven day buttons with group counts and moves between weeks without a date input', async () => {
    localStorage.setItem('cdms.locale', 'en');
    const weeks: string[] = [];
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [{ code: 'clinical_schedule.view', scope: 'global' }] });
      if (url.includes('/operational/clinical-schedule-options')) return envelope({ sites: [dailyGroup.site] });
      if (url.includes('/operational/clinical-schedule/weekly-counts?')) { weeks.push(new URL(url, 'http://localhost').searchParams.get('week_start') || ''); return envelope(weekCounts(url)); }
      if (url.includes('/operational/clinical-schedule/daily-groups?')) return envelope([dailyGroup]);
      if (url.includes('/student-schedule-portal')) return envelope({ is_enabled: true, public_url: '/portal/student-lookup' });
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<ClinicalSchedulePage />, { route: '/clinical/schedule' });
    const days = await screen.findByRole('group', { name: 'Choose a day of the week' });
    expect(within(days).getAllByRole('button')).toHaveLength(7);
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument();
    await waitFor(() => expect(weeks).toHaveLength(1));
    expect(await within(days).findByRole('button', { name: /1 group$/ })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(weeks).toHaveLength(2));
    expect(weeks[1]).not.toBe(weeks[0]);
    expect(within(days).getAllByRole('button').filter(button => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled();
  });

  it('shows enlargeable photos for the student, supervisor, and all group members in the public lookup', async () => {
    localStorage.setItem('cdms.locale', 'en');
    let requested = false;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(null);
      if (url.includes('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
      if (url.includes('/public/student-schedule/request-otp')) { requested = true; return envelope({ otp_required: false, access_token: 'x'.repeat(80), expires_in_seconds: 1200 }); }
      if (url.endsWith('/public/student-schedule') && init?.method === 'POST') return requested
        ? envelope({ student: { name: 'طالب سريري', name_en: 'Clinical Student', university_number: '22310001', academic_level: 'fourth', photo_url: '/storage/students/4.jpg' }, group: { name: 'L' }, subgroup: { name: 'L1' }, members: [{ name: 'طالب سريري', name_en: 'Clinical Student', photo_url: '/storage/students/4.jpg', is_current_student: true }, { name: 'زميل', name_en: 'Teammate', photo_url: '/storage/students/5.jpg', is_current_student: false }], schedule: [item] })
        : new Response(JSON.stringify({ success: false, data: null, message: 'Not verified', errors: {}, meta: {} }), { status: 401, headers: { 'Content-Type': 'application/json' } });
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
