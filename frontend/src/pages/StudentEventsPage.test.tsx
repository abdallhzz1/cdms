import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { StudentEventsPage } from './StudentEventsPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }),
  { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); });

it('creates a bilingual event with eligible years and a separate check-in window', async () => {
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
  expect(screen.getByLabelText('Check-in opens')).toHaveValue('2026-10-21T11:00');
  expect(screen.getByLabelText('Check-in closes')).toHaveValue('2026-10-21T12:00');
  fireEvent.submit(document.querySelector('#student-event-form')!);
  await waitFor(() => expect(posted).toMatchObject({ title_ar: 'ندوة طب', title_en: 'Medicine Seminar',
    starts_at: '2026-10-21 11:00:00', ends_at: '2026-10-21 12:00:00', eligible_levels: ['fourth','fifth'] }));
});
