import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CourseDetailsPage } from './CourseDetailsPage';
import { renderWithProviders } from '@/test/renderWithProviders';
import { Route, Routes } from 'react-router-dom';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem('cdms.locale');
  document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('CourseDetailsPage course report export', () => {
  it('offers a direct printable PDF generated from course details without opening a report form', async () => {
    localStorage.setItem('cdms.locale', 'ar');
    vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'Manager', email: 'manager@hebron.edu', roles: ['CLINICAL_DIRECTOR'], assigned_levels: [], department_ids: [], permissions: [{ code: 'courses.view', scope: 'global' }] });
      if (url.endsWith('/courses/8')) return envelope({ id: 8, code: 'M1460', name_ar: 'الطب الباطني مبتدئ', name_en: 'Internal Medicine', credit_hours: 12, academic_level: 'fourth', is_active: true, description: 'وصف المساق', assessment_components: [], learning_outcomes: [], program_outcome_mappings: [] });
      if (url.includes('/program-outcomes')) return envelope([]);
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<Routes><Route path="/courses/:courseId" element={<CourseDetailsPage />} /></Routes>, { route: '/courses/8' });

    const exportLink = await screen.findByRole('link', { name: 'تصدير تقرير المساق PDF' });
    expect(exportLink).toHaveAttribute('href', '/api/v1/courses/8/report.pdf');
    expect(screen.queryByText('حفظ المسودة')).not.toBeInTheDocument();
  });

  it('edits all course marks together before saving a valid 15/25/60 plan', async () => {
    localStorage.setItem('cdms.locale', 'ar');
    document.cookie = 'XSRF-TOKEN=test; path=/';
    const components = [
      { id: 1, code: 'clinical', name: 'التقييم السريري', weight: 20, max_score: 20 },
      { id: 2, code: 'osce', name: 'OSCE', weight: 40, max_score: 40 },
      { id: 3, code: 'written', name: 'الكتابي', weight: 40, max_score: 40 },
    ];
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, name: 'Manager', email: 'manager@hebron.edu', roles: ['CLINICAL_DIRECTOR'], permissions: [{ code: 'courses.view', scope: 'global' }, { code: 'courses.manage', scope: 'global' }] });
      if (url.endsWith('/courses/8')) return envelope({ id: 8, code: 'MED101', name_ar: 'الطب الباطني', assessment_components: components, learning_outcomes: [], program_outcome_mappings: [] });
      if (url.endsWith('/courses/8/assessment-plan') && init?.method === 'PUT') return envelope(components);
      if (url.includes('/program-outcomes')) return envelope([]);
      throw new Error(`Unmocked request: ${url}`);
    });
    renderWithProviders(<Routes><Route path="/courses/:courseId" element={<CourseDetailsPage />} /></Routes>, { route: '/courses/8' });
    await userEvent.click(await screen.findByRole('button', { name: /خطة التقييم/ }));
    await userEvent.click(screen.getByRole('button', { name: 'ضبط خطة المساق' }));
    const inputs = screen.getAllByRole('spinbutton');
    for (const [input, value] of inputs.map((input, index) => [input, ['15', '25', '60'][index]] as const)) { await userEvent.clear(input); await userEvent.type(input, value); }
    await userEvent.click(screen.getByRole('button', { name: 'حفظ الخطة' }));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([url, init]) => String(url).endsWith('/courses/8/assessment-plan') && init?.method === 'PUT' && String(init.body).includes('"clinical":15') && String(init.body).includes('"osce":25') && String(init.body).includes('"written":60'))).toBe(true));
  });
});
