import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ReportsDashboard } from './ReportsDashboard';
import { renderWithProviders } from '@/test/renderWithProviders';

describe('ReportsDashboard', () => {
  it('renders report dashboard and options', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'Unauthenticated.' }), { status: 401 }),
    );
    renderWithProviders(<ReportsDashboard />);
    expect(screen.getByText(/Reports Center/i)).toBeInTheDocument();
    expect(screen.getByText(/Student Registry/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /CSV \/ Excel/i })).toHaveLength(6);
    await waitFor(() => expect(window.fetch).toHaveBeenCalled());
    vi.restoreAllMocks();
  });

  it('downloads the selected report with authentication', async () => {
    localStorage.setItem('token', 'test-token');
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/export/students')) {
        return new Response(new Blob(['report']), { status: 200 });
      }
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthenticated.' }),
        { status: 401 },
      );
    });
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const user = userEvent.setup();

    renderWithProviders(<ReportsDashboard />);

    const excelBtn = screen.getAllByRole('button', { name: /CSV \/ Excel/i })[0];
    await user.click(excelBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/export/students', {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(clickSpy).toHaveBeenCalled();
    });
    fetchSpy.mockRestore();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
    clickSpy.mockRestore();
  });
});
