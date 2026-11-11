import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ClinicalFieldMonitoringPage } from './ClinicalFieldMonitoringPage';

const ok = (data: unknown, meta: Record<string, unknown> = {}) => new Response(JSON.stringify({ success: true, data, message: null, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } });

afterEach(() => { vi.restoreAllMocks(); window.localStorage.removeItem('cdms.locale'); });

it('gives an assistant one focused bilingual form and routes it to the clinical director', async () => {
  window.localStorage.setItem('cdms.locale', 'ar');
  const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async input => {
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
    if (url.includes('/clinical-field-monitoring/context?')) return ok({
      groups: [{
        key: '7:12:21', rotation_id: 7,
        course: { id: 8, code: 'MED401', name_ar: 'الباطني', name_en: 'Internal Medicine' },
        department: { id: 3, name_ar: 'قسم الباطني', name_en: 'Internal Medicine' },
        group: { id: 12, name: 'A' }, subgroup: { id: 21, name: 'A1' },
        supervisors: [{ id: 31, name_ar: 'د. أحمد', name_en: 'Dr Ahmad' }], student_count: 8,
      }],
      specialties: [{ code: 'department_3', name_ar: 'قسم الباطني', name_en: 'Internal Medicine' }],
      totals: { groups: 1, students: 8, supervisors: 1 },
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
  expect(screen.queryByLabelText(/^المساق$/)).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText(/المستشفى أو موقع التدريب/), '4');
  fireEvent.change(screen.getByLabelText(/تاريخ الزيارة/), { target: { value: '2026-11-09' } });
  await waitFor(() => expect(fetchSpy.mock.calls.some(([input]) => {
    const url = String(input);
    return url.includes('/clinical-field-monitoring/context?')
      && url.includes('training_site_id=4')
      && url.includes('activity_date=2026-11-09');
  })).toBe(true));
  await userEvent.selectOptions(await screen.findByLabelText(/اختر المجموعة/), '7:12:21');
  expect(screen.getByText('MED401 · الباطني — قسم الباطني')).toBeVisible();
  expect(screen.getByText('د. أحمد')).toBeVisible();
  expect(screen.getByText('8')).toBeVisible();
  expect(screen.getByRole('button', { name: /حفظ وإرسال/ })).toBeVisible();
});
