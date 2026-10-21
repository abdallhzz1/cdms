import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { StudentEventsPage } from './StudentEventsPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }),
  { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); });

it('creates a bilingual event without requiring a timed check-in window', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  let posted: Record<string, unknown> | null = null;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [
      { code: 'student_events.view', scope: 'global' }, { code: 'student_events.manage', scope: 'global' }] });
    if (url.includes('/student-events') && init?.method === 'POST') {
      posted = JSON.parse(String(init.body)); return envelope({ id: 5 });
    }
    if (url.includes('/student-events')) return envelope({ data: [], current_page: 1, last_page: 1, total: 0 });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<StudentEventsPage />, { route: '/events' });
  await screen.findByRole('heading', { name: 'Student events' });
  await userEvent.click(screen.getByRole('button', { name: 'New event' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(screen.getByLabelText('Arabic title'), 'ندوة طب');
  await userEvent.type(screen.getByLabelText('English title'), 'Medicine Seminar');
  await userEvent.type(screen.getByLabelText('Arabic location'), 'القاعة الكبرى');
  await userEvent.type(screen.getByLabelText('English location'), 'Main Hall');
  expect(dialog).toBeVisible();
  expect(screen.getByLabelText('Year 4')).toBeChecked();
  await userEvent.click(screen.getByLabelText('Year 6'));
  expect(screen.getByLabelText('Year 6')).not.toBeChecked();
  // Date/time controls are native. Their local format is submitted without a timezone shift.
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-10-21T11:00' } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-10-21T12:00' } });
  expect(screen.queryByLabelText('Check-in opens')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Check-in closes')).not.toBeInTheDocument();
  fireEvent.submit(document.querySelector('#student-event-form')!);
  await waitFor(() => expect(posted).toMatchObject({ title_ar: 'ندوة طب', title_en: 'Medicine Seminar',
    starts_at: '2026-10-21 11:00:00', ends_at: '2026-10-21 12:00:00', eligible_levels: ['fourth','fifth'] }));
  expect(posted).not.toHaveProperty('check_in_opens_at');
});

it('opens and closes check-in manually and exposes permanent deletion for published events', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  const event = { id: 7, public_id: 'event-7', type: 'seminar', title_ar: 'ندوة', title_en: 'Medical Seminar',
    description_ar: null, description_en: null, location_ar: 'القاعة', location_en: 'Hall',
    starts_at: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T10:00:00Z',
    eligible_levels: ['fourth'], status: 'published', check_in_enabled: false, attendance_count: 2 };
  const requests: Array<{ url: string; method?: string; body?: Record<string, unknown> }> = [];
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method: init?.method, body });
    if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['SYS_ADMIN'], permissions: [
      { code: 'student_events.view', scope: 'global' }, { code: 'student_events.attendance.manage', scope: 'global' },
      { code: 'student_events.delete', scope: 'global' }] });
    if (url.includes('/student-events/7/check-in')) {
      event.check_in_enabled = Boolean(body?.enabled); return envelope({ ...event });
    }
    if (url.includes('/student-events/7/qr')) return envelope({ token: 'qr-token', expires_at: '2026-10-21T10:00:00Z' });
    if (url.includes('/student-events/7/attendance')) return envelope({ data: [], current_page: 1, last_page: 1, total: 0 });
    if (url.includes('/student-events?')) return envelope({ data: [event], current_page: 1, last_page: 1, total: 1 });
    if (url.includes('/student-events/7') && init?.method === 'DELETE') return envelope({ deleted: true });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<StudentEventsPage />, { route: '/events' });
  await screen.findByRole('heading', { name: 'Medical Seminar' });
  await userEvent.click(screen.getByRole('button', { name: 'Check-in QR' }));
  expect(screen.getByText('Check-in is closed')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Open check-in and show QR' }));
  expect(await screen.findByRole('button', { name: 'Close check-in and disable QR' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Close check-in and disable QR' }));
  expect(await screen.findByText('Check-in is closed')).toBeVisible();
  expect(requests.filter(row => row.url.includes('/check-in') && row.method === 'POST').map(row => row.body?.enabled)).toEqual([true, false]);
  await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));
  expect(screen.getByText(/entire attendance register/)).toBeVisible();
  await userEvent.type(screen.getByLabelText('Type the event title to confirm'), 'Medical Seminar');
  await userEvent.type(screen.getByLabelText('Administrative reason (at least 10 characters)'), 'Administrative correction');
  await userEvent.click(screen.getByRole('button', { name: 'Delete event and register permanently' }));
  await waitFor(() => expect(requests.some(row => row.method === 'DELETE' && row.body?.confirmation === 'Medical Seminar')).toBe(true));
});
