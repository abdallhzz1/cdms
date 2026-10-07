import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BasicAttendanceCatalogPage } from './BasicAttendanceCatalogPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const section = { id: 3, course_id: 1, course_name: 'Anatomy', course_code: 'B101', number: '2', academic_year: '2026/2027', semester: 'first', is_active: true, students_count: 1, lecturers: [{ id: 8, name: 'Lecturer' }], active_session: null };
const account = { id: 8, name: 'Lecturer', roles: ['BASIC_LECTURER'], permissions: ['view', 'record', 'export'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };
const manager = { id: 9, name: 'Manager', roles: ['BASIC_ATTENDANCE_ADMIN'], permissions: ['view', 'record', 'export', 'manage', 'delete'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };
let currentAccount = account;
let courses = [{ id: 1, code: 'B101', name: 'Anatomy', academic_level: 'first' }];
let sectionList = [section];

beforeEach(() => {
  currentAccount = account;
  courses = [{ id: 1, code: 'B101', name: 'Anatomy', academic_level: 'first' }];
  sectionList = [section];
  localStorage.setItem('cdms.locale', 'en');
  document.cookie = 'XSRF-TOKEN=test; path=/';
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return envelope(currentAccount);
    if (path === '/basic-attendance/sections' && init?.method === 'POST') { sectionList = [...sectionList, { ...section, ...(JSON.parse(String(init.body)) as Omit<typeof section, 'id'>), id: 4, lecturers: [{ id: 8, name: 'Lecturer' }] }]; return envelope(sectionList[1]); }
    if (path === '/basic-attendance/sections') return envelope(sectionList);
    if (path === '/basic-attendance/options') return envelope({ courses, lecturers: [{ id: 8, name: 'Lecturer' }] });
    if (path === '/basic-attendance/courses' && init?.method === 'POST') { courses = [...courses, { ...(JSON.parse(String(init.body)) as Omit<typeof courses[number], 'id'>), id: 2 }]; return envelope(courses[1]); }
    if (path === '/basic-attendance/sections/3/roster') return envelope([{ id: 1, name: 'Student One', university_number: '2600001', email: 'one@example.edu' }]);
    if (path === '/basic-attendance/sections/3/sessions') return envelope([]);
    if (path === '/basic-attendance/sections/3/report') return envelope({ sessions: [], students: [], records: [], pagination: { offset: 0, total: 0, per_page: 7 } });
    if (path === '/basic-attendance/sections/3/monthly-summary') return envelope({ month: '2026-09', finalized_sessions: 2, students: [{ id: 1, name: 'Student One', university_number: '2600001', email: 'one@example.edu', present: 0, absent: 2, excused: 0, incomplete: 0, late: 0, total_absent: 2, is_enrolled: true, notifications: {} }] });
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

it('offers a manual email warning at two finalized absences', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderWithProviders(<Routes><Route path="/basic-attendance/sections/:sectionId/report" element={<BasicAttendanceCatalogPage />} /></Routes>, { route: '/basic-attendance/sections/3/report' });
  await userEvent.click((await screen.findAllByText('Student One'))[0]);
  const [send] = await screen.findAllByRole('button', { name: 'Email absence warning' });
  await userEvent.click(send);
  expect(window.fetch).toHaveBeenCalledWith('/api/v1/basic-attendance/sections/3/students/1/absence-warning', expect.objectContaining({ method: 'POST', body: JSON.stringify({ threshold: 2 }) }));
});

it('lets only the administrator remove a finalized lecture from report details', async () => {
  currentAccount = manager;
  const originalFetch = vi.mocked(window.fetch).getMockImplementation()!;
  vi.mocked(window.fetch).mockImplementation((input, init) => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/basic-attendance/sections/3/report') return Promise.resolve(envelope({ sessions: [{ id: 11, title: 'Final lecture', state: 'finalized', mode: 'single', opened_at: '2026-10-01 09:00:00' }], students: [], records: [], pagination: { offset: 0, total: 1, per_page: 7 } }));
    if (path === '/basic-attendance/sessions/11' && init?.method === 'DELETE') return Promise.resolve(envelope(null));
    return originalFetch(input, init);
  });
  renderWithProviders(<Routes><Route path="/basic-attendance/sections/:sectionId/report" element={<BasicAttendanceCatalogPage />} /></Routes>, { route: '/basic-attendance/sections/3/report' });
  await userEvent.click(await screen.findByText('Lecture-level register'));
  await screen.findByRole('combobox', { name: 'Displayed lecture' });
  await userEvent.click(screen.getAllByRole('button', { name: 'Remove lecture' })[0]);
  const dialog = screen.getByRole('dialog', { name: 'Remove from workspace' });
  await userEvent.type(screen.getByRole('textbox', { name: 'To confirm, type exactly: Final lecture' }), 'Final lecture');
  await userEvent.type(screen.getByRole('textbox', { name: 'Reason for removal (required)' }), 'Incorrect test lecture');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(window.fetch).toHaveBeenCalledWith('/api/v1/basic-attendance/sessions/11', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ confirm: 'Final lecture', reason: 'Incorrect test lecture' }) })));
  expect(dialog).not.toBeInTheDocument();
});

