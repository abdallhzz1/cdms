import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DirectoryPage } from './DirectoryPage';
import { CoursesPage } from './CoursesPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, errors: {}, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const department = { id: 7, code: 'DEP-PED', name_ar: 'طب الأطفال', name_en: 'Pediatrics', is_active: true };
const course = { id: 8, code: 'M1583', name_ar: 'طب الأطفال', name_en: 'Pediatrics course', academic_level: 'fifth', course_type: 'major', credit_hours: 8, is_active: true, description: null, departments: [department] };
const identity = (global = false) => ({ id: 7, name: 'Head', email: 'head@example.test', roles: global ? ['CLINICAL_DIRECTOR'] : ['DEPARTMENT_HEAD'], assigned_levels: ['fourth', 'fifth', 'sixth'], permissions: ['students.view', 'students.create', 'students.delete', 'courses.view', 'courses.manage'].map(code => ({ code, scope: 'global' })) });

afterEach(() => { vi.restoreAllMocks(); document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'; });

describe('Department head course ownership', () => {
  it('shows only populated student years and hides college-wide roster mutations', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(identity());
      if (url.includes('/students/scope-options')) return envelope({ academic_levels: ['fifth'] });
      if (url.includes('/students/main-groups')) return envelope(['A']);
      if (url.includes('/students?')) return envelope([{ id: 11, university_number: '22100011', full_name_ar: 'طالب القسم', full_name_en: 'Department student', academic_level: 'fifth', registration_status: 'active', batch_year: 2023 }]);
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<DirectoryPage kind="students" />, { route: '/students' });
    expect(await screen.findAllByText('Department student')).not.toHaveLength(0);
    expect(await screen.findByRole('button', { name: /5th Year.*Cohort/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /4th Year.*Cohort|6th Year.*Cohort/i })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('academic_level=fifth'))).toBe(true));
    expect(screen.queryByRole('button', { name: /Add student|Import|Delete/i })).not.toBeInTheDocument();
  });

  it('shows an explicit empty department state instead of all cohort tabs', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope(identity());
      if (url.includes('/students/scope-options')) return envelope({ academic_levels: [] });
      if (url.includes('/students')) return envelope([]);
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<DirectoryPage kind="students" />, { route: '/students' });
    expect(await screen.findByText(/No current students.*department/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Year.*Cohort/i })).not.toBeInTheDocument();
  });

  for (const global of [false, true]) {
    it(global ? 'lets a global course manager save department ownership' : 'keeps ownership read-only for a head without sending replacement owners', async () => {
      document.cookie = 'XSRF-TOKEN=test; path=/';
      const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/auth/me')) return envelope(identity(global));
        if (url.includes('/courses/department-options')) return envelope({ departments: [department], academic_levels: ['fifth'], department_scoped: !global, can_assign_departments: global });
        if (url.includes('/courses?')) return envelope({ items: [course], summary: { total: 1, total_hours: 8, active: 1, inactive: 0, by_level: {} }, pagination: { current_page: 1, last_page: 1, per_page: 25, total: 1 } });
        if (url.endsWith('/courses/8') && init?.method === 'PUT') return envelope(course);
        throw new Error(`Unmocked request: ${url}`);
      });
      renderWithProviders(<CoursesPage />, { route: '/courses' });
      await screen.findAllByText('Pediatrics course');
      await waitFor(() => expect(screen.getAllByTitle('Edit').length).toBeGreaterThan(0));
      await userEvent.click(screen.getAllByTitle('Edit')[0]);
      expect(screen.getByRole('group', { name: /Responsible department/i })).toBeVisible();
      if (global) expect(screen.getByRole('checkbox', { name: 'Pediatrics' })).toBeChecked();
      else expect(screen.queryByRole('checkbox', { name: 'Pediatrics' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Save course' }));
      await waitFor(() => {
        const call = fetchSpy.mock.calls.find(([input, init]) => String(input).endsWith('/courses/8') && init?.method === 'PUT');
        expect(call).toBeTruthy();
        const body = JSON.parse(String(call?.[1]?.body));
        if (global) expect(body.department_ids).toEqual([7]);
        else expect(body).not.toHaveProperty('department_ids');
      });
    });
  }
});
