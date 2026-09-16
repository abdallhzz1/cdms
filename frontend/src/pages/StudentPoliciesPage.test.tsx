import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

it('keeps campaign creation focused and hides generated document metadata by default', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes('/auth/me')) return ok({ id: 1, name: 'Manager', roles: [], department_ids: [], permissions: [{ code: 'student_policies.manage' }] });
    if (url.includes('/student-policies')) return ok([]);
    if (url.includes('/academic-years')) return ok([
      { id: 8, code: '2025/2026', is_current: false },
      { id: 9, code: '2026/2027', is_current: true },
    ]);
    throw new Error(url);
  });

  renderWithProviders(<StudentPoliciesPage />);
  await userEvent.click(await screen.findByRole('button', { name: /إنشاء حملة/ }));

  expect(screen.getByLabelText('العام الأكاديمي')).toHaveValue('9');
  expect(screen.getByLabelText('النسخة الرسمية PDF')).toBeVisible();
  expect(screen.getByRole('group', { name: 'السنوات المستهدفة' })).toBeVisible();
  expect(screen.getByLabelText('آخر موعد')).toBeVisible();
  expect(screen.queryByLabelText('العنوان العربي')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('رقم الإصدار')).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /إعدادات متقدمة/ }));
  expect(screen.getByLabelText('العنوان العربي')).toHaveValue('مدونة سلوك طلبة الطب');
  expect(screen.getByLabelText('العنوان الإنجليزي')).toHaveValue('Medical Students’ Code of Conduct');
  expect(screen.getByLabelText('رقم الإصدار')).toHaveValue(`${new Date().getFullYear()}.1`);
  expect(screen.getByLabelText('تاريخ النفاذ')).toHaveValue(new Date().toISOString().slice(0, 10));
});
