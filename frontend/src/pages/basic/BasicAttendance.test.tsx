import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BasicAttendancePage, BasicLectureSessionPage } from './BasicAttendancePage';
import { PublicLectureAttendancePage } from './PublicLectureAttendancePage';
import { Sidebar } from '@/components/layout/Sidebar';
import { Route, Routes } from 'react-router-dom';
import QRCode from 'qrcode';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,cXI=') } }));
const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const account = { id: 10, name: 'Basic Lecturer', email: 'lecturer@example.edu', roles: ['BASIC_LECTURER'], permissions: ['view', 'record', 'export'].map(action => ({ code: 'basic_attendance.' + action, scope: 'global' })) };
const student = { id: 1, name: 'Student Test', university_number: '2600001' };
const section = { id: 1, course_id: 1, course_name: 'Anatomy', course_code: 'B101', number: '2', academic_year: '2026/2027', semester: 'first', students_count: 3, is_active: true, lecturers: [{ id: 10, name: 'Basic Lecturer' }], active_session: null };
const attendance = { phase: 'check_in', time: '2026-09-29T09:00:00+03:00', already_recorded: false, course_name: 'Anatomy', section_number: '2', title: 'Test Lecture' };

beforeEach(() => { localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test; path=/'; window.history.replaceState({}, '', '/'); });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); window.history.replaceState({}, '', '/'); });

function mock(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
 return vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
  const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
  if (path === '/auth/me') return envelope(account);
  return handler(path, init);
 });
}

