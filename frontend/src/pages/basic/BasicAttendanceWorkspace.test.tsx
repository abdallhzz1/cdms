import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BasicAttendanceHome, BasicAttendanceSetup } from './BasicAttendanceWorkspace';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const admin = { id: 7, name: 'Basic Administrator', roles: ['BASIC_ATTENDANCE_ADMIN'], permissions: ['view', 'record', 'export', 'manage'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };
const lecturer = { id: 8, name: 'Lecturer', roles: ['BASIC_LECTURER'], permissions: ['view', 'record', 'export'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };
const section = { id: 3, course_id: 1, course_name: 'Anatomy', course_code: 'B101', number: '2', academic_year: '2026/2027', semester: 'first', is_active: true, students_count: 1, lecturers: [{ id: 8, name: 'Lecturer' }], active_session: null };
const secondSection = { ...section, id: 4, course_id: 2, course_name: 'Biology', course_code: 'B102', number: 'A', students_count: 0 };

function mock(account: typeof admin) {
  const courses = [{ id: 1, code: 'B101', name: 'Anatomy', academic_level: 'first' }, { id: 2, code: 'B102', name: 'Biology', academic_level: 'first' }];
  const roster = [{ id: 1, name: 'Synthetic Student', university_number: '123456', email: 'student@example.edu' }];
  vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return envelope(account);
    if (path === '/basic-attendance/sections') return envelope([section, secondSection]);
    if (path === '/basic-attendance/options') return envelope({ courses, lecturers: [{ id: 8, name: 'Lecturer' }] });
    if (path === '/basic-attendance/courses' && init?.method === 'POST') { courses.push({ id: 5, ...(JSON.parse(String(init.body)) as { code: string; name: string; academic_level: string }) }); return envelope({ id: 5 }); }
    if (path === '/basic-attendance/sections/3/roster/student' && init?.method === 'POST') { const row = JSON.parse(String(init.body)) as { name: string; university_number: string; email: string }; roster.push({ id: 2, ...row }); return envelope({ id: 2, existing_student: false }); }
    if (path === '/basic-attendance/sections/3/roster') return envelope(roster);
    if (path === '/basic-attendance/sections/3/sessions') return envelope([]);
    if (path === '/basic-attendance/sections/4/sessions') return envelope([]);
    if (path === '/basic-attendance/sections/3/report') return envelope({ sessions: [], students: [], records: [], pagination: { offset: 0, total: 0, per_page: 7 } });
    if (path === '/basic-attendance/sections/4/report') return envelope({ sessions: [], students: [], records: [], pagination: { offset: 0, total: 0, per_page: 7 } });
    throw new Error(path);
  });
}

