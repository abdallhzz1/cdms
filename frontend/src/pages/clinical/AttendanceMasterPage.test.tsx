import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AttendanceMasterPage } from './AttendanceMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  vi.restoreAllMocks();
});

describe('AttendanceMasterPage', () => {
  it('shows the selected published group, its supervisor, and weekly student attendance', async () => {
    document.cookie = 'XSRF-TOKEN=test; path=/';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let sentPayload: Record<string, unknown> | null = null;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'RTA', email: 'rta@hebron.edu', roles: ['RTA'], permissions: [{ code: 'attendance.review', scope: 'global' }, { code: 'attendance.notify', scope: 'global' }] });
      if (url.includes('/attendance-records/groups')) return envelope([{ assignment_id: 9, academic_year: { id: 1, code: '2026-2027' }, course: { id: 2, code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' }, subgroup_name: 'L5', student_count: 1 }]);
      if (url.includes('/attendance-records/group-summary')) return envelope({
        group: { assignment_id: 9, academic_year: { id: 1, code: '2026-2027' }, course: { id: 2, code: 'MED401', name_ar: 'الجراحة', name_en: 'Surgery' }, subgroup_name: 'L5', student_count: 1 },
        weeks: [{ number: 1, start_date: '2026-09-01', end_date: '2026-09-07' }],
        selected_week: { number: 1, start_date: '2026-09-01', end_date: '2026-09-07' },
        schedule: [{ rotation_block_id: 7, supervisor: { id: 8, full_name_ar: 'د. أحمد', full_name_en: 'Dr Ahmad' }, training_site: { id: 2, name_ar: 'المستشفى الأهلي', name_en: 'Ahli Hospital' }, scheduled_dates: ['2026-09-01'], student_count: 1 }],
        students: [{ student: { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student' }, totals: { scheduled_days: 1, elapsed_scheduled_days: 1, recorded_days: 1, present: 0, absent: 1, late: 0, excused: 0, absence_percentage: 100, warning_level: 20 } }],
      });
      if (url.includes('/attendance-warnings/send') && init?.method === 'POST') {
        sentPayload = JSON.parse(String(init.body));
        return envelope({ recipient_email: '22310001@students.hebron.edu', threshold_percent: 20, sent_at: '2026-09-11T12:00:00Z' });
      }
      if (url.includes('/attendance-warnings')) return envelope([{ student: { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', email: '22310001@students.hebron.edu' }, rotation_id: 3, course: { id: 2, code: 'MED401' }, total_required_days: 10, recorded_days: 3, present_days: 0, absent_days: 3, late_days: 0, excused_days: 0, absence_percentage: 30, current_threshold: 20, last_sent: { '10': null, '20': null } }]);
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Dr Ahmad')).toBeVisible();
    expect(screen.getByText('Clinical Student')).toBeVisible();
    expect(screen.getAllByText(/Week 1/).length).toBeGreaterThan(0);
    await userEvent.click(await screen.findByRole('button', { name: 'Absence alerts (1)' }));
    expect(await screen.findByText('Formal warning')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Send formal warning' }));
    expect(await screen.findByText('Warning sent to 22310001@students.hebron.edu.')).toBeVisible();
    expect(sentPayload).toMatchObject({ student_id: 4, rotation_id: 3, threshold_percent: 20, resend: false });
  });

  it('does not expose the administrative register through a supervisor-only permission', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => String(input).includes('/auth/me')
      ? envelope({ id: 2, name: 'Supervisor', email: 'supervisor@hebron.edu', roles: ['CLINICAL_SUPERVISOR'], permissions: [{ code: 'attendance.record', scope: 'global' }] })
      : Promise.reject(new Error('Administrative attendance API must not be requested')));
    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Access denied')).toBeVisible();
  });
});
