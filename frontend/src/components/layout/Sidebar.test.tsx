import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { renderWithProviders } from '@/test/renderWithProviders';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('Sidebar active navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks only student group registration active on its route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return jsonResponse({
            success: true,
            data: {
              id: 1,
              name: 'Test Admin',
              email: 'admin@cdms.local',
              roles: ['SYS_ADMIN'],
              permissions: [
                { code: 'distribution.view', scope: 'global' },
                { code: 'group_registration.view', scope: 'global' },
              ],
            },
            message: null,
            meta: {},
          });
        }
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<Sidebar />, { route: '/distribution/groups' });

    const distributionLink = await screen.findByRole('link', { name: /^(Distribution|التوزيع السريري)$/i });
    const registrationLink = screen.getByRole('link', { name: /Student Group Registration|تسجيل مجموعات الطلبة/i });

    expect(distributionLink).not.toHaveAttribute('aria-current', 'page');
    expect(registrationLink).toHaveAttribute('aria-current', 'page');
  });

  it('shows departments management for a non-admin granted departments.manage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return jsonResponse({
            success: true,
            data: {
              id: 2,
              name: 'Department Manager',
              email: 'manager@cdms.local',
              roles: ['ADMIN_ASSISTANT'],
              permissions: [{ code: 'departments.manage', scope: 'global' }],
            },
            message: null,
            meta: {},
          });
        }
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<Sidebar />, { route: '/admin/departments' });

    const link = await screen.findByRole('link', { name: /Departments & Leaders Management|إدارة أقسام الكلية والقيادات/i });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('shows student policy workspace for either policy permission', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/me')) return jsonResponse({ success: true, data: { id: 3, name: 'Policy Manager', roles: [], permissions: [{ code: 'student_policies.manage', scope: 'global' }] }, message: null, meta: {} });
      throw new Error(`Unmocked fetch call to ${String(input)}`);
    }));
    renderWithProviders(<Sidebar />, { route: '/student-policies' });
    expect(await screen.findByRole('link', { name: /Student Policies|سياسات وتعهدات الطلبة/i })).toHaveAttribute('aria-current', 'page');
  });

  it('shows one basic-sciences destination for the course hierarchy', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/me')) return jsonResponse({ success: true, data: { id: 4, name: 'Basic Administrator', roles: ['BASIC_ATTENDANCE_ADMIN'], permissions: ['view', 'manage', 'export'].map(action => ({ code: `basic_attendance.${action}`, scope: 'global' })) }, message: null, meta: {} });
      throw new Error(`Unmocked fetch call to ${String(input)}`);
    }));
    renderWithProviders(<Sidebar />, { route: '/basic-attendance/sections/3/roster' });
    const courses = await screen.findByRole('link', { name: 'Basic Sciences Courses' });
    expect(courses).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Section Students' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Attendance Reports' })).not.toBeInTheDocument();
  });

  it('shows college events once and gives dual-role supervisors a separate workspace', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/me')) return jsonResponse({ success: true, data: {
        id: 5, name: 'Dual-role supervisor', roles: ['RTA', 'CLINICAL_SUPERVISOR'],
        permissions: ['student_events.view', 'supervisor.workspace.view', 'attendance.record', 'assessment.create',
          'basic_attendance.view'].map(code => ({ code, scope: 'global' })),
      }, message: null, meta: {} });
      throw new Error(`Unmocked fetch call to ${String(input)}`);
    }));
    renderWithProviders(<Sidebar />, { route: '/supervisor/portal' });
    const eventLink = (await screen.findAllByRole('link', { name: 'College Events' }));
    expect(eventLink).toHaveLength(1);
    expect(eventLink[0].closest('.mb-3')).toHaveTextContent('Students & Clinical');
    expect(eventLink[0].closest('.mb-3')).not.toHaveTextContent('Basic Sciences');
    const supervisorLink = screen.getByRole('link', { name: 'Supervisor Dashboard' });
    expect(supervisorLink).toHaveAttribute('aria-current', 'page');
    expect(supervisorLink.closest('.mb-3')).toHaveTextContent('Clinical Supervisor Workspace');
    expect(supervisorLink.closest('.mb-3')).not.toHaveTextContent('Students & Clinical');
  });

  it('keeps the college events link for a basic-sciences-only account', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/me')) return jsonResponse({ success: true, data: {
        id: 6, name: 'Basic lecturer', roles: ['BASIC_LECTURER'],
        permissions: [{ code: 'student_events.view', scope: 'global' }],
      }, message: null, meta: {} });
      throw new Error(`Unmocked fetch call to ${String(input)}`);
    }));
    renderWithProviders(<Sidebar />, { route: '/events' });
    expect(await screen.findByRole('link', { name: 'College Events' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: 'College Events' })).toHaveLength(1);
  });
});
