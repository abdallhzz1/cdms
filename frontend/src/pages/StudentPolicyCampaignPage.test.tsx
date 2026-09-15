import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { StudentPolicyCampaignPage } from './StudentPolicyCampaignPage';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

it('shows real paper and acknowledgement milestones in one table', async () => {
  vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/auth/me')) return ok({ id: 1, name: 'Reader', roles: [], department_ids: [], permissions: [{ code: 'student_policies.view' }] });
    return ok({ campaign: { id: 7, public_id: 'public', status: 'published', deadline: '2026-10-01', target_levels: ['fourth'], document: { title_ar: 'مدونة سلوك طلبة الطب', title_en: 'Medical Students Code of Conduct', version_label: '2026.1' }, academic_year: { id: 1, code: '2026/2027' }, counts: { total: 1, not_opened: 1, acknowledged: 0, paper_received: 0, scan_attached: 0 } }, assignments: { data: [{ id: 2, student: { id: 3, university_number: '22310001', full_name_ar: 'طالب تجريبي', academic_level: 'fourth' }, opened_at: null, acknowledged_at: null, paper_received_at: null, scan_attached: false }], current_page: 1, last_page: 1, total: 1 } });
  });
  renderWithProviders(<Routes><Route path="/student-policies/:id" element={<StudentPolicyCampaignPage />} /></Routes>, { route: '/student-policies/7' });
  expect(await screen.findByText('طالب تجريبي')).toBeVisible();
  expect(screen.getAllByText(/لم يفتح/).length).toBeGreaterThan(0);
});
