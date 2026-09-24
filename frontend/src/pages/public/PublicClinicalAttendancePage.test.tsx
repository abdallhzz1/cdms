import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicClinicalAttendancePage } from './PublicClinicalAttendancePage';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  identity: vi.fn(),
  scan: vi.fn(),
}));

vi.mock('@/api/client', () => ({ apiFetch: mocks.begin }));
vi.mock('@/api/clinicalQrAttendance', () => ({
  clinicalAttendanceIdentity: mocks.identity,
  scanClinicalQr: mocks.scan,
  rememberClinicalAttendanceBrowser: vi.fn(),
}));

describe('PublicClinicalAttendancePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers one scan and does not show an error after success', async () => {
    mocks.begin.mockResolvedValue({ attendance_intent: 'intent' });
    mocks.identity.mockResolvedValue({ student: { name: 'طالب تجريبي', university_number: '22210466' } });
    mocks.scan.mockResolvedValue({ operation: 'check_in', recorded_at: '2026-09-24T08:52:00Z' });

    render(<MemoryRouter initialEntries={['/clinical-attendance?qr=current-code']}>
      <Routes><Route path="/clinical-attendance" element={<PublicClinicalAttendancePage />} /></Routes>
    </MemoryRouter>);

    expect(await screen.findByText(/تم تسجيل الدخول بنجاح/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.begin).toHaveBeenCalledTimes(1));
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/تعذر معالجة الطلب/)).not.toBeInTheDocument();
  });

  it('records checkout immediately for a trusted student', async () => {
    mocks.begin.mockResolvedValue({ attendance_intent: 'checkout-intent' });
    mocks.identity.mockResolvedValue({ student: { name: 'طالب تجريبي', university_number: '22210466' } });
    mocks.scan.mockResolvedValue({ operation: 'check_out', recorded_at: '2026-09-24T14:52:00Z' });

    render(<MemoryRouter initialEntries={['/clinical-attendance?qr=checkout-code&phase=check_out']}>
      <Routes><Route path="/clinical-attendance" element={<PublicClinicalAttendancePage />} /></Routes>
    </MemoryRouter>);

    expect(await screen.findByText(/تم تسجيل الخروج بنجاح/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'تسجيل الخروج السريري' })).toBeInTheDocument();
    expect(screen.queryByLabelText('الرقم الجامعي')).not.toBeInTheDocument();
    expect(mocks.scan).toHaveBeenCalledWith('checkout-code', undefined);
  });
});
