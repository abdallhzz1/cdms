import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClinicalDashboard } from './ClinicalDashboard';
import * as distributionApi from '@/api/distribution';

vi.mock('@/api/distribution', async () => {
  const actual = await vi.importActual('@/api/distribution');
  return {
    ...actual,
    getDashboardSummary: vi.fn(),
  };
});

describe('ClinicalDashboard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const renderComponent = () => renderWithProviders(<ClinicalDashboard />);

  it('renders loading state initially', () => {
    vi.mocked(distributionApi.getDashboardSummary).mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('renders error state on API failure', async () => {
    vi.mocked(distributionApi.getDashboardSummary).mockRejectedValue(new Error('Network error'));
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/^Error Occurred$/i)).toBeInTheDocument();
    });
  });

  it('renders empty state when no published distribution is active', async () => {
    vi.mocked(distributionApi.getDashboardSummary).mockResolvedValue({
      success: true,
      data: {
        student_coverage: { total_active_students: 0, assigned_students: 0, unassigned_students: 0, coverage_percentage: 0 },
        distribution_overview: { active_rotations_count: 0, active_blocks_count: 0, total_placements_count: 0, published_at: null },
        alerts: { unassigned_students_count: 0, sites_near_capacity_count: 0, sites_over_capacity_count: 0, unsupervised_assignments_count: 0, inactive_supervisor_assignments_count: 0 },
        department_distribution: [],
        site_capacity_utilization: [],
        supervisor_workload_summary: [],
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/^No Data$/i)).toBeInTheDocument();
    });
  });

  it('renders dashboard KPI cards and capacity tables when data is returned', async () => {
    vi.mocked(distributionApi.getDashboardSummary).mockResolvedValue({
      success: true,
      data: {
        student_coverage: { total_active_students: 100, assigned_students: 95, unassigned_students: 5, coverage_percentage: 95.0 },
        distribution_overview: { active_rotations_count: 2, active_blocks_count: 8, total_placements_count: 190, published_at: '2026-08-15T12:00:00Z' },
        alerts: { unassigned_students_count: 5, sites_near_capacity_count: 1, sites_over_capacity_count: 0, unsupervised_assignments_count: 2, inactive_supervisor_assignments_count: 0 },
        department_distribution: [
          { department_id: 1, name_ar: 'الباطني', name_en: 'Internal Medicine', assigned_count: 95, share_percentage: 50.0 },
        ],
        site_capacity_utilization: [
          { site_id: 1, name_ar: 'المستشفى', name_en: 'City Hospital', capacity_limit: 100, assigned_count: 95, available_capacity: 5, utilization_percentage: 95.0, status: 'NEAR_CAPACITY' },
        ],
        supervisor_workload_summary: [
          { supervisor_id: 1, full_name_ar: 'د. أحمد', full_name_en: 'Dr. Ahmad', assigned_count: 5, max_students: 5, workload_warning: true },
        ],
      },
      meta: { generated_at: '2026-08-15T18:00:00Z' },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getAllByText('95%')[0]).toBeInTheDocument();
      expect(screen.getAllByText('100')[0]).toBeInTheDocument();
      expect(screen.getAllByText('95')[0]).toBeInTheDocument();
    });
  });
});
