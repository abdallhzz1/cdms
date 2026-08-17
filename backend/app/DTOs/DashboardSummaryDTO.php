<?php

namespace App\DTOs;

class DashboardSummaryDTO
{
    /**
     * Transforms calculated dashboard metrics into the exact JSON response contract
     * defined by docs/PHASE_6B_BUSINESS_RULES_SPECIFICATION.md.
     *
     * @param array $coverage
     * @param array $overview
     * @param array $alerts
     * @param array $departmentDist
     * @param array $siteCapacity
     * @param array $supervisorWorkload
     * @return array
     */
    public static function toArray(
        array $coverage,
        array $overview,
        array $alerts,
        array $departmentDist,
        array $siteCapacity,
        array $supervisorWorkload
    ): array {
        return [
            'student_coverage' => [
                'total_active_students' => (int) ($coverage['total_active_students'] ?? 0),
                'assigned_students'     => (int) ($coverage['assigned_students'] ?? 0),
                'unassigned_students'   => (int) ($coverage['unassigned_students'] ?? 0),
                'coverage_percentage'   => (float) ($coverage['coverage_percentage'] ?? 0.0),
            ],
            'distribution_overview' => [
                'active_rotations_count' => (int) ($overview['active_rotations_count'] ?? 0),
                'active_blocks_count'    => (int) ($overview['active_blocks_count'] ?? 0),
                'total_placements_count' => (int) ($overview['total_placements_count'] ?? 0),
                'published_at'           => $overview['published_at'] ?? null,
            ],
            'alerts' => [
                'unassigned_students_count'             => (int) ($alerts['unassigned_students_count'] ?? 0),
                'sites_near_capacity_count'             => (int) ($alerts['sites_near_capacity_count'] ?? 0),
                'sites_over_capacity_count'             => (int) ($alerts['sites_over_capacity_count'] ?? 0),
                'unsupervised_assignments_count'        => (int) ($alerts['unsupervised_assignments_count'] ?? 0),
                'inactive_supervisor_assignments_count' => (int) ($alerts['inactive_supervisor_assignments_count'] ?? 0),
            ],
            'department_distribution'    => $departmentDist,
            'site_capacity_utilization'  => $siteCapacity,
            'supervisor_workload_summary' => $supervisorWorkload,
        ];
    }
}
