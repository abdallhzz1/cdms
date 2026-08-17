<?php

namespace Database\Seeders;

use App\Models\AcademicYear;
use Illuminate\Database\Seeder;

/**
 * Seeds the 2026/2027 academic year as defined in workbook sheet 45.
 * Safe to run multiple times (updateOrCreate).
 */
class AcademicYearSeeder extends Seeder
{
    public function run(): void
    {
        AcademicYear::updateOrCreate(
            ['code' => '2026/2027'],
            [
                'start_date'      => '2026-09-01',
                'end_date'        => '2027-08-31',
                'semester1_start' => '2026-09-01',
                'semester1_end'   => '2027-01-15',
                'semester2_start' => '2027-02-01',
                'semester2_end'   => '2027-06-15',
                'summer_start'    => null,
                'summer_end'      => null,
                'is_current'      => true,
                'status'          => 'active',
                'notes'           => 'Seeded from workbook sheet 45 (44_السنوات_الأكاديمية).',
            ]
        );
    }
}
