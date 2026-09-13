import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StudentGroupsPage } from './StudentGroupsPage';
import { renderWithProviders } from '@/test/renderWithProviders';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200 });
}

const cycle = {
  id: 11,
  public_id: 'cycle-11',
  academic_year_id: 4,
  academic_year: { code: '2026/2027' },
  academic_level: 'fifth',
  status: 'open',
  default_capacity: 6,
  main_group_codes: ['A', 'B', 'C'],
  rosters_count: 125,
  registered_rosters_count: 79,
  public_url: '/student-registration/cycle-11',
  roster_students: [],
  groups: [
    { id: 1, name: 'A', roster_count: 42, registered_roster_count: 31, recommended_subgroups_count: 7, recommended_capacity_plan: [6, 6, 6, 6, 6, 6, 6], current_active_capacity: 43, subgroups: [] },
    { id: 2, name: 'B', roster_count: 40, registered_roster_count: 23, recommended_subgroups_count: 7, recommended_capacity_plan: [6, 6, 6, 6, 6, 5, 5], current_active_capacity: 40, subgroups: [] },
    { id: 3, name: 'C', roster_count: 43, registered_roster_count: 25, recommended_subgroups_count: 8, recommended_capacity_plan: [6, 6, 6, 5, 5, 5, 5, 5], current_active_capacity: 43, subgroups: [] },
  ],
};

describe('StudentGroupsPage workspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('keeps group monitoring primary and opens split planning in a dialog', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/auth/me')) {
          return jsonResponse({
            id: 1,
            name: 'Test Admin',
            email: 'admin@cdms.local',
            roles: ['SYS_ADMIN'],
            department_ids: [],
            permissions: [
              { code: 'group_registration.view', scope: 'global' },
              { code: 'group_registration.manage_groups', scope: 'global' },
              { code: 'group_registration.open_close', scope: 'global' },
              { code: 'group_registration.override', scope: 'global' },
              { code: 'group_registration.export', scope: 'global' },
            ],
          });
        }
        if (url.includes('/group-registration-cycles')) return jsonResponse([cycle]);
        if (url.includes('/academic-years')) return jsonResponse([{ id: 4, code: '2026/2027', is_current: true }]);
        throw new Error(`Unmocked fetch call to ${url}`);
      }),
    );

    renderWithProviders(<StudentGroupsPage />, { route: '/distribution/groups' });

    expect(await screen.findByRole('combobox', { name: /current cycle/i })).toHaveValue('11');
    expect(screen.getByRole('heading', { name: /main groups/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /flexible subgroup planning/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /plan subgroup split/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /flexible subgroup planning/i })).toBeInTheDocument();
  });
});
