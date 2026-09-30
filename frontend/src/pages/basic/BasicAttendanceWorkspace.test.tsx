import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BasicAttendanceHome, BasicAttendanceSection, BasicAttendanceSetup } from './BasicAttendanceWorkspace';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const admin = { id: 7, name: 'Basic Administrator', roles: ['BASIC_ATTENDANCE_ADMIN'], permissions: ['view', 'record', 'export', 'manage'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };
const lecturer = { id: 8, name: 'Lecturer', roles: ['BASIC_LECTURER'], permissions: ['view', 'record', 'export'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) };
const section = { id: 3, course_id: 1, course_name: 'Anatomy', course_code: 'B101', number: '2', academic_year: '2026/2027', semester: 'first', is_active: true, students_count: 1, lecturers: [{ id: 8, name: 'Lecturer' }], active_session: null };

function mock(account: typeof admin) {
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return envelope(account);
    if (path === '/basic-attendance/sections') return envelope([section]);
    if (path === '/basic-attendance/options') return envelope({ courses: [{ id: 1, code: 'B101', name: 'Anatomy', academic_level: 'first' }], lecturers: [{ id: 8, name: 'Lecturer' }] });
    if (path === '/basic-attendance/sections/3/roster') return envelope([{ id: 1, name: 'Synthetic Student', university_number: '123456', email: 'student@example.edu' }]);
    if (path === '/basic-attendance/sections/3/sessions') return envelope([]);
    throw new Error(path);
  });
}

beforeEach(() => { localStorage.setItem('cdms.locale', 'en'); document.cookie = 'XSRF-TOKEN=test; path=/'; });
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('Basic attendance workspace separation', () => {
  it('shows assigned sections without mixing setup and import forms', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance' });
    expect(await screen.findByRole('link', { name: /Section 2/ })).toHaveAttribute('href', '/basic-attendance/sections/3');
    expect(screen.getByRole('link', { name: 'Set up courses and sections' })).toBeInTheDocument();
    expect(screen.queryByText('Import student roster')).not.toBeInTheDocument();
  });

  it('hides basic-sciences setup from lecturer accounts', async () => {
    mock(lecturer);
    renderWithProviders(<Routes><Route path="/basic-attendance" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance' });
    await screen.findByRole('link', { name: /Section 2/ });
    expect(screen.queryByRole('link', { name: 'Set up courses and sections' })).not.toBeInTheDocument();
  });

  it('lets lecturers view assigned students without roster mutation controls', async () => {
    mock(lecturer);
    renderWithProviders(<Routes><Route path="/basic-attendance/sections/:sectionId/roster" element={<BasicAttendanceSection />} /></Routes>, { route: '/basic-attendance/sections/3/roster' });
    expect(await screen.findByText('Synthetic Student')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Excel template' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw enrollment' })).not.toBeInTheDocument();
  });

  it('opens the report directly from its own section chooser', async () => {
    mock(lecturer);
    renderWithProviders(<Routes><Route path="/basic-attendance/reports" element={<BasicAttendanceHome />} /></Routes>, { route: '/basic-attendance/reports' });
    expect(await screen.findByRole('link', { name: /Section 2/ })).toHaveAttribute('href', '/basic-attendance/sections/3/report');
    expect(screen.getByRole('heading', { name: 'Attendance Reports' })).toBeInTheDocument();
  });

  it('shows the roster template and preview only on the roster page', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/sections/:sectionId/roster" element={<BasicAttendanceSection />} /></Routes>, { route: '/basic-attendance/sections/3/roster' });
    expect(await screen.findByText('Synthetic Student')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Excel template' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start lecture' })).not.toBeInTheDocument();
  });

  it('keeps course and section setup on different URLs', async () => {
    mock(admin);
    renderWithProviders(<Routes><Route path="/basic-attendance/setup/:kind" element={<BasicAttendanceSetup />} /></Routes>, { route: '/basic-attendance/setup/courses' });
    expect(await screen.findByRole('button', { name: 'Add course' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save section' })).not.toBeInTheDocument();
  });
});