beforeEach(() => { localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test; path=/'; });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); sessionStorage.clear(); });

describe('Basic attendance course → section workflow', () => {
  it('shows courses before their sections and does not link to other functions', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance' });
    expect(await screen.findByRole('combobox', { name: 'Course' })).toHaveValue('1');
    expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('3');
    expect(screen.getByRole('heading', { name: 'Section 2' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sections and assignments' })).not.toBeInTheDocument();
    expect(screen.queryByText('Import student roster')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), '2');
    expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('4');
    expect(screen.getByRole('heading', { name: 'Section A' })).toBeInTheDocument();
  });

  it('hides basic-sciences setup from lecturer accounts', async () => {
    mock(lecturer);
    renderWithProviders(<Routes><Route path="/basic-attendance" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance' });
    await screen.findByRole('combobox', { name: 'Section' });
    expect(screen.queryByRole('link', { name: 'Set up courses and sections' })).not.toBeInTheDocument();
  });

  it('lets lecturers view assigned students without roster mutation controls', async () => {
    mock(lecturer);
    renderWithProviders(<Routes><Route path="/basic-attendance/students" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/students' });
    expect(await screen.findByText('Synthetic Student')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Excel template' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add student' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw enrollment' })).not.toBeInTheDocument();
  });

  it('opens the report under the selected course and section', async () => {
    mock(lecturer);
    renderWithProviders(<Routes><Route path="/basic-attendance/reports" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/reports' });
    expect(await screen.findByRole('combobox', { name: 'Course' })).toHaveValue('1');
    expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('3');
    expect(screen.getByRole('heading', { name: 'Attendance Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Excel report' })).toBeInTheDocument();
  });

  it('keeps the selected course and section when switching screens via the sidebar', async () => {
    mock(lecturer);
    const page = renderWithProviders(<Routes><Route path="/basic-attendance/students" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/students' });
    await screen.findByRole('combobox', { name: 'Course' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), '2');
    expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('4');
    page.unmount();
    renderWithProviders(<Routes><Route path="/basic-attendance/reports" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/reports' });
    expect(await screen.findByRole('combobox', { name: 'Course' })).toHaveValue('2');
    expect(screen.getByRole('combobox', { name: 'Section' })).toHaveValue('4');
  });

  it('shows the roster template and preview only on the roster page', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/students" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/students' });
    expect(await screen.findByText('Synthetic Student')).toBeInTheDocument();
    await userEvent.click(screen.getByText(/Import student roster/));
    expect(screen.getByRole('button', { name: 'Download Excel template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start lecture' })).not.toBeInTheDocument();
  });

  it('adds one student manually without opening the Excel importer', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/students" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/students' });
    expect(await screen.findByText('Synthetic Student')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add student' }));
    expect(screen.getByRole('dialog', { name: 'Add student' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Excel template' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'University number' }), '2600004');
    await userEvent.type(screen.getByRole('textbox', { name: 'Student name' }), 'Manual Student');
    await userEvent.type(screen.getByRole('textbox', { name: 'University email' }), 'manual@example.edu');
    await userEvent.click(screen.getByRole('button', { name: 'Save student' }));
    expect(await screen.findByText('Manual Student')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.fetch).toHaveBeenCalledWith('/api/v1/basic-attendance/sections/3/roster/student', expect.objectContaining({ method: 'POST', body: JSON.stringify({ university_number: '2600004', name: 'Manual Student', email: 'manual@example.edu' }) }));
  });

  it('keeps course and section setup on different URLs', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/setup/:kind" element={<BasicAttendanceSetup />} /></Routes>, { route: '/basic-attendance/setup/courses' });
    expect(await screen.findByRole('button', { name: 'Add course' })).toBeInTheDocument();
    expect(screen.getByText('Anatomy')).toBeInTheDocument();
    expect(screen.getByText('Biology')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sections and assignments' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add course' }));
    expect(screen.getByRole('dialog', { name: 'Add course' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates a course from the overlay and returns to the full-width catalog', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/setup/:kind" element={<BasicAttendanceSetup />} /></Routes>, { route: '/basic-attendance/setup/courses' });
    await userEvent.click(await screen.findByRole('button', { name: 'Add course' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Course code' }), 'B103');
    await userEvent.type(screen.getByRole('textbox', { name: 'Course name' }), 'Chemistry');
    await userEvent.click(screen.getByRole('dialog').querySelector('button[type="submit"]')!);
    expect(await screen.findByText('Chemistry')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows only the chosen course sections in section management', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/setup/:kind" element={<BasicAttendanceSetup />} /></Routes>, { route: '/basic-attendance/setup/sections' });
    expect(await screen.findByRole('combobox', { name: 'Course' })).toHaveValue('1');
    expect(screen.getByRole('button', { name: /Section 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Section A/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), '2');
    expect(screen.getByRole('button', { name: /Section A/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Section 2/ })).not.toBeInTheDocument();
  });

  it('edits a section in a focused dialog instead of an always-open second panel', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/setup/:kind" element={<BasicAttendanceSetup />} /></Routes>, { route: '/basic-attendance/setup/sections' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /Section 2/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Section number' })).toHaveValue('2');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
