import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AttendanceMasterPage, organizeAttendanceGroups } from './AttendanceMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'; });
const catalog = [{ assignment_id: 9, student_group_id: 8, student_subgroup_id: 12, rotation_id: 3, group_name: 'N', subgroup_name: 'N1', academic_year: { id: 1, code: '2026-2027' }, course: { id: 2, name_en: 'Surgery' }, student_count: 1 }];
const student = { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', photo_url: '/storage/students/4.jpg' };
const week = (number: number, status: string | null) => ({ number, start_date: `2026-09-${String(number).padStart(2, '0')}`, end_date: `2026-09-${String(number + 6).padStart(2, '0')}`, students: [{ student_id: 4, assigned: true, days: [{ date: `2026-09-${String(number).padStart(2, '0')}`, scheduled: true, status, note: number === 1 ? 'Reported illness' : null, recorded_by: 'Dr Ahmad', supervisor: { full_name_en: 'Dr Ahmad' }, training_site: { name_en: 'Ahli Hospital' }, recording_source: status ? 'manual' : null }] }] });
const review = { student_group_id: 8, subgroups: [
  { id: 12, name: 'N1', students: [student], rotations: [{ id: 3, course: { id: 2, name_en: 'Surgery' }, weeks: [week(1, 'absent'), week(2, null)] }] },
  { id: 13, name: 'N2', students: [{ id: 5, university_number: '22310002', full_name_ar: 'طالب آخر', full_name_en: 'Other Student' }], rotations: [{ id: 4, course: { id: 3, name_en: 'Neurology' }, weeks: [{ number: 1, start_date: '2026-09-01', end_date: '2026-09-07', students: [{ student_id: 5, assigned: true, schedule_issue: 'supervisor_missing', days: [] }] }] }] },
] };

describe('AttendanceMasterPage', () => {
  it('deduplicates repeated rows of one rotation under the same subgroup', () => {
    const organized = organizeAttendanceGroups([...catalog, { ...catalog[0], assignment_id: 10 }, { ...catalog[0], assignment_id: 11, student_subgroup_id: 13, subgroup_name: 'N2' }]);
    expect(organized).toHaveLength(1);
    expect(organized[0].subgroups.map(row => row.name)).toEqual(['N1', 'N2']);
    expect(organized[0].subgroups[0].entries).toHaveLength(1);
  });

  it('shows all subgroups and weeks, with day details and alerts', async () => {
    document.cookie = 'XSRF-TOKEN=test; path=/';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let sent: Record<string, unknown> | null = null;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [{ code: 'attendance.review', scope: 'global' }, { code: 'attendance.notify', scope: 'global' }] });
      if (url.includes('/attendance-records/groups')) return envelope(catalog);
      if (url.includes('/attendance-records/review-group')) return envelope(review);
      if (url.includes('/attendance-warnings/send') && init?.method === 'POST') { sent = JSON.parse(String(init.body)); return envelope({ recipient_email: 'student@hebron.edu' }); }
      if (url.includes('/attendance-warnings')) return envelope([{ student: { ...student, email: 'student@hebron.edu' }, rotation_id: 3, course: { name_en: 'Surgery' }, absent_days: 3, total_required_days: 10, absence_percentage: 30, current_threshold: 20, last_sent: { '10': null, '20': null } }]);
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Other Student')).toBeVisible();
    expect(screen.getByText('Clinical Student')).toBeVisible();
    expect(screen.getAllByText('Week 1').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: 'Total absent' })).toHaveLength(2);
    expect(within(screen.getByRole('row', { name: /Clinical Student/ })).getByText('1')).toBeVisible();
    expect(screen.getByText('Not recorded')).toBeVisible();
    expect(screen.queryByText('Formal warning')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clinical Student · Week 1' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Reported illness/)).toBeVisible();
    expect(within(dialog).getAllByText(/Dr Ahmad/).length).toBeGreaterThan(0);
    await userEvent.click(within(dialog).getByRole('button', { name: /Close|إغلاق/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Clinical Student · Week 2' }));
    expect(within(screen.getByRole('dialog')).getByText('Not recorded')).toBeVisible();
    expect(within(screen.getByRole('dialog')).queryByText('Absent')).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Close|إغلاق/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Other Student · Week 1' }));
    expect(within(screen.getByRole('dialog')).getByText(/No supervisor is assigned/)).toBeVisible();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Close|إغلاق/ }));
    await userEvent.click(screen.getByRole('tab', { name: 'Absence alerts (1)' }));
    expect(await screen.findByText('Formal warning')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Warning sent to student@hebron.edu.')).toBeVisible();
    expect(sent).toMatchObject({ student_id: 4, rotation_id: 3, threshold_percent: 20 });
  });

  it('does not request records without review permission', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => String(input).includes('/auth/me') ? envelope({ id: 2, roles: ['CLINICAL_SUPERVISOR'], permissions: [{ code: 'attendance.record', scope: 'global' }] }) : Promise.reject(new Error('Administrative API must not be requested')));
    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    expect(await screen.findByText('Access denied')).toBeVisible();
  });
});
