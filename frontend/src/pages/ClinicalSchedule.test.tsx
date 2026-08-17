import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClinicalSchedule } from './ClinicalSchedule';
import * as distributionApi from '../api/distribution';

vi.mock('../api/distribution', async () => {
  const actual = await vi.importActual('../api/distribution');
  return {
    ...actual,
    getClinicalSchedule: vi.fn(),
  };
});

describe('ClinicalSchedule Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders title, badge, and loading state', async () => {
    vi.mocked(distributionApi.getClinicalSchedule).mockImplementation(
      () => new Promise(() => {}) // Pending promise
    );

    renderWithProviders(<ClinicalSchedule />);

    expect(screen.getByText(/Clinical Schedule/i)).toBeInTheDocument();
    expect(screen.getByText('Current Published')).toBeInTheDocument();
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('renders clinical schedule table when data is returned', async () => {
    vi.mocked(distributionApi.getClinicalSchedule).mockResolvedValue({
      current_page: 1,
      data: [
        {
          assignment_id: 1,
          distribution_version_id: 10,
          student: {
            id: 101,
            university_number: '20260001',
            full_name_ar: 'أحمد علي',
            full_name_en: 'Ahmad Ali',
            full_name: 'Ahmad Ali',
            registration_status: 'active',
          },
          rotation: {
            id: 5,
            code: 'ROT01',
            name: 'Internal Medicine Rotation',
            academic_year_id: 1,
            academic_level: 'fourth',
            start_date: '2026-09-01',
            end_date: '2026-10-30',
          },
          block: {
            id: 20,
            block_code: 'BLOCK_1',
            from_week: 1,
            to_week: 4,
            start_date: '2026-09-01',
            end_date: '2026-09-28',
          },
          training_site: {
            id: 2,
            name: 'Al-Ahli Hospital',
          },
          department: {
            id: 3,
            name: 'Internal Medicine',
          },
          supervisor: {
            id: 8,
            full_name_ar: 'د. عمر كحلوت',
            full_name_en: 'Dr. Omar Kahlout',
            name: 'Dr. Omar Kahlout',
          },
        },
      ],
      first_page_url: '',
      from: 1,
      last_page: 1,
      last_page_url: '',
      next_page_url: null,
      path: '',
      per_page: 25,
      prev_page_url: null,
      to: 1,
      total: 1,
    });

    renderWithProviders(<ClinicalSchedule />);

    await waitFor(() => {
      
      
      expect(screen.getByText('Internal Medicine Rotation')).toBeInTheDocument();
      
      expect(screen.getByText('Al-Ahli Hospital')).toBeInTheDocument();
      
    });
  });

  it('renders empty state when no items are returned', async () => {
    vi.mocked(distributionApi.getClinicalSchedule).mockResolvedValue({
      current_page: 1,
      data: [],
      first_page_url: '',
      from: null,
      last_page: 1,
      last_page_url: '',
      next_page_url: null,
      path: '',
      per_page: 25,
      prev_page_url: null,
      to: null,
      total: 0,
    });

    renderWithProviders(<ClinicalSchedule />);

    await waitFor(() => {
      expect(screen.getByText(/No Data Found/i)).toBeInTheDocument();
      
    });
  });
});
