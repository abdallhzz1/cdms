<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Rotation;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;

class DistributionValidationContextBuilder
{
    /**
     * Builds a context containing all active subgroups eligible for the rotation.
     * This is highly optimized for Candidate Generation where the entire domain is evaluated.
     */
    public function buildForGeneration(Rotation $rotation): DistributionValidationContext
    {
        $blocks = $rotation->blocks()->orderBy('from_week')->orderBy('id')->get()->keyBy('id');
        $capacityRules = $rotation->siteCapacityRules()->orderBy('site_id')->get()->keyBy('site_id');

        // Only active subgroups matching the rotation's academic year and level
        $subgroups = StudentSubgroup::with('group')
            ->where('is_active', true)
            ->whereHas('group', function ($q) use ($rotation) {
                $q->where('academic_year_id', $rotation->academic_year_id)
                  ->where('academic_level', $rotation->academic_level);
            })
            ->orderBy('id')
            ->get();

        $subgroupIds = $subgroups->pluck('id')->toArray();

        $subgroupSizes = collect();
        if (!empty($subgroupIds)) {
            $subgroupSizes = StudentGroupAssignment::whereIn('student_subgroup_id', $subgroupIds)
                ->where('academic_year_id', $rotation->academic_year_id)
                ->current()
                ->whereHas('student', fn ($query) => $query->where('registration_status', 'active'))
                ->groupBy('student_subgroup_id')
                ->selectRaw('student_subgroup_id, count(student_id) as student_count')
                ->pluck('student_count', 'student_subgroup_id');
        }

        return new DistributionValidationContext(
            rotation: $rotation,
            blocks: $blocks,
            capacityRules: $capacityRules,
            subgroups: $subgroups->keyBy('id'),
            subgroupSizes: $subgroupSizes
        );
    }

    /**
     * Builds a context tailored to specific assignments.
     * Used by the API validation endpoint to avoid loading the entire domain.
     *
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function buildForValidation(Rotation $rotation, array $assignments): DistributionValidationContext
    {
        $blocks = $rotation->blocks()->get()->keyBy('id');
        $capacityRules = $rotation->siteCapacityRules()->get()->keyBy('site_id');

        $subgroupIds = array_unique(array_map(fn($a) => $a->subgroup_id, $assignments));

        $subgroups = collect();
        $subgroupSizes = collect();

        if (!empty($subgroupIds)) {
            // Load only the assigned subgroups, regardless of active status (so validation can correctly report if they're wrong)
            $subgroups = StudentSubgroup::whereIn('id', $subgroupIds)->with('group')->get()->keyBy('id');

            $subgroupSizes = StudentGroupAssignment::whereIn('student_subgroup_id', $subgroupIds)
                ->where('academic_year_id', $rotation->academic_year_id)
                ->current()
                ->whereHas('student', fn ($query) => $query->where('registration_status', 'active'))
                ->groupBy('student_subgroup_id')
                ->selectRaw('student_subgroup_id, count(student_id) as student_count')
                ->pluck('student_count', 'student_subgroup_id');
        }

        return new DistributionValidationContext(
            rotation: $rotation,
            blocks: $blocks,
            capacityRules: $capacityRules,
            subgroups: $subgroups,
            subgroupSizes: $subgroupSizes
        );
    }
}
