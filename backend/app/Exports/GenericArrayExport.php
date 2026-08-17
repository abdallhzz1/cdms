<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomCsvSettings;

class GenericArrayExport implements FromArray, WithHeadings, ShouldAutoSize, WithCustomCsvSettings
{
    public function __construct(private array $data, private array $headings)
    {}

    public function getCsvSettings(): array
    {
        return [
            'use_bom' => true,
        ];
    }

    public function array(): array
    {
        return $this->data;
    }

    public function headings(): array
    {
        return $this->headings;
    }
}
