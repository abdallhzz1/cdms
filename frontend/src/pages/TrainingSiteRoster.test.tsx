import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrainingSiteRoster } from './TrainingSiteRoster';
import { I18nProvider } from '../i18n/I18nContext';
import * as api from '../api/distribution';

vi.mock('../api/distribution');

describe('TrainingSiteRoster', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially', () => {
    (api.getTrainingSiteRoster as any).mockReturnValue(new Promise(() => {}));
    (api.getTrainingSiteSummary as any).mockReturnValue(new Promise(() => {}));
    
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/operational/training-sites/1/roster']}>
          <Routes>
            <Route path="/operational/training-sites/:siteId/roster" element={<TrainingSiteRoster />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    );

    expect(screen.getByText('جاري التحميل...')).toBeInTheDocument();
  });

  it('renders title and "Current Published" badge', async () => {
    (api.getTrainingSiteRoster as any).mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0 });
    (api.getTrainingSiteSummary as any).mockResolvedValue({
      data: {
        training_site: { name_en: 'Al-Ahli Hospital', name_ar: 'مستشفى الأهلي' },
        summary: { total_assigned_students: 0, has_over_capacity: false },
        capacity_by_rotation: []
      }
    });

    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/operational/training-sites/1/roster']}>
          <Routes>
            <Route path="/operational/training-sites/:siteId/roster" element={<TrainingSiteRoster />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    );

    expect(await screen.findByText(/Al-Ahli Hospital/i)).toBeInTheDocument();
    expect(screen.getByText('Current Published')).toBeInTheDocument();
  });

  it('renders over capacity warning correctly', async () => {
    (api.getTrainingSiteRoster as any).mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0 });
    (api.getTrainingSiteSummary as any).mockResolvedValue({
      data: {
        training_site: { name_en: 'Al-Ahli Hospital' },
        summary: { total_assigned_students: 5, has_over_capacity: true },
        capacity_by_rotation: [
          { rotation_name: 'Surgery', capacity_limit: 2, assigned_count: 5, over_capacity: true, utilization_status: 'OVER_CAPACITY' }
        ]
      }
    });

    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/operational/training-sites/1/roster']}>
          <Routes>
            <Route path="/operational/training-sites/:siteId/roster" element={<TrainingSiteRoster />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    );

    expect(await screen.findByText(/Over capacity detected/i)).toBeInTheDocument();
    expect(screen.getByText('Over Capacity')).toBeInTheDocument();
  });
});
