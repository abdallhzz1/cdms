import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { BasicAttendanceOverviewPage } from './BasicAttendanceOverviewPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.setItem('cdms.locale', 'en');
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const path = new URL(String(input), window.location.origin).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return envelope({ id: 9, name: 'Manager', roles: ['BASIC_ATTENDANCE_ADMIN'], permissions: ['view', 'manage'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) });
    if (path === '/basic-attendance/monthly-overview') return envelope({ month: '2026-10', sections: [
      { id: 1, number: 'A', academic_year: '2026/2027', course_id: 10, course_code: 'B101', course_name: 'Anatomy', students_count: 40, assigned_lecturers: [{ id: 8, name: 'Dr One' }], lecturers: [{ lecturer_id: 8, lecturer_name: 'Dr One', lectures: 2, present: 60, absent: 10, excused: 5, late: 3 }] },
      { id: 2, number: 'B', academic_year: '2026/2027', course_id: 11, course_code: 'B102', course_name: 'Biology', students_count: 30, assigned_lecturers: [{ id: 9, name: 'Dr Two' }], lecturers: [{ lecturer_id: 9, lecturer_name: 'Dr Two', lectures: 1, present: 20, absent: 8, excused: 1, late: 2 }] },
    ] });
    throw new Error(path);
  });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('groups the monthly report by course, section and lecture owner with filters', async () => {
  renderWithProviders(<Routes><Route path="/basic-attendance/monthly-report" element={<BasicAttendanceOverviewPage />} /></Routes>, { route: '/basic-attendance/monthly-report' });
  expect(await screen.findByRole('heading', { name: 'Anatomy' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Biology' })).toBeInTheDocument();
  expect(screen.getAllByText('Dr One').length).toBeGreaterThan(1);
  expect(screen.getAllByRole('link', { name: 'Details' })[0]).toHaveAttribute('href', '/basic-attendance/sections/1/report');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), '11');
  expect(screen.queryByRole('heading', { name: 'Anatomy' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Biology' })).toBeInTheDocument();
});
