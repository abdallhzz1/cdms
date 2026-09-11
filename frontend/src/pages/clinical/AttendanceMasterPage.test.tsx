import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AttendanceMasterPage } from './AttendanceMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('AttendanceMasterPage', () => {
  it('shows the selected published group, its supervisor, and weekly student attendance', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], permissions: [{ code: 'attendance.review', scope: 'global' }] });
      if (url.includes('/attendance-records/groups')) return envelope([{ assignment_id: 9, academic_year: { code: '2026-2027' }, course: { code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' }, subgroup_name: 'L5', student_count: 1 }]);
      if (url.includes('/attendance-records/group-summary')) return envelope({
        group: { assignment_id: 9, course: { code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' }, subgroup_name: 'L5', student_count: 1, supervisor: { full_name_ar: 'د. أحمد', full_name_en: 'Dr Ahmad' }, training_site: { name_ar: 'المستشفى الأهلي', name_en: 'Ahli Hospital' }, block: { from_week: 1, to_week: 2 } },
        weeks: [{ number: 1, start_date: '2026-09-01', end_date: '2026-09-07', scheduled_dates: ['2026-09-01'], scheduled_days: 1, elapsed_scheduled_days: 1 }],
        students: [{ student: { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student' }, weeks: [{ number: 1, start_date: '2026-09-01', end_date: '2026-09-07', scheduled_days: 1, elapsed_scheduled_days: 1, recorded_days: 1, present: 0, absent: 1, late: 0, excused: 0 }], totals: { scheduled_days: 1, elapsed_scheduled_days: 1, recorded_days: 1, present: 0, absent: 1, late: 0, excused: 0, absence_percentage: 100, warning_level: 20 } }],
      });
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Dr Ahmad')).toBeVisible();
    expect(screen.getByText('Clinical Student')).toBeVisible();
    expect(screen.getByText('Week 1')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Absence alerts (1)' }));
    expect(await screen.findByText('Formal warning')).toBeVisible();
  });

  it('does not expose the administrative register through a supervisor-only permission', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => String(input).includes('/auth/me')
      ? envelope({ id: 2, name: 'Supervisor', email: 'supervisor@hebron.edu', roles: ['CLINICAL_SUPERVISOR'], permissions: [{ code: 'attendance.record', scope: 'global' }] })
      : Promise.reject(new Error('Administrative attendance API must not be requested')));
    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Access denied')).toBeVisible();
  });
});
