import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { PublicStudentPolicyPage } from './PublicStudentPolicyPage';

const response = (status = 'published') => new Response(JSON.stringify({ success: true, data: {
  public_id: 'x', status, title_ar: 'مدونة سلوك طلبة الطب', title_en: 'Medical Students Code of Conduct',
  version_label: '2026.1', deadline: '2026-10-01', has_english_document: true,
}, message: null, meta: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

it('shows direct Arabic and English downloads without identity or OTP', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(response());
  renderWithProviders(<Routes><Route path="/portal/student-policies/:publicId" element={<PublicStudentPolicyPage />} /></Routes>, { route: '/portal/student-policies/x' });
  expect(await screen.findByRole('heading', { name: 'مدونة سلوك طلبة الطب' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'تنزيل النسخة العربية PDF' })).toHaveAttribute('href', expect.stringContaining('/public/student-policies/x/document?language=ar'));
  expect(screen.getByRole('link', { name: 'Download English PDF' })).toHaveAttribute('href', expect.stringContaining('/public/student-policies/x/document?language=en'));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /رمز|إقرار/ })).not.toBeInTheDocument();
  expect(screen.getByText('نزّل النسخة المناسبة، اطبعها ووقّعها، ثم سلّمها للكلية.')).toBeVisible();
  expect(screen.queryByText(/الإصدار|آخر موعد للتسليم|رمز تحقق|سيُسجّل الموظف/)).not.toBeInTheDocument();
});

it('does not offer downloads when the campaign is closed', async () => {
  vi.spyOn(window, 'fetch').mockResolvedValue(response('closed'));
  renderWithProviders(<Routes><Route path="/portal/student-policies/:publicId" element={<PublicStudentPolicyPage />} /></Routes>, { route: '/portal/student-policies/x' });
  expect(await screen.findByText('الوثيقة غير متاحة للتنزيل حالياً.')).toBeVisible();
  expect(screen.queryByRole('link', { name: /PDF/ })).not.toBeInTheDocument();
});
