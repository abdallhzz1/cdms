import { afterEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PublicClinicalSchedulePage } from './PublicClinicalSchedulePage';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('offers a clear 30-day browser choice after the first email verification', async () => {
  localStorage.setItem('cdms.locale', 'en');
  let verified = false;
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/auth/me')) return ok(null);
    if (url.includes('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/public/student-schedule/request-otp')) return ok({ otp_required: true, challenge_token: 'c'.repeat(64), email_hint: '222***@students.hebron.edu', expires_in_seconds: 600 });
    if (url.endsWith('/public/student-schedule/verify-otp')) { verified = true; return ok({ access_token: 'a'.repeat(80) }); }
    if (url.endsWith('/public/student-schedule/remember')) return ok({ expires_in_days: 30 });
    if (url.endsWith('/public/student-schedule')) return verified
      ? ok({ student: { name: 'Student', name_en: 'Student', university_number: '22210466', academic_level: 'fourth', photo_url: null }, group: null, subgroup: null, members: [], schedule: [] })
      : new Response(JSON.stringify({ success: false, data: null, message: 'Not verified', errors: {}, meta: {} }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    throw new Error(`Unmocked request: ${url}`);
  });

  renderWithProviders(<PublicClinicalSchedulePage />, { route: '/portal/student-lookup' });
  await userEvent.type(screen.getByPlaceholderText('Example: 22210466'), '22210466');
  await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Verify and view schedule' }));

  expect(await screen.findByRole('dialog', { name: 'Remember this browser?' })).toBeVisible();
  expect(screen.getByText(/personal phone.*30 days/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Remember for 30 days' }));
  expect(await screen.findByText('This browser can open your schedule for 30 days without a new code.')).toBeVisible();
});

it('opens a remembered schedule without showing the university-number form', async () => {
  localStorage.setItem('cdms.locale', 'en');
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/auth/me')) return ok(null);
    if (url.includes('/sanctum/csrf-cookie')) return new Response(null, { status: 204 });
    if (url.endsWith('/public/student-schedule')) return ok({ student: { name: 'Student', name_en: 'Student', university_number: '22210466', academic_level: 'fourth', photo_url: null }, group: null, subgroup: null, members: [], schedule: [] });
    throw new Error(`Unmocked request: ${url}`);
  });

  renderWithProviders(<PublicClinicalSchedulePage />, { route: '/portal/student-lookup' });
  expect(await screen.findByRole('heading', { name: 'Student' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Send verification code' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Remember this browser?' })).not.toBeInTheDocument();
});
