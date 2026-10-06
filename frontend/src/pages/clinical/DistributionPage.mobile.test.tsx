import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DistributionPage } from './DistributionPage';

const envelope = (data: unknown) => new Response(JSON.stringify({ success: true, data, message: null, meta: {} }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem('cdms.locale'); });

describe('clinical distribution phone workspace', () => {
  it('shows one selected week at a time and groups physician rows under their site', async () => {
    localStorage.setItem('cdms.locale', 'en');
    vi.spyOn(window, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/auth/me')) return envelope({ id: 1, roles: ['SYS_ADMIN'], permissions: [{ code: 'distribution.view', scope: 'global' }] });
      if (url.includes('/course-distribution/options')) return envelope({
        academic_years: [{ id: 1, code: '2026/2027', start_date: '2026-09-01', end_date: '2027-06-30', is_current: true }],
        clinical_periods: [{ id: 2, academic_year_id: 1, code: 'P1', name_ar: 'الفترة الأولى', name_en: 'First period', sequence: 1, start_date: '2026-09-01', end_date: '2026-09-14', weeks_count: 2, status: 'active' }],
        courses: [{ id: 3, code: 'M1460', name_ar: 'الطب الباطني', name_en: 'Internal Medicine', academic_level: 'fourth' }],
        hospitals: [{ id: 4, site_code: 'A', name_ar: 'الأهلي', name_en: 'Ahli Hospital', supervisors: [] }],
        unassigned_doctors: [],
      });
      if (url.includes('/course-distribution/schedule?')) return envelope({
        rotation: { id: 5, name: 'Internal Medicine', start_date: '2026-09-01', duration_weeks: 2 },
        version: { id: 6, status: 'published', updated_at: '2026-09-01' },
        blocks: [{ id: 7, block_code: 'W1', from_week: 1, to_week: 1 }, { id: 8, block_code: 'W2', from_week: 2, to_week: 2 }],
        subgroups: [], hospitals: [], unassigned_doctors: [],
        rows: [{ id: 9, row_type: 'doctor', training_site_id: 4, training_site: { id: 4, name_ar: 'الأهلي', name_en: 'Ahli Hospital' }, person: { id: 10, full_name_ar: 'د. أحمد', full_name_en: 'Dr Ahmad' } }],
        cells: [{ course_schedule_row_id: 9, rotation_block_id: 7, training_site_id: 4, subgroup_id: 11, subgroup_name: 'L1' }, { course_schedule_row_id: 9, rotation_block_id: 8, training_site_id: 4, subgroup_id: 12, subgroup_name: 'L2' }],
      });
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<DistributionPage />, { route: '/distribution' });
    const mobile = await screen.findByRole('region', { name: 'Mobile weekly distribution' });
    expect(within(mobile).getByText('Ahli Hospital')).toBeVisible();
    expect(within(mobile).getByText('Dr Ahmad')).toBeVisible();
    expect(within(mobile).getByText('L1')).toBeVisible();
    expect(within(mobile).queryByText('L2')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(within(mobile).getByText('L2')).toBeVisible();
    expect(within(mobile).queryByText('L1')).not.toBeInTheDocument();

    const context = screen.getByRole('button', { name: /Year and period/ });
    expect(context).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(context);
    expect(context).toHaveAttribute('aria-expanded', 'true');
  });
});