it('sends the two-absence warning to all eligible students in safe batches', async () => {
  currentAccount = manager;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const originalFetch = vi.mocked(window.fetch).getMockImplementation()!;
  vi.mocked(window.fetch).mockImplementation((input, init) => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/basic-attendance/sections/3/monthly-summary') return Promise.resolve(envelope({ month: '2026-10', finalized_sessions: 2, students: Array.from({ length: 13 }, (_, index) => ({ id: index + 1, name: `Student ${index + 1}`, university_number: `260000${index + 1}`, email: `student${index + 1}@example.edu`, present: 0, absent: 2, excused: 0, incomplete: 0, late: 0, total_absent: 2, is_enrolled: true, notifications: {} })) }));
    if (path === '/basic-attendance/sections/3/absence-warnings/bulk' && init?.method === 'POST') return Promise.resolve(envelope({ sent: (JSON.parse(String(init.body)) as { student_ids: number[] }).student_ids, already_sent: [], not_eligible: [], missing_email: [], failed: [] }));
    return originalFetch(input, init);
  });
  renderWithProviders(<Routes><Route path="/basic-attendance/sections/:sectionId/report" element={<BasicAttendanceCatalogPage />} /></Routes>, { route: '/basic-attendance/sections/3/report' });
  await userEvent.click(await screen.findByRole('button', { name: 'Warn 13 students at 2 absences' }));
  await waitFor(() => expect(vi.mocked(window.fetch).mock.calls.filter(([input, init]) => String(input).includes('/absence-warnings/bulk') && init?.method === 'POST')).toHaveLength(2));
  const calls = vi.mocked(window.fetch).mock.calls.filter(([input, init]) => String(input).includes('/absence-warnings/bulk') && init?.method === 'POST');
  expect((JSON.parse(String(calls[0][1]?.body)) as { student_ids: number[] }).student_ids).toHaveLength(10);
  expect((JSON.parse(String(calls[1][1]?.body)) as { student_ids: number[] }).student_ids).toHaveLength(3);
});

it('opens the add course form directly in the catalog and keeps the code beneath the name', async () => {
  currentAccount = manager;
  renderWithProviders(<Routes><Route path="/basic-attendance" element={<BasicAttendanceCatalogPage />} /></Routes>, { route: '/basic-attendance' });
  await userEvent.click(await screen.findByRole('button', { name: 'Add course' }));
  expect(screen.getByRole('dialog', { name: 'Add course' })).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Course name' }), 'Chemistry');
  await userEvent.type(screen.getByRole('textbox', { name: 'Course code' }), 'B102');
  await userEvent.click(screen.getByRole('dialog').querySelector('button[type="submit"]')!);
  expect(await screen.findByRole('link', { name: /Chemistry B102/ })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('opens the add section form from the selected course without a setup page', async () => {
  currentAccount = manager;
  renderWithProviders(<Routes><Route path="/basic-attendance/courses/:courseId" element={<BasicAttendanceCatalogPage />} /></Routes>, { route: '/basic-attendance/courses/1' });
  await userEvent.click(await screen.findByRole('button', { name: 'New section' }));
  expect(screen.getByRole('dialog', { name: 'New section' })).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Section number' }), '3');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Lecturer' }));
  await userEvent.click(screen.getByRole('dialog').querySelector('button[type="submit"]')!);
  expect(await screen.findByRole('link', { name: /Section 3/ })).toBeInTheDocument();
});
