import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import { getQrPayload, getQrSessions } from '@/api/clinicalQrAttendance';
import { groupSupervisorAssignments } from './supervisorWorkspace';
import { groupQrAssignments, SupervisorQrAttendanceWorkspace } from './SupervisorQrAttendanceWorkspace';

const assignments = [
  { id: 8, distribution_version_id: 1, rotation_block_id: 2, training_site_id: 3, student_subgroup_id: 4, student: { id: 11, full_name_ar: 'طالب أول', batch_year: 2026 }, student_subgroup: { name: 'أ', group: { name: 'المجموعة 5' } }, training_site: { name_ar: 'مستشفى الخليل' }, rotation_block: { block_code: 'B1', from_week: 1, to_week: 1, rotation: { name: 'دوران', start_date: '2026-09-21', course: { id: 9, name_ar: 'الباطني', code: 'MED' }, academic_year: { code: '2026/2027' } } }, scheduled_dates: ['2026-09-24'] },
  { id: 9, distribution_version_id: 1, rotation_block_id: 2, training_site_id: 3, student_subgroup_id: 4, student: { id: 12, full_name_ar: 'طالب ثان', batch_year: 2026 }, student_subgroup: { name: 'أ', group: { name: 'المجموعة 5' } }, training_site: { name_ar: 'مستشفى الخليل' }, rotation_block: { block_code: 'B1', from_week: 1, to_week: 1, rotation: { name: 'دوران', start_date: '2026-09-21', course: { id: 9, name_ar: 'الباطني', code: 'MED' }, academic_year: { code: '2026/2027' } } }, scheduled_dates: ['2026-09-24'] },
] as any[];

vi.mock('@/api/client', () => ({ apiFetch: vi.fn((path: string) => path === '/operational/my-supervisor-workspace' ? Promise.resolve({ assignments }) : Promise.resolve([])) }));
vi.mock('@/api/clinicalQrAttendance', () => ({ getQrSessions: vi.fn().mockResolvedValue([]), openQrSession: vi.fn(), getQrSession: vi.fn(), getQrPayload: vi.fn(), transitionQrSession: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,checkout') } }));

describe('SupervisorQrAttendanceWorkspace', () => {
  it('groups student assignments once and offers only scheduled work days', async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><SupervisorQrAttendanceWorkspace /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByRole('option', { name: /الباطني — المجموعة 5 \(أ\).*مستشفى الخليل/ })).toBeInTheDocument();
    expect(screen.getAllByRole('option', { name: /الباطني — المجموعة 5 \(أ\).*مستشفى الخليل/ })).toHaveLength(1);
    expect(screen.getByRole('option', { name: /الخميس/ })).toBeInTheDocument();
  });

  it('merges cohorts of the same QR session instead of repeating a group', () => {
    const groups = groupQrAssignments(groupSupervisorAssignments([
      ...assignments,
      { ...assignments[0], id: 10, student: { id: 13, full_name_ar: 'طالب ثالث', batch_year: 2027 } },
    ]));
    expect(groups).toHaveLength(1);
    expect(groups[0].students).toHaveLength(3);
  });

  it('encodes checkout as a camera link with the checkout phase', async () => {
    vi.mocked(getQrSessions).mockResolvedValueOnce([{ id: 51, public_id: 'session', student_clinical_assignment_id: 8, session_date: '2026-09-24', state: 'check_out_open', roster: [] }]);
    vi.mocked(getQrPayload).mockResolvedValueOnce({ token: 'checkout-token', phase: 'check_out', expires_at: '2026-09-24T12:00:00Z' });

    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><SupervisorQrAttendanceWorkspace /></QueryClientProvider></MemoryRouter>);

    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled());
    expect(vi.mocked(QRCode.toDataURL).mock.calls[0][0]).toContain('/clinical-attendance?qr=checkout-token&phase=check_out');
  });
});
