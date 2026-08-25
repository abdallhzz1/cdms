<?php

namespace App\Exports;

use Illuminate\Database\Eloquent\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomCsvSettings;

class DistributionReportExport implements FromQuery, WithHeadings, WithMapping, ShouldAutoSize, WithCustomCsvSettings
{
    public function __construct(private Builder $query)
    {}

    public function getCsvSettings(): array
    {
        return [
            'use_bom' => true,
        ];
    }

    public function query(): Builder
    {
        return $this->query;
    }

    public function csvRows(): array
    {
        return (clone $this->query)
            ->without(['student', 'rotationBlock', 'trainingSite', 'department', 'supervisor'])
            ->leftJoin('rotations', 'rotation_blocks.rotation_id', '=', 'rotations.id')
            ->leftJoin('departments', 'student_clinical_assignments.department_id', '=', 'departments.id')
            ->leftJoin('training_sites', 'student_clinical_assignments.training_site_id', '=', 'training_sites.id')
            ->leftJoin('people as supervisors', 'student_clinical_assignments.supervisor_id', '=', 'supervisors.id')
            ->addSelect([
                'students.university_number as export_student_number', 'students.full_name_en as export_student_name_en',
                'students.full_name_ar as export_student_name_ar', 'rotations.name as export_rotation_name',
                'rotation_blocks.block_code as export_block_code', 'rotation_blocks.from_week as export_from_week',
                'rotation_blocks.to_week as export_to_week', 'departments.name_en as export_department_name',
                'training_sites.name_en as export_site_name', 'supervisors.full_name_en as export_supervisor_name_en',
                'supervisors.full_name_ar as export_supervisor_name_ar',
            ])->get()->map(fn ($row) => [
                $row->export_student_number ?? 'N/A', $row->export_student_name_en ?? '', $row->export_student_name_ar ?? '',
                $row->export_rotation_name ?? 'N/A', $row->export_block_code ?? 'N/A',
                'Week '.($row->export_from_week ?? 1), 'Week '.($row->export_to_week ?? 4),
                $row->export_department_name ?? 'N/A', $row->export_site_name ?? 'N/A',
                $row->export_supervisor_name_en ?: ($row->export_supervisor_name_ar ?: 'Unassigned'),
            ])->all();
    }

    public function headings(): array
    {
        return [
            'Univ. Number',
            'Student Name (EN)',
            'Student Name (AR)',
            'Rotation',
            'Block',
            'Start Date',
            'End Date',
            'Department',
            'Training Site',
            'Supervisor',
        ];
    }

    public function map($assignment): array
    {
        return [
            $assignment->student->university_number ?? 'N/A',
            $assignment->student->full_name_en ?? '',
            $assignment->student->full_name_ar ?? '',
            $assignment->rotationBlock->rotation->name ?? 'N/A',
            $assignment->rotationBlock->block_code ?? 'N/A',
            'Week ' . ($assignment->rotationBlock->from_week ?? '1'),
            'Week ' . ($assignment->rotationBlock->to_week ?? '4'),
            $assignment->department->name_en ?? 'N/A',
            $assignment->trainingSite->name_en ?? 'N/A',
            $assignment->supervisor ? ($assignment->supervisor->full_name_en ?? $assignment->supervisor->full_name_ar) : 'Unassigned',
        ];
    }
}
