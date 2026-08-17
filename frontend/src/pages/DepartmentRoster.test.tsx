import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DepartmentRoster } from './DepartmentRoster';
import * as api from '../api/distribution';

vi.mock('../api/distribution');

describe('DepartmentRoster', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    (api.getDepartmentRoster as any).mockReturnValue(new Promise(() => {}));
    (api.getDepartmentSummary as any).mockReturnValue(new Promise(() => {}));
    
    render(
      <MemoryRouter initialEntries={['/operational/departments/1/roster']}>
        <Routes>
          <Route path="/operational/departments/:departmentId/roster" element={<DepartmentRoster />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('جاري التحميل...')).toBeInTheDocument();
  });

  it('renders title and "Current Published" badge', async () => {
    (api.getDepartmentRoster as any).mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0 });
    (api.getDepartmentSummary as any).mockResolvedValue({
      data: {
        department: { name_en: 'Internal Medicine', name_ar: 'الطب الباطني' },
        summary: { total_assigned_students: 0 }
      }
    });

    render(
      <MemoryRouter initialEntries={['/operational/departments/1/roster']}>
        <Routes>
          <Route path="/operational/departments/:departmentId/roster" element={<DepartmentRoster />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Internal Medicine/i)).toBeInTheDocument();
    expect(screen.getByText('Current Published')).toBeInTheDocument();
  });

  it('renders empty state when no distribution', async () => {
    (api.getDepartmentRoster as any).mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0 });
    (api.getDepartmentSummary as any).mockResolvedValue({
      data: {
        no_current_distribution: true,
      }
    });

    render(
      <MemoryRouter initialEntries={['/operational/departments/1/roster']}>
        <Routes>
          <Route path="/operational/departments/:departmentId/roster" element={<DepartmentRoster />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('No Current Distribution')).toBeInTheDocument();
  });
});
