import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/api/client';
import { PublicClinicalAttendancePage } from './PublicClinicalAttendancePage';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  identity: vi.fn(),
  scan: vi.fn(),
  remember: vi.fn(),
}));

vi.mock('@/api/client', async importOriginal => ({ ...await importOriginal<typeof import('@/api/client')>(), apiFetch: mocks.begin }));
vi.mock('@/api/clinicalQrAttendance', () => ({
  clinicalAttendanceIdentity: mocks.identity,
  scanClinicalQr: mocks.scan,
  rememberClinicalAttendanceBrowser: mocks.remember,
}));
vi.mock('@/components/clinical/LiveQrScanner',()=>({LiveQrScanner:({onDecoded}:{onDecoded:(value:string)=>Promise<void>})=><button onClick={()=>{const link=`${window.location.origin}/clinical-attendance?qr=camera-token&phase=check_in`;void onDecoded(link);void onDecoded(link);}}>Scan camera code</button>}));

describe('PublicClinicalAttendancePage', () => {
  beforeEach(() => {vi.clearAllMocks();mocks.remember.mockResolvedValue({expires_in_days:30});});

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

  it('shows the group-roster rejection clearly without leaving a loading message', async () => {
    mocks.begin.mockResolvedValue({ attendance_intent: 'intent' });
    mocks.identity.mockResolvedValue({ student: { name: 'طالب تجريبي', university_number: '22210466' } });
    mocks.scan.mockRejectedValue(new Error('لم يُسجّل حضورك: رقمك الجامعي غير موجود في كشف المجموعة الرئيسية لهذه المحاضرة.'));

    render(<MemoryRouter initialEntries={['/clinical-attendance?qr=lecture-code']}>
      <Routes><Route path="/clinical-attendance" element={<PublicClinicalAttendancePage />} /></Routes>
    </MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('رقمك الجامعي غير موجود في كشف المجموعة الرئيسية');
    expect(screen.queryByText('جارٍ تسجيل الحضور...')).not.toBeInTheDocument();
  });

  it('records attendance even if remembering the browser fails',async()=>{
    mocks.identity.mockRejectedValueOnce(new Error('not trusted')).mockResolvedValue({student:{name:'Test student',university_number:'22123456'}});
    mocks.begin.mockImplementation(async(path:string)=>path.endsWith('/begin')?{attendance_intent:'intent'}:{access_token:'access-token'});
    mocks.scan.mockResolvedValue({operation:'check_in',recorded_at:'2026-10-15T09:00:00Z'});
    mocks.remember.mockRejectedValue(new Error('temporary remember failure'));
    render(<MemoryRouter initialEntries={['/clinical-attendance?qr=lecture-code']}><PublicClinicalAttendancePage/></MemoryRouter>);
    await userEvent.type(await screen.findByLabelText('الرقم الجامعي'),'22123456');
    await userEvent.click(screen.getByRole('button',{name:'إرسال رمز التحقق'}));
    expect(await screen.findByText(/تم تسجيل الدخول بنجاح/)).toBeVisible();
    await waitFor(()=>expect(mocks.remember).toHaveBeenCalledWith('access-token'));
    expect(mocks.scan).toHaveBeenCalledWith('lecture-code','access-token');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('honors Retry-After without automatically submitting more scans',async()=>{
    mocks.begin.mockResolvedValue({attendance_intent:'intent'});
    mocks.identity.mockResolvedValue({student:{name:'Test student',university_number:'22123456'}});
    mocks.scan.mockRejectedValue(new ApiError('انتظر قليلًا',429,{},25));
    render(<MemoryRouter initialEntries={['/clinical-attendance?qr=lecture-code']}><PublicClinicalAttendancePage/></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('انتظر قليلًا');
    expect(screen.getByRole('button',{name:'إعادة المحاولة بعد 25 ثوانٍ'})).toBeDisabled();
    expect(mocks.scan).toHaveBeenCalledTimes(1);
  });

  it('extracts the signed token from a camera URL and suppresses overlapping detections',async()=>{
    mocks.begin.mockResolvedValue({access_token:'access-token'});
    mocks.identity.mockResolvedValue({student:{name:'Test student',university_number:'22123456'}});
    mocks.scan.mockResolvedValue({operation:'check_in',recorded_at:'2026-10-15T09:00:00Z'});
    render(<MemoryRouter initialEntries={['/clinical-attendance']}><PublicClinicalAttendancePage/></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('الرقم الجامعي'),'22123456');
    await userEvent.click(screen.getByRole('button',{name:'إرسال رمز التحقق'}));
    await userEvent.click(await screen.findByRole('button',{name:'Scan camera code'}));
    expect(await screen.findByText(/تم تسجيل الدخول بنجاح/)).toBeVisible();
    expect(mocks.scan).toHaveBeenCalledTimes(1);
    expect(mocks.scan).toHaveBeenCalledWith('camera-token','access-token');
  });
});
