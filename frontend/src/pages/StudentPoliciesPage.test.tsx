import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { StudentPoliciesPage } from './StudentPoliciesPage';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

it('shows campaign milestones and a focused creation action', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.manage' }] });
    if (url.includes('/student-policies')) return ok([]);
    if (url.includes('/academic-years')) return ok([]);
    throw new Error(url);
  });
  renderWithProviders(<StudentPoliciesPage />);
  expect(await screen.findByRole('heading', { name: /سياسات وتعهدات الطلبة/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /إنشاء حملة/ })).toBeVisible();
});
