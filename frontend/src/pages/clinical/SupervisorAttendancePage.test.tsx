import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorAttendancePage } from './SupervisorAttendancePage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const user = { id: 1, name: 'Supervisor', email: 'supervisor@example.test', roles: ['CLINICAL_SUPERVISOR'], permissions: ['supervisor.workspace.view', 'attendance.record'].map(code => ({ code, scope: 'global' })) };
const assignment = (id: number, studentId: number, name: string) => ({
  id, distribution_version_id: 3, rotation_block_id: 4, training_site_id: 5, student_subgroup_id: 6,
  session_start_date: '2026-09-01', session_end_date: '2026-09-30', scheduled_dates: ['2026-09-24'],
  student: { id: studentId, university_number: `2201000${studentId}`, full_name_ar: name, full_name_en: name, batch_year: 2026 },
  student_subgroup: { name: 'L1', group: { name: 'L' } },
  rotation_block: { block_code: 'W1', rotation: { course: { id: 10, name_ar: 'الجراحة', name_en: 'Surgery' } } },
  training_site: { name_ar: 'المستشفى الأهلي', name_en: 'Ahli Hospital' },
});
const workspace = { supervisor: { full_name_ar: 'د. أحمد', full_name_en: 'Dr Ahmad' }, assignments: [assignment(21, 7, 'First Student'), assignment(22, 8, 'Second Student')], attendance_records: [], assessments: [], student_notes: [], assessment_templates: [], schedule_configured: true };

afterEach(() => { vi.restoreAllMocks(); document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/'; });

describe('manual clinical attendance', () => {
  it('requires an explicit status for every student and saves official notes with the group', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    document.cookie = 'XSRF-TOKEN=test; path=/';
    let payload: { records: { student_id: number; status: string; excuse_note: string | null }[] } | null = null;
    vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(user);
      if (url.includes('/my-supervisor-workspace')) return envelope(workspace);
      if (url.includes('/my-supervisor-attendance')) {
        if (init?.method === 'POST') { payload = JSON.parse(String(init.body)); return envelope({ session_id: 10 }); }
        return envelope({ records: [], qr_session: null });
      }
      throw new Error(`Unmocked: ${url}`);
    });
    renderWithProviders(<SupervisorAttendancePage />, { route: '/supervisor/attendance?date=2026-09-24' });
    const save = await screen.findByRole('button', { name: 'Save group attendance' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Mark all present' }));
    expect(save).toBeEnabled();
    await userEvent.click(screen.getAllByRole('button', { name: 'Add official note' })[0]);
    await userEvent.type(screen.getByRole('textbox', { name: 'Note for First Student' }), 'Reviewed by supervisor');
    await userEvent.click(save);
    await waitFor(() => expect(payload).toMatchObject({ records: [
      { student_id: 7, status: 'present', excuse_note: 'Reviewed by supervisor' },
      { student_id: 8, status: 'present', excuse_note: null },
    ] }));
  });

  it('does not allow manual editing when a QR session already exists', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(user);
      if (url.includes('/my-supervisor-workspace')) return envelope(workspace);
      if (url.includes('/my-supervisor-attendance')) return envelope({ records: [], qr_session: { id: 99, state: 'check_in_open' } });
      throw new Error(`Unmocked: ${url}`);
    });
    renderWithProviders(<SupervisorAttendancePage />, { route: '/supervisor/attendance?date=2026-09-24' });
    expect(await screen.findByText('This group has a QR session for this day.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save group attendance' })).not.toBeInTheDocument();
  });
});
