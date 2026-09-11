import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AttendanceMasterPage } from './AttendanceMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('AttendanceMasterPage', () => {
  it('uses server totals, paginated records, and loads alerts only when requested', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], permissions: [{ code: 'attendance.review', scope: 'global' }] });
      if (url.includes('/attendance-records/options')) return envelope({ academic_years: [{ id: 1, code: '2026-2027' }], courses: [], clinical_periods: [], training_sites: [], sessions: [] });
      if (url.includes('/attendance-records/gaps?')) return envelope([{ date: '2026-09-20', expected_students: 3, recorded_students: 2, missing_students: 1, group_name: 'L5', course: { code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' }, training_site: { name_ar: 'المستشفى', name_en: 'Hospital' }, supervisor: { full_name_ar: 'المشرف', full_name_en: 'Supervisor' } }]);
      if (url.includes('/attendance-records?')) return envelope({ items: [{ id: 9, status: 'absent', student: { full_name_en: 'Clinical Student', university_number: '22310001' }, session: { title: 'Clinical training session', session_date: '2026-09-20', training_site: null, rotation_block: { rotation: { course: { code: 'MED401', name_en: 'Surgery' } } } }, recorder: { name: 'Supervisor' } }], pagination: { current_page: 1, last_page: 3, per_page: 25, total: 51 }, summary: { present: 40, absent: 7, late: 3, excused: 1 } });
      if (url.includes('/attendance-warnings')) return envelope([]);
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect((await screen.findAllByText('Clinical Student')).length).toBeGreaterThan(0);
    expect(await screen.findByText('2 of 3 recorded')).toBeVisible();
    expect(screen.getAllByText('Sunday').length).toBeGreaterThan(0);
    expect(screen.getAllByText('20/09/2026').length).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/attendance-warnings'))).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Absence alerts' }));
    expect(await screen.findByText('All clear')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/attendance-warnings'))).toBe(true);
  });

  it('does not expose the administrative log through a supervisor-only permission', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => String(input).includes('/auth/me')
      ? envelope({ id: 2, name: 'Director Supervisor', email: 'director@hebron.edu', roles: ['CLINICAL_DIRECTOR', 'CLINICAL_SUPERVISOR'], permissions: [{ code: 'attendance.view', scope: 'global' }, { code: 'attendance.record', scope: 'global' }] })
      : Promise.reject(new Error('Administrative attendance API must not be requested')));

    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Access denied')).toBeVisible();
  });
});
