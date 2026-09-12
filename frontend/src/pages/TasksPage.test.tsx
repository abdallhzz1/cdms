import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { TasksPage } from './TasksPage';

const response = (data: unknown, meta: Record<string, unknown> = {}) => new Response(JSON.stringify({
  success: true, data, message: null, errors: {}, meta,
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('TasksPage navigation', () => {
  it('labels the combined view as all and hides created tasks from users without manage permission', async () => {
    window.localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return response({
        id: 4, name: 'Assignee', email: 'assignee@hebron.edu', roles: ['CLINICAL_SUPERVISOR'],
        permissions: [{ code: 'tasks.view', scope: 'global' }],
      });
      if (url.includes('/operational-tasks')) return response([], {
        current_page: 1, last_page: 1, total: 0,
        summary: { mine: 2, assigned: 2, created: 0, overdue: 0, completed: 0 },
      });
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<TasksPage />, { route: '/tasks' });

    expect(await screen.findByRole('button', { name: /All 2/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Assigned 2/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Created/ })).not.toBeInTheDocument();
  });
});
