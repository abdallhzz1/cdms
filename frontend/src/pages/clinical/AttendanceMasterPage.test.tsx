import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AttendanceMasterPage, organizeAttendanceGroups } from './AttendanceMasterPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => {
  document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
  vi.restoreAllMocks();
});

describe('AttendanceMasterPage', () => {
  it('organizes repeated rotation rows under one main group and one subgroup', () => {
    const base = { academic_year: { id: 1, code: '2026-2027' }, academic_level: 'fourth', group_name: 'N', student_group_id: 8, subgroup_name: 'N1', student_subgroup_id: 12, student_count: 4 };
    const organized = organizeAttendanceGroups([
      { ...base, assignment_id: 21, rotation_id: 5, course: { id: 3, name_en: 'Dermatology' } },
      { ...base, assignment_id: 22, rotation_id: 5, course: { id: 3, name_en: 'Dermatology' } },
      { ...base, assignment_id: 23, rotation_id: 6, course: { id: 4, name_en: 'Neurology' } },
      { ...base, assignment_id: 24, rotation_id: 6, subgroup_name: 'N2', student_subgroup_id: 13, student_count: 3 },
    ]);
    expect(organized).toHaveLength(1);
    expect(organized[0].subgroups.map(item => item.name)).toEqual(['N1', 'N2']);
    expect(organized[0].subgroups[0].entries.map(item => item.assignment_id)).toEqual([21, 23]);
  });

  it('navigates from a main group to its subgroups without a long repeated course list', async () => {
    const entries = [
      { assignment_id: 21, student_group_id: 8, student_subgroup_id: 12, rotation_id: 5, group_name: 'N', subgroup_name: 'N1', academic_year: { id: 1, code: '2026-2027' }, academic_level: 'fourth', course: { id: 3, name_en: 'Dermatology' }, student_count: 4 },
      { assignment_id: 22, student_group_id: 8, student_subgroup_id: 12, rotation_id: 5, group_name: 'N', subgroup_name: 'N1', academic_year: { id: 1, code: '2026-2027' }, academic_level: 'fourth', course: { id: 3, name_en: 'Dermatology' }, student_count: 4 },
      { assignment_id: 23, student_group_id: 8, student_subgroup_id: 13, rotation_id: 6, group_name: 'N', subgroup_name: 'N2', academic_year: { id: 1, code: '2026-2027' }, academic_level: 'fourth', course: { id: 4, name_en: 'Neurology' }, student_count: 1 },
    ];
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [{ code: 'attendance.review', scope: 'global' }] });
      if (url.includes('/attendance-records/groups')) return envelope(entries);
      if (url.includes('/attendance-records/group-summary')) {
        const second = url.includes('assignment_id=23');
        const entry = second ? entries[2] : entries[0];
        return envelope({ group: entry, weeks: [{ number: 1, start_date: '2026-09-01', end_date: '2026-09-07' }], selected_week: { number: 1, start_date: '2026-09-01', end_date: '2026-09-07' }, schedule: [], daily: [], students: second ? [{ student: { id: 9, university_number: '22310009', full_name_ar: 'طالب آخر', full_name_en: 'Other Student' }, totals: { scheduled_days: 0, elapsed_scheduled_days: 0, recorded_days: 0, present: 0, absent: 0, late: 0, excused: 0, absence_percentage: 0 } }] : [] });
      }
      if (url.includes('/attendance-warnings')) return envelope([]);
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<AttendanceMasterPage />, { route: '/attendance' });
    const subgroups = await screen.findByRole('group', { name: 'Subgroups' });
    expect(within(subgroups).getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'Group N · Fourth year · 2026-2027' })).toBeInTheDocument();
    await userEvent.click(within(subgroups).getByRole('button', { name: /N2/ }));
    expect(await screen.findByText('Other Student')).toBeVisible();
  });

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
        daily: [{ date: '2026-09-01', rotation_block_id: 7, supervisor: { id: 8, full_name_ar: 'د. أحمد', full_name_en: 'Dr Ahmad' }, training_site: { id: 2, name_ar: 'المستشفى الأهلي', name_en: 'Ahli Hospital' }, qr_session: { state: 'finalized', check_in_opened_at: '2026-09-01T08:00:00Z', finalized_at: '2026-09-01T15:00:00Z' }, recorded_count: 1, students: [{ student: { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student' }, status: 'absent', check_in_at: null, check_out_at: null, recording_source: 'qr', note: 'Reported illness', recorded_by: 'Dr Ahmad', is_incomplete: false }] }],
        students: [{ student: { id: 4, university_number: '22310001', full_name_ar: 'طالب سريري', full_name_en: 'Clinical Student', photo_url: '/storage/students/4.jpg' }, totals: { scheduled_days: 1, elapsed_scheduled_days: 1, recorded_days: 1, present: 0, absent: 1, late: 0, excused: 0, absence_percentage: 100, warning_level: 20 }, attendance_notes: [{ date: '2026-09-01', note: 'Reported illness', recorded_by: 'Dr Ahmad' }] }],
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
    expect(screen.getByText('Reported illness')).toBeVisible();
    expect(screen.getAllByText(/Week 1/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Enlarge student photo' }));
    const photoDialog = screen.getByRole('dialog', { name: 'Clinical Student' });
    expect(photoDialog).toBeVisible();
    expect(within(photoDialog).getByText('22310001')).toBeVisible();
    await userEvent.click(within(photoDialog).getByRole('button', { name: /Close|إغلاق/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Daily details and notes' }));
    expect(await screen.findByText('Finalized')).toBeVisible();
    expect(screen.getByText(/Check-in opened: 11:00/)).toBeVisible();
    expect(screen.getByText('QR')).toBeVisible();
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
