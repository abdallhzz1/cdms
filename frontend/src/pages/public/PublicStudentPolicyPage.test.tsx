import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PublicStudentPolicyPage } from './PublicStudentPolicyPage';

afterEach(() => vi.restoreAllMocks());
it('explains that acknowledgement does not replace the handwritten signature', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { public_id: 'x', status: 'published', title_ar: 'مدونة سلوك طلبة الطب', title_en: 'Medical Students Code of Conduct', version_label: '2026.1', deadline: '2026-10-01' }, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  renderWithProviders(<Routes><Route path="/portal/student-policies/:publicId" element={<PublicStudentPolicyPage />} /></Routes>, { route: '/portal/student-policies/x' });
  expect(await screen.findByRole('heading', { name: /مدونة سلوك طلبة الطب/ })).toBeVisible();
  expect(screen.getByText(/لا يغني عن التوقيع الورقي/)).toBeVisible();
  expect(screen.queryByRole('button', { name: /فتح النسخة الرسمية/ })).not.toBeInTheDocument();
});
