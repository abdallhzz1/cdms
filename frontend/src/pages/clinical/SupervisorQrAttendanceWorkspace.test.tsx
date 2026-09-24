import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SupervisorQrAttendanceWorkspace } from './SupervisorQrAttendanceWorkspace';

vi.mock('@/api/distribution', () => ({ getMySupervisorAssignments: vi.fn().mockResolvedValue([{ id: 8, student_subgroup_id: null, training_site: { name_ar: 'المستشفى التعليمي' } }]) }));
vi.mock('@/api/clinicalQrAttendance', () => ({
  getQrSessions: vi.fn().mockResolvedValue([]), openQrSession: vi.fn(), getQrSession: vi.fn(),
  getQrPayload: vi.fn(), transitionQrSession: vi.fn(),
}));

describe('SupervisorQrAttendanceWorkspace', () => {
  it('renders supervisor assignments returned directly from the API envelope', async () => {
    render(<QueryClientProvider client={new QueryClient()}><SupervisorQrAttendanceWorkspace /></QueryClientProvider>);
    expect(await screen.findByRole('option', { name: 'تكليف #8 — المستشفى التعليمي' })).toBeInTheDocument();
  });
});
