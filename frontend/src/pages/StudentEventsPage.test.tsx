import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  let uploaded: FormData | null = null;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [
      { code: 'student_events.view', scope: 'global' }, { code: 'student_events.manage', scope: 'global' }] });
    if (url.includes('/student-events/5/poster') && init?.method === 'POST') {
      uploaded = init.body as FormData; return envelope({ id: 5, poster_url: '/api/v1/student-events/5/poster' });
    }
    if (url.includes('/student-events') && init?.method === 'POST') {
      posted = JSON.parse(String(init.body)); return envelope({ id: 5 });
    }
    if (url.includes('/student-events')) return envelope({ data: [], current_page: 1, last_page: 1, total: 0 });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<StudentEventsPage />, { route: '/events' });
  await screen.findByRole('heading', { name: 'College events' });
  await userEvent.click(screen.getByRole('button', { name: 'New event' }));
  const dialog = screen.getByRole('dialog');
  await userEvent.type(screen.getByLabelText('Arabic title'), 'ندوة طب');
  await userEvent.type(screen.getByLabelText('English title'), 'Medicine Seminar');
  await userEvent.type(screen.getByLabelText('Arabic location'), 'القاعة الكبرى');
  await userEvent.type(screen.getByLabelText('English location'), 'Main Hall');
  await userEvent.click(screen.getByRole('button', { name: 'Add presenter' }));
  await userEvent.type(screen.getByLabelText('Arabic name'), 'د. شذى ملحم');
  await userEvent.type(screen.getByLabelText('English name'), 'Dr. Shatha Melhem');
  const poster = new File(['poster'], 'lecture.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Choose event poster'), { target: { files: [poster] } });
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
    starts_at: '2026-10-21 11:00:00', ends_at: '2026-10-21 12:00:00', eligible_levels: ['fourth','fifth'],
    presenters: [{ name_ar: 'د. شذى ملحم', name_en: 'Dr. Shatha Melhem', role_ar: '', role_en: '' }] }));
  await waitFor(() => expect(uploaded?.get('poster')).toBe(poster));
  expect(posted).not.toHaveProperty('check_in_opens_at');
});

it('publishes a draft directly from its card after showing that check-in remains closed', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  const event = { id: 6, public_id: 'event-6', type: 'lecture', title_ar: 'محاضرة', title_en: 'Medical Lecture',
    description_ar: null, description_en: null, location_ar: 'القاعة', location_en: 'Hall',
    starts_at: '2026-10-22T08:00:00Z', ends_at: '2026-10-22T10:00:00Z', eligible_levels: ['fourth'],
    status: 'draft', check_in_enabled: false, attendance_count: 0, presenters: [], poster_url: null };
  let published = false;
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [
      { code: 'student_events.view', scope: 'global' }, { code: 'student_events.manage', scope: 'global' }] });
    if (url.includes('/student-events/6/status') && init?.method === 'POST') {
      expect(JSON.parse(String(init.body))).toMatchObject({ status: 'published' });
      published = true; event.status = 'published'; return envelope(event);
    }
    if (url.includes('/student-events?')) return envelope({ data: url.includes('scope=draft') || published ? [event] : [],
      current_page: 1, last_page: 1, total: 1 });
    if (url.includes('/student-events/6/attendance')) return envelope({ data: [], current_page: 1, last_page: 1, total: 0 });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<StudentEventsPage />, { route: '/events' });
  await userEvent.click(screen.getByRole('button', { name: 'Drafts' }));
  await screen.findByRole('heading', { name: 'Medical Lecture' });
  expect(screen.getByText(/Students will not see it until published/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Publish event for students' }));
  expect(screen.getByText(/Check-in will remain closed until you open it manually/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm publication' }));
  await waitFor(() => expect(published).toBe(true));
  expect(await screen.findByText('Published')).toBeVisible();
});

it('opens and closes check-in manually and exposes permanent deletion for published events', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  const event = { id: 7, public_id: 'event-7', type: 'seminar', title_ar: 'ندوة', title_en: 'Medical Seminar',
    description_ar: null, description_en: null, location_ar: 'القاعة', location_en: 'Hall',
    starts_at: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T10:00:00Z',
    eligible_levels: ['fourth'], status: 'published', check_in_enabled: false, attendance_count: 2,
    presenters: [{ name_ar: 'د. شذى ملحم', name_en: 'Dr. Shatha Melhem', role_ar: '', role_en: 'OB/GYN Specialist' }],
    poster_url: '/api/v1/public/student-events/posters/event-7' };
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
  expect(screen.getByText('Speakers & presenters: Dr. Shatha Melhem')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'View event poster' }));
  expect(screen.getByRole('img', { name: 'Event poster' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Open full-size poster' }));
  expect(screen.getByRole('dialog', { name: 'Full-size event poster' })).toBeVisible();
  expect(within(screen.getByRole('dialog', { name: 'Full-size event poster' })).getByRole('img', { name: 'Event poster' })).toHaveAttribute('src', event.poster_url);
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Full-size event poster' })).getByRole('button', { name: 'Close' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Check-in QR' }));
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

it('updates the open event register when a student checks in without reloading the page', async () => {
  window.localStorage.setItem('cdms.locale', 'en');
  const event = { id: 9, public_id: 'event-9', type: 'seminar', title_ar: 'ندوة', title_en: 'College Seminar',
    description_ar: null, description_en: null, location_ar: 'القاعة', location_en: 'Hall',
    starts_at: '2026-10-21T08:00:00Z', ends_at: '2026-10-21T10:00:00Z',
    eligible_levels: ['fourth'], status: 'published', check_in_enabled: true, attendance_count: 0 };
  let rosterRequests = 0;
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['RTA'], permissions: [
      { code: 'student_events.view', scope: 'global' }] });
    if (url.includes('/student-events/9/attendance')) {
      rosterRequests++;
      if (rosterRequests === 1) return envelope({ data: [], current_page: 1, last_page: 1, total: 0 });
      event.attendance_count = 1;
      return envelope({ data: [{ id: 3, checked_in_at: '2026-10-21T08:05:00Z', source: 'qr', student: {
        university_number: '22000001', full_name_ar: 'طالب', full_name_en: 'New Student', academic_level: 'fourth',
      } }], current_page: 1, last_page: 1, total: 1 });
    }
    if (url.includes('/student-events?')) return envelope({ data: [event], current_page: 1, last_page: 1, total: 1 });
    throw new Error(`Unmocked ${url}`);
  });
  renderWithProviders(<StudentEventsPage />, { route: '/events' });
  await screen.findByRole('heading', { name: 'College Seminar' });
  await userEvent.click(screen.getByRole('button', { name: 'Register · 0' }));
  expect(await screen.findByText('No check-ins yet.')).toBeVisible();
  expect(await screen.findByText('New Student', {}, { timeout: 5_000 })).toBeVisible();
  expect(screen.getByText('Recorded attendance · 1')).toBeVisible();
  expect(rosterRequests).toBeGreaterThanOrEqual(2);
});
