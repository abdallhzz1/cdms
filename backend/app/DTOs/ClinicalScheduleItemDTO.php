<?php

namespace App\DTOs;

use App\Models\StudentClinicalAssignment;
use App\Services\Distribution\ClinicalScheduleDateCalculator;

class ClinicalScheduleItemDTO
{
    /**
     * Transforms a StudentClinicalAssignment into a clinical schedule DTO representation.
     * 
     * @param StudentClinicalAssignment $assignment
     * @param ClinicalScheduleDateCalculator $dateCalculator
     * @return array
     */
    public static function fromAssignment(
        StudentClinicalAssignment $assignment,
        ClinicalScheduleDateCalculator $dateCalculator
    ): array {
        $block = $assignment->rotationBlock;
        $rotation = $block?->rotation;
        $student = $assignment->student;
        $course = $rotation?->course;
        $subgroup = $assignment->studentSubgroup;
        $group = $subgroup?->group;
        $site = $assignment->trainingSite;
        $department = $assignment->department ?? $block?->department;
        $supervisor = $assignment->supervisor;

        $rotationStartDate = $rotation?->start_date?->toDateString();
        $rotationEndDate = $rotation?->end_date?->toDateString();

        $blockStartDate = null;
        $blockEndDate = null;

        if ($rotationStartDate && $block) {
            $blockStartDate = $dateCalculator->calculateBlockStartDate($rotationStartDate, $block->from_week);
            $blockEndDate = $dateCalculator->calculateBlockEndDate($rotationStartDate, $block->to_week);
        }

        return [
            'assignment_id' => $assignment->id,
            'distribution_version_id' => $assignment->distribution_version_id,
            'student' => $student ? [
                'id' => $student->id,
                'university_number' => $student->university_number,
                'full_name_ar' => $student->full_name_ar,
                'full_name_en' => $student->full_name_en,
                'full_name' => $student->full_name_en ?? $student->full_name_ar,
                'registration_status' => $student->registration_status,
            ] : null,
            'group' => $group ? [
                'id' => $group->id,
                'name' => $group->name,
            ] : null,
            'subgroup' => $subgroup ? [
                'id' => $subgroup->id,
                'name' => $subgroup->name,
                'group' => $group ? [
                    'id' => $group->id,
                    'name' => $group->name,
                ] : null,
            ] : null,
            'rotation' => $rotation ? [
                'id' => $rotation->id,
                'code' => $rotation->code,
                'name' => $rotation->name,
                'academic_year_id' => $rotation->academic_year_id,
                'academic_level' => $rotation->academic_level,
                'start_date' => $rotationStartDate,
                'end_date' => $rotationEndDate,
            ] : null,
            'course' => $course ? [
                'id' => $course->id,
                'code' => $course->code,
                'name_ar' => $course->name_ar,
                'name_en' => $course->name_en,
            ] : null,
            'block' => $block ? [
                'id' => $block->id,
                'block_code' => $block->block_code,
                'from_week' => $block->from_week,
                'to_week' => $block->to_week,
                'start_date' => $blockStartDate,
                'end_date' => $blockEndDate,
            ] : null,
            'training_site' => $site ? [
                'id' => $site->id,
                'name' => $site->name_en ?? $site->name_ar,
                'name_en' => $site->name_en,
                'name_ar' => $site->name_ar,
            ] : null,
            'department' => $department ? [
                'id' => $department->id,
                'name' => $department->name_en ?? $department->name_ar,
                'name_en' => $department->name_en,
                'name_ar' => $department->name_ar,
            ] : null,
            'supervisor' => $supervisor ? [
                'id' => $supervisor->id,
                'full_name_ar' => $supervisor->full_name_ar,
                'full_name_en' => $supervisor->full_name_en,
                'name' => $supervisor->full_name_en ?? $supervisor->full_name_ar,
                'email' => $supervisor->email,
            ] : null,
        ];
    }
}