describe('Isolated basic lecture attendance', () => {
 it('only lists its assigned sections and does not show management controls to a lecturer', async () => {
  mock(path => { if (path === '/basic-attendance/sections') return envelope([section]); throw Error(path); });
  renderWithProviders(<BasicAttendancePage />);
  await screen.findByText('Anatomy');
  expect(screen.queryByRole('button', { name: 'Manage courses and sections' })).not.toBeInTheDocument();
  expect(screen.getByText(/3 students/)).toBeInTheDocument();
 });

 it('shows only basic attendance and the own profile in a basic-only navigation', async () => {
  mock(path => { throw Error(path); });
  renderWithProviders(<Sidebar />);
  await screen.findByRole('link', { name: /Basic Sciences Courses/ });
  expect(screen.getByRole('link', { name: /My Profile/ })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Clinical Schedule|Student Directory|Grades/ })).not.toBeInTheDocument();
 });

 it.each(['check_in', 'check_out'])('registers %s once for a remembered student without OTP', async phase => {
  window.history.replaceState({}, '', '/lecture-attendance?qr=fresh');
  const fetch = mock(path => {
   if (path === '/public/basic-attendance/identity') return envelope({ student });
   if (path === '/public/basic-attendance/scan') return envelope({ ...attendance, phase });
   throw Error(path);
  });
  renderWithProviders(<PublicLectureAttendancePage />);
  await screen.findByText(phase === 'check_in' ? 'Your attendance was registered successfully.' : 'Second check registered successfully.');
  expect(screen.queryByLabelText('University number')).not.toBeInTheDocument();
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/public/basic-attendance/scan'))).toHaveLength(1);
 });

 it('prepares a fresh scan and verifies OTP without a duplicate auto-scan or contradictory error', async () => {
  window.history.replaceState({}, '', '/lecture-attendance?qr=fresh');
  const fetch = mock(path => {
   if (path === '/public/basic-attendance/identity') return envelope({ student: null });
   if (path === '/public/basic-attendance/prepare') return envelope({ scan_ticket: 'prepared', claim_expires_at: '2026-09-29T09:10:00+03:00' });
   if (path === '/public/basic-attendance/request-otp') return envelope({ challenge_token: 'challenge', claim_expires_at: '2026-09-29T09:10:00+03:00' });
   if (path === '/public/basic-attendance/verify-otp') return envelope({ student, attendance, attendance_error: null, remembered_days: 30 });
   throw Error(path);
  });
  renderWithProviders(<PublicLectureAttendancePage />);
  await screen.findByText(/Your QR scan time is saved/);
  expect(screen.getByText(/Attendance is not recorded yet/)).toBeInTheDocument();
  await userEvent.type(await screen.findByLabelText('University number'), '2600001');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send verification code' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await userEvent.type(await screen.findByLabelText('Verification code'), '123456');
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Verify identity and register attendance' }));
  await screen.findByText('Your attendance was registered successfully.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const requested = fetch.mock.calls.find(([url]) => String(url).endsWith('/request-otp'));
  expect(JSON.parse(String(requested?.[1]?.body))).toEqual({ university_number: '2600001', scan_ticket: 'prepared' });
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/public/basic-attendance/scan'))).toHaveLength(0);
  const verified = fetch.mock.calls.find(([url]) => String(url).endsWith('/verify-otp'));
  expect(JSON.parse(String(verified?.[1]?.body)).remember).toBe(true);
 });

 it('does not claim attendance for pre-verification without a QR', async () => {
  mock(path => {
   if (path === '/public/basic-attendance/identity') return envelope({ student });
   throw Error(path);
  });
  renderWithProviders(<PublicLectureAttendancePage />);
  await screen.findByText(/opening this page alone does not register attendance/);
  expect(screen.queryByText('Your attendance was registered successfully.')).not.toBeInTheDocument();
 });

 it('displays the lecture QR prominently and only allows correction with a reason', async () => {
  mock(path => {
   if (path === '/basic-attendance/sessions/1') return envelope({ section, session: { id: 1, title: 'Test Lecture', state: 'check_in', mode: 'double', opened_at: '2026-09-29T09:00:00+03:00' }, accepting: true, counts: { total: 1, check_in: 0, check_out: 0, late: 0, absent: 0, incomplete: 0 }, rows: [{ id: 1, student_id: 1, name: student.name, university_number: student.university_number, status: 'pending', source: 'qr', check_in_at: null, check_out_at: null, is_late: false }] });
   if (path === '/basic-attendance/sessions/1/qr') return envelope({ url: 'https://example.edu/lecture-attendance?qr=fresh', phase: 'check_in', valid_until: Math.floor(Date.now()/1000)+15, server_time: Math.floor(Date.now()/1000) });
   throw Error(path);
  });
  renderWithProviders(<Routes><Route path="/basic-attendance/sessions/:sessionId" element={<BasicLectureSessionPage />} /></Routes>, { route: '/basic-attendance/sessions/1' });
  await screen.findByAltText('Lecture attendance QR');
  expect(QRCode.toDataURL).toHaveBeenCalledWith(`${window.location.origin}/lecture-attendance?qr=fresh`, expect.any(Object));
  expect(screen.queryByRole('button', { name: 'End and finalize lecture' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Large QR display' }));
  expect(screen.getByRole('dialog', { name: 'Large QR display' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Close large display' }));
  await userEvent.click(screen.getAllByRole('button', { name: 'Correct' })[0]);
  const reason = screen.getByLabelText('Correction reason — required');
  expect(reason).toBeRequired();
 });

 it('shows pending first-time scans before allowing lecture finalization', async () => {
  mock(path => {
   if (path === '/basic-attendance/sessions/1') return envelope({ section, session: { id: 1, title: 'Test Lecture', state: 'paused', mode: 'single', opened_at: '2026-09-29T09:00:00+03:00' }, accepting: false, pending_scans: 1, pending_until: '2026-09-29T09:10:00+03:00', counts: { total: 1, check_in: 0, check_out: 0, late: 0, absent: 0, incomplete: 0 }, rows: [{ id: 1, student_id: 1, name: student.name, university_number: student.university_number, status: 'pending', source: 'qr', check_in_at: null, check_out_at: null, is_late: false }] });
   if (path === '/basic-attendance/sessions/1/qr') return envelope({ url: null, phase: 'paused' });
   throw Error(path);
  });
  renderWithProviders(<Routes><Route path="/basic-attendance/sessions/:sessionId" element={<BasicLectureSessionPage />} /></Routes>, { route: '/basic-attendance/sessions/1' });
  await screen.findByText(/QR scans awaiting email verification: 1/);
  expect(screen.getByRole('button', { name: 'End and finalize lecture' })).toBeDisabled();
 });
});
