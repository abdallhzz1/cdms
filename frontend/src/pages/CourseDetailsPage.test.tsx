import { screen } from '@testing-library/react';
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
});
