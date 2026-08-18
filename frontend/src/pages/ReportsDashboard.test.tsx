import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ReportsDashboard } from './ReportsDashboard';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('ReportsDashboard', () => {
  it('renders report dashboard and options', () => {
    renderWithProviders(<ReportsDashboard />);
    expect(screen.getByText(/Reports & Data Export Center/i)).toBeInTheDocument();
    expect(screen.getByText(/Export Students/i)).toBeInTheDocument();
    expect(screen.getByText(/Export Excel/i)).toBeInTheDocument();
  });

  it('triggers window.open on export click', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();

    renderWithProviders(<ReportsDashboard />);

    const excelBtn = screen.getByText(/Export Excel/i);
    await user.click(excelBtn);

    expect(windowOpenSpy).toHaveBeenCalledWith(
      '/api/v1/operational/reports/students?rotation_id=1&format=excel',
      '_blank'
    );
    windowOpenSpy.mockRestore();
  });
});
