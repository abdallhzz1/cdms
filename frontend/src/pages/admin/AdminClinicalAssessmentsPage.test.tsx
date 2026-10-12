import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AdminClinicalAssessmentsPage } from './AdminClinicalAssessmentsPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, errors: {}, meta: {} }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});
const admin = { id: 1, name: 'Admin', email: 'admin@hebron.edu', roles: ['SYS_ADMIN'], permissions: [] };
const overview = {
  counts: { clinical: 1, clinical_historical: 1, mini_osce: 0, mini_historical: 0, final_osce: 0 },
  courses: [{ id: 2, code: 'M1470', name_ar: 'Surgery' }],
  supervisors: [{ id: 3, full_name_ar: 'Dr. Ahmad' }],
  groups: [{ id: 4, name: 'M' }], subgroups: [{ id: 5, student_group_id: 4, name: 'M2' }],
};
const record = {
  type: 'clinical', record_id: 44, student_id: 9, student_name: 'Student One', university_number: '22011922',
  supervisor_name: 'Dr. Ahmad', course_code: 'M1470', course_name: 'Surgery', group_name: 'M', subgroup_name: 'M2',
  evaluation_week: 5, assessment_kind: 'weekly', score: '8.00', max_score: '10.00', status: 'submitted',
  finding: 'restorable', version_id: 27, is_current: false, assignment_id: 89,
  updated_at: '2026-10-01 12:00:00', submitted_at: '2026-10-01 11:59:00', snapshot: 'a'.repeat(64),
};
const listing = { items: [record], pagination: { current_page: 1, last_page: 1, per_page: 25, total: 1 } };
const detail = { record, restore: { allowed: true, reason: null, current_version_id: 28, target_assignment_id: 90 },
  grade: { id: 7, status: 'approved', clinical_score: '12', osce_score: '25', written_score: '55', total_score: '92', snapshot: 'b'.repeat(64) },
  peers: [record], audits: [], manual: null };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.removeItem('cdms.locale'); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('admin clinical assessment registry', () => {
  it('shows historical mark, its current target and requires approval acknowledgment before restoration', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    document.cookie = 'XSRF-TOKEN=test';
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(admin);
      if (url.includes('/overview')) return envelope(overview);
      if (url.includes('/clinical/44/restore')) return envelope(null);
      if (url.includes('/clinical/44')) return envelope(detail);
      if (url.includes('/clinical-assessments?')) return envelope(listing);
      throw new Error(`Unexpected request: ${url} ${init?.method}`);
    });
    vi.stubGlobal('confirm', () => true);
    renderWithProviders(<AdminClinicalAssessmentsPage />, { route: '/admin/clinical-assessments' });
    expect(await screen.findByText('Assessments on old versions')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Student One.*M1470/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Assessment detail' });
    expect(within(dialog).getByText('Historical mark can be restored')).toBeVisible();
    const restore = within(dialog).getByRole('button', { name: 'Restore to current version' });
    expect(restore).toBeDisabled();
    await userEvent.type(within(dialog).getByPlaceholderText('Describe evidence and academic decision...'), 'Verified original signed supervisor sheet.');
    expect(restore).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /I confirm amendment of an approved grade sheet/ }));
    expect(restore).toBeEnabled();
    await userEvent.click(restore);
    expect(fetchSpy.mock.calls.some(([input, init]) => String(input).includes('/clinical/44/restore') &&
      String(init?.body).includes('"expected_current_version_id":28') && String(init?.body).includes('"acknowledge_approved_grade":true'))).toBe(true);
  });

  it('shows missing marks separately from the record list', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(admin);
      if (url.includes('/overview')) return envelope(overview);
      if (url.includes('/gaps?')) return envelope({ items: [{
        kind: 'clinical', assignment_id: 90, version_id: 28, student_id: 9, student_name: 'Student One',
        university_number: '22011922', supervisor_name: 'Dr. Ahmad', course_code: 'M1470', course_name: 'Surgery',
        group_name: 'M', subgroup_name: 'M2', from_week: 5, to_week: 5, max_score: 10, assessment_kind: 'weekly',
      }], pagination: { current_page: 1, last_page: 1, total: 1, per_page: 25 } });
      if (url.includes('/clinical-assessments?')) return envelope(listing);
      throw new Error(`Unexpected request: ${url}`);
    });
    renderWithProviders(<AdminClinicalAssessmentsPage />, { route: '/admin/clinical-assessments' });
    expect(await screen.findByText('Assessments on old versions')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Missing marks' }));
    expect(await screen.findByText(/marks missing after the assessment period ended/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Inspect and enter' })).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/gaps?kind=clinical'))).toBe(true);
  });
});
