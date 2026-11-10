import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalFieldMonitoringPage } from './ClinicalFieldMonitoringPage';

const ok = (data: unknown, meta: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: true, data, message: null, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); });

it('gives an assistant one focused bilingual form and routes it to the clinical director', async () => {
  window.localStorage.setItem('cdms.locale', 'ar');
  vi.spyOn(window, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/auth/me')) return ok({ id: 11, name: 'مساعد الاختبار', roles: ['RTA'], department_ids: [3], permissions: [
      { code: 'clinical_field_monitoring.view' }, { code: 'clinical_field_monitoring.create_assistant' }, { code: 'clinical_field_monitoring.export' },
    ] });
    if (url.endsWith('/clinical-field-monitoring/options')) return ok({
      allowed_types: ['assistant_follow_up'], recipients: { assistant_follow_up: { id: 2, name: 'مدير الدائرة السريرية' } },
      departments: [{ id: 3, name_ar: 'قسم الباطني', name_en: 'Internal Medicine' }],
      training_sites: [{ id: 4, name_ar: 'مستشفى الخليل', name_en: 'Hebron Hospital' }], courses: [],
      creator: { id: 11, name: 'مساعد الاختبار' },
    });
    if (url.includes('/clinical-field-monitoring?')) return ok([], { current_page: 1, last_page: 1, total: 0 });
    throw new Error(url);
  });

  renderWithProviders(<ClinicalFieldMonitoringPage />);
  expect(await screen.findByRole('heading', { name: 'المتابعة والزيارات الميدانية' })).toBeVisible();
  expect(screen.queryByText('وارد يحتاج متابعة')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'نماذجي' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'الوارد إليّ' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: /نموذج جديد/ }));
  expect(screen.getByText('مدير الدائرة السريرية')).toBeVisible();
  expect(screen.getByText('قائمة المتابعة')).toBeVisible();
  expect(screen.getByLabelText(/المستشفى أو موقع التدريب/)).toBeVisible();
  expect(screen.queryByLabelText(/القسم السريري/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /حفظ وإرسال/ })).toBeVisible();
});
