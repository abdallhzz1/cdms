import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BasicAttendanceCatalogPage } from './BasicAttendanceCatalogPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const section = { id: 3, course_id: 1, course_name: 'Anatomy', course_code: 'B101', number: '2', academic_year: '2026/2027', semester: 'first', is_active: true, students_count: 1, lecturers: [{ id: 8, name: 'Lecturer' }], active_session: null };
const account = { id: 8, name: 'Lecturer', roles: ['BASIC_LECTURER'], permissions: ['view', 'record', 'export'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };

beforeEach(() => {
  localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return envelope(account);
    if (path === '/basic-attendance/sections') return envelope([section]);
    if (path === '/basic-attendance/sections/3/roster') return envelope([{ id: 1, name: 'Student One', university_number: '2600001', email: 'one@example.edu' }]);
    if (path === '/basic-attendance/sections/3/sessions') return envelope([]);
    if (path === '/basic-attendance/sections/3/report') return envelope({ sessions: [], students: [], records: [], pagination: { offset: 0, total: 0, per_page: 7 } });
    if (path === '/basic-attendance/sections/3/monthly-summary') return envelope({ month: '2026-09', finalized_sessions: 4, students: [{ id: 1, name: 'Student One', university_number: '2600001', email: 'one@example.edu', present: 0, absent: 4, excused: 0, incomplete: 0, late: 0, total_absent: 4, is_enrolled: true, notifications: {} }] });
    if (path === '/basic-attendance/sections/3/students/1/absence-warning') return envelope(null);
    throw new Error(path);
  });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('opens course, section, and students in that order', async () => {
  renderWithProviders(<Routes>
    <Route path="/basic-attendance" element={<BasicAttendanceCatalogPage />} />
    <Route path="/basic-attendance/courses/:courseId" element={<BasicAttendanceCatalogPage />} />
    <Route path="/basic-attendance/sections/:sectionId" element={<BasicAttendanceCatalogPage />} />
    <Route path="/basic-attendance/sections/:sectionId/lectures" element={<BasicAttendanceCatalogPage />} />
  </Routes>, { route: '/basic-attendance' });
  expect(await screen.findByRole('link', { name: /Anatomy B101/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: /Anatomy B101/ }));
  expect(await screen.findByRole('link', { name: /Section 2/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('link', { name: /Section 2/ }));
  expect(await screen.findByText('Student One')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Students' })).toHaveAttribute('aria-current', 'page');
  await userEvent.click(screen.getByRole('link', { name: 'Lectures' }));
  expect(await screen.findByText('Lecture history')).toBeInTheDocument();
});

it('offers a manual email warning at four finalized absences', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderWithProviders(<Routes><Route path="/basic-attendance/sections/:sectionId/report" element={<BasicAttendanceCatalogPage />} /></Routes>, { route: '/basic-attendance/sections/3/report' });
  const [send] = await screen.findAllByRole('button', { name: 'Email absence warning' });
  await userEvent.click(send);
  expect(window.fetch).toHaveBeenCalledWith('/api/v1/basic-attendance/sections/3/students/1/absence-warning', expect.objectContaining({ method: 'POST', body: JSON.stringify({ threshold: 4 }) }));
});
