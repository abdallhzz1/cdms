import { afterEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PublicStudentEventCheckInPage } from './PublicStudentEventCheckInPage';

const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data,
  message: status < 400 ? null : 'تحقق من هويتك ببريدك الجامعي أولاً.', meta: {} }),
  { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); });

it('automatically records a verified student after scanning an event code', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/auth/me')) return envelope(null);
    if (url.includes('/student-events/begin')) return envelope({ intent: 'intent', event: {
      title_ar: 'ندوة طبية', title_en: 'Medical Seminar', location_ar: 'القاعة', location_en: 'Hall',
      starts_at: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T10:00:00Z', eligible_levels: ['fourth'], type: 'seminar' } });
    if (url.includes('/student-events/identity')) return envelope({ university_number: '22000001' });
    if (url.includes('/student-events/check-in')) return envelope({ student_name: 'Test Student',
      checked_in_at: '2026-10-21T08:15:00Z', already_recorded: false });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<Routes><Route path="/event-check-in" element={<PublicStudentEventCheckInPage />} /></Routes>,
    { route: '/event-check-in?qr=code' });
  expect(await screen.findByRole('heading', { name: 'Check-in complete' })).toBeVisible();
  expect(screen.getByText('Medical Seminar')).toBeVisible();
  expect(screen.queryByLabelText('University number')).not.toBeInTheDocument();
});

it('clearly rejects an already verified student from an ineligible year', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/auth/me')) return envelope(null);
    if (url.includes('/student-events/begin')) return envelope({ intent: 'intent', event: {
      title_ar: 'ندوة طبية', title_en: 'Medical Seminar', location_ar: 'القاعة', location_en: 'Hall',
      starts_at: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T10:00:00Z', eligible_levels: ['fourth'], type: 'seminar' } });
    if (url.includes('/student-events/identity')) return envelope({ university_number: '22000001' });
    if (url.includes('/student-events/check-in')) return new Response(JSON.stringify({ success: false, data: null,
      message: 'This event is not open to your academic year.', errors: {}, meta: {} }), { status: 422,
      headers: { 'Content-Type': 'application/json' } });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<Routes><Route path="/event-check-in" element={<PublicStudentEventCheckInPage />} /></Routes>,
    { route: '/event-check-in?qr=code' });
  expect(await screen.findByRole('alert')).toHaveTextContent('This event is not open to your academic year.');
  expect(screen.queryByLabelText('University number')).not.toBeInTheDocument();
});
