import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ReportsDashboard } from './ReportsDashboard';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('ReportsDashboard', () => {
  it('renders report dashboard and options', () => {
    renderWithProviders(<ReportsDashboard />);
    // The page title uses translations, but our default fallback for nav.reports is "التقارير التشغيلية"
    expect(screen.getByText('Operational Reports')).toBeInTheDocument();
    expect(screen.getByText('reports.master_students')).toBeInTheDocument();
    expect(screen.getByText('reports.export_excel')).toBeInTheDocument();
  });

  it('triggers window.open on export click', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();

    renderWithProviders(<ReportsDashboard />);

    const excelBtn = screen.getByText('reports.export_excel');
    await user.click(excelBtn);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      '/api/v1/operational/reports/students?rotation_id=1&format=excel',
      '_blank'
    );
    windowOpenSpy.mockRestore();
  });
});
