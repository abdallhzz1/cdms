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
    if (path === '/basic-attendance/overview') return envelope({ sections: [
      { id: 1, number: 'A', academic_year: '2026/2027', semester: 'first', course_id: 10, course_code: 'B101', course_name: 'Anatomy', students_count: 40, assigned_lecturers: [{ id: 8, name: 'Dr One' }], lecturers: [{ lecturer_id: 8, lecturer_name: 'Dr One', lectures: 2, present: 60, absent: 10 }] },
      { id: 2, number: 'B', academic_year: '2026/2027', semester: 'first', course_id: 11, course_code: 'B102', course_name: 'Biology', students_count: 30, assigned_lecturers: [{ id: 9, name: 'Dr Two' }], lecturers: [{ lecturer_id: 9, lecturer_name: 'Dr Two', lectures: 1, present: 20, absent: 8 }] },
      { id: 3, number: 'C', academic_year: '2025/2026', semester: 'second', course_id: 12, course_code: 'B103', course_name: 'Pharmacology', students_count: 24, assigned_lecturers: [{ id: 10, name: 'Dr Three' }], lecturers: [{ lecturer_id: 10, lecturer_name: 'Dr Three', lectures: 3, present: 50, absent: 4 }] },
    ] });
    throw new Error(path);
  });
});
afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

it('groups the full-semester report by term, course, section and lecture owner', async () => {
  renderWithProviders(<Routes><Route path="/basic-attendance/semester-report" element={<BasicAttendanceOverviewPage />} /></Routes>, { route: '/basic-attendance/semester-report' });
  expect(await screen.findByRole('heading', { name: 'Anatomy' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Biology' })).toBeInTheDocument();
  expect(screen.getAllByText('Dr One').length).toBeGreaterThan(1);
  expect(screen.queryByText('Excused')).not.toBeInTheDocument();
  expect(screen.queryByText('Late')).not.toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Details' })[0]).toHaveAttribute('href', '/basic-attendance/sections/1/report');
  const termFilter = screen.getByRole('combobox', { name: 'Academic term' });
  expect(termFilter).toHaveValue('2026/2027|first');
  expect(screen.queryByRole('textbox', { name: 'Month' })).not.toBeInTheDocument();
  await userEvent.selectOptions(termFilter, '2025/2026|second');
  expect(screen.queryByRole('heading', { name: 'Anatomy' })).not.toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Pharmacology' })).toBeInTheDocument();
  await userEvent.selectOptions(termFilter, '2026/2027|first');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Course' }), '11');
  expect(screen.queryByRole('heading', { name: 'Anatomy' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Biology' })).toBeInTheDocument();
});
