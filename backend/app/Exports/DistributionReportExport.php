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
